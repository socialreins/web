import { api, failure, request, type Failure } from "@/lib/auth";
import { CONNECT_TIMEOUT_MS } from "@/lib/connections";

export type Kind = "comment" | "mention" | "dm";
export const KINDS: Kind[] = ["comment", "mention", "dm"];
export type ItemState = "open" | "done";

export type Filters = {
  social_set_id?: string | null;
  account_ids: string[];
  kinds: Kind[];
  platforms: string[];
  keywords: string[];
  unanswered: boolean;
};
export type Inbox = { id: string; name: string; is_all: boolean; filters: Filters; created_at: string; updated_at: string };
export type Author = { id: string; handle: string | null; name: string | null; avatar_url: string | null };
export type Reply = {
  id: string;
  kind: "public" | "dm";
  text: string;
  remote_id: string | null;
  remote_url: string | null;
  sent_by: string | null;
  automation_id: string | null;
  created_at: string;
};
export type Item = {
  id: string;
  social_account_id: string;
  platform: string;
  kind: Kind;
  remote_id: string;
  remote_url: string | null;
  convo_id: string | null;
  post_id: string | null;
  author: Author;
  text: string;
  received_at: string;
  state: ItemState;
  replied_at: string | null;
  replies: Reply[];
};
export type ItemPage = { items: Item[]; next_cursor: string | null };

// Bluesky's limits as brain checks them: a public reply is a post, a DM is a chat message.
export const MAX_PUBLIC = 300;
export const MAX_DM = 1000;
export const maxFor = (kind: Kind) => (kind === "dm" ? MAX_DM : MAX_PUBLIC);

export const kindName: Record<Kind, string> = { comment: "Comment", mention: "Mention", dm: "DM" };

const enc = encodeURIComponent;

export const listInboxes = () => api<Inbox[]>("/v1/inboxes");
export const createInbox = (name: string, filters: Filters) => api<Inbox>("/v1/inboxes", "POST", { name, filters });
export const updateInbox = (id: string, name: string, filters: Filters) =>
  api<Inbox>(`/v1/inboxes/${enc(id)}`, "PUT", { name, filters });
export const deleteInbox = (id: string) => api(`/v1/inboxes/${enc(id)}`, "DELETE");

export function listItems(inboxId: string, state: ItemState, cursor?: string | null) {
  const q = new URLSearchParams({ state });
  if (cursor) q.set("cursor", cursor);
  return api<ItemPage>(`/v1/inboxes/${enc(inboxId)}/items?${q}`);
}
export const getItem = (id: string) => api<Item>(`/v1/inbox-items/${enc(id)}`);
export const setItemState = (id: string, state: ItemState) => api<Item>(`/v1/inbox-items/${enc(id)}`, "PATCH", { state });

// A send that did not happen: brain's code and its message saying what to do.
export type SendError = { code: string; message: string };
export type ReplyResult = Item | Failure | SendError;

// 201 with the item and its replies. Sending waits on Bluesky, so it gets the connect timeout.
export async function replyToItem(id: string, text: string): Promise<ReplyResult> {
  const res = await request(`/v1/inbox-items/${enc(id)}/reply`, "POST", { text }, CONNECT_TIMEOUT_MS);
  if (typeof res === "string") return res;
  if (res.ok) return ((await res.json().catch(() => null)) as Item | null) ?? "error";
  const body = await res.clone().json().catch(() => null);
  if (res.status === 422 && typeof body?.message === "string") return { code: String(body.error), message: body.message };
  return failure(res);
}

const units: [Intl.RelativeTimeFormatUnit, number][] = [
  ["year", 31_536_000],
  ["month", 2_592_000],
  ["week", 604_800],
  ["day", 86_400],
  ["hour", 3_600],
  ["minute", 60],
];
// "5 minutes ago", "yesterday"; under a minute is "now".
export function relativeTime(iso: string, now = Date.now()) {
  const seconds = Math.round((Date.parse(iso) - now) / 1000);
  const rtf = new Intl.RelativeTimeFormat(undefined, { numeric: "auto" });
  for (const [unit, size] of units) if (Math.abs(seconds) >= size) return rtf.format(Math.round(seconds / size), unit);
  return "now";
}

export const authorName = (a: Author) => a.name || (a.handle ? `@${a.handle}` : a.id);
