"use client";

import { useEffect, useRef, useState } from "react";
import { flushSync } from "react-dom";
import Link from "next/link";
import { useRouter } from "next/navigation";
import type { Failure } from "@/lib/auth";
import {
  actionName,
  deleteAutomation,
  getAutomation,
  listAutomations,
  listRuns,
  reason,
  switchAutomation,
  triggerSummary,
  type Automation,
  type Run,
} from "@/lib/automations";
import { listConnections, type Connection } from "@/lib/connections";
import { listSets, type SocialSet } from "@/lib/sets";
import { manages } from "@/lib/teams";
import { useSession } from "@/components/app-shell";
import { AutomationForm, automationMessages } from "@/components/automation-form";
import { scopeSummary } from "@/components/scope-fields";
import { isFailure, problemText, Status, useAction } from "@/components/team-ui";
import { Icon } from "@/components/ui";

const heading = "font-display text-xl font-extrabold tracking-tight";
const when = (iso: string) => new Date(iso).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" });

export const actionsSummary = (a: Automation) => {
  const reply = a.actions.find((x) => x.type === "reply_publicly");
  if (reply) return "Sends a DM and replies publicly";
  return a.fallback_public_reply ? "Sends a DM, or replies publicly if it can't" : "Sends a DM";
};

// The team's accounts and sets, for the scope fields and summaries.
function useScopeData() {
  const [accounts, setAccounts] = useState<Connection[] | null>(null);
  const [sets, setSets] = useState<SocialSet[]>([]);
  useEffect(() => {
    // A failed load still settles, so the form can be used; post links by handle then need a reload.
    listConnections().then((r) => setAccounts(Array.isArray(r) ? r : []));
    listSets().then((r) => Array.isArray(r) && setSets(r));
  }, []);
  return { accounts: accounts ?? [], ready: accounts !== null, sets };
}

// On and off as a switch. Members see the state as text.
function ActiveSwitch({ automation: a, canManage, onChange }: { automation: Automation; canManage: boolean; onChange: (a: Automation) => void }) {
  const { busy, problem, done, run } = useAction();
  if (!canManage) return <span className="badge tone" data-status={a.active ? "sent" : undefined}>{a.active ? "On" : "Off"}</span>;
  return (
    <span className="grid justify-items-end gap-1">
      <button
        type="button"
        role="switch"
        aria-checked={a.active}
        aria-label={a.name}
        disabled={busy !== null}
        onClick={() => run("switch", () => switchAutomation(a.id, !a.active), (r) => {
          onChange(r);
          return `${r.name} is ${r.active ? "on" : "off"}.`;
        })}
        className={`relative h-7 w-12 shrink-0 rounded-full transition-colors disabled:cursor-progress ${a.active ? "bg-ink" : "bg-ink/20"}`}
      >
        <span
          aria-hidden="true"
          className={`absolute top-1 left-1 size-5 rounded-full bg-paper transition-transform motion-reduce:transition-none ${a.active ? "translate-x-5 bg-signal" : ""}`}
        />
      </button>
      <span role="status" className="sr-only">
        {done?.text}
      </span>
      {problem && (
        <span role="alert" className="max-w-56 text-right text-xs font-bold text-signal-deep">
          Not switched. {problemText(problem, automationMessages)}
        </span>
      )}
    </span>
  );
}

function runsSummary(runs: Automation["runs"]) {
  if (!runs?.count || !runs.last_at) return "No runs yet";
  return `${runs.count} ${runs.count === 1 ? "run" : "runs"}, last ${when(runs.last_at)}`;
}

export function Automations() {
  const { user } = useSession();
  const canManage = manages(user.current_team.role);
  const [list, setList] = useState<Automation[] | Failure | null>(null);
  const { accounts, sets } = useScopeData();

  useEffect(() => {
    listAutomations().then(setList);
  }, []);

  // Switching on or off answers without run counts, so the listed ones stay.
  const replace = (a: Automation) => setList((l) => (Array.isArray(l) ? l.map((x) => (x.id === a.id ? { ...a, runs: x.runs } : x)) : l));

  return (
    <section aria-labelledby="automations-heading" className="grid gap-4">
      <h2 id="automations-heading" className="sr-only">
        Your automations
      </h2>
      {!canManage && <p className="text-ink-soft">Only team owners and admins can create or change automations.</p>}
      {list === null ? (
        <div role="status" className="h-40 rounded-2xl bg-ink/5 motion-safe:animate-pulse">
          <span className="sr-only">Loading automations...</span>
        </div>
      ) : isFailure(list) ? (
        <p role="alert" className="waitlist-error">
          Automations couldn&apos;t be loaded. {problemText(list)}
        </p>
      ) : list.length === 0 ? (
        <div className="card grid gap-3 p-6">
          <p>
            <strong className="block">No automations yet</strong>
            <span className="text-ink-soft">
              Send a DM to everyone who comments a keyword on your posts, like &quot;price&quot; or &quot;link&quot;. It runs within a minute of the comment.
            </span>
          </p>
          {canManage && (
            <Link href="/app/automations/new" className="btn btn-primary justify-self-start">
              <Icon name="plus" className="size-4" />
              New automation
            </Link>
          )}
        </div>
      ) : (
        <ul className="grid gap-3">
          {list.map((a) => (
            <li key={a.id} className="card relative flex flex-wrap items-start gap-4 p-5">
              <span className={`grid size-10 shrink-0 place-items-center rounded-xl ${a.active ? "bg-signal/10 text-signal-deep" : "bg-ink/5 text-ink-soft"}`}>
                <Icon name="automations" />
              </span>
              <div className="grid min-w-0 flex-1 basis-64 gap-1">
                <Link href={`/app/automations/${a.id}`} className="font-bold hover:underline">
                  {a.name}
                </Link>
                <p className="text-[0.95rem]">{triggerSummary(a.conditions)}</p>
                <p className="text-sm text-ink-soft">
                  {scopeSummary(a.conditions, accounts, sets)}. {actionsSummary(a)}.
                </p>
                <p className="text-sm text-ink-soft">{runsSummary(a.runs)}</p>
              </div>
              <ActiveSwitch automation={a} canManage={canManage} onChange={replace} />
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

const statusName: Record<Run["status"], string> = { running: "Running", sent: "Sent", failed: "Failed", skipped: "Skipped" };

export function AutomationDetail({ id }: { id: string }) {
  const { user } = useSession();
  const canManage = manages(user.current_team.role);
  const router = useRouter();
  const [a, setA] = useState<Automation | Failure | null>(null);
  const [runs, setRuns] = useState<{ runs: Run[]; next: string | null } | Failure | null>(null);
  const [editing, setEditing] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [saved, setSaved] = useState<{ text: string; n: number } | null>(null);
  const { accounts, ready, sets } = useScopeData();
  const del = useAction();
  const more = useAction();
  const editRef = useRef<HTMLButtonElement>(null);
  const deleteRef = useRef<HTMLButtonElement>(null);
  const confirmRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    getAutomation(id).then(setA);
    listRuns(id).then((r) => setRuns(isFailure(r) ? r : { runs: r.runs, next: r.next_cursor }));
  }, [id]);

  if (a === null) return <div role="status" className="h-64 rounded-2xl bg-ink/5 motion-safe:animate-pulse"><span className="sr-only">Loading the automation...</span></div>;
  if (isFailure(a))
    return (
      <p role="alert" className="waitlist-error">
        This automation couldn&apos;t be loaded. {problemText(a, automationMessages)}
      </p>
    );

  async function onDelete(x: Automation) {
    const ok = await del.run("delete", () => deleteAutomation(x.id), () => {
      router.push("/app/automations");
    });
    if (!ok) confirmRef.current?.focus();
  }

  const close = () => {
    flushSync(() => setEditing(false));
    editRef.current?.focus();
  };

  return (
    <div className="grid gap-10">
      {editing ? (
        <AutomationForm
          automation={a}
          accounts={accounts}
          ready={ready}
          sets={sets}
          onCancel={close}
          onSaved={(saved) => {
            setA(saved);
            close();
            setSaved((n) => ({ text: "Automation saved.", n: (n?.n ?? 0) + 1 }));
          }}
        />
      ) : (
        <section aria-labelledby="summary-heading" className="card grid gap-4 p-5">
          <div className="flex flex-wrap items-start gap-4">
            <div className="grid min-w-0 flex-1 basis-64 gap-1">
              <h2 id="summary-heading" className={heading}>
                {a.name}
              </h2>
              <p>{triggerSummary(a.conditions)}</p>
              <p className="text-sm text-ink-soft">
                {scopeSummary(a.conditions, accounts, sets)}. {actionsSummary(a)}.{a.active ? ` On since ${when(a.activated_at)}.` : " Off."}
              </p>
            </div>
            <ActiveSwitch automation={a} canManage={canManage} onChange={setA} />
          </div>
          <dl className="grid gap-3 sm:grid-cols-2">
            {a.actions.map((x) => (
              <div key={x.type} className="grid gap-1 rounded-xl bg-canvas p-3">
                <dt className="text-sm font-bold">{x.type === "send_dm" ? "DM" : "Public reply"}</dt>
                <dd className="whitespace-pre-wrap break-words">{x.text}</dd>
              </div>
            ))}
            {a.fallback_public_reply && (
              <div className="grid gap-1 rounded-xl bg-canvas p-3">
                <dt className="text-sm font-bold">Public reply if the DM can&apos;t go</dt>
                <dd className="whitespace-pre-wrap break-words">{a.fallback_public_reply}</dd>
              </div>
            )}
          </dl>
          {canManage &&
            (confirming ? (
              <div className="flex flex-wrap items-center gap-2 rounded-xl bg-canvas p-3">
                <p id="automation-delete-q" className="text-sm">
                  Delete {a.name} and its run history? Replies it sent stay.
                </p>
                <button
                  ref={confirmRef}
                  type="button"
                  autoFocus
                  className="btn btn-primary btn-sm"
                  aria-describedby="automation-delete-q"
                  disabled={del.busy !== null}
                  onClick={() => onDelete(a)}
                >
                  {del.busy ? "Deleting..." : "Yes, delete"}
                </button>
                <button
                  type="button"
                  className="btn btn-quiet btn-sm"
                  onClick={() => {
                    flushSync(() => setConfirming(false));
                    deleteRef.current?.focus();
                  }}
                >
                  Cancel
                </button>
              </div>
            ) : (
              <div className="flex flex-wrap gap-2">
                <button ref={editRef} type="button" className="btn btn-secondary btn-sm" onClick={() => setEditing(true)}>
                  <Icon name="edit" className="size-4" />
                  Edit
                </button>
                <button ref={deleteRef} type="button" className="btn btn-quiet btn-danger btn-sm" onClick={() => setConfirming(true)}>
                  <Icon name="trash" className="size-4" />
                  Delete
                </button>
              </div>
            ))}
          <Status problem={del.problem} done={del.done} overrides={automationMessages} />
          {!del.problem && saved && (
            <p key={saved.n} role="status" className="waitlist-done">
              {saved.text}
            </p>
          )}
        </section>
      )}

      <section aria-labelledby="runs-heading" className="grid gap-4">
        <h2 id="runs-heading" className={heading}>
          Run history
        </h2>
        {runs === null ? (
          <div role="status" className="h-32 rounded-2xl bg-ink/5 motion-safe:animate-pulse">
            <span className="sr-only">Loading runs...</span>
          </div>
        ) : isFailure(runs) ? (
          <p role="alert" className="waitlist-error">
            Runs couldn&apos;t be loaded. {problemText(runs)}
          </p>
        ) : runs.runs.length === 0 ? (
          <p className="card p-5 text-ink-soft">No runs yet. Each matching comment shows here with what was sent.</p>
        ) : (
          <>
            <ol className="card divide-y divide-ink/10">
              {runs.runs.map((r) => (
                <li key={r.id} className="grid gap-2 px-5 py-4">
                  <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                    <span className="badge tone" data-status={r.status === "skipped" ? undefined : r.status}>
                      {statusName[r.status]}
                    </span>
                    <time dateTime={r.created_at} className="text-sm text-ink-soft">
                      {when(r.created_at)}
                    </time>
                    {r.reason && <span className="text-sm font-bold">{reason(r.reason)}</span>}
                    <Link href={`/app/inbox?item=${encodeURIComponent(r.inbox_item_id)}`} className="ml-auto text-sm font-bold underline decoration-signal decoration-2 underline-offset-4">
                      Open the comment<span className="sr-only"> from {when(r.created_at)}</span>
                    </Link>
                  </div>
                  {r.results.length > 0 && (
                    <ul aria-label="Actions" className="flex flex-wrap gap-x-4 gap-y-1 text-sm text-ink-soft">
                      {r.results.map((x, i) => (
                        <li key={i}>
                          {actionName[x.type]}: {statusName[x.status].toLowerCase()}
                          {x.reason ? ` (${reason(x.reason)})` : ""}
                        </li>
                      ))}
                    </ul>
                  )}
                </li>
              ))}
            </ol>
            {runs.next && (
              <button
                type="button"
                className="btn btn-secondary btn-sm justify-self-start"
                disabled={more.busy !== null}
                onClick={() =>
                  more.run("more", () => listRuns(id, runs.next), (p) => {
                    setRuns((cur) => (cur && !isFailure(cur) ? { runs: [...cur.runs, ...p.runs], next: p.next_cursor } : cur));
                  })
                }
              >
                {more.busy ? "Loading..." : "Load more"}
              </button>
            )}
            <Status problem={more.problem} done={null} />
          </>
        )}
      </section>
    </div>
  );
}

export function NewAutomation() {
  const { user } = useSession();
  const router = useRouter();
  const { accounts, ready, sets } = useScopeData();
  if (!manages(user.current_team.role)) return <p className="text-ink-soft">Only team owners and admins can create automations.</p>;
  return <AutomationForm accounts={accounts} ready={ready} sets={sets} onSaved={(a) => router.push(`/app/automations/${a.id}`)} />;
}

// The page header's action, for owners and admins only.
export function NewAutomationLink() {
  const { user } = useSession();
  if (!manages(user.current_team.role)) return null;
  return (
    <Link href="/app/automations/new" className="btn btn-primary">
      <Icon name="plus" className="size-4" />
      New automation
    </Link>
  );
}
