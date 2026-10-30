"use client";

import { useEffect, useRef, useState, type FormEvent, type ReactNode } from "react";
import { flushSync } from "react-dom";
import { useRouter } from "next/navigation";
import type { Failure } from "@/lib/auth";
import { listConnections, type Connection } from "@/lib/connections";
import {
  checkPost,
  createPost,
  deletePost,
  fromLocalInput,
  getPost,
  graphemes,
  MAX_GRAPHEMES,
  MAX_IMAGES,
  publishPost,
  toLocalInput,
  updatePost,
  type Post,
  type PostInput,
} from "@/lib/posts";
import { listSets, type SocialSet } from "@/lib/sets";
import { accountName, Avatar } from "@/components/connections";
import { BlueskyNote, postMessages, StatusBadge, statusName } from "@/components/posts";
import { isFailure, problemText, Status, useAction } from "@/components/team-ui";
import { Icon } from "@/components/ui";

const POLL_MS = 2000;
const POLL_FOR_MS = 60_000;
const when = (iso: string) => new Date(iso).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" });


export function PostEditor({ id }: { id?: string }) {
  const router = useRouter();
  const [post, setPost] = useState<Post | Failure | null>(null);
  const [sets, setSets] = useState<SocialSet[] | Failure | null>(null);
  const [accounts, setAccounts] = useState<Connection[]>([]);
  const [setId, setSetId] = useState("");
  const [body, setBody] = useState("");
  const [media, setMedia] = useState<string[]>([]);
  const [at, setAt] = useState("");
  const [local, setLocal] = useState<ReactNode>(null);
  const [confirming, setConfirming] = useState(false);
  const [pollNote, setPollNote] = useState("");
  // Bumped after Publish now, to move focus onto the status line that follows the post.
  const [sent, setSent] = useState(0);
  const statusRef = useRef<HTMLParagraphElement>(null);
  const addRef = useRef<HTMLButtonElement>(null);
  const imageRefs = useRef<(HTMLInputElement | null)[]>([]);
  const { busy, problem, done, run } = useAction();
  const confirmRef = useRef<HTMLButtonElement>(null);
  const askRef = useRef<HTMLButtonElement>(null);

  function load(p: Post) {
    setPost(p);
    setSetId(p.social_set_id);
    setBody(p.body);
    setMedia(p.media);
    setAt(toLocalInput(p.status === "scheduled" ? p.scheduled_at : null));
  }

  useEffect(() => {
    listSets().then((r) => {
      setSets(r);
      if (Array.isArray(r) && r[0]) setSetId((v) => v || r[0]!.id);
    });
    listConnections().then((r) => Array.isArray(r) && setAccounts(r));
    if (id)
      getPost(id).then((r) => {
        if (isFailure(r)) setPost(r);
        else load(r);
      });
  }, [id]);

  const postId = post && !isFailure(post) ? post.id : undefined;
  const status = post && !isFailure(post) ? post.status : undefined;

  // After Publish now brain answers "queued"; ask again every 2s, for up to a minute.
  useEffect(() => {
    if (status !== "queued" || !postId) return;
    const started = Date.now();
    const timer = setInterval(async () => {
      if (Date.now() - started > POLL_FOR_MS) {
        clearInterval(timer);
        setPollNote("Still publishing. Reload in a minute to see how it went.");
        return;
      }
      const r = await getPost(postId);
      if (!isFailure(r)) setPost(r);
    }, POLL_MS);
    return () => clearInterval(timer);
  }, [status, postId]);

  useEffect(() => {
    if (confirming) confirmRef.current?.focus();
  }, [confirming]);

  useEffect(() => {
    if (sent) statusRef.current?.focus();
  }, [sent]);

  if (id && post === null) return <p className="text-ink-soft">Loading the post...</p>;
  if (isFailure(post))
    return (
      <p role="alert" className="waitlist-error">
        The post couldn&apos;t be loaded. {problemText(post, postMessages)}
      </p>
    );

  async function save(mode: "draft" | "schedule" | "publish") {
    flushSync(() => setLocal(null));
    const images = media.map((m) => m.trim()).filter(Boolean);
    const invalid = checkPost(body, images);
    if (invalid) return setLocal(postMessages[invalid]);
    if (mode === "schedule" && !at) return setLocal("Pick a date and time to schedule the post.");
    const input: PostInput = {
      social_set_id: setId,
      platform: "bluesky",
      body,
      media: images,
      scheduled_at: mode === "schedule" ? fromLocalInput(at) : null,
    };
    await run(mode, async () => {
      const saved = postId ? await updatePost(postId, input) : await createPost(input);
      if (isFailure(saved)) return saved;
      // Keep this editor mounted on the new post's own address.
      if (!postId) window.history.replaceState(null, "", `/app/posts/${saved.id}`);
      load(saved);
      return mode === "publish" ? publishPost(saved.id) : saved;
    }, (p) => {
      load(p);
      // The status line says Publishing and updates itself; a separate message would go stale.
      if (mode === "publish") return void setSent((n) => n + 1);
      if (p.status === "scheduled") return `Scheduled for ${when(p.scheduled_at!)}.`;
      return "Draft saved.";
    });
  }

  async function remove() {
    flushSync(() => setLocal(null));
    let takedown: string | null = null;
    const ok = await run(status === "published" ? "takedown" : "delete", async () => {
      const r = await deletePost(postId!);
      if (typeof r === "object" && "takedownFailed" in r) {
        takedown = r.takedownFailed;
        return "error" as const;
      }
      return r;
    }, (r) => {
      if (r === "ok") return;
      load(r);
      return "Taken down from Bluesky.";
    });
    flushSync(() => setConfirming(false));
    if (takedown !== null) {
      // brain's message says what to do, e.g. which account still has the post.
      flushSync(() => setLocal(takedown || postMessages.not_deletable));
      askRef.current?.focus();
    } else if (ok && status !== "published") router.push("/app/posts");
    else if (!ok) askRef.current?.focus();
  }

  const editable = !status || status === "draft" || status === "scheduled";
  const count = graphemes(body);
  const over = count > MAX_GRAPHEMES;
  const zone = Intl.DateTimeFormat().resolvedOptions().timeZone;
  const setName = Array.isArray(sets) ? sets.find((s) => s.id === (post as Post | null)?.social_set_id)?.name : undefined;
  const byId = new Map(accounts.map((a) => [a.id, a]));
  const shownProblem = local ? null : problem;

  const preview = (
    <Preview
      body={body}
      media={media.map((m) => m.trim()).filter(Boolean)}
      account={accounts.find((a) => a.provider === "bluesky" && a.set_ids.includes(setId))}
    />
  );

  const confirm = confirming ? (
    <div className="card grid gap-3 p-4">
      <p id="remove-q">
        {status === "published" ? "Take this post down from Bluesky? It stays here as taken down." : "Delete this post? This can't be undone."}
      </p>
      <div className="flex flex-wrap gap-2">
        <button ref={confirmRef} type="button" className="btn btn-primary btn-sm" aria-describedby="remove-q" disabled={busy !== null} onClick={remove}>
          {busy === "takedown" ? "Taking down..." : busy === "delete" ? "Deleting..." : status === "published" ? "Yes, take it down" : "Yes, delete"}
        </button>
        <button
          type="button"
          className="btn btn-quiet btn-sm"
          disabled={busy !== null}
          onClick={() => {
            flushSync(() => setConfirming(false));
            askRef.current?.focus();
          }}
        >
          Cancel
        </button>
      </div>
    </div>
  ) : (
    <button ref={askRef} type="button" className="btn btn-quiet btn-danger btn-sm justify-self-start" disabled={busy !== null} onClick={() => setConfirming(true)}>
      <Icon name="trash" className="size-4" />
      {status === "published" ? "Take down" : "Delete"}
    </button>
  );

  const messages = (
    <>
      {local && (
        <p role="alert" className="waitlist-error">
          {local}
        </p>
      )}
      <Status problem={shownProblem} done={done} overrides={postMessages} />
    </>
  );

  if (!editable && post) {
    return (
      <div className="grid items-start gap-8 lg:grid-cols-[minmax(0,1fr)_24rem]">
        <div className="grid gap-5">
          <div className="card grid gap-2 p-5">
            <div className="flex flex-wrap items-center gap-3">
              <span aria-hidden="true" className="tone size-3 shrink-0 rounded-full bg-current" data-status={post.status} />
              <p ref={statusRef} tabIndex={-1} role="status" className="font-bold">
                {statusName[post.status]}
                {post.status === "published" && post.published_at ? ` on ${when(post.published_at)}` : ""}
                {post.status === "queued" ? ". This page updates by itself." : "."}
              </p>
            </div>
            <p className="text-sm text-ink-soft">
              {setName ? `Set: ${setName}. ` : ""}
              {post.scheduled_at ? `Planned for ${when(post.scheduled_at)}.` : ""}
            </p>
            {pollNote && <p className="text-ink-soft">{pollNote}</p>}
            {post.error && <p className="waitlist-error">What went wrong: {post.error}</p>}
          </div>
          {messages}
          {post.targets.length > 0 && (
            <section aria-labelledby="targets-heading" className="grid gap-3">
              <h2 id="targets-heading" className="font-display text-lg font-extrabold tracking-tight">
                Accounts
              </h2>
              <ul className="card divide-y divide-ink/10">
                {post.targets.map((t) => {
                  const a = t.social_account_id ? byId.get(t.social_account_id) : undefined;
                  return (
                    <li key={t.id} className="flex flex-wrap items-center gap-3 p-4 text-sm">
                      {a && <Avatar connection={a} size="size-8" />}
                      <span className="min-w-0 flex-1">
                        <strong>{a ? accountName(a) : "A disconnected account"}</strong>: {t.status}
                        {t.error ? `. ${t.error}` : ""}
                      </span>
                      {t.remote_url && t.status === "published" && (
                        <a href={t.remote_url} target="_blank" rel="noopener noreferrer" className="btn btn-secondary btn-sm">
                          View on Bluesky
                          <Icon name="external" className="size-4" />
                        </a>
                      )}
                    </li>
                  );
                })}
              </ul>
            </section>
          )}
          {post.status === "published" && confirm}
        </div>
        {preview}
      </div>
    );
  }

  function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const mode = ((e.nativeEvent as SubmitEvent).submitter as HTMLButtonElement | null)?.value as "draft" | "schedule" | "publish";
    save(mode || "draft");
  }

  function addImage() {
    flushSync(() => setMedia((list) => [...list, ""]));
    imageRefs.current[media.length]?.focus();
  }

  function removeImage(i: number) {
    flushSync(() => setMedia((list) => list.filter((_, j) => j !== i)));
    addRef.current?.focus();
  }

  return (
    <div className="grid items-start gap-8 lg:grid-cols-[minmax(0,1fr)_24rem]">
      <div className="grid gap-5">
        <BlueskyNote />
        {status === "scheduled" && post && (
          <p className="flex flex-wrap items-center gap-3 font-bold">
            <StatusBadge status="scheduled" />
            Scheduled for {when(post.scheduled_at!)}.
          </p>
        )}
        {/* Save draft is the first submit button, so Enter in a field saves rather than publishes. */}
        <form onSubmit={onSubmit} className="grid gap-5">
          <div className="card grid gap-5 p-5">
            <div className="grid gap-1.5">
              <label htmlFor="post-set" className="label">
                Set
              </label>
              <select id="post-set" className="field" value={setId} onChange={(e) => setSetId(e.target.value)} required aria-describedby="post-set-note">
                {Array.isArray(sets) &&
                  sets.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name}
                    </option>
                  ))}
              </select>
              <p id="post-set-note" className="hint">
                The post goes to every Bluesky account in this set.
              </p>
            </div>
            <div className="grid gap-1.5">
              <label htmlFor="post-body" className="label">
                Post
              </label>
              <textarea
                id="post-body"
                rows={7}
                className="field resize-y"
                placeholder="What do you want to say?"
                value={body}
                onChange={(e) => setBody(e.target.value)}
                aria-invalid={over || undefined}
                aria-describedby="post-count"
              />
              <p id="post-count" className={`justify-self-end text-sm ${over ? "font-bold text-signal-deep" : count > MAX_GRAPHEMES - 20 ? "text-signal-deep" : "text-ink-soft"}`}>
                {count} of {MAX_GRAPHEMES} characters
              </p>
              {over && (
                <p role="alert" className="waitlist-error">
                  That is {count - MAX_GRAPHEMES} over Bluesky&apos;s limit of {MAX_GRAPHEMES} characters.
                </p>
              )}
            </div>
            <fieldset className="grid gap-2">
              <legend className="label">Images</legend>
              <p className="hint">Up to {MAX_IMAGES}. Public https links to JPEG, PNG, WebP or GIF files of 1 MB or less.</p>
              {media.length > 0 && (
                <ul className="grid gap-2">
                  {media.map((m, i) => (
                    <li key={i} className="flex items-end gap-2">
                      <label className="grid flex-1 gap-1 text-sm font-bold">
                        Image {i + 1} link
                        <input
                          ref={(el) => {
                            imageRefs.current[i] = el;
                          }}
                          type="url"
                          inputMode="url"
                          placeholder="https://"
                          className="field font-normal"
                          value={m}
                          onChange={(e) => setMedia((list) => list.map((v, j) => (j === i ? e.target.value : v)))}
                        />
                      </label>
                      <button type="button" className="icon-btn mb-1" aria-label={`Remove image ${i + 1}`} onClick={() => removeImage(i)}>
                        <Icon name="close" className="size-4" />
                      </button>
                    </li>
                  ))}
                </ul>
              )}
              {media.length < MAX_IMAGES && (
                <button ref={addRef} type="button" className="btn btn-secondary btn-sm justify-self-start" onClick={addImage}>
                  <Icon name="image" className="size-4" />
                  Add image
                </button>
              )}
            </fieldset>
          </div>
          {messages}
          <div className="card grid gap-4 p-5">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <button type="submit" name="mode" value="draft" className="btn btn-secondary" disabled={busy !== null}>
                {busy === "draft" ? "Saving..." : "Save draft"}
              </button>
              <button type="submit" name="mode" value="publish" className="btn btn-primary" disabled={busy !== null}>
                <Icon name="send" className="size-4" />
                {busy === "publish" ? "Publishing..." : "Publish now"}
              </button>
            </div>
            <div className="grid gap-1.5 border-t border-ink/10 pt-4">
              <label htmlFor="post-at" className="label">
                Publish at
              </label>
              <div className="flex flex-wrap gap-2">
                <input
                  id="post-at"
                  type="datetime-local"
                  className="field w-auto min-w-0 flex-1"
                  value={at}
                  onChange={(e) => setAt(e.target.value)}
                  aria-describedby="post-at-note"
                />
                <button type="submit" name="mode" value="schedule" className="btn btn-secondary" disabled={busy !== null}>
                  <Icon name="clock" className="size-4" />
                  {busy === "schedule" ? "Scheduling..." : "Schedule"}
                </button>
              </div>
              <p id="post-at-note" className="hint">
                In your time zone, {zone}.
              </p>
            </div>
          </div>
        </form>
        {postId && confirm}
      </div>
      {preview}
    </div>
  );
}

// Links, mentions and tags, coloured as Bluesky shows them.
const rich = /(https?:\/\/\S+|(?<!\w)@[a-z0-9.-]+\.[a-z]{2,}|(?<!\w)#[^\s#.,!?;:]+)/gi;
const fileName = (url: string) => {
  try {
    const u = new URL(url);
    return u.pathname.split("/").filter(Boolean).pop() || u.host;
  } catch {
    return url;
  }
};

// Roughly how the post looks on Bluesky. Images show as tiles: the CSP only allows Bluesky's own image CDN.
function Preview({ body, media, account }: { body: string; media: string[]; account?: Connection }) {
  const parts = body.split(rich);
  return (
    <section aria-labelledby="preview-heading" className="grid gap-3 lg:sticky lg:top-10">
      <h2 id="preview-heading" className="font-display text-lg font-extrabold tracking-tight">
        Preview
      </h2>
      <div className="card flex gap-3 p-4">
        {account ? (
          <Avatar connection={account} />
        ) : (
          <span aria-hidden="true" className="size-10 shrink-0 rounded-full bg-ink/10" />
        )}
        <div className="grid min-w-0 flex-1 gap-1.5">
          <p className="truncate text-[0.95rem] leading-tight">
            <strong>{account ? accountName(account) : "Your Bluesky account"}</strong>{" "}
            <span className="text-ink-soft">{account?.handle ? `@${account.handle}` : ""} now</span>
          </p>
          {body.trim() ? (
            <p className="whitespace-pre-wrap break-words text-[0.95rem] leading-snug">
              {parts.map((part, i) =>
                i % 2 ? (
                  <span key={i} className="text-[#1185FE]">
                    {part}
                  </span>
                ) : (
                  part
                ),
              )}
            </p>
          ) : (
            media.length === 0 && <p className="text-[0.95rem] text-ink-soft">Your post shows here as you write.</p>
          )}
          {media.length > 0 && (
            <ul className={`mt-1 grid gap-1 overflow-hidden rounded-xl ${media.length > 1 ? "grid-cols-2" : ""}`}>
              {media.map((m, i) => (
                <li
                  key={i}
                  className={`grid place-items-center gap-1 bg-ink/5 p-3 text-center text-xs text-ink-soft ${
                    media.length === 1 ? "aspect-video" : media.length === 3 && i === 0 ? "row-span-2" : "aspect-square"
                  }`}
                >
                  <span className="grid justify-items-center gap-1">
                    <Icon name="image" className="size-6" />
                    <span className="max-w-full truncate">{fileName(m)}</span>
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </section>
  );
}
