"use client";

import { useEffect, useState, type ReactNode } from "react";
import Link from "next/link";
import type { Failure } from "@/lib/auth";
import { listConnections } from "@/lib/connections";
import { listPosts, monthRange, monthWeeks, postDay, sameDay, type Post, type PostStatus } from "@/lib/posts";
import { listSets, type SocialSet } from "@/lib/sets";
import { PlatformIcon, platforms } from "@/components/platform-icons";
import { isFailure, problemText } from "@/components/team-ui";
import { Icon } from "@/components/ui";

export const postMessages: Partial<Record<Failure, ReactNode>> = {
  too_long: "Bluesky posts can be at most 300 characters (and 3000 bytes).",
  too_many_images: "Add at most 4 images.",
  invalid_media: "Images must be https links to JPEG, PNG, WebP or GIF files of 1 MB or less.",
  empty_post: "Write something or add an image first.",
  invalid_set: "That set no longer exists. Pick another one.",
  unsupported_platform: "Only Bluesky can publish today.",
  too_many_posts: "This team has 2000 posts, the most allowed. Delete some first.",
  not_editable: "This post is publishing or already went out, so it can't change. Reload to see it.",
  not_deletable: "A post that is publishing or failed can't be deleted.",
  publish_quota: "The team reached its limit of 100 published posts today. Schedule this one for tomorrow.",
  rate_limited: "Too many publish or take down actions. Wait a minute, then try again.",
  not_found: "This post no longer exists.",
};

export const statusName: Record<PostStatus, string> = {
  draft: "Draft",
  scheduled: "Scheduled",
  queued: "Publishing",
  published: "Published",
  failed: "Failed",
  deleted: "Taken down",
};

const time = (d: Date) => d.toLocaleTimeString(undefined, { timeStyle: "short" });
const snippet = (p: Post) => (p.body.trim() ? p.body.trim().slice(0, 60) + (p.body.trim().length > 60 ? "..." : "") : "(images only)");
const bluesky = platforms.find((p) => p.id === "bluesky")!;
const legend: PostStatus[] = ["scheduled", "queued", "published", "failed", "deleted"];

export function StatusBadge({ status }: { status: PostStatus }) {
  return (
    <span className="badge tone" data-status={status}>
      {statusName[status]}
    </span>
  );
}

// Shown when the team has no Bluesky account, since posts go to every Bluesky account of their set.
export function BlueskyNote() {
  const [missing, setMissing] = useState(false);
  useEffect(() => {
    listConnections().then((r) => setMissing(Array.isArray(r) && !r.some((c) => c.provider === "bluesky")));
  }, []);
  if (!missing) return null;
  return (
    <div className="card flex flex-wrap items-center gap-4 border-signal/40 p-5">
      <span className="grid size-11 place-items-center rounded-xl bg-[#e7f1ff]" style={{ color: bluesky.color }}>
        <PlatformIcon platform={bluesky} className="size-6" />
      </span>
      <p className="min-w-0 flex-1 basis-60">
        <strong className="block">Connect an account first</strong>
        <span className="text-ink-soft">No Bluesky account is connected to this team yet, so posts have nowhere to go.</span>
      </p>
      <Link href="/app/connections" className="btn btn-primary">
        Connect an account
      </Link>
    </div>
  );
}

export function Posts() {
  const now = new Date();
  const [month, setMonth] = useState({ y: now.getFullYear(), m: now.getMonth() });
  const [setId, setSetId] = useState("");
  const [sets, setSets] = useState<SocialSet[] | Failure | null>(null);
  const [posts, setPosts] = useState<Post[] | Failure | null>(null);
  const [drafts, setDrafts] = useState<Post[] | Failure | null>(null);

  useEffect(() => {
    listSets().then(setSets);
  }, []);

  useEffect(() => {
    let live = true;
    listPosts({ social_set_id: setId, ...monthRange(month.y, month.m) }).then((r) => live && setPosts(r));
    return () => {
      live = false;
    };
  }, [month, setId]);

  useEffect(() => {
    let live = true;
    listPosts({ social_set_id: setId, status: "draft" }).then((r) => live && setDrafts(r));
    return () => {
      live = false;
    };
  }, [setId]);

  const step = (by: number) => setMonth(({ y, m }) => ({ y: m + by < 0 ? y - 1 : m + by > 11 ? y + 1 : y, m: (m + by + 12) % 12 }));
  const title = new Date(month.y, month.m, 1).toLocaleDateString(undefined, { month: "long", year: "numeric" });
  // 1 January 2024 was a Monday, so these are Monday to Sunday in the browser's language.
  const weekdays = Array.from({ length: 7 }, (_, i) => new Date(2024, 0, 1 + i).toLocaleDateString(undefined, { weekday: "short" }));
  const calendarPosts = Array.isArray(posts) ? posts.filter((p) => p.status !== "draft") : [];
  const setName = (id: string) => (Array.isArray(sets) ? sets.find((s) => s.id === id)?.name : undefined);

  return (
    <div className="grid gap-10">
      <BlueskyNote />
      <section aria-labelledby="month-heading" className="grid gap-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <button type="button" className="icon-btn" aria-label="Previous month" onClick={() => step(-1)}>
              <Icon name="left" />
            </button>
            <button type="button" className="icon-btn" aria-label="Next month" onClick={() => step(1)}>
              <Icon name="right" />
            </button>
            <h2 id="month-heading" className="ml-2 font-display text-xl font-extrabold tracking-tight" aria-live="polite">
              {title}
            </h2>
          </div>
          {Array.isArray(sets) && (
            <label className="flex items-center gap-2 text-sm font-bold">
              Set
              <select value={setId} onChange={(e) => setSetId(e.target.value)} className="field w-auto py-1.5 font-normal">
                <option value="">All sets</option>
                {sets.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </select>
            </label>
          )}
        </div>
        {posts === null ? (
          <div className="h-96 rounded-2xl bg-ink/5 motion-safe:animate-pulse" role="status">
            <span className="sr-only">Loading posts...</span>
          </div>
        ) : isFailure(posts) ? (
          <p role="alert" className="waitlist-error">
            Posts couldn&apos;t be loaded. {problemText(posts, postMessages)}
          </p>
        ) : (
          <div className="card overflow-x-auto">
            <table className="w-full min-w-[46rem] table-fixed border-collapse text-sm">
              <caption className="sr-only">Posts in {title}</caption>
              <thead>
                <tr>
                  {weekdays.map((w) => (
                    <th key={w} scope="col" className="border-b border-ink/10 px-2 py-2 text-left text-xs font-bold text-ink-soft">
                      {w}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {monthWeeks(month.y, month.m).map((week, i) => (
                  <tr key={i}>
                    {week.map((day, j) => {
                      const items = day ? calendarPosts.filter((p) => sameDay(postDay(p) ?? new Date(0), day)) : [];
                      const today = day && sameDay(day, now);
                      return (
                        <td
                          key={j}
                          aria-current={today ? "date" : undefined}
                          className={`h-28 border-ink/10 p-1.5 align-top [&:not(:last-child)]:border-r ${i > 0 ? "border-t" : ""} ${
                            day ? (today ? "bg-signal/5" : "") : "bg-canvas"
                          }`}
                        >
                          {day && (
                            <>
                              <p
                                className={`mb-1 grid size-6 place-items-center rounded-full text-xs font-bold ${
                                  today ? "bg-signal text-paper" : "text-ink-soft"
                                }`}
                              >
                                {day.getDate()}
                              </p>
                              {items.length > 0 && (
                                <ul className="grid gap-1">
                                  {items.map((p) => {
                                    const remote = p.targets.filter((t) => t.remote_url && t.status === "published");
                                    return (
                                      <li key={p.id} className="tone flex min-w-0 items-center rounded-md text-xs" data-status={p.status}>
                                        <Link href={`/app/posts/${p.id}`} className="min-w-0 flex-1 truncate rounded-md px-1.5 py-1 hover:underline">
                                          <strong>{time(postDay(p)!)}</strong> {snippet(p)}
                                        </Link>
                                        <span className="sr-only">{statusName[p.status]}</span>
                                        {remote.map((t) => (
                                          <a
                                            key={t.id}
                                            href={t.remote_url!}
                                            target="_blank"
                                            rel="noopener noreferrer"
                                            aria-label="View on Bluesky"
                                            className="shrink-0 rounded-md p-1 hover:bg-ink/10"
                                          >
                                            <Icon name="external" className="size-3.5" />
                                          </a>
                                        ))}
                                      </li>
                                    );
                                  })}
                                </ul>
                              )}
                            </>
                          )}
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <ul aria-label="Colors" className="flex flex-wrap gap-2">
          {legend.map((s) => (
            <li key={s}>
              <StatusBadge status={s} />
            </li>
          ))}
        </ul>
      </section>
      <section aria-labelledby="drafts-heading" className="grid gap-4">
        <h2 id="drafts-heading" className="font-display text-xl font-extrabold tracking-tight">
          Drafts
        </h2>
        {drafts === null ? (
          <p className="text-ink-soft">Loading drafts...</p>
        ) : isFailure(drafts) ? (
          <p role="alert" className="waitlist-error">
            Drafts couldn&apos;t be loaded. {problemText(drafts, postMessages)}
          </p>
        ) : drafts.length === 0 ? (
          <p className="text-ink-soft">No drafts. Posts you save without scheduling show up here.</p>
        ) : (
          <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {drafts.map((p) => (
              <li key={p.id} className="tone relative grid content-start gap-2 rounded-2xl bg-paper p-4 hover:bg-ink/[0.02]" data-status="draft">
                <Link href={`/app/posts/${p.id}`} className="font-bold text-ink after:absolute after:inset-0 after:rounded-2xl">
                  {snippet(p)}
                </Link>
                <p className="text-sm text-ink-soft">
                  {setName(p.social_set_id) ? `${setName(p.social_set_id)}. ` : ""}Saved{" "}
                  {new Date(p.updated_at).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" })}.
                </p>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
