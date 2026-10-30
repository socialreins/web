"use client";

import { useEffect, useRef, useState, type FormEvent, type ReactNode } from "react";
import type { Failure } from "@/lib/auth";
import type { Connection } from "@/lib/connections";
import { createInbox, deleteInbox, KINDS, updateInbox, type Inbox, type Kind } from "@/lib/inbox";
import type { SocialSet } from "@/lib/sets";
import { PlatformIcon, platforms } from "@/components/platform-icons";
import { KeywordsField, ScopeField, scopeBody, scopeOf } from "@/components/scope-fields";
import { Status, useAction } from "@/components/team-ui";
import { Icon } from "@/components/ui";

export const inboxMessages: Partial<Record<Failure, ReactNode>> = {
  invalid_filters: "One of the accounts or the set no longer exists, or a keyword is too long. Check them and try again.",
  too_many_inboxes: "This team already has 50 inboxes, the most allowed. Delete one first.",
  all_inbox: "The All inbox can't be changed.",
  not_deletable: "The All inbox can't be deleted.",
  forbidden: "Only team owners and admins can change inboxes.",
};

const kindLabel: Record<Kind, string> = { comment: "Comments", mention: "Mentions", dm: "DMs" };

// Create or edit an inbox in a modal dialog. The browser keeps focus inside it and returns focus on close.
export function InboxEditor({
  inbox,
  accounts,
  sets,
  onSaved,
  onDeleted,
  onClose,
}: {
  inbox: Inbox | null;
  accounts: Connection[];
  sets: SocialSet[];
  onSaved: (i: Inbox) => void;
  onDeleted: (id: string) => void;
  onClose: () => void;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const f = inbox?.filters;
  const [name, setName] = useState(inbox?.name ?? "");
  const [scope, setScope] = useState(scopeOf(f ?? { account_ids: [] }));
  const [kinds, setKinds] = useState<Kind[]>(f?.kinds ?? []);
  const [keywords, setKeywords] = useState<string[]>(f?.keywords ?? []);
  const [unanswered, setUnanswered] = useState(f?.unanswered ?? false);
  const [confirming, setConfirming] = useState(false);
  const { busy, problem, done, run } = useAction();

  useEffect(() => {
    ref.current?.showModal();
  }, []);

  async function onSave(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    // No kind ticked means every kind; Bluesky is the only platform with an inbox today.
    const filters = { ...scopeBody(scope), kinds, platforms: [], keywords, unanswered };
    const call = () => (inbox ? updateInbox(inbox.id, name, filters) : createInbox(name, filters));
    await run("save", call, (saved) => {
      onSaved(saved);
      ref.current?.close();
    });
  }

  async function onDelete() {
    if (!inbox) return;
    await run("delete", () => deleteInbox(inbox.id), () => {
      onDeleted(inbox.id);
      ref.current?.close();
    });
  }

  const title = inbox ? `Edit ${inbox.name}` : "New inbox";
  return (
    <dialog
      ref={ref}
      aria-labelledby="inbox-editor-title"
      onClose={onClose}
      className="m-auto w-[min(36rem,calc(100vw-2rem))] rounded-2xl bg-paper p-0 text-ink shadow-2xl backdrop:bg-ink/40"
    >
      <form onSubmit={onSave} className="grid gap-5 p-6">
        <div className="flex items-center justify-between gap-3">
          <h2 id="inbox-editor-title" className="font-display text-xl font-extrabold tracking-tight">
            {title}
          </h2>
          <button type="button" className="icon-btn" aria-label="Close" onClick={() => ref.current?.close()}>
            <Icon name="close" />
          </button>
        </div>
        <div className="grid gap-1.5">
          <label htmlFor="inbox-name" className="label">
            Name
          </label>
          <input
            id="inbox-name"
            required
            maxLength={60}
            className="field"
            value={name}
            onChange={(e) => setName(e.target.value)}
            aria-invalid={problem === "invalid_name" || undefined}
          />
        </div>
        <ScopeField id="inbox-scope" value={scope} onChange={setScope} accounts={accounts} sets={sets} />
        <fieldset className="grid gap-1">
          <legend className="label mb-1">Kinds</legend>
          <div className="flex flex-wrap gap-x-5 gap-y-1">
            {KINDS.map((k) => (
              <label key={k} className="flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={kinds.includes(k)}
                  onChange={(e) => setKinds((ks) => (e.target.checked ? [...ks, k] : ks.filter((x) => x !== k)))}
                />
                {kindLabel[k]}
              </label>
            ))}
          </div>
          <p className="hint">None ticked shows every kind.</p>
        </fieldset>
        <fieldset className="grid gap-1">
          <legend className="label mb-1">Platforms</legend>
          <ul className="flex flex-wrap gap-x-5 gap-y-1">
            {platforms.map((p) => {
              const live = p.id === "bluesky";
              return (
                <li key={p.id}>
                  <label className={`flex items-center gap-2 ${live ? "" : "text-ink-soft"}`}>
                    <input type="checkbox" checked={live} disabled aria-describedby={live ? undefined : "platforms-note"} readOnly />
                    <PlatformIcon platform={p} className="size-4" />
                    {p.name}
                  </label>
                </li>
              );
            })}
          </ul>
          <p id="platforms-note" className="hint">
            Only Bluesky has an inbox today. The others come with their connections.
          </p>
        </fieldset>
        <KeywordsField
          id="inbox-keywords"
          label="Keywords"
          hint="Only items containing any of these. Press Enter or a comma after each one."
          value={keywords}
          onChange={setKeywords}
        />
        <label className="flex items-center gap-2">
          <input type="checkbox" checked={unanswered} onChange={(e) => setUnanswered(e.target.checked)} />
          Unanswered only
        </label>
        <Status problem={problem} done={done} overrides={inboxMessages} />
        <div className="flex flex-wrap items-center gap-2">
          <button type="submit" className="btn btn-primary" disabled={busy !== null}>
            {busy === "save" ? "Saving..." : inbox ? "Save inbox" : "Create inbox"}
          </button>
          <button type="button" className="btn btn-quiet" disabled={busy !== null} onClick={() => ref.current?.close()}>
            Cancel
          </button>
          {inbox &&
            (confirming ? (
              <span className="ml-auto flex flex-wrap items-center gap-2">
                <span id="inbox-delete-q" className="text-sm">
                  Delete {inbox.name}? Its items stay in All.
                </span>
                <button
                  type="button"
                  className="btn btn-quiet btn-danger btn-sm"
                  aria-describedby="inbox-delete-q"
                  autoFocus
                  disabled={busy !== null}
                  onClick={onDelete}
                >
                  {busy === "delete" ? "Deleting..." : "Yes, delete"}
                </button>
                <button type="button" className="btn btn-quiet btn-sm" onClick={() => setConfirming(false)}>
                  Keep it
                </button>
              </span>
            ) : (
              <button type="button" className="btn btn-quiet btn-danger ml-auto" onClick={() => setConfirming(true)}>
                <Icon name="trash" className="size-4" />
                Delete inbox
              </button>
            ))}
        </div>
      </form>
    </dialog>
  );
}
