"use client";

import { useEffect, useRef, useState, type FormEvent, type ReactNode } from "react";
import { flushSync } from "react-dom";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { getMe, type Failure, type MeResult } from "@/lib/auth";
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
import { accountName } from "@/components/connections";
import { BlueskyNote, postMessages, statusName } from "@/components/posts";
import { isFailure, linkButton, problemText, Status, useAction } from "@/components/team-ui";

const POLL_MS = 2000;
const POLL_FOR_MS = 60_000;
const field = "rounded-2xl border-2 border-ink bg-paper px-4 py-2 font-normal";
const when = (iso: string) => new Date(iso).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" });

// The session cookie is on the API host, invisible to Next server code, so the check runs here.
export function PostEditor({ id }: { id?: string }) {
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
  return <Editor id={id} />;
}

function Editor({ id }: { id?: string }) {
  const router = useRouter();
  const [post, setPost] = useState<Post | Failure | null>(null);
  const [sets, setSets] = useState<SocialSet[] | Failure | null>(null);
  const [accounts, setAccounts] = useState<Connection[]>([]);
  const [setId, setSetId] = useState("");
  const [body, setBody] = useState("");
  const [media, setMedia] = useState<string[]>(Array(MAX_IMAGES).fill(""));
  const [at, setAt] = useState("");
  const [local, setLocal] = useState<ReactNode>(null);
  const [confirming, setConfirming] = useState(false);
  const [pollNote, setPollNote] = useState("");
  const { busy, problem, done, run } = useAction();
  const confirmRef = useRef<HTMLButtonElement>(null);
  const askRef = useRef<HTMLButtonElement>(null);

  function load(p: Post) {
    setPost(p);
    setSetId(p.social_set_id);
    setBody(p.body);
    setMedia([...p.media, ...Array(MAX_IMAGES).fill("")].slice(0, MAX_IMAGES));
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
      if (mode === "publish") return "Sent to Bluesky. Publishing...";
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

  const confirm = (
    <div className="grid gap-2">
      {confirming ? (
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
          <p id="remove-q">
            {status === "published"
              ? "Take this post down from Bluesky? It stays here as taken down."
              : "Delete this post? This can't be undone."}
          </p>
          <button ref={confirmRef} type="button" className={linkButton} aria-describedby="remove-q" disabled={busy !== null} onClick={remove}>
            {busy === "takedown" ? "Taking down..." : busy === "delete" ? "Deleting..." : status === "published" ? "Yes, take it down" : "Yes, delete"}
          </button>
          <button
            type="button"
            className={linkButton}
            disabled={busy !== null}
            onClick={() => {
              flushSync(() => setConfirming(false));
              askRef.current?.focus();
            }}
          >
            Cancel
          </button>
        </div>
      ) : (
        <button ref={askRef} type="button" className={`justify-self-start ${linkButton}`} disabled={busy !== null} onClick={() => setConfirming(true)}>
          {status === "published" ? "Take down" : "Delete"}
        </button>
      )}
    </div>
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
      <div className="grid gap-4">
        <p role="status" className="font-bold">
          {statusName[post.status]}
          {post.status === "published" && post.published_at ? ` on ${when(post.published_at)}` : ""}
          {post.status === "queued" ? ". This page updates by itself." : "."}
        </p>
        {pollNote && <p className="text-ink-soft">{pollNote}</p>}
        {messages}
        <div className="grid gap-2 border-l-4 border-ink bg-paper px-4 py-3">
          <p className="whitespace-pre-wrap">{post.body || "(no text)"}</p>
          {post.media.length > 0 && (
            <ul className="grid gap-1 text-sm">
              {post.media.map((m) => (
                <li key={m} className="truncate">
                  Image: {m}
                </li>
              ))}
            </ul>
          )}
          <p className="text-sm text-ink-soft">
            {setName ? `Set: ${setName}. ` : ""}
            {post.scheduled_at ? `Planned for ${when(post.scheduled_at)}.` : ""}
          </p>
        </div>
        {post.error && (
          <p className="waitlist-error">
            What went wrong: {post.error}
          </p>
        )}
        {post.targets.length > 0 && (
          <section aria-labelledby="targets-heading" className="grid gap-2">
            <h2 id="targets-heading" className="font-display text-xl font-extrabold tracking-tight">
              Accounts
            </h2>
            <ul className="grid gap-2">
              {post.targets.map((t) => {
                const a = t.social_account_id ? byId.get(t.social_account_id) : undefined;
                return (
                  <li key={t.id} className="grid gap-1 text-sm">
                    <span>
                      <strong>{a ? accountName(a) : "A disconnected account"}</strong>: {t.status}
                      {t.error ? `. ${t.error}` : ""}
                    </span>
                    {t.remote_url && t.status === "published" && (
                      <a href={t.remote_url} target="_blank" rel="noopener noreferrer" className={`justify-self-start ${linkButton}`}>
                        View on Bluesky
                      </a>
                    )}
                  </li>
                );
              })}
            </ul>
          </section>
        )}
        {post.status === "published" && confirm}
        <Link href="/app/posts" className={`justify-self-start ${linkButton}`}>
          Back to posts
        </Link>
      </div>
    );
  }

  function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const mode = ((e.nativeEvent as SubmitEvent).submitter as HTMLButtonElement | null)?.value as "draft" | "schedule" | "publish";
    save(mode || "draft");
  }

  return (
    <div className="grid gap-4">
      <BlueskyNote />
      {status === "scheduled" && post && (
        <p className="font-bold">Scheduled for {when(post.scheduled_at!)}.</p>
      )}
      <form onSubmit={onSubmit} className="waitlist max-w-none">
        <label htmlFor="post-set">Set</label>
        <select id="post-set" className={field} value={setId} onChange={(e) => setSetId(e.target.value)} required>
          {Array.isArray(sets) &&
            sets.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
        </select>
        <p className="waitlist-note">The post goes to every Bluesky account in this set.</p>
        <label htmlFor="post-body">Post</label>
        <textarea
          id="post-body"
          rows={6}
          className={field}
          value={body}
          onChange={(e) => setBody(e.target.value)}
          aria-invalid={over || undefined}
          aria-describedby="post-count"
        />
        <p id="post-count" className={over ? "waitlist-error" : "waitlist-note"}>
          {count} of {MAX_GRAPHEMES} characters
        </p>
        {over && (
          <p role="alert" className="waitlist-error">
            That is {count - MAX_GRAPHEMES} over Bluesky&apos;s limit of {MAX_GRAPHEMES} characters.
          </p>
        )}
        <fieldset className="grid gap-2">
          <legend className="font-bold">Images (up to {MAX_IMAGES})</legend>
          <p className="waitlist-note">Public https links to JPEG, PNG, WebP or GIF files of 1 MB or less.</p>
          {media.map((m, i) => (
            <label key={i} className="grid gap-1 font-normal">
              Image {i + 1} link
              <input
                type="url"
                inputMode="url"
                placeholder="https://"
                className={field}
                value={m}
                onChange={(e) => setMedia((list) => list.map((v, j) => (j === i ? e.target.value : v)))}
              />
            </label>
          ))}
        </fieldset>
        <label htmlFor="post-at">Publish at</label>
        <input id="post-at" type="datetime-local" className={field} value={at} onChange={(e) => setAt(e.target.value)} aria-describedby="post-at-note" />
        <p id="post-at-note" className="waitlist-note">
          In your time zone, {zone}. Needed only for Schedule.
        </p>
        {messages}
        <div className="waitlist-row">
          <button type="submit" name="mode" value="draft" disabled={busy !== null}>
            {busy === "draft" ? "Saving..." : "Save draft"}
          </button>
          <button type="submit" name="mode" value="schedule" disabled={busy !== null}>
            {busy === "schedule" ? "Scheduling..." : "Schedule"}
          </button>
          <button type="submit" name="mode" value="publish" disabled={busy !== null}>
            {busy === "publish" ? "Publishing..." : "Publish now"}
          </button>
        </div>
      </form>
      {postId && confirm}
      <Link href="/app/posts" className={`justify-self-start ${linkButton}`}>
        Back to posts
      </Link>
    </div>
  );
}
