"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import { flushSync } from "react-dom";
import { useRouter } from "next/navigation";
import { getMe, type Failure, type MeResult, type Role, type Team, type User } from "@/lib/auth";
import {
  deleteTeam,
  grantable,
  invite,
  listInvitations,
  listMembers,
  manages,
  mayChange,
  removeMember,
  renameTeam,
  revokeInvitation,
  setRole,
  type Invitation,
  type Member,
} from "@/lib/teams";
import { isFailure, linkButton, problemText, roleName, Status, useAction } from "@/components/team-ui";

const heading = "font-display text-2xl font-extrabold tracking-tight";
const select = "rounded-full border-2 border-ink bg-paper px-4 py-2";
const date = (iso: string) => new Date(iso).toLocaleDateString(undefined, { dateStyle: "medium" });

// The session cookie is on the API host, invisible to Next server code, so the check runs here.
export function TeamSettings() {
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
  return <TeamPage user={me.user} />;
}

function TeamPage({ user }: { user: User }) {
  const [team, setTeam] = useState<Team>(user.current_team);
  // brain drops the invitations a member sent once they are removed or can no longer invite.
  const [version, setVersion] = useState(0);
  const mine = team.role;
  return (
    <>
      <p>
        You are {mine === "admin" ? "an" : "a"} {roleName[mine].toLowerCase()} of <strong>{team.name}</strong>.
      </p>
      {manages(mine) && <Rename team={team} onRenamed={setTeam} />}
      <Members me={user} mine={mine} onChanged={() => setVersion((v) => v + 1)} />
      {manages(mine) && <Invitations version={version} />}
      {mine === "owner" && <DeleteTeam team={team} />}
    </>
  );
}

function Rename({ team, onRenamed }: { team: Team; onRenamed: (t: Team) => void }) {
  const [name, setName] = useState(team.name);
  const { busy, problem, done, run } = useAction();
  return (
    <section aria-labelledby="rename-heading" className="grid gap-3">
      <h2 id="rename-heading" className={heading}>
        Team name
      </h2>
      <form
        className="waitlist"
        onSubmit={(e) => {
          e.preventDefault();
          run("rename", () => renameTeam(name), (t) => {
            onRenamed(t);
            return `The team is now called ${t.name}.`;
          });
        }}
      >
        <label htmlFor="team-name">Name</label>
        <div className="waitlist-row">
          <input
            id="team-name"
            required
            maxLength={60}
            value={name}
            onChange={(e) => setName(e.target.value)}
            aria-invalid={problem === "invalid_name" || undefined}
          />
          <button type="submit" disabled={busy !== null}>
            {busy ? "Saving..." : "Save name"}
          </button>
        </div>
      </form>
      <Status problem={problem} done={done} />
    </section>
  );
}

function Members({ me, mine, onChanged }: { me: User; mine: Role; onChanged: () => void }) {
  const router = useRouter();
  const [members, setMembers] = useState<Member[] | Failure | null>(null);
  const [roles, setRoles] = useState<Record<string, Role>>({});
  const [confirming, setConfirming] = useState<string | null>(null);
  const { busy, problem, done, run } = useAction();
  const removeRefs = useRef(new Map<string, HTMLButtonElement>());
  const confirmRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    listMembers().then(setMembers);
  }, []);

  useEffect(() => {
    if (confirming) confirmRef.current?.focus();
  }, [confirming]);

  function cancel(id: string) {
    flushSync(() => setConfirming(null));
    removeRefs.current.get(id)?.focus();
  }

  async function remove(m: Member) {
    const leaving = m.id === me.id;
    const ok = await run("remove", () => removeMember(m.id), () => {
      if (leaving) return;
      setMembers((list) => (Array.isArray(list) ? list.filter((x) => x.id !== m.id) : list));
      onChanged();
      return `${m.name} was removed from the team.`;
    });
    // Leaving changes the current team, so the app page shows the new one.
    if (ok && leaving) return router.push("/app");
    flushSync(() => setConfirming(null));
    if (!ok) removeRefs.current.get(m.id)?.focus();
  }

  function changeRole(e: FormEvent<HTMLFormElement>, m: Member) {
    e.preventDefault();
    const role = roles[m.id] ?? m.role;
    run(`role:${m.id}`, () => setRole(m.id, role), (updated) => {
      setMembers((list) => (Array.isArray(list) ? list.map((x) => (x.id === m.id ? updated : x)) : list));
      onChanged();
      return `${m.name} is now ${roleName[updated.role].toLowerCase()}.`;
    });
  }

  return (
    <section aria-labelledby="members-heading" className="grid gap-3">
      <h2 id="members-heading" className={heading}>
        Members
      </h2>
      <Status problem={problem} done={done} />
      {members === null ? (
        <p className="text-ink-soft">Loading members...</p>
      ) : isFailure(members) ? (
        <p role="alert" className="waitlist-error">
          Members couldn&apos;t be loaded. {problemText(members)}
        </p>
      ) : (
        <ul className="grid gap-2">
          {members.map((m) => {
            const self = m.id === me.id;
            const editable = !self && manages(mine) && mayChange(mine, m.role);
            return (
              <li key={m.id} className="grid gap-2 border-l-4 border-ink bg-paper px-4 py-3">
                <div>
                  <p className="font-bold">
                    {m.name}
                    {self && " (you)"}
                  </p>
                  <p className="text-sm text-ink-soft">
                    {m.email}. {roleName[m.role]}. Joined {date(m.joined_at)}.
                  </p>
                </div>
                {editable && (
                  <form className="flex flex-wrap items-center gap-2" onSubmit={(e) => changeRole(e, m)}>
                    <label htmlFor={`role-${m.id}`} className="font-bold">
                      Role for {m.name}
                    </label>
                    <select
                      id={`role-${m.id}`}
                      className={select}
                      value={roles[m.id] ?? m.role}
                      onChange={(e) => setRoles((r) => ({ ...r, [m.id]: e.target.value as Role }))}
                    >
                      {grantable(mine).map((r) => (
                        <option key={r} value={r}>
                          {roleName[r]}
                        </option>
                      ))}
                    </select>
                    <button
                      type="submit"
                      className={linkButton}
                      aria-label={`Change ${m.name}'s role`}
                      disabled={busy !== null || (roles[m.id] ?? m.role) === m.role}
                    >
                      {busy === `role:${m.id}` ? "Saving..." : "Change role"}
                    </button>
                  </form>
                )}
                {(editable || self) &&
                  (confirming === m.id ? (
                    <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
                      <p id={`confirm-${m.id}`}>{self ? "Leave this team? You will lose access to it." : `Remove ${m.name} from the team?`}</p>
                      <button
                        ref={confirmRef}
                        type="button"
                        className={linkButton}
                        aria-describedby={`confirm-${m.id}`}
                        disabled={busy !== null}
                        onClick={() => remove(m)}
                      >
                        {busy === "remove" ? (self ? "Leaving..." : "Removing...") : self ? "Yes, leave" : "Yes, remove"}
                      </button>
                      <button type="button" className={linkButton} disabled={busy !== null} onClick={() => cancel(m.id)}>
                        Cancel
                      </button>
                    </div>
                  ) : (
                    <button
                      ref={(el) => {
                        if (el) removeRefs.current.set(m.id, el);
                        else removeRefs.current.delete(m.id);
                      }}
                      type="button"
                      className={`justify-self-start ${linkButton}`}
                      disabled={busy !== null}
                      aria-label={self ? undefined : `Remove ${m.name}`}
                      onClick={() => setConfirming(m.id)}
                    >
                      {self ? "Leave team" : "Remove"}
                    </button>
                  ))}
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}

function Invitations({ version }: { version: number }) {
  const [list, setList] = useState<Invitation[] | Failure | null>(null);
  const [email, setEmail] = useState("");
  const [role, setInviteRole] = useState<Invitation["role"]>("member");
  const { busy, problem, done, run } = useAction();

  useEffect(() => {
    listInvitations().then(setList);
  }, [version]);

  function onInvite(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    run("invite", () => invite(email.trim(), role), (inv) => {
      // A new invitation for a pending email replaces the old one.
      setList((l) => [...(Array.isArray(l) ? l.filter((x) => x.email !== inv.email) : []), inv]);
      setEmail("");
      return `Invitation sent to ${inv.email}.`;
    });
  }

  return (
    <section aria-labelledby="invitations-heading" className="grid gap-3">
      <h2 id="invitations-heading" className={heading}>
        Invitations
      </h2>
      <form onSubmit={onInvite} className="waitlist">
        <label htmlFor="invite-email">Email</label>
        <input
          id="invite-email"
          type="email"
          required
          autoComplete="off"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          aria-invalid={problem === "invalid_email" || problem === "already_member" || undefined}
        />
        <label htmlFor="invite-role">Role</label>
        <div className="waitlist-row">
          <select id="invite-role" className={select} value={role} onChange={(e) => setInviteRole(e.target.value as Invitation["role"])}>
            <option value="member">Member</option>
            <option value="admin">Admin</option>
          </select>
          <button type="submit" disabled={busy !== null}>
            {busy === "invite" ? "Sending..." : "Send invitation"}
          </button>
        </div>
        <p className="waitlist-note">The link works for 7 days and only for that email.</p>
      </form>
      <Status problem={problem} done={done} />
      {list === null ? (
        <p className="text-ink-soft">Loading invitations...</p>
      ) : isFailure(list) ? (
        <p role="alert" className="waitlist-error">
          Invitations couldn&apos;t be loaded. {problemText(list)}
        </p>
      ) : list.length === 0 ? (
        <p>No pending invitations.</p>
      ) : (
        <ul className="grid gap-2">
          {list.map((inv) => (
            <li key={inv.id} className="grid gap-1 border-l-4 border-ink bg-paper px-4 py-3">
              <p className="font-bold">{inv.email}</p>
              <p className="text-sm text-ink-soft">
                {roleName[inv.role]}. Expires {date(inv.expires_at)}.
              </p>
              <button
                type="button"
                className={`justify-self-start ${linkButton}`}
                disabled={busy !== null}
                aria-label={`Revoke the invitation for ${inv.email}`}
                onClick={() =>
                  run(`revoke:${inv.id}`, () => revokeInvitation(inv.id), () => {
                    setList((l) => (Array.isArray(l) ? l.filter((x) => x.id !== inv.id) : l));
                    return `The invitation for ${inv.email} was revoked.`;
                  })
                }
              >
                {busy === `revoke:${inv.id}` ? "Revoking..." : "Revoke"}
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function DeleteTeam({ team }: { team: Team }) {
  const router = useRouter();
  const [typed, setTyped] = useState("");
  const { busy, problem, done, run } = useAction();

  async function onDelete(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (await run("delete", deleteTeam, () => undefined)) router.push("/app");
  }

  return (
    <section aria-labelledby="delete-heading" className="grid gap-3">
      <h2 id="delete-heading" className={heading}>
        Delete team
      </h2>
      <p className="text-ink-soft">
        This removes the team, its members and its invitations. It can&apos;t be undone. For your safety it needs a sign-in
        from the last 10 minutes.
      </p>
      <form onSubmit={onDelete} className="waitlist">
        <label htmlFor="delete-confirm">Type {team.name} to confirm</label>
        <input id="delete-confirm" autoComplete="off" value={typed} onChange={(e) => setTyped(e.target.value)} />
        <div className="waitlist-row">
          <button type="submit" disabled={busy !== null || typed.trim() !== team.name}>
            {busy ? "Deleting..." : "Delete team"}
          </button>
        </div>
      </form>
      <Status problem={problem} done={done} />
    </section>
  );
}
