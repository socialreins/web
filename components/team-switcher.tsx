"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import { flushSync } from "react-dom";
import Link from "next/link";
import type { Failure, Team } from "@/lib/auth";
import { createTeam, listTeams, switchTeam } from "@/lib/teams";
import { useSession } from "@/components/app-shell";
import { Icon } from "@/components/ui";
import { isFailure, problemText, roleName, Status, useAction } from "@/components/team-ui";

// The current team, a switch between the caller's teams, and "New team", in the app's sidebar.
export function TeamSwitcher() {
  const { user, setTeam: setCurrent } = useSession();
  const current = user.current_team;
  const [teams, setTeams] = useState<Team[] | Failure | null>(null);
  const [target, setTarget] = useState("");
  const [creating, setCreating] = useState(false);
  const [name, setName] = useState("");
  const nameRef = useRef<HTMLInputElement>(null);
  const newRef = useRef<HTMLButtonElement>(null);
  const { busy, problem, done, run } = useAction();

  useEffect(() => {
    listTeams().then(setTeams);
  }, []);

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
    <section aria-label="Team" className="card grid gap-3 p-3 text-sm">
      <div className="flex items-center gap-3">
        <span aria-hidden="true" className="grid size-9 shrink-0 place-items-center rounded-lg bg-signal font-display font-extrabold text-paper">
          {current.name.charAt(0).toUpperCase()}
        </span>
        <p className="min-w-0 leading-snug">
          <strong className="block truncate text-base">{current.name}</strong>
          <span className="text-ink-soft">{roleName[current.role]}</span>
        </p>
      </div>
      {isFailure(teams) && (
        <p role="alert" className="waitlist-error">
          Your other teams couldn&apos;t be loaded. {problemText(teams)}
        </p>
      )}
      {others.length > 0 && (
        <form onSubmit={onSwitch} className="grid gap-1">
          <label htmlFor="switch-team" className="font-bold">
            Switch to another team
          </label>
          <div className="flex gap-2">
            <select id="switch-team" value={picked} onChange={(e) => setTarget(e.target.value)} className="field min-w-0 py-1.5 text-sm">
              {others.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name}
                </option>
              ))}
            </select>
            <button type="submit" className="btn btn-secondary btn-sm" disabled={busy !== null}>
              {busy === "switch" ? "Switching..." : "Switch"}
            </button>
          </div>
        </form>
      )}
      {creating && (
        <form onSubmit={onCreate} className="grid gap-1">
          <label htmlFor="new-team-name" className="font-bold">
            New team name
          </label>
          <input
            ref={nameRef}
            id="new-team-name"
            required
            maxLength={60}
            value={name}
            onChange={(e) => setName(e.target.value)}
            aria-invalid={problem === "invalid_name" || undefined}
            className="field py-1.5 text-sm"
          />
          <div className="flex gap-2">
            <button type="submit" className="btn btn-primary btn-sm" disabled={busy !== null}>
              {busy === "create" ? "Creating..." : "Create team"}
            </button>
            <button type="button" className="btn btn-quiet btn-sm" onClick={() => openCreate(false)}>
              Cancel
            </button>
          </div>
        </form>
      )}
      <div className="flex flex-wrap gap-1">
        {!creating && (
          <button ref={newRef} type="button" className="btn btn-quiet btn-sm" onClick={() => openCreate(true)}>
            <Icon name="plus" className="size-4" />
            New team
          </button>
        )}
        <Link href="/app/team" className="btn btn-quiet btn-sm">
          Manage team
        </Link>
      </div>
      <Status problem={problem} done={done} />
    </section>
  );
}
