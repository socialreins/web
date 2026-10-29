import { api, failure, request, type Failure } from "@/lib/auth";
import { CONNECT_TIMEOUT_MS } from "@/lib/connections";

export type PostStatus = "draft" | "scheduled" | "queued" | "published" | "failed" | "deleted";
export type Target = {
  id: string;
  social_account_id: string | null;
  status: "pending" | "publishing" | "published" | "failed" | "deleted";
  remote_id: string | null;
  remote_url: string | null;
  error: string | null;
  published_at: string | null;
};
export type Post = {
  id: string;
  social_set_id: string;
  platform: "bluesky";
  body: string;
  media: string[];
  status: PostStatus;
  scheduled_at: string | null;
  published_at: string | null;
  error: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
  targets: Target[];
};
export type PostInput = {
  social_set_id: string;
  platform: "bluesky";
  body: string;
  media: string[];
  // ISO time to publish; null keeps the post a draft. A past time means now.
  scheduled_at: string | null;
};
export type PostFilter = { social_set_id?: string; status?: PostStatus; from?: string; to?: string };

// Bluesky's limits, as brain checks them.
export const MAX_GRAPHEMES = 300;
export const MAX_BYTES = 3000;
export const MAX_IMAGES = 4;

const enc = encodeURIComponent;

export function listPosts(filter: PostFilter = {}) {
  const q = new URLSearchParams(Object.entries(filter).filter((e): e is [string, string] => Boolean(e[1])));
  return api<Post[]>(`/v1/posts${q.size ? `?${q}` : ""}`);
}
export const getPost = (id: string) => api<Post>(`/v1/posts/${enc(id)}`);
export const createPost = (input: PostInput) => api<Post>("/v1/posts", "POST", input);
export const updatePost = (id: string, input: PostInput) => api<Post>(`/v1/posts/${enc(id)}`, "PUT", input);
// 202 with the post queued; poll getPost until it is published or failed.
export const publishPost = (id: string) => api<Post>(`/v1/posts/${enc(id)}/publish`, "POST");

export type DeleteResult = "ok" | Post | Failure | { takedownFailed: string };

// "ok": a draft or scheduled post is gone. A Post: a published post was taken down. brain answers
// a takedown it could not finish with 422 and a message saying what to do.
export async function deletePost(id: string): Promise<DeleteResult> {
  // A takedown calls Bluesky for every account, so it gets the connect timeout.
  const res = await request(`/v1/posts/${enc(id)}`, "DELETE", undefined, CONNECT_TIMEOUT_MS);
  if (typeof res === "string") return res;
  if (res.status === 204) return "ok";
  if (res.ok) return ((await res.json().catch(() => null)) as Post | null) ?? "error";
  const body = await res.clone().json().catch(() => null);
  if (body?.error === "takedown_failed") return { takedownFailed: String(body.message ?? "") };
  return failure(res);
}

const segmenter = typeof Intl !== "undefined" && "Segmenter" in Intl ? new Intl.Segmenter(undefined, { granularity: "grapheme" }) : null;
// What Bluesky counts as characters: user-perceived graphemes, so an emoji family is one.
export const graphemes = (text: string) => (segmenter ? [...segmenter.segment(text)].length : [...text].length);
export const utf8Bytes = (text: string) => new TextEncoder().encode(text).length;

// Mirrors brain's checks, so most mistakes show before a request. brain stays the judge.
export function checkPost(body: string, media: string[]): Failure | null {
  if (!body.trim() && media.length === 0) return "empty_post";
  if (graphemes(body) > MAX_GRAPHEMES || utf8Bytes(body) > MAX_BYTES) return "too_long";
  if (media.length > MAX_IMAGES) return "too_many_images";
  if (media.some((m) => !/^https:\/\/[^\s/]+\/?\S*$/.test(m))) return "invalid_media";
  return null;
}

// datetime-local works in the browser's time zone: "2026-11-02T09:30" is local time.
const pad = (n: number) => String(n).padStart(2, "0");
export function toLocalInput(iso: string | null) {
  if (!iso) return "";
  const d = new Date(iso);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}
export const fromLocalInput = (value: string) => (value ? new Date(value).toISOString() : null);

// The local month as an ISO range: from inclusive, to exclusive, as brain filters scheduled_at.
export const monthRange = (year: number, month: number) => ({
  from: new Date(year, month, 1).toISOString(),
  to: new Date(year, month + 1, 1).toISOString(),
});

// Weeks of the month, Monday first; days outside the month are null.
export function monthWeeks(year: number, month: number): (Date | null)[][] {
  const first = new Date(year, month, 1);
  const days = new Date(year, month + 1, 0).getDate();
  const lead = (first.getDay() + 6) % 7;
  const cells: (Date | null)[] = [
    ...Array<null>(lead).fill(null),
    ...Array.from({ length: days }, (_, i) => new Date(year, month, i + 1)),
  ];
  while (cells.length % 7) cells.push(null);
  return Array.from({ length: cells.length / 7 }, (_, w) => cells.slice(w * 7, w * 7 + 7));
}

// The day a post sits on in the calendar: when it is planned for, else when it went out.
export const postDay = (p: Post) => {
  const when = p.scheduled_at ?? p.published_at;
  return when ? new Date(when) : null;
};

export const sameDay = (a: Date, b: Date) =>
  a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
