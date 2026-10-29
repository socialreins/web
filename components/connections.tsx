"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import { flushSync } from "react-dom";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { getMe, type Failure, type MeResult } from "@/lib/auth";
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
import { isFailure, linkButton, problemText, Status, useAction } from "@/components/team-ui";

const heading = "font-display text-2xl font-extrabold tracking-tight";
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

// The session cookie is on the API host, invisible to Next server code, so the check runs here.
export function Connections() {
  const router = useRouter();
  const [me, setMe] = useState<MeResult | null>(null);

  useEffect(() => {
    getMe().then((r) => {
      if (r === "signed_out") router.replace("/login");
      else setMe(r);
    });
  }, [router]);

  if (me === null || me === "signed_out") return <p className="text-ink-soft">Checking your sign-in...</p>;
  if (me === "error") return <p role="alert" className="waitlist-error">Sign-in couldn&apos;t be checked. Reload to try again.</p>;
  return <ConnectionsPage canManage={manages(me.user.current_team.role)} team={me.user.current_team.name} />;
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
      <section aria-labelledby="accounts-heading" className="grid gap-3">
        <h2 id="accounts-heading" ref={headingRef} tabIndex={-1} className={heading}>
          Connected accounts
        </h2>
        <p className="text-ink-soft">
          Accounts connected to {team}.{" "}
          <Link href="/app/sets" className={linkButton}>
            Manage sets
          </Link>
        </p>
        <Status problem={problem} done={done} overrides={connectMessages} />
        {list === null ? (
          <p className="text-ink-soft">Loading accounts...</p>
        ) : isFailure(list) ? (
          <p role="alert" className="waitlist-error">
            Accounts couldn&apos;t be loaded. {problemText(list)}
          </p>
        ) : list.length === 0 ? (
          <p>No accounts connected yet.</p>
        ) : (
          <ul className="grid gap-2">
            {list.map((c) => {
              const platform = platformOf(c.provider);
              const name = accountName(c);
              return (
                <li key={c.id} className="grid gap-2 border-l-4 border-ink bg-paper px-4 py-3">
                  <div className="flex items-center gap-3">
                    <Avatar connection={c} />
                    <div className="min-w-0">
                      <p className="flex items-center gap-2 font-bold">
                        {platform && (
                          <span style={{ color: platform.color }}>
                            <PlatformIcon platform={platform} className="size-4" />
                          </span>
                        )}
                        <span className="truncate">{name}</span>
                      </p>
                      <p className="text-sm text-ink-soft">
                        {platform?.name ?? c.provider}
                        {c.handle && c.display_name ? `, @${c.handle}` : ""}. Connected {date(c.created_at)}.
                        {Array.isArray(sets) && ` Sets: ${setNames(c.set_ids, sets).join(", ")}.`}
                      </p>
                    </div>
                  </div>
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
                      <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
                        <p id={`confirm-${c.id}`}>Disconnect {name}? SocialReins will forget its stored password.</p>
                        <button
                          ref={confirmRef}
                          type="button"
                          className={linkButton}
                          aria-describedby={`confirm-${c.id}`}
                          disabled={busy !== null}
                          onClick={() => onDisconnect(c, name)}
                        >
                          {busy === "disconnect" ? "Disconnecting..." : "Yes, disconnect"}
                        </button>
                        <button type="button" className={linkButton} disabled={busy !== null} onClick={() => cancel(c.id)}>
                          Cancel
                        </button>
                      </div>
                    ) : (
                      <button
                        ref={(el) => {
                          if (el) disconnectRefs.current.set(c.id, el);
                          else disconnectRefs.current.delete(c.id);
                        }}
                        type="button"
                        className={`justify-self-start ${linkButton}`}
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
        <form onSubmit={onSave} className="grid gap-2">
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
            <button type="submit" className={linkButton} disabled={busy !== null}>
              {busy ? "Saving..." : "Save sets"}
            </button>
            <button type="button" className={linkButton} disabled={busy !== null} onClick={() => show(false)}>
              Cancel
            </button>
          </div>
        </form>
      ) : (
        <button
          ref={toggleRef}
          type="button"
          className={`justify-self-start ${linkButton}`}
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

const stateText = { available: "Available", coming_soon: "Coming soon", not_configured: "Not set up on this server" };

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

  const bluesky = Array.isArray(providers) && providerState("bluesky", providers) === "available";
  return (
    <section aria-labelledby="add-heading" className="grid gap-3">
      <h2 id="add-heading" className={heading}>
        Add an account
      </h2>
      {providers === null ? (
        <p className="text-ink-soft">Loading platforms...</p>
      ) : isFailure(providers) ? (
        <p role="alert" className="waitlist-error">
          Platforms couldn&apos;t be loaded. {problemText(providers)}
        </p>
      ) : (
        <ul className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          {platforms.map((p) => {
            const state = providerState(p.id, providers);
            return (
              <li key={p.id} className="grid gap-1 rounded-xl border border-ink/10 bg-paper p-3">
                <span className="flex items-center gap-2 font-display font-bold">
                  <span style={{ color: p.color }}>
                    <PlatformIcon platform={p} className="size-5" />
                  </span>
                  {p.name}
                </span>
                <span className={`text-sm ${state === "available" ? "font-bold" : "text-ink-soft"}`}>{stateText[state]}</span>
              </li>
            );
          })}
        </ul>
      )}
      {bluesky && (
        <form onSubmit={onConnect} className="waitlist" aria-labelledby="bluesky-heading">
          <h3 id="bluesky-heading" className="font-display text-xl font-extrabold tracking-tight">
            Connect Bluesky
          </h3>
          <label htmlFor="bluesky-handle">Bluesky handle</label>
          <input
            id="bluesky-handle"
            required
            autoComplete="off"
            spellCheck={false}
            placeholder="alice.bsky.social"
            value={handle}
            onChange={(e) => setHandle(e.target.value)}
            aria-invalid={problem === "invalid_handle" || undefined}
          />
          <label htmlFor="bluesky-app-password">App password</label>
          <input
            id="bluesky-app-password"
            type="password"
            required
            autoComplete="off"
            value={appPassword}
            onChange={(e) => setAppPassword(e.target.value)}
            aria-invalid={problem === "invalid_credentials" || undefined}
            aria-describedby="bluesky-app-password-note"
          />
          <p id="bluesky-app-password-note" className="waitlist-note">
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
            ).
          </p>
          <div className="waitlist-row">
            <button type="submit" disabled={busy !== null}>
              {busy ? "Connecting..." : "Connect Bluesky"}
            </button>
          </div>
          <Status problem={problem} done={done} overrides={connectMessages} />
        </form>
      )}
    </section>
  );
}
