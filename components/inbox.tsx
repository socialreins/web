"use client";

import { useEffect, useRef, useState, type FormEvent, type ReactNode } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import type { Failure } from "@/lib/auth";
import { listConnections, safeAvatar, type Connection } from "@/lib/connections";
import {
  authorName,
  getItem,
  kindName,
  listInboxes,
  listItems,
  maxFor,
  mergeFresh,
  relativeTime,
  replyToItem,
  setItemState,
  type Author,
  type Inbox as InboxT,
  type Item,
  type ItemState,
  type Kind,
  type Page,
  type SendError,
} from "@/lib/inbox";
import { graphemes } from "@/lib/posts";
import { listSets, type SocialSet } from "@/lib/sets";
import { manages } from "@/lib/teams";
import { useSession } from "@/components/app-shell";
import { accountName } from "@/components/connections";
import { InboxEditor, inboxMessages } from "@/components/inbox-editor";
import { isFailure, problemText, Status, useAction } from "@/components/team-ui";
import { Icon } from "@/components/ui";

// New comments arrive on brain's per-minute tick; the open list checks twice a minute.
const REFRESH_MS = 30_000;

const replyMessages: Partial<Record<Failure, ReactNode>> = {
  reply_in_progress: "Another reply to this is going out right now. Wait a moment, then reload.",
  rate_limited: "Too many replies and posts in a minute. Wait a minute, then try again.",
  invalid_text: "Write something first, within the length limit.",
  not_found: "This item is no longer there. Reload to see the latest.",
  timeout: "Bluesky is taking a long time to answer. The reply may still go out, so reload before sending it again.",
};

const accountsLink = (
  <Link href="/app/connections" className="underline decoration-2 underline-offset-4">
    Open Accounts
  </Link>
);
const sendMessages: Record<string, ReactNode> = {
  no_dm_access: <>This account&apos;s app password doesn&apos;t allow DMs. Reconnect with an app password that allows DMs. {accountsLink}</>,
  dm_not_allowed: "They only accept DMs from people they follow, so Bluesky didn't take it.",
  reconnect_required: <>Bluesky refused the app password. Reconnect the account. {accountsLink}</>,
};

const filters: { kind: Kind | "all"; label: string }[] = [
  { kind: "all", label: "All kinds" },
  { kind: "comment", label: "Comments" },
  { kind: "mention", label: "Mentions" },
  { kind: "dm", label: "DMs" },
];

function AuthorAvatar({ author, size = "size-10" }: { author: Author; size?: string }) {
  const src = safeAvatar(author.avatar_url);
  return src ? (
    // eslint-disable-next-line @next/next/no-img-element -- a remote avatar, no Next image loader configured
    <img src={src} alt="" width={40} height={40} referrerPolicy="no-referrer" className={`${size} shrink-0 rounded-full`} />
  ) : (
    <span aria-hidden="true" className={`grid ${size} shrink-0 place-items-center rounded-full bg-ink/10 font-bold`}>
      {authorName(author).replace(/^@/, "").charAt(0).toUpperCase()}
    </span>
  );
}

function KindBadge({ kind }: { kind: Kind }) {
  return (
    <span className="badge tone" data-kind={kind}>
      {kindName[kind]}
    </span>
  );
}

export function Inbox({ inboxId }: { inboxId?: string }) {
  const { user } = useSession();
  const canManage = manages(user.current_team.role);
  const router = useRouter();
  const params = useSearchParams();
  const itemId = params.get("item");
  const state: ItemState = params.get("state") === "done" ? "done" : "open";

  const [inboxes, setInboxes] = useState<InboxT[] | Failure | null>(null);
  const [accounts, setAccounts] = useState<Connection[] | Failure | null>(null);
  const [sets, setSets] = useState<SocialSet[]>([]);
  // Loaded data remembers what it was loaded for, so a new inbox, tab or item shows loading, not stale rows.
  const [loaded, setLoaded] = useState<{ key: string; page: Page | Failure } | null>(null);
  const [more, setMore] = useState<Failure | "loading" | null>(null);
  const [kind, setKind] = useState<Kind | "all">("all");
  const [shown, setShown] = useState<{ id: string; item: Item | Failure } | null>(null);
  const [editing, setEditing] = useState<InboxT | "new" | null>(null);
  const [opened, setOpened] = useState<string | null>(null);
  const [reloads, setReloads] = useState(0);

  useEffect(() => {
    listInboxes().then(setInboxes);
    listConnections().then(setAccounts);
    listSets().then((r) => Array.isArray(r) && setSets(r));
  }, []);

  const list = Array.isArray(inboxes) ? inboxes : [];
  const current = inboxId ? list.find((i) => i.id === inboxId) : list[0];
  const currentId = current?.id ?? inboxId;
  const base = inboxId ? `/app/inbox/${encodeURIComponent(inboxId)}` : "/app/inbox";
  const href = (q: { item?: string | null; state?: ItemState }) => {
    const s = new URLSearchParams();
    if ((q.state ?? state) === "done") s.set("state", "done");
    if (q.item) s.set("item", q.item);
    return s.size ? `${base}?${s}` : base;
  };

  const kindQ = kind === "all" ? null : kind;
  const key = `${currentId}:${state}:${kind}`;
  const page = loaded?.key === key ? loaded.page : null;
  const setPage = (f: (p: Page | Failure | null) => Page | Failure | null) =>
    // A late answer for another inbox or tab leaves the newer page alone.
    setLoaded((l) => {
      if (l?.key !== key) return l;
      const next = f(l.page);
      return next ? { key, page: next } : l;
    });
  const detail = itemId && shown?.id === itemId ? shown.item : null;
  const setDetail = (i: Item) => setShown({ id: i.id, item: i });

  useEffect(() => {
    if (!currentId) return;
    let live = true;
    listItems(currentId, state, null, kindQ).then(
      (r) => live && setLoaded({ key, page: isFailure(r) ? r : { items: r.items, next: r.next_cursor } }),
    );
    return () => {
      live = false;
    };
  }, [currentId, state, kindQ, key, reloads]);

  // While the tab shows, fold the newest page into the list; a failed check waits for the next.
  useEffect(() => {
    if (!currentId) return;
    let live = true;
    const check = async () => {
      if (document.visibilityState !== "visible") return;
      const r = await listItems(currentId, state, null, kindQ);
      if (!live || isFailure(r)) return;
      setLoaded((l) => (l?.key === key && !isFailure(l.page) ? { key, page: mergeFresh(l.page, r) } : l));
    };
    const timer = setInterval(check, REFRESH_MS);
    const onVisible = () => document.visibilityState === "visible" && check();
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      live = false;
      clearInterval(timer);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [currentId, state, kindQ, key]);

  useEffect(() => {
    if (!itemId) return;
    let live = true;
    getItem(itemId).then((r) => live && setShown({ id: itemId, item: r }));
    return () => {
      live = false;
    };
  }, [itemId]);

  async function loadMore() {
    if (!currentId || isFailure(page) || !page?.next) return;
    setMore("loading");
    const r = await listItems(currentId, state, page.next, kindQ);
    if (isFailure(r)) return setMore(r);
    setMore(null);
    setPage((p) => (p && !isFailure(p) ? { items: [...p.items, ...r.items], next: r.next_cursor } : p));
  }

  // A changed item: the detail shows it, the list keeps it only while it fits the tab.
  function changed(i: Item) {
    setDetail(i);
    setPage((p) =>
      p && !isFailure(p) ? { ...p, items: i.state === state ? p.items.map((x) => (x.id === i.id ? i : x)) : p.items.filter((x) => x.id !== i.id) } : p,
    );
  }

  const loadMoreButton = page && !isFailure(page) && page.next && (
    <>
      <button type="button" className="btn btn-secondary btn-sm mt-3" disabled={more === "loading"} onClick={loadMore}>
        {more === "loading" ? "Loading..." : "Load more"}
      </button>
      {isFailure(more) && (
        <p role="alert" className="waitlist-error mt-2">
          More items couldn&apos;t be loaded. {problemText(more)}
        </p>
      )}
    </>
  );
  const items = page && !isFailure(page) ? page.items : [];
  const noAccounts = Array.isArray(accounts) && accounts.length === 0;
  const accountList = Array.isArray(accounts) ? accounts : [];
  // On small screens one pane shows at a time: inboxes, then items, then the item.
  const show = (pane: "inboxes" | "items" | "detail") =>
    (pane === "detail" ? itemId : pane === "items" ? inboxId && !itemId : !inboxId && !itemId) ? "block" : "hidden";

  return (
    <div className="grid grid-cols-[minmax(0,1fr)] gap-6 xl:grid-cols-[12rem_minmax(0,1fr)_minmax(0,1.25fr)] xl:items-start">
      <nav aria-labelledby="inboxes-heading" className={`${show("inboxes")} grid content-start gap-3 xl:block`}>
        <div className="flex items-center justify-between gap-2 xl:mb-3">
          <h2 id="inboxes-heading" className="font-display text-lg font-extrabold tracking-tight">
            Inboxes
          </h2>
        </div>
        {inboxes === null ? (
          <div role="status" className="h-32 rounded-2xl bg-ink/5 motion-safe:animate-pulse">
            <span className="sr-only">Loading inboxes...</span>
          </div>
        ) : isFailure(inboxes) ? (
          <p role="alert" className="waitlist-error">
            Inboxes couldn&apos;t be loaded. {problemText(inboxes)}
          </p>
        ) : (
          <ul className="grid gap-0.5">
            {inboxes.map((i) => {
              const active = i.id === current?.id;
              return (
                <li key={i.id} className="group flex items-center gap-1">
                  <Link
                    href={`/app/inbox/${encodeURIComponent(i.id)}`}
                    aria-current={active ? "page" : undefined}
                    className={`flex min-w-0 flex-1 items-center gap-2 rounded-xl px-3 py-2 font-bold ${
                      active ? "bg-ink text-paper" : "text-ink-soft hover:bg-ink/5 hover:text-ink"
                    }`}
                  >
                    <Icon name="inbox" className={`size-4 ${active ? "text-signal" : ""}`} />
                    <span className="truncate">{i.name}</span>
                  </Link>
                  {canManage && !i.is_all && (
                    <button
                      type="button"
                      className="grid size-8 shrink-0 place-items-center rounded-lg text-ink-soft hover:bg-ink/5 hover:text-ink"
                      aria-label={`Edit ${i.name}`}
                      onClick={() => setEditing(i)}
                    >
                      <Icon name="edit" className="size-4" />
                    </button>
                  )}
                </li>
              );
            })}
          </ul>
        )}
        {canManage && (
          <button type="button" className="btn btn-secondary btn-sm mt-3 w-full" onClick={() => setEditing("new")}>
            <Icon name="plus" className="size-4" />
            New inbox
          </button>
        )}
      </nav>

      <section aria-labelledby="items-heading" className={`${show("items")} grid content-start gap-3 xl:block`}>
        <Link href="/app/inbox" className="flex items-center gap-1 text-sm font-bold text-ink-soft hover:text-ink xl:hidden">
          <Icon name="left" className="size-4" />
          Inboxes
        </Link>
        <h2 id="items-heading" className="font-display text-lg font-extrabold tracking-tight xl:mb-3">
          {current?.name ?? "Inbox"}
        </h2>
        <div className="grid gap-3 xl:mb-3">
          <nav aria-label="State" className="flex gap-1 rounded-full bg-ink/5 p-1">
            {(["open", "done"] as const).map((s) => (
              <Link
                key={s}
                aria-current={state === s ? "true" : undefined}
                href={href({ state: s, item: itemId })}
                className={`flex-1 rounded-full px-3 py-1.5 text-center text-sm font-bold ${state === s ? "bg-paper text-ink shadow-sm" : "text-ink-soft hover:text-ink"}`}
              >
                {s === "open" ? "Open" : "Done"}
              </Link>
            ))}
          </nav>
          <ul aria-label="Kind" className="flex flex-wrap gap-1.5">
            {filters.map((f) => (
              <li key={f.kind}>
                <button
                  type="button"
                  aria-pressed={kind === f.kind}
                  onClick={() => setKind(f.kind)}
                  className={`rounded-full border px-3 py-1 text-sm font-bold ${
                    kind === f.kind ? "border-ink bg-ink text-paper" : "border-ink/15 text-ink-soft hover:border-ink hover:text-ink"
                  }`}
                >
                  {f.label}
                </button>
              </li>
            ))}
          </ul>
        </div>
        {noAccounts ? (
          <div className="card grid gap-3 p-5">
            <p>
              <strong className="block">No accounts connected</strong>
              <span className="text-ink-soft">Connect a Bluesky account and its comments, mentions and DMs land here.</span>
            </p>
            <Link href="/app/connections" className="btn btn-primary justify-self-start">
              Connect an account
            </Link>
          </div>
        ) : page === null ? (
          <div role="status" className="h-64 rounded-2xl bg-ink/5 motion-safe:animate-pulse">
            <span className="sr-only">Loading items...</span>
          </div>
        ) : isFailure(page) ? (
          <p role="alert" className="waitlist-error">
            Items couldn&apos;t be loaded. {problemText(page)}
          </p>
        ) : items.length === 0 ? (
          <>
          <p className="card p-5 text-ink-soft">
            {state === "done"
              ? "Nothing marked done yet."
              : kind !== "all"
                ? "No items of this kind here."
                : "Nothing here yet. New comments, mentions and DMs show up here within a minute."}
          </p>
          {loadMoreButton}
          </>
        ) : (
          <>
            <ul aria-label="Items" className="card divide-y divide-ink/10 overflow-hidden">
              {items.map((i) => {
                const selected = i.id === itemId;
                return (
                  <li key={i.id} className="relative">
                    <Link
                      href={href({ item: i.id })}
                      scroll={false}
                      onClick={() => setOpened(i.id)}
                      aria-current={selected ? "true" : undefined}
                      className={`flex gap-3 px-4 py-3 ${selected ? "bg-signal/[0.07] shadow-[inset_3px_0_0_var(--color-signal)]" : "hover:bg-ink/[0.03]"}`}
                    >
                      <AuthorAvatar author={i.author} />
                      <span className="grid min-w-0 flex-1 gap-0.5">
                        <span className="flex min-w-0 items-center gap-2">
                          {!i.replied_at && (
                            <>
                              <span aria-hidden="true" className="size-2 shrink-0 rounded-full bg-signal" title="Unanswered" />
                              <span className="sr-only">Unanswered:</span>
                            </>
                          )}
                          <strong className="min-w-0 truncate">{authorName(i.author)}</strong>
                          {/* The handle gives way first when the row is narrow. */}
                          {i.author.handle && i.author.name && <span className="min-w-0 shrink-[4] truncate text-sm text-ink-soft">@{i.author.handle}</span>}
                          <time dateTime={i.received_at} className="ml-auto shrink-0 text-xs text-ink-soft">
                            {relativeTime(i.received_at)}
                          </time>
                        </span>
                        <span className="line-clamp-2 text-sm text-ink-soft">{i.text || "(no text)"}</span>
                        <span className="mt-1">
                          <KindBadge kind={i.kind} />
                        </span>
                      </span>
                    </Link>
                  </li>
                );
              })}
            </ul>
            {loadMoreButton}
          </>
        )}
      </section>

      <section aria-label="Item" className={`${show("detail")} xl:sticky xl:top-10 xl:block`}>
        <Link href={href({ item: null })} scroll={false} className="mb-3 flex items-center gap-1 text-sm font-bold text-ink-soft hover:text-ink xl:hidden">
          <Icon name="left" className="size-4" />
          Back to {current?.name ?? "the inbox"}
        </Link>
        {!itemId ? (
          <div className="hidden rounded-2xl border border-dashed border-ink/15 p-8 text-center text-ink-soft xl:block">
            Pick an item to read it and reply.
          </div>
        ) : detail === null ? (
          <div role="status" className="h-80 rounded-2xl bg-ink/5 motion-safe:animate-pulse">
            <span className="sr-only">Loading the item...</span>
          </div>
        ) : isFailure(detail) ? (
          <p role="alert" className="waitlist-error">
            This item couldn&apos;t be loaded. {problemText(detail, replyMessages)}
          </p>
        ) : (
          <Detail key={detail.id} item={detail} focus={opened === detail.id} account={accountList.find((a) => a.id === detail.social_account_id)} onChange={changed} />
        )}
      </section>

      {editing && (
        <InboxEditor
          inbox={editing === "new" ? null : editing}
          accounts={accountList}
          sets={sets}
          onClose={() => setEditing(null)}
          onSaved={(saved) => {
            setInboxes((l) => (Array.isArray(l) ? (l.some((x) => x.id === saved.id) ? l.map((x) => (x.id === saved.id ? saved : x)) : [...l, saved]) : l));
            // Its filters changed, so its items did too.
            if (saved.id === currentId) setReloads((n) => n + 1);
          }}
          onDeleted={(id) => {
            setInboxes((l) => (Array.isArray(l) ? l.filter((x) => x.id !== id) : l));
            if (id === inboxId) router.replace("/app/inbox");
          }}
        />
      )}
    </div>
  );
}

const when = (iso: string) => new Date(iso).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" });

function Detail({ item, account, focus, onChange }: { item: Item; account?: Connection; focus: boolean; onChange: (i: Item) => void }) {
  const [text, setText] = useState("");
  const [sendError, setSendError] = useState<SendError | null>(null);
  const action = useAction();
  const reply = useAction();
  const headingRef = useRef<HTMLHeadingElement>(null);
  const max = maxFor(item.kind);
  const count = graphemes(text);
  const dm = item.kind === "dm";

  // Opened from the list: focus moves here (on a phone the list is gone). A shared link leaves focus alone.
  useEffect(() => {
    if (focus) headingRef.current?.focus();
  }, [focus]);

  async function onReply(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    // Ctrl+Enter submits even while the button is disabled.
    if (reply.busy || !text.trim() || count > max) return;
    setSendError(null);
    await reply.run(
      "reply",
      async () => {
        const r = await replyToItem(item.id, text);
        if (typeof r === "object" && "code" in r) {
          setSendError(r);
          return "ok" as const;
        }
        return r;
      },
      (r) => {
        if (r === "ok") return;
        onChange(r as Item);
        setText("");
        return dm ? "DM sent." : "Reply sent.";
      },
    );
  }

  const toggle = () =>
    action.run("state", () => setItemState(item.id, item.state === "open" ? "done" : "open"), (r) => {
      onChange(r);
      return r.state === "done" ? "Marked done." : "Reopened.";
    });

  return (
    <article className="card grid grid-cols-[minmax(0,1fr)] gap-5 p-5">
      <header className="flex items-start gap-3">
        <AuthorAvatar author={item.author} size="size-12" />
        <div className="min-w-0 flex-1">
          <h2 ref={headingRef} tabIndex={-1} className="truncate font-display text-lg font-extrabold tracking-tight focus:outline-none">
            {authorName(item.author)}
          </h2>
          <p className="truncate text-sm text-ink-soft">
            {item.author.handle && item.author.name ? `@${item.author.handle}, ` : ""}
            {kindName[item.kind]} to {account ? accountName(account) : "your account"}
          </p>
        </div>
        <KindBadge kind={item.kind} />
      </header>

      <ol className="grid grid-cols-[minmax(0,1fr)] gap-3" aria-label="Thread">
        <li className="grid justify-items-start gap-1">
          <p className="max-w-[90%] whitespace-pre-wrap break-words rounded-2xl rounded-tl-md bg-canvas px-4 py-3">{item.text || "(no text)"}</p>
          <p className="flex flex-wrap items-center gap-x-3 text-xs text-ink-soft">
            <time dateTime={item.received_at}>{when(item.received_at)}</time>
            {item.remote_url && (
              <a href={item.remote_url} target="_blank" rel="noopener noreferrer" className="flex items-center gap-1 font-bold hover:text-ink">
                View on Bluesky
                <Icon name="external" className="size-3.5" />
              </a>
            )}
          </p>
        </li>
        {item.replies.map((r) => (
          <li key={r.id} className="grid justify-items-end gap-1">
            <p className="max-w-[90%] whitespace-pre-wrap break-words rounded-2xl rounded-tr-md bg-ink px-4 py-3 text-paper">{r.text}</p>
            <p className="flex flex-wrap items-center justify-end gap-x-3 text-xs text-ink-soft">
              <span>
                {r.automation_id ? "Automation" : "Team"}, {r.kind === "dm" ? "DM" : "public reply"}
              </span>
              <time dateTime={r.created_at}>{when(r.created_at)}</time>
              {r.remote_url && (
                <a href={r.remote_url} target="_blank" rel="noopener noreferrer" className="flex items-center gap-1 font-bold hover:text-ink">
                  View
                  <Icon name="external" className="size-3.5" />
                  <span className="sr-only">reply on Bluesky</span>
                </a>
              )}
            </p>
          </li>
        ))}
      </ol>

      <form onSubmit={onReply} className="grid gap-2 border-t border-ink/10 pt-4">
        <label htmlFor="reply-text" className="label">
          {dm ? "Send DM" : "Reply publicly"}
        </label>
        <textarea
          id="reply-text"
          rows={3}
          className="field resize-y"
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) e.currentTarget.form?.requestSubmit();
          }}
          aria-describedby="reply-count"
          aria-invalid={count > max || undefined}
          placeholder={dm ? `Message ${authorName(item.author)}` : `Reply to ${authorName(item.author)} on Bluesky`}
        />
        <div className="flex flex-wrap items-center gap-3">
          <button type="submit" className="btn btn-primary" disabled={reply.busy !== null || !text.trim() || count > max}>
            <Icon name="send" className="size-4" />
            {reply.busy ? "Sending..." : dm ? "Send DM" : "Reply publicly"}
          </button>
          <p id="reply-count" className={`hint ml-auto ${count > max ? "font-bold text-signal-deep" : ""}`}>
            {count} of {max} characters
          </p>
        </div>
        {sendError ? (
          <p role="alert" className="waitlist-error">
            {sendMessages[sendError.code] ?? sendError.message}
          </p>
        ) : (
          <Status problem={reply.problem} done={reply.done} overrides={replyMessages} />
        )}
      </form>

      <div className="flex flex-wrap items-center gap-3 border-t border-ink/10 pt-4">
        <button type="button" className="btn btn-secondary btn-sm" disabled={action.busy !== null} onClick={toggle}>
          {action.busy ? "Saving..." : item.state === "open" ? "Mark done" : "Reopen"}
        </button>
        <span className="text-sm text-ink-soft">{item.state === "done" ? "Done." : item.replied_at ? `Answered ${relativeTime(item.replied_at)}.` : "Not answered yet."}</span>
      </div>
      <Status problem={action.problem} done={action.done} overrides={inboxMessages} />
    </article>
  );
}
