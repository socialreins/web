"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import { flushSync } from "react-dom";
import Link from "next/link";
import type { Failure } from "@/lib/auth";
import { useSession } from "@/components/app-shell";
import {
  connectBluesky,
  disconnect,
  listConnections,
  listProviders,
  providerState,
  safeAvatar,
  type Connection,
  type Provider,
} from "@/lib/connections";
import { listSets, setAccountSets, setNames, type SocialSet } from "@/lib/sets";
import { manages } from "@/lib/teams";
import { PlatformIcon, platforms } from "@/components/platform-icons";
import { isFailure, problemText, Status, useAction } from "@/components/team-ui";

const heading = "font-display text-xl font-extrabold tracking-tight";
const date = (iso: string) => new Date(iso).toLocaleDateString(undefined, { dateStyle: "medium" });
const platformOf = (id: string) => platforms.find((p) => p.id === id);

const connectMessages: Partial<Record<Failure, string>> = {
  invalid_handle: "That handle wasn't found on Bluesky. Check it, for example alice.bsky.social.",
  invalid_credentials:
    "Bluesky didn't accept that password. Use an app password made in Bluesky settings, not your main Bluesky password.",
  unsupported_pds: "That account is hosted on a server SocialReins can't connect to.",
  bluesky_unreachable: "Bluesky couldn't be reached. Try again in a moment.",
  timeout: "Bluesky is taking a long time to answer. The account may still connect, so check the list above before trying again.",
  rate_limited: "Too many connection attempts. Wait a while, then try again.",
  forbidden: "Only team owners and admins can connect or disconnect accounts.",
  not_found: "That account was already disconnected.",
};

export const accountName = (c: Connection) => c.display_name || (c.handle ? `@${c.handle}` : c.external_id);

// The account's avatar from Bluesky's CDN, else its initial. Decorative: the name is always next to it.
export function Avatar({ connection: c, size = "size-10" }: { connection: Connection; size?: string }) {
  const avatar = safeAvatar(c.avatar_url);
  return avatar ? (
    // eslint-disable-next-line @next/next/no-img-element -- a remote avatar, no Next image loader configured
    <img src={avatar} alt="" width={40} height={40} referrerPolicy="no-referrer" className={`${size} rounded-full`} />
  ) : (
    <span aria-hidden="true" className={`grid ${size} place-items-center rounded-full bg-canvas font-bold`}>
      {accountName(c).replace(/^@/, "").charAt(0).toUpperCase()}
    </span>
  );
}

export function Connections() {
  const { user } = useSession();
  return <ConnectionsPage canManage={manages(user.current_team.role)} team={user.current_team.name} />;
}

function ConnectionsPage({ canManage, team }: { canManage: boolean; team: string }) {
  const [list, setList] = useState<Connection[] | Failure | null>(null);
  const [sets, setSets] = useState<SocialSet[] | Failure | null>(null);
  const [confirming, setConfirming] = useState<string | null>(null);
  const { busy, problem, done, run } = useAction();
  const disconnectRefs = useRef(new Map<string, HTMLButtonElement>());
  const confirmRef = useRef<HTMLButtonElement>(null);
  const headingRef = useRef<HTMLHeadingElement>(null);

  const reload = () => listConnections().then(setList);
  useEffect(() => {
    listConnections().then(setList);
    listSets().then(setSets);
  }, []);

  useEffect(() => {
    if (confirming) confirmRef.current?.focus();
  }, [confirming]);

  function cancel(id: string) {
    flushSync(() => setConfirming(null));
    disconnectRefs.current.get(id)?.focus();
  }

  async function onDisconnect(c: Connection, name: string) {
    let gone = false;
    const call = async () => {
      const r = await disconnect(c.id);
      gone = r === "not_found";
      return r;
    };
    const ok = await run("disconnect", call, () => `${name} was disconnected.`);
    flushSync(() => setConfirming(null));
    if (ok || gone) setList((l) => (Array.isArray(l) ? l.filter((x) => x.id !== c.id) : l));
    // Its button is gone with it, so focus moves to the section heading; the alert says why.
    if (gone) headingRef.current?.focus();
    else if (!ok) disconnectRefs.current.get(c.id)?.focus();
  }

  return (
    <>
      <section aria-labelledby="accounts-heading" className="grid gap-4">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h2 id="accounts-heading" ref={headingRef} tabIndex={-1} className={heading}>
              Connected accounts
            </h2>
            <p className="text-ink-soft">Accounts connected to {team}.</p>
          </div>
          <Link href="/app/sets" className="btn btn-secondary btn-sm">
            Manage sets
          </Link>
        </div>
        <Status problem={problem} done={done} overrides={connectMessages} />
        {list === null ? (
          <div role="status" className="h-28 rounded-2xl bg-ink/5 motion-safe:animate-pulse">
            <span className="sr-only">Loading accounts...</span>
          </div>
        ) : isFailure(list) ? (
          <p role="alert" className="waitlist-error">
            Accounts couldn&apos;t be loaded. {problemText(list)}
          </p>
        ) : list.length === 0 ? (
          <p className="card p-5 text-ink-soft">No accounts connected yet. Connect one below to start posting.</p>
        ) : (
          <ul className="grid gap-3 sm:grid-cols-2">
            {list.map((c) => {
              const platform = platformOf(c.provider);
              const name = accountName(c);
              return (
                <li key={c.id} className="card grid content-start gap-3 p-4">
                  <div className="flex items-center gap-3">
                    <span className="relative shrink-0">
                      <Avatar connection={c} size="size-12" />
                      {platform && (
                        <span className="absolute -right-1 -bottom-1 grid size-5 place-items-center rounded-full bg-paper ring-2 ring-paper" style={{ color: platform.color }}>
                          <PlatformIcon platform={platform} className="size-3.5" />
                        </span>
                      )}
                    </span>
                    <div className="min-w-0">
                      <p className="truncate font-bold">{name}</p>
                      <p className="text-sm text-ink-soft">
                        {platform?.name ?? c.provider}
                        {c.handle && c.display_name ? `, @${c.handle}` : ""}. Connected {date(c.created_at)}.
                      </p>
                    </div>
                  </div>
                  {c.provider === "bluesky" && c.dm_access === false && (
                    <p className="rounded-xl bg-canvas p-3 text-sm">
                      <strong>DMs off.</strong>{" "}
                      <span className="text-ink-soft">
                        Comments and mentions still reach the inbox, but DMs can&apos;t be read or sent. Make a new app password with
                        &quot;Allow access to your direct messages&quot; ticked, then connect @{c.handle ?? name} again with it below.
                      </span>
                    </p>
                  )}
                  {Array.isArray(sets) && (
                    <ul aria-label={`Sets for ${name}`} className="flex flex-wrap gap-1.5">
                      {setNames(c.set_ids, sets).map((n) => (
                        <li key={n} className="badge tone">
                          {n}
                        </li>
                      ))}
                    </ul>
                  )}
                  {canManage && Array.isArray(sets) && sets.length > 1 && (
                    <SetsEditor
                      connection={c}
                      sets={sets}
                      onStale={() => listSets().then(setSets)}
                      onSaved={(updated) => setList((l) => (Array.isArray(l) ? l.map((x) => (x.id === updated.id ? updated : x)) : l))}
                    />
                  )}
                  {canManage &&
                    (confirming === c.id ? (
                      <div className="grid gap-2 rounded-xl bg-canvas p-3">
                        <p id={`confirm-${c.id}`} className="text-sm">
                          Disconnect {name}? SocialReins will forget its stored password.
                        </p>
                        <div className="flex flex-wrap gap-2">
                          <button
                            ref={confirmRef}
                            type="button"
                            className="btn btn-primary btn-sm"
                            aria-describedby={`confirm-${c.id}`}
                            disabled={busy !== null}
                            onClick={() => onDisconnect(c, name)}
                          >
                            {busy === "disconnect" ? "Disconnecting..." : "Yes, disconnect"}
                          </button>
                          <button type="button" className="btn btn-quiet btn-sm" disabled={busy !== null} onClick={() => cancel(c.id)}>
                            Cancel
                          </button>
                        </div>
                      </div>
                    ) : (
                      <button
                        ref={(el) => {
                          if (el) disconnectRefs.current.set(c.id, el);
                          else disconnectRefs.current.delete(c.id);
                        }}
                        type="button"
                        className="btn btn-quiet btn-danger btn-sm justify-self-start"
                        disabled={busy !== null}
                        aria-label={`Disconnect ${name}`}
                        onClick={() => setConfirming(c.id)}
                      >
                        Disconnect
                      </button>
                    ))}
                </li>
              );
            })}
          </ul>
        )}
      </section>
      {canManage ? (
        <AddAccount connected={Array.isArray(list) ? list : []} onConnected={reload} />
      ) : (
        <p className="text-ink-soft">Only team owners and admins can connect or disconnect accounts.</p>
      )}
    </>
  );
}

// Checkboxes of the team's live sets for one account. Default stays checked: brain keeps every account in it.
function SetsEditor({
  connection: c,
  sets,
  onSaved,
  onStale,
}: {
  connection: Connection;
  sets: SocialSet[];
  onSaved: (c: Connection) => void;
  onStale: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [checked, setChecked] = useState<string[]>(c.set_ids);
  const { busy, problem, done, run } = useAction();
  const toggleRef = useRef<HTMLButtonElement>(null);
  const firstRef = useRef<HTMLInputElement>(null);
  const name = accountName(c);

  function show(next: boolean) {
    flushSync(() => {
      setOpen(next);
      setChecked(c.set_ids);
    });
    (next ? firstRef : toggleRef).current?.focus();
  }

  async function onSave(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const ids = sets.filter((s) => s.is_default || checked.includes(s.id)).map((s) => s.id);
    const call = async () => {
      const r = await setAccountSets(c.id, ids);
      // A set was deleted meanwhile: reload them so the checkboxes match what is left.
      if (r === "invalid_sets") onStale();
      return r;
    };
    await run("sets", call, (updated) => {
      onSaved(updated);
      setOpen(false);
      return `Sets saved for ${name}.`;
    });
  }

  const firstEditable = sets.find((s) => !s.is_default)?.id;
  return (
    <div className="grid gap-2">
      {open ? (
        <form onSubmit={onSave} className="grid gap-2 rounded-xl bg-canvas p-3">
          <fieldset className="grid gap-1">
            <legend className="font-bold">Sets for {name}</legend>
            {sets.map((s) => (
              <label key={s.id} className="flex items-center gap-2">
                <input
                  ref={s.id === firstEditable ? firstRef : undefined}
                  type="checkbox"
                  checked={s.is_default || checked.includes(s.id)}
                  disabled={s.is_default}
                  onChange={(e) =>
                    setChecked((ids) => (e.target.checked ? [...ids, s.id] : ids.filter((id) => id !== s.id)))
                  }
                />
                {s.name}
                {s.is_default && <span className="text-sm text-ink-soft">(every account stays here)</span>}
              </label>
            ))}
          </fieldset>
          <div className="flex flex-wrap gap-x-4 gap-y-2">
            <button type="submit" className="btn btn-primary btn-sm" disabled={busy !== null}>
              {busy ? "Saving..." : "Save sets"}
            </button>
            <button type="button" className="btn btn-quiet btn-sm" disabled={busy !== null} onClick={() => show(false)}>
              Cancel
            </button>
          </div>
        </form>
      ) : (
        <button
          ref={toggleRef}
          type="button"
          className="btn btn-secondary btn-sm justify-self-start"
          aria-label={`Edit sets for ${name}`}
          onClick={() => show(true)}
        >
          Edit sets
        </button>
      )}
      <Status problem={problem} done={done} />
    </div>
  );
}

const stateText = { coming_soon: "Coming soon", not_configured: "Not set up on this server" };

function AddAccount({ connected, onConnected }: { connected: Connection[]; onConnected: () => void }) {
  const [providers, setProviders] = useState<Provider[] | Failure | null>(null);
  const [handle, setHandle] = useState("");
  const [appPassword, setAppPassword] = useState("");
  const { busy, problem, done, run } = useAction();

  useEffect(() => {
    listProviders().then(setProviders);
  }, []);

  async function onConnect(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const password = appPassword;
    // The app password is only kept for the request: cleared before the answer arrives.
    setAppPassword("");
    const call = async () => {
      const r = await connectBluesky(handle.trim(), password);
      // brain may finish after the browser stops waiting, so the list could hold the account.
      if (r === "timeout") onConnected();
      return r;
    };
    await run("connect", call, (c) => {
      onConnected();
      setHandle("");
      const known = connected.some((x) => x.id === c.id);
      return known ? `Updated the app password for @${c.handle}.` : `Connected @${c.handle}.`;
    });
  }

  const known = Array.isArray(providers) ? providers : [];
  const bluesky = platforms.find((p) => p.id === "bluesky")!;
  const blueskyReady = providerState("bluesky", known) === "available";
  const groups = (["coming_soon", "not_configured"] as const).map((state) => ({
    state,
    list: platforms.filter((p) => providerState(p.id, known) === state && !(p.id === "bluesky" && blueskyReady)),
  }));
  return (
    <section aria-labelledby="add-heading" className="grid gap-4">
      <h2 id="add-heading" className={heading}>
        Add an account
      </h2>
      {providers === null ? (
        <div role="status" className="h-40 rounded-2xl bg-ink/5 motion-safe:animate-pulse">
          <span className="sr-only">Loading platforms...</span>
        </div>
      ) : isFailure(providers) ? (
        <p role="alert" className="waitlist-error">
          Platforms couldn&apos;t be loaded. {problemText(providers)}
        </p>
      ) : (
        <>
          {blueskyReady && (
            <form onSubmit={onConnect} className="card grid gap-4 p-5" aria-labelledby="bluesky-heading">
              <div className="flex items-center gap-3">
                <span className="grid size-10 place-items-center rounded-xl bg-[#e7f1ff]" style={{ color: bluesky.color }}>
                  <PlatformIcon platform={bluesky} className="size-6" />
                </span>
                <h3 id="bluesky-heading" className="font-display text-lg font-extrabold tracking-tight">
                  Connect Bluesky
                </h3>
                <span className="badge tone ml-auto" data-status="published">
                  Available
                </span>
              </div>
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="grid content-start gap-1.5">
                  <label htmlFor="bluesky-handle" className="label">
                    Bluesky handle
                  </label>
                  <input
                    id="bluesky-handle"
                    required
                    autoComplete="off"
                    spellCheck={false}
                    placeholder="alice.bsky.social"
                    className="field"
                    value={handle}
                    onChange={(e) => setHandle(e.target.value)}
                    aria-invalid={problem === "invalid_handle" || undefined}
                  />
                </div>
                <div className="grid content-start gap-1.5">
                  <label htmlFor="bluesky-app-password" className="label">
                    App password
                  </label>
                  <input
                    id="bluesky-app-password"
                    type="password"
                    required
                    autoComplete="off"
                    className="field"
                    value={appPassword}
                    onChange={(e) => setAppPassword(e.target.value)}
                    aria-invalid={problem === "invalid_credentials" || undefined}
                    aria-describedby="bluesky-app-password-note"
                  />
                </div>
              </div>
              <p id="bluesky-app-password-note" className="hint">
                Use an app password, not your main password: make one in Bluesky under Settings, Privacy and security, App
                passwords (
                <a
                  href="https://bsky.app/settings/app-passwords"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="underline decoration-2 underline-offset-4"
                >
                  open App passwords
                </a>
                ). Tick &quot;Allow access to your direct messages&quot; so the inbox can read and send DMs; reconnecting an account
                with a new app password keeps its posts and sets.
              </p>
              <button type="submit" className="btn btn-primary justify-self-start" disabled={busy !== null}>
                {busy ? "Connecting..." : "Connect Bluesky"}
              </button>
              <Status problem={problem} done={done} overrides={connectMessages} />
            </form>
          )}
          {groups.map(
            ({ state, list }) =>
              list.length > 0 && (
                <div key={state} className="grid gap-2">
                  <h3 className="font-bold text-ink-soft">{stateText[state]}</h3>
                  <ul className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                    {list.map((p) => (
                      <li key={p.id} className="flex items-center gap-2 rounded-xl border border-dashed border-ink/15 px-3 py-2.5 text-ink-soft">
                        <PlatformIcon platform={p} className="size-5 opacity-60" />
                        <span className="font-bold">{p.name}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              ),
          )}
          {groups[1]!.list.length > 0 && (
            <p className="hint">Platforms not set up need their app keys added to this server.</p>
          )}
        </>
      )}
    </section>
  );
}
