"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import { flushSync } from "react-dom";
import { useRouter } from "next/navigation";
import { getMe, type Failure, type MeResult } from "@/lib/auth";
import { listConnections, type Connection } from "@/lib/connections";
import { createSet, deleteSet, listSets, purgeDate, renameSet, restoreSet, type SocialSet } from "@/lib/sets";
import { manages } from "@/lib/teams";
import { accountName, Avatar } from "@/components/connections";
import { isFailure, linkButton, problemText, Status, useAction } from "@/components/team-ui";

const heading = "font-display text-2xl font-extrabold tracking-tight";
const date = (d: string | Date) => new Date(d).toLocaleDateString(undefined, { dateStyle: "medium" });
const count = (n: number) => `${n} ${n === 1 ? "account" : "accounts"}`;

// The session cookie is on the API host, invisible to Next server code, so the check runs here.
export function Sets() {
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
  return <SetsPage canManage={manages(me.user.current_team.role)} />;
}

function SetsPage({ canManage }: { canManage: boolean }) {
  const [live, setLive] = useState<SocialSet[] | Failure | null>(null);
  const [deleted, setDeleted] = useState<SocialSet[] | Failure | null>(null);
  const [accounts, setAccounts] = useState<Connection[]>([]);
  const [name, setName] = useState("");
  const [renaming, setRenaming] = useState<string | null>(null);
  const [newName, setNewName] = useState("");
  const [deleting, setDeleting] = useState<string | null>(null);
  const main = useAction();
  const bin = useAction();
  const buttons = useRef(new Map<string, HTMLElement>());
  const openRef = useRef<HTMLInputElement | HTMLButtonElement | null>(null);
  const headingRef = useRef<HTMLHeadingElement>(null);

  const reload = () => {
    listSets().then(setLive);
    listSets(true).then(setDeleted);
  };
  useEffect(() => {
    listSets().then(setLive);
    listSets(true).then(setDeleted);
    listConnections().then((r) => Array.isArray(r) && setAccounts(r));
  }, []);

  const keep = (key: string) => (el: HTMLElement | null) => {
    if (el) buttons.current.set(key, el);
    else buttons.current.delete(key);
  };

  function open(kind: "rename" | "delete", s: SocialSet | null) {
    flushSync(() => {
      setRenaming(kind === "rename" && s ? s.id : null);
      setDeleting(kind === "delete" && s ? s.id : null);
      setNewName(s?.name ?? "");
    });
    openRef.current?.focus();
  }

  function close(key: string) {
    flushSync(() => {
      setRenaming(null);
      setDeleting(null);
    });
    buttons.current.get(key)?.focus();
  }

  function onCreate(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    main.run("create", () => createSet(name), (s) => {
      setLive((l) => (Array.isArray(l) ? [...l, s] : [s]));
      setName("");
      return `Created ${s.name}.`;
    });
  }

  async function onRename(e: FormEvent<HTMLFormElement>, s: SocialSet) {
    e.preventDefault();
    const ok = await main.run("rename", () => renameSet(s.id, newName), (updated) => {
      setLive((l) => (Array.isArray(l) ? l.map((x) => (x.id === updated.id ? updated : x)) : l));
      setRenaming(null);
      return `Renamed to ${updated.name}.`;
    });
    if (!ok) openRef.current?.focus();
  }

  async function onDelete(s: SocialSet) {
    let gone = false;
    const call = async () => {
      const r = await deleteSet(s.id);
      gone = r === "not_found";
      return r;
    };
    const ok = await main.run("delete", call, () => {
      setDeleting(null);
      reload();
      return `Deleted ${s.name}. You can restore it for 30 days.`;
    });
    if (gone) {
      // Deleted elsewhere: its confirm and buttons go, so focus the section heading; the alert says why.
      flushSync(() => setDeleting(null));
      reload();
      headingRef.current?.focus();
    } else if (!ok) openRef.current?.focus();
  }

  const byId = new Map(accounts.map((a) => [a.id, a]));

  return (
    <>
      <section aria-labelledby="sets-heading" className="grid gap-3">
        <h2 id="sets-heading" ref={headingRef} tabIndex={-1} className={heading}>
          Sets
        </h2>
        <p className="text-ink-soft">Sets group connected accounts. Every account is always in the Default set.</p>
        {canManage ? (
          <form onSubmit={onCreate} className="waitlist">
            <label htmlFor="new-set-name">New set name</label>
            <div className="waitlist-row">
              <input
                id="new-set-name"
                required
                maxLength={60}
                value={name}
                onChange={(e) => setName(e.target.value)}
                aria-invalid={
                  (main.failedKey === "create" && (main.problem === "name_taken" || main.problem === "invalid_name")) || undefined
                }
              />
              <button type="submit" disabled={main.busy !== null}>
                {main.busy === "create" ? "Creating..." : "Create set"}
              </button>
            </div>
          </form>
        ) : (
          <p className="text-ink-soft">Only team owners and admins can change sets.</p>
        )}
        <Status problem={main.problem} done={main.done} />
        {live === null ? (
          <p className="text-ink-soft">Loading sets...</p>
        ) : isFailure(live) ? (
          <p role="alert" className="waitlist-error">
            Sets couldn&apos;t be loaded. {problemText(live)}
          </p>
        ) : (
          <ul className="grid gap-2">
            {live.map((s) => {
              const members = s.account_ids.flatMap((id) => byId.get(id) ?? []);
              return (
                <li key={s.id} className="grid gap-2 border-l-4 border-ink bg-paper px-4 py-3">
                  <div>
                    <p className="font-bold">
                      {s.name}
                      {s.is_default && <span className="ml-2 text-sm font-normal text-ink-soft">Default, pinned</span>}
                    </p>
                    <p className="text-sm text-ink-soft">{count(s.account_count)}</p>
                  </div>
                  {members.length > 0 && (
                    <ul aria-label={`Accounts in ${s.name}`} className="flex flex-wrap gap-2">
                      {members.map((a) => (
                        <li key={a.id} className="flex items-center gap-1.5 text-sm">
                          <Avatar connection={a} size="size-6" />
                          {accountName(a)}
                        </li>
                      ))}
                    </ul>
                  )}
                  {canManage && renaming === s.id && (
                    <form className="flex flex-wrap items-end gap-2" onSubmit={(e) => onRename(e, s)}>
                      <label htmlFor={`rename-${s.id}`} className="grid gap-1 font-bold">
                        New name for {s.name}
                        <input
                          ref={(el) => {
                            openRef.current = el;
                          }}
                          id={`rename-${s.id}`}
                          required
                          maxLength={60}
                          value={newName}
                          onChange={(e) => setNewName(e.target.value)}
                          className="rounded-full border-2 border-ink bg-paper px-4 py-2 font-normal"
                        />
                      </label>
                      <button type="submit" className={linkButton} disabled={main.busy !== null}>
                        {main.busy === "rename" ? "Saving..." : "Save name"}
                      </button>
                      <button type="button" className={linkButton} disabled={main.busy !== null} onClick={() => close(`rename:${s.id}`)}>
                        Cancel
                      </button>
                    </form>
                  )}
                  {canManage && deleting === s.id && (
                    <form
                      className="grid gap-2"
                      onSubmit={(e) => {
                        e.preventDefault();
                        onDelete(s);
                      }}
                    >
                      <p id={`delete-q-${s.id}`}>Delete {s.name}? You can restore it for 30 days. This needs a sign-in from the last 10 minutes.</p>
                      <div className="flex flex-wrap gap-x-4 gap-y-2">
                        <button
                          ref={(el) => {
                            openRef.current = el;
                          }}
                          type="submit"
                          className={linkButton}
                          aria-describedby={`delete-q-${s.id}`}
                          disabled={main.busy !== null}
                        >
                          {main.busy === "delete" ? "Deleting..." : "Yes, delete"}
                        </button>
                        <button type="button" className={linkButton} disabled={main.busy !== null} onClick={() => close(`delete:${s.id}`)}>
                          Cancel
                        </button>
                      </div>
                    </form>
                  )}
                  {canManage && renaming !== s.id && deleting !== s.id && (
                    <div className="flex flex-wrap gap-x-4 gap-y-2">
                      <button
                        ref={keep(`rename:${s.id}`)}
                        type="button"
                        className={linkButton}
                        disabled={main.busy !== null}
                        aria-label={`Rename ${s.name}`}
                        onClick={() => open("rename", s)}
                      >
                        Rename
                      </button>
                      {!s.is_default && (
                        <button
                          ref={keep(`delete:${s.id}`)}
                          type="button"
                          className={linkButton}
                          disabled={main.busy !== null}
                          aria-label={`Delete ${s.name}`}
                          onClick={() => open("delete", s)}
                        >
                          Delete
                        </button>
                      )}
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </section>
      <section aria-labelledby="deleted-heading" className="grid gap-3">
        <h2 id="deleted-heading" className={heading}>
          Recently deleted
        </h2>
        <Status problem={bin.problem} done={bin.done} />
        {deleted === null ? (
          <p className="text-ink-soft">Loading deleted sets...</p>
        ) : isFailure(deleted) ? (
          <p role="alert" className="waitlist-error">
            Deleted sets couldn&apos;t be loaded. {problemText(deleted)}
          </p>
        ) : deleted.length === 0 ? (
          <p>No recently deleted sets.</p>
        ) : (
          <ul className="grid gap-2">
            {deleted.map((s) => (
              <li key={s.id} className="grid gap-1 border-l-4 border-ink/30 bg-paper px-4 py-3">
                <p className="font-bold">{s.name}</p>
                <p className="text-sm text-ink-soft">
                  {count(s.account_count)}. Deleted {date(s.deleted_at!)}. Gone for good on {date(purgeDate(s.deleted_at!))}.
                </p>
                {canManage && (
                  <button
                    type="button"
                    className={`justify-self-start ${linkButton}`}
                    disabled={bin.busy !== null}
                    aria-label={`Restore ${s.name}`}
                    onClick={() =>
                      bin.run(`restore:${s.id}`, () => restoreSet(s.id), (r) => {
                        reload();
                        return `Restored ${r.name}.`;
                      })
                    }
                  >
                    {bin.busy === `restore:${s.id}` ? "Restoring..." : "Restore"}
                  </button>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>
    </>
  );
}
