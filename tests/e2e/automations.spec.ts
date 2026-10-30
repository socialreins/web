import { expect, test, type Page } from "@playwright/test";

type Role = "owner" | "admin" | "member";
const me = (role: Role) => ({
  id: "u-me",
  email: "me@example.com",
  name: "Me",
  username: null,
  current_team: { id: "t1", name: "Acme", role },
});
const alice = {
  id: "c1",
  provider: "bluesky",
  external_id: "did:plc:alice",
  handle: "alice.bsky.social",
  display_name: "Alice",
  avatar_url: null,
  token_expires_at: null,
  set_ids: ["d"],
  dm_access: true,
  created_at: "2026-10-20T10:00:00Z",
};
const automation = (id: string, name: string, extra = {}) => ({
  id,
  name,
  active: true,
  activated_at: "2026-10-28T10:00:00Z",
  trigger: "comment_received",
  conditions: { social_set_id: null, account_ids: [], post_remote_ids: [], keywords: ["price", "link"], first_per_author: false },
  actions: [{ type: "send_dm", text: "Hi {name}, here it is" }],
  fallback_public_reply: "Check your DMs, {name}",
  created_by: "u-me",
  created_at: "2026-10-28T10:00:00Z",
  updated_at: "2026-10-28T10:00:00Z",
  ...extra,
});
const run = (id: string, status: string, reason: string | null, results: unknown[]) => ({
  id,
  automation_id: "a1",
  inbox_item_id: "p1",
  status,
  reason,
  results,
  created_at: "2026-10-29T10:00:00Z",
  updated_at: "2026-10-29T10:00:00Z",
});
const runs = [
  run("r1", "sent", "dm_not_allowed", [
    { type: "send_dm", status: "skipped", reason: "dm_not_allowed", remote_id: null },
    { type: "fallback_public_reply", status: "sent", reason: null, remote_id: "at://x" },
  ]),
  run("r2", "skipped", "no_dm_access", [{ type: "send_dm", status: "skipped", reason: "no_dm_access", remote_id: null }]),
  run("r3", "skipped", "daily_cap", []),
];

async function brain(page: Page, role: Role) {
  const state = { list: [automation("a1", "Price to DM", { runs: { count: 3, last_at: runs[0]!.created_at } })], bodies: [] as unknown[] };
  await page.route("**/auth/me", (route) => route.fulfill({ json: me(role) }));
  await page.route("**/v1/connections", (route) => route.fulfill({ json: [alice] }));
  await page.route(/\/v1\/social-sets$/, (route) => route.fulfill({ json: [{ id: "d", name: "Default", is_default: true, account_ids: ["c1"], account_count: 1, created_at: "", deleted_at: null }] }));
  await page.route("**/v1/automations", (route) => {
    const req = route.request();
    if (req.method() === "POST") {
      state.bodies.push(req.postDataJSON());
      const made = automation("a2", req.postDataJSON().name, req.postDataJSON());
      state.list.push(made);
      return route.fulfill({ status: 201, json: made });
    }
    return route.fulfill({ json: state.list });
  });
  await page.route(/\/v1\/automations\/(a1|a2)$/, (route) => {
    const req = route.request();
    const id = req.url().split("/").pop()!;
    if (req.method() === "DELETE") {
      state.list = state.list.filter((a) => a.id !== id);
      return route.fulfill({ status: 204 });
    }
    if (req.method() === "PUT") {
      state.bodies.push(req.postDataJSON());
      return route.fulfill({ json: automation(id, req.postDataJSON().name, req.postDataJSON()) });
    }
    return route.fulfill({ json: state.list.find((a) => a.id === id) });
  });
  await page.route(/\/v1\/automations\/a1\/(enable|disable)$/, (route) => {
    const on = route.request().url().endsWith("enable");
    state.list[0] = { ...state.list[0]!, active: on };
    return route.fulfill({ json: state.list[0] });
  });
  await page.route(/\/v1\/automations\/(a1|a2)\/runs/, (route) =>
    route.fulfill({ json: { runs: route.request().url().includes("/a1/") ? runs : [], next_cursor: null } }),
  );
  return state;
}

test("lists automations with summary, runs and a switch", async ({ page }) => {
  const state = await brain(page, "owner");
  await page.goto("/app/automations");
  const card = page.getByRole("listitem").filter({ hasText: "Price to DM" });
  await expect(card).toContainText("Comment contains: price, link");
  await expect(card).toContainText("All accounts. Sends a DM, or replies publicly if it can't.");
  await expect(card).toContainText("3 runs, last");
  const toggle = card.getByRole("switch", { name: "Price to DM" });
  await expect(toggle).toHaveAttribute("aria-checked", "true");
  await toggle.click();
  await expect(toggle).toHaveAttribute("aria-checked", "false");
  await expect(card).toContainText("3 runs, last");
  expect(state.list[0]!.active).toBe(false);
});

test("members see automations but can't change them", async ({ page }) => {
  await brain(page, "member");
  await page.goto("/app/automations");
  await expect(page.getByText("Price to DM")).toBeVisible();
  await expect(page.getByRole("link", { name: "New automation" })).toHaveCount(0);
  await expect(page.getByRole("switch")).toHaveCount(0);
  await page.getByRole("link", { name: "Price to DM" }).click();
  await expect(page.getByRole("heading", { name: "Run history" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Edit" })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Delete" })).toHaveCount(0);
});

test("creates a comment-to-DM automation with post links", async ({ page }) => {
  const state = await brain(page, "admin");
  await page.goto("/app/automations");
  await page.getByRole("link", { name: "New automation" }).click();
  await expect(page).toHaveURL("/app/automations/new");
  await page.getByLabel("Name").fill("Guide");
  await page.getByLabel("Comment contains").fill("guide");
  await page.getByLabel("Comment contains").press("Enter");
  await page.getByLabel("Specific posts").check();
  await page.getByLabel("Post links").fill("https://bsky.app/profile/alice.bsky.social/post/3abc\nhttps://bsky.app/profile/stranger.bsky.social/post/3def");
  await page.getByLabel("DM text").fill("Hi {name}, the guide: https://example.com");
  await expect(page.getByText("Hi Sam, the guide: https://example.com")).toBeVisible();
  await expect(page.getByText("99 of 1000 characters")).toBeVisible();
  await page.getByLabel("Public reply").fill("Sent you a DM!");
  await page.getByLabel("If the DM can't be delivered, reply publicly instead").check();
  await page.getByLabel("First comment per person only").check();
  await page.getByRole("button", { name: "Create automation" }).click();
  await expect(page.getByRole("alert").filter({ hasText: "isn't a post" })).toContainText("stranger.bsky.social");
  await expect(page.getByLabel("Post links")).toBeFocused();
  expect(state.bodies).toHaveLength(0);
  await page.getByLabel("Post links").fill("https://bsky.app/profile/alice.bsky.social/post/3abc\nat://did:plc:bob/app.bsky.feed.post/3xyz");
  await page.getByRole("button", { name: "Create automation" }).click();
  await expect(page).toHaveURL("/app/automations/a2");
  expect(state.bodies[0]).toEqual({
    name: "Guide",
    trigger: "comment_received",
    conditions: {
      social_set_id: null,
      account_ids: [],
      post_remote_ids: ["at://did:plc:alice/app.bsky.feed.post/3abc", "at://did:plc:bob/app.bsky.feed.post/3xyz"],
      keywords: ["guide"],
      first_per_author: true,
    },
    actions: [{ type: "send_dm", text: "Hi {name}, the guide: https://example.com" }],
    active: true,
    fallback_public_reply: "Sent you a DM!",
  });
});

test("detail shows runs with readable reasons, edits and deletes", async ({ page }) => {
  const state = await brain(page, "owner");
  await page.goto("/app/automations/a1");
  const history = page.getByRole("region", { name: "Run history" });
  await expect(history.getByRole("listitem").filter({ hasText: "Sent" }).first()).toContainText("They only accept DMs from people they follow");
  await expect(history).toContainText("Reconnect with an app password that allows DMs");
  await expect(history).toContainText("The team reached 500 automation runs today");
  await expect(history.getByRole("link", { name: "Open the comment" }).first()).toHaveAttribute("href", "/app/inbox?item=p1");

  await page.getByRole("button", { name: "Edit" }).click();
  await expect(page.getByLabel("If the DM can't be delivered, reply publicly instead")).toBeChecked();
  await page.getByLabel("If the DM can't be delivered, reply publicly instead").uncheck();
  await page.getByRole("button", { name: "Save automation" }).click();
  await expect(page.getByRole("button", { name: "Edit" })).toBeFocused();
  await expect(page.getByRole("status").filter({ hasText: "Automation saved." })).toBeVisible();
  expect(state.bodies[0]).toMatchObject({
    actions: [
      { type: "send_dm", text: "Hi {name}, here it is" },
      { type: "reply_publicly", text: "Check your DMs, {name}" },
    ],
    fallback_public_reply: null,
  });
  await expect(page.getByText("Sends a DM and replies publicly")).toBeVisible();

  await page.getByRole("button", { name: "Delete" }).click();
  await page.getByRole("button", { name: "Yes, delete" }).click();
  await expect(page).toHaveURL("/app/automations");
  await expect(page.getByText("No automations yet")).toBeVisible();
});
