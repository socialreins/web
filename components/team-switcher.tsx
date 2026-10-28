"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import { flushSync } from "react-dom";
import Link from "next/link";
import { getMe, type Failure, type Team } from "@/lib/auth";
import { createTeam, listTeams, switchTeam } from "@/lib/teams";
import { isFailure, linkButton, problemText, roleName, Status, useAction } from "@/components/team-ui";

// The current team, a switch between the caller's teams, and "New team". Account handles signed out.
export function TeamSwitcher() {
  const [current, setCurrent] = useState<Team | null>(null);
  const [meFailed, setMeFailed] = useState(false);
  const [teams, setTeams] = useState<Team[] | Failure | null>(null);
  const [target, setTarget] = useState("");
  const [creating, setCreating] = useState(false);
  const [name, setName] = useState("");
  const nameRef = useRef<HTMLInputElement>(null);
  const newRef = useRef<HTMLButtonElement>(null);
  const { busy, problem, done, run } = useAction();

  useEffect(() => {
    getMe().then((r) => {
      if (typeof r === "object") setCurrent(r.user.current_team);
      else if (r === "error") setMeFailed(true);
    });
    listTeams().then(setTeams);
  }, []);

  if (meFailed)
    return (
      <p role="alert" className="waitlist-error">
        Your team couldn&apos;t be loaded. Reload to try again.
      </p>
    );
  if (!current) return null;
  const others = Array.isArray(teams) ? teams.filter((t) => t.id !== current.id) : [];
  const picked = target || others[0]?.id || "";

  function onSwitch(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    run("switch", () => switchTeam(picked), (team) => {
      setCurrent(team);
      setTarget("");
      return `Switched to ${team.name}.`;
    });
  }

  async function onCreate(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    await run("create", () => createTeam(name), (team) => {
      setCurrent(team);
      setTeams((t) => (Array.isArray(t) ? [...t, team] : [team]));
      setCreating(false);
      setName("");
      return `Created ${team.name}. It is now your current team.`;
    });
  }

  function openCreate(open: boolean) {
    flushSync(() => setCreating(open));
    (open ? nameRef : newRef).current?.focus();
  }

  return (
    <section aria-labelledby="team-heading" className="grid gap-3">
      <h2 id="team-heading" className="font-display text-2xl font-extrabold tracking-tight">
        Team
      </h2>
      <p>
        You are in <strong>{current.name}</strong> as {roleName[current.role].toLowerCase()}.{" "}
        <Link href="/app/team" className={linkButton}>
          Manage team
        </Link>
      </p>
      {isFailure(teams) && (
        <p role="alert" className="waitlist-error">
          Your other teams couldn&apos;t be loaded. {problemText(teams)}
        </p>
      )}
      {others.length > 0 && (
        <form onSubmit={onSwitch} className="waitlist">
          <label htmlFor="switch-team">Switch to another team</label>
          <div className="waitlist-row">
            <select
              id="switch-team"
              value={picked}
              onChange={(e) => setTarget(e.target.value)}
              className="rounded-full border-2 border-ink bg-paper px-4 py-2"
            >
              {others.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name}
                </option>
              ))}
            </select>
            <button type="submit" disabled={busy !== null}>
              {busy === "switch" ? "Switching..." : "Switch"}
            </button>
          </div>
        </form>
      )}
      {creating ? (
        <form onSubmit={onCreate} className="waitlist">
          <label htmlFor="new-team-name">New team name</label>
          <div className="waitlist-row">
            <input
              ref={nameRef}
              id="new-team-name"
              required
              maxLength={60}
              value={name}
              onChange={(e) => setName(e.target.value)}
              aria-invalid={problem === "invalid_name" || undefined}
            />
            <button type="submit" disabled={busy !== null}>
              {busy === "create" ? "Creating..." : "Create team"}
            </button>
          </div>
          <button type="button" className={`justify-self-start ${linkButton}`} onClick={() => openCreate(false)}>
            Cancel
          </button>
        </form>
      ) : (
        <button ref={newRef} type="button" className={`justify-self-start ${linkButton}`} onClick={() => openCreate(true)}>
          New team
        </button>
      )}
      <Status problem={problem} done={done} />
    </section>
  );
}
