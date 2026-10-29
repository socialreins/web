"use client";

import { useEffect, useState, type ReactNode } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { getMe, type Failure, type MeResult } from "@/lib/auth";
import { listConnections } from "@/lib/connections";
import { listPosts, monthRange, monthWeeks, postDay, sameDay, type Post, type PostStatus } from "@/lib/posts";
import { listSets, type SocialSet } from "@/lib/sets";
import { isFailure, linkButton, problemText } from "@/components/team-ui";

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

const heading = "font-display text-2xl font-extrabold tracking-tight";
const time = (d: Date) => d.toLocaleTimeString(undefined, { timeStyle: "short" });
export const snippet = (p: Post) => (p.body.trim() ? p.body.trim().slice(0, 60) + (p.body.trim().length > 60 ? "..." : "") : "(images only)");

// Shown when the team has no Bluesky account, since posts go to every Bluesky account of their set.
export function BlueskyNote() {
  const [missing, setMissing] = useState(false);
  useEffect(() => {
    listConnections().then((r) => setMissing(Array.isArray(r) && !r.some((c) => c.provider === "bluesky")));
  }, []);
  if (!missing) return null;
  return (
    <p className="waitlist-done">
      No Bluesky account is connected to this team yet, so posts have nowhere to go.{" "}
      <Link href="/app/connections" className={linkButton}>
        Connect one
      </Link>
    </p>
  );
}

export function RemoteLinks({ post }: { post: Post }) {
  const links = post.targets.filter((t) => t.remote_url && t.status === "published");
  return links.map((t) => (
    <a key={t.id} href={t.remote_url!} target="_blank" rel="noopener noreferrer" className={`text-sm ${linkButton}`}>
      View on Bluesky
    </a>
  ));
}

// The session cookie is on the API host, invisible to Next server code, so the check runs here.
export function Posts() {
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
  return <PostsPage />;
}

function PostsPage() {
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
    <>
      <BlueskyNote />
      <div className="flex flex-wrap items-end gap-4">
        <Link
          href="/app/posts/new"
          className="rounded-full border-2 border-ink bg-ink px-5 py-2 font-bold text-paper hover:border-signal-deep hover:bg-signal-deep"
        >
          New post
        </Link>
        {Array.isArray(sets) && (
          <label className="grid gap-1 font-bold">
            Set
            <select value={setId} onChange={(e) => setSetId(e.target.value)} className="rounded-full border-2 border-ink bg-paper px-4 py-2 font-normal">
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
      <section aria-labelledby="month-heading" className="grid gap-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 id="month-heading" className={heading} aria-live="polite">
            {title}
          </h2>
          <div className="flex gap-4">
            <button type="button" className={linkButton} onClick={() => step(-1)}>
              Previous month
            </button>
            <button type="button" className={linkButton} onClick={() => step(1)}>
              Next month
            </button>
          </div>
        </div>
        {posts === null ? (
          <p className="text-ink-soft">Loading posts...</p>
        ) : isFailure(posts) ? (
          <p role="alert" className="waitlist-error">
            Posts couldn&apos;t be loaded. {problemText(posts, postMessages)}
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[42rem] table-fixed border-collapse text-sm">
              <caption className="sr-only">Posts in {title}</caption>
              <thead>
                <tr>
                  {weekdays.map((w) => (
                    <th key={w} scope="col" className="p-1 text-left text-ink-soft">
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
                      return (
                        <td key={j} className="h-24 border border-ink/10 bg-paper p-1 align-top">
                          {day && (
                            <>
                              <p className="font-bold">{day.getDate()}</p>
                              {items.length > 0 && (
                                <ul className="grid gap-1">
                                  {items.map((p) => (
                                    <li key={p.id} className="grid">
                                      <Link href={`/app/posts/${p.id}`} className="truncate underline decoration-signal underline-offset-2 hover:text-signal-deep">
                                        {time(postDay(p)!)} {snippet(p)}
                                      </Link>
                                      <span className="text-ink-soft">{statusName[p.status]}</span>
                                      <RemoteLinks post={p} />
                                    </li>
                                  ))}
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
      </section>
      <section aria-labelledby="drafts-heading" className="grid gap-3">
        <h2 id="drafts-heading" className={heading}>
          Drafts
        </h2>
        {drafts === null ? (
          <p className="text-ink-soft">Loading drafts...</p>
        ) : isFailure(drafts) ? (
          <p role="alert" className="waitlist-error">
            Drafts couldn&apos;t be loaded. {problemText(drafts, postMessages)}
          </p>
        ) : drafts.length === 0 ? (
          <p>No drafts.</p>
        ) : (
          <ul className="grid gap-2">
            {drafts.map((p) => (
              <li key={p.id} className="grid gap-1 border-l-4 border-ink bg-paper px-4 py-3">
                <Link href={`/app/posts/${p.id}`} className={`justify-self-start ${linkButton}`}>
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
    </>
  );
}
