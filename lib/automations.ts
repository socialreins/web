import { api } from "@/lib/auth";
import type { Connection } from "@/lib/connections";
import { graphemes } from "@/lib/posts";

export type Conditions = {
  social_set_id?: string | null;
  account_ids: string[];
  // Bluesky at:// URIs of the posts commented on.
  post_remote_ids: string[];
  keywords: string[];
  first_per_author: boolean;
};
export type Action = { type: "send_dm" | "reply_publicly"; text: string };
export type Automation = {
  id: string;
  name: string;
  active: boolean;
  activated_at: string;
  trigger: "comment_received";
  conditions: Conditions;
  actions: Action[];
  fallback_public_reply: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
};
export type AutomationInput = Pick<Automation, "name" | "trigger" | "conditions" | "actions" | "active" | "fallback_public_reply">;
export type RunStatus = "running" | "sent" | "failed" | "skipped";
export type ActionResult = {
  type: "send_dm" | "reply_publicly" | "fallback_public_reply";
  status: Exclude<RunStatus, "running">;
  reason: string | null;
  remote_id: string | null;
};
export type Run = {
  id: string;
  automation_id: string;
  inbox_item_id: string;
  status: RunStatus;
  reason: string | null;
  results: ActionResult[];
  created_at: string;
  updated_at: string;
};
export type RunPage = { runs: Run[]; next_cursor: string | null };

const enc = encodeURIComponent;

export const listAutomations = () => api<Automation[]>("/v1/automations");
export const getAutomation = (id: string) => api<Automation>(`/v1/automations/${enc(id)}`);
export const createAutomation = (input: AutomationInput) => api<Automation>("/v1/automations", "POST", input);
export const updateAutomation = (id: string, input: AutomationInput) => api<Automation>(`/v1/automations/${enc(id)}`, "PUT", input);
export const deleteAutomation = (id: string) => api(`/v1/automations/${enc(id)}`, "DELETE");
export const switchAutomation = (id: string, on: boolean) =>
  api<Automation>(`/v1/automations/${enc(id)}/${on ? "enable" : "disable"}`, "POST");
export const listRuns = (id: string, cursor?: string | null) =>
  api<RunPage>(`/v1/automations/${enc(id)}/runs${cursor ? `?cursor=${enc(cursor)}` : ""}`);

// brain checks texts with every {name} at its longest, 64 characters.
const LONGEST_NAME = "n".repeat(64);
export const templateLength = (text: string) => graphemes(text.replaceAll("{name}", LONGEST_NAME));
// What a commenter called Sam would get, for the preview.
export const sample = (text: string, name = "Sam") => text.replaceAll("{name}", name);

const plain = /^[A-Za-z0-9.\-_~:]+$/;

// A Bluesky post link or at:// URI as the at://{did}/app.bsky.feed.post/{rkey} URI brain matches
// comments against. A handle in a link must be one of the team's accounts (comments land on
// their posts), so no lookup leaves the browser. null when it isn't one.
export function postUri(input: string, accounts: Pick<Connection, "provider" | "handle" | "external_id">[]): string | null {
  const s = input.trim();
  const at = /^at:\/\/([^/\s]+)\/app\.bsky\.feed\.post\/([^/\s]+)$/.exec(s);
  if (at) return at[1]!.startsWith("did:") && plain.test(at[1]!) && plain.test(at[2]!) ? s : null;
  const link = /^https:\/\/bsky\.app\/profile\/([^/\s?#]+)\/post\/([^/\s?#]+)\/?(?:[?#]\S*)?$/.exec(s);
  if (!link) return null;
  const [, actor, rkey] = link as unknown as [string, string, string];
  if (!plain.test(rkey) || !plain.test(actor)) return null;
  const did = actor.startsWith("did:")
    ? actor
    : accounts.find((a) => a.provider === "bluesky" && a.handle?.toLowerCase() === actor.toLowerCase())?.external_id;
  return did ? `at://${did}/app.bsky.feed.post/${rkey}` : null;
}

// The bsky.app link for an at:// post URI, as brain's bluesky::post_url builds it.
export const postLink = (uri: string) => {
  const m = /^at:\/\/([^/]+)\/app\.bsky\.feed\.post\/([^/]+)$/.exec(uri);
  return m ? `https://bsky.app/profile/${m[1]}/post/${m[2]}` : uri;
};

export const reasonText: Record<string, string> = {
  dm_not_allowed: "They only accept DMs from people they follow",
  no_dm_access: "Reconnect with an app password that allows DMs",
  daily_cap: "The team reached 500 automation runs today",
  rate_limited: "Bluesky is rate limiting this account",
  reconnect_required: "Bluesky refused the app password. Reconnect the account",
  interrupted: "Cut off by a restart, not retried",
  bluesky_refused: "Bluesky refused it",
  bluesky_unreachable: "Bluesky couldn't be reached",
  not_repliable: "This comment can't be replied to",
  too_long: "The text was too long",
  internal: "Something went wrong on our side",
};
export const reason = (code: string | null) => (code ? (reasonText[code] ?? code.replaceAll("_", " ")) : null);

export const actionName: Record<ActionResult["type"], string> = {
  send_dm: "DM",
  reply_publicly: "Public reply",
  fallback_public_reply: "Fallback reply",
};

// "Comment contains: price, link", "Any comment on 2 posts".
export function triggerSummary(c: Conditions) {
  const where = c.post_remote_ids.length ? ` on ${c.post_remote_ids.length === 1 ? "1 post" : `${c.post_remote_ids.length} posts`}` : "";
  const what = c.keywords.length ? `Comment contains: ${c.keywords.join(", ")}` : "Any comment";
  return `${what}${where}${c.first_per_author ? ", first per person" : ""}`;
}
