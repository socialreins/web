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
const filters = { social_set_id: null, account_ids: [], kinds: [], platforms: [], keywords: [], unanswered: false };
const inbox = (id: string, name: string, extra = {}) => ({
  id,
  name,
  is_all: id === "all",
  filters,
  created_at: "2026-10-20T10:00:00Z",
  updated_at: "2026-10-20T10:00:00Z",
  ...extra,
});
const ago = (minutes: number) => new Date(Date.now() - minutes * 60_000).toISOString();
const item = (id: string, kind: "comment" | "mention" | "dm", text: string, extra = {}) => ({
  id,
  social_account_id: "c1",
  platform: "bluesky",
  kind,
  remote_id: `at://did:plc:bob/app.bsky.feed.post/${id}`,
  remote_url: kind === "dm" ? null : `https://bsky.app/profile/did:plc:bob/post/${id}`,
  parent_remote_id: null,
  root_remote_id: null,
  convo_id: kind === "dm" ? "convo1" : null,
  post_id: null,
  author: { id: "did:plc:bob", handle: "bob.bsky.social", name: "Bob", avatar_url: null },
  text,
  received_at: ago(5),
  state: "open",
  replied_at: null as string | null,
  replies: [] as unknown[],
  ...extra,
});

// A small in-memory brain for the inbox.
async function brain(page: Page, role: Role, opts: { accounts?: unknown[]; items?: ReturnType<typeof item>[] } = {}) {
  const state = {
    inboxes: [inbox("all", "All"), inbox("i2", "Questions", { filters: { ...filters, keywords: ["price"] } })],
    items: opts.items ?? [
      item("p1", "comment", "What is the price?"),
      item("p2", "mention", "Loving @alice lately", { received_at: ago(90) }),
      item("p3", "dm", "Hi, can we talk?", { received_at: ago(60 * 30) }),
    ],
    bodies: [] as unknown[],
  };
  await page.route("**/auth/me", (route) => route.fulfill({ json: me(role) }));
  await page.route("**/v1/connections", (route) => route.fulfill({ json: opts.accounts ?? [alice] }));
  await page.route(/\/v1\/social-sets$/, (route) => route.fulfill({ json: [{ id: "d", name: "Default", is_default: true, account_ids: ["c1"], account_count: 1, created_at: "", deleted_at: null }] }));
  await page.route("**/v1/inboxes", (route) => {
    const req = route.request();
    if (req.method() === "POST") {
      state.bodies.push(req.postDataJSON());
      const made = inbox("i3", req.postDataJSON().name, { filters: req.postDataJSON().filters });
      state.inboxes.push(made);
      return route.fulfill({ status: 201, json: made });
    }
    return route.fulfill({ json: state.inboxes });
  });
  await page.route(/\/v1\/inboxes\/i2$/, (route) => {
    const req = route.request();
    if (req.method() === "DELETE") {
      state.inboxes = state.inboxes.filter((i) => i.id !== "i2");
      return route.fulfill({ status: 204 });
    }
    state.bodies.push(req.postDataJSON());
    return route.fulfill({ json: inbox("i2", req.postDataJSON().name) });
  });
  await page.route(/\/v1\/inboxes\/[^/]+\/items/, (route) => {
    const q = new URL(route.request().url()).searchParams;
    const kind = q.get("kind");
    return route.fulfill({ json: { items: state.items.filter((i) => i.state === q.get("state") && (!kind || i.kind === kind)), next_cursor: null } });
  });
  await page.route(/\/v1\/inbox-items\/[^/]+$/, (route) => {
    const id = route.request().url().split("/").pop()!;
    const found = state.items.find((i) => i.id === id);
    if (!found) return route.fulfill({ status: 404, json: { error: "not_found" } });
    if (route.request().method() === "PATCH") found.state = route.request().postDataJSON().state;
    return route.fulfill({ json: found });
  });
  return state;
}

test("sidebar lists Inbox second and Automations", async ({ page }) => {
  await brain(page, "owner");
  await page.goto("/app/posts");
  const links = page.getByRole("navigation", { name: "App" }).getByRole("link");
  await expect(links.nth(1)).toHaveText("Inbox");
  await expect(links.nth(2)).toHaveText("Automations");
});

test("inbox lists items, filters by kind, and opens one by URL", async ({ page }) => {
  await brain(page, "owner");
  await page.goto("/app/inbox");
  const nav = page.getByRole("navigation", { name: "Inboxes" });
  await expect(nav.getByRole("link").first()).toHaveText("All");
  await expect(nav.getByRole("link", { name: "All" })).toHaveAttribute("aria-current", "page");
  const list = page.getByRole("region", { name: "All" });
  const rows = list.getByRole("list", { name: "Items" }).getByRole("listitem");
  await expect(rows).toHaveCount(3);
  await expect(rows.first()).toContainText("Unanswered:");
  await expect(rows.first()).toContainText("5 minutes ago");
  await page.getByRole("button", { name: "DMs" }).click();
  await expect(page.getByRole("button", { name: "DMs" })).toHaveAttribute("aria-pressed", "true");
  await expect(rows).toHaveCount(1);
  await list.getByRole("link", { name: /Hi, can we talk/ }).click();
  await expect(page).toHaveURL("/app/inbox?item=p3");
  const detail = page.getByRole("region", { name: "Item" });
  await expect(detail.getByRole("heading", { name: "Bob" })).toBeFocused();
  await expect(detail.getByLabel("Send DM")).toBeVisible();
  await expect(detail.getByRole("link", { name: "View on Bluesky" })).toHaveCount(0);
  // A shared link opens the same item.
  await page.goto("/app/inbox/i2?item=p1");
  await expect(page.getByRole("region", { name: "Item" }).getByLabel("Reply publicly")).toBeVisible();
  await expect(page.getByRole("region", { name: "Item" }).getByRole("link", { name: "View on Bluesky" })).toHaveAttribute(
    "href",
    "https://bsky.app/profile/did:plc:bob/post/p1",
  );
  await expect(page.getByRole("navigation", { name: "Inboxes" }).getByRole("link", { name: "Questions" })).toHaveAttribute("aria-current", "page");
});

test("reply publicly, then mark done and reopen", async ({ page }) => {
  const state = await brain(page, "member");
  let sent: unknown;
  await page.route("**/v1/inbox-items/p1/reply", (route) => {
    sent = route.request().postDataJSON();
    const p1 = state.items.find((i) => i.id === "p1")!;
    p1.replied_at = new Date().toISOString();
    p1.replies = [{ id: "r1", kind: "public", text: sent && (sent as { text: string }).text, remote_id: null, remote_url: null, sent_by: "u-me", automation_id: null, created_at: p1.replied_at }];
    return route.fulfill({ status: 201, json: p1 });
  });
  await page.goto("/app/inbox?item=p1");
  // Members read and answer but don't manage inboxes.
  await expect(page.getByRole("button", { name: "New inbox" })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Edit Questions" })).toHaveCount(0);
  const detail = page.getByRole("region", { name: "Item" });
  await detail.getByLabel("Reply publicly").fill("It is free!");
  await expect(detail.getByText("11 of 300 characters")).toBeVisible();
  await detail.getByRole("button", { name: "Reply publicly" }).click();
  await expect(detail.getByText("Reply sent.")).toBeFocused();
  expect(sent).toEqual({ text: "It is free!" });
  await expect(detail.getByRole("list", { name: "Thread" })).toContainText("It is free!");
  await expect(detail.getByRole("list", { name: "Thread" })).toContainText("Team, public reply");
  await detail.getByRole("button", { name: "Mark done" }).click();
  await expect(detail.getByText("Marked done.")).toBeFocused();
  await expect(page.getByRole("region", { name: "All" }).getByRole("link", { name: /What is the price/ })).toHaveCount(0);
  await page.getByRole("link", { name: "Done", exact: true }).click();
  await expect(page).toHaveURL("/app/inbox?state=done&item=p1");
  await expect(page.getByRole("region", { name: "All" }).getByRole("link", { name: /What is the price/ })).toBeVisible();
  await detail.getByRole("button", { name: "Reopen" }).click();
  await expect(detail.getByText("Reopened.")).toBeFocused();
});

test("a DM that can't be sent says why", async ({ page }) => {
  await brain(page, "owner");
  await page.route("**/v1/inbox-items/p3/reply", (route) =>
    route.fulfill({ status: 422, json: { error: "no_dm_access", message: "The app password has no DM access." } }),
  );
  await page.goto("/app/inbox?item=p3");
  const detail = page.getByRole("region", { name: "Item" });
  await detail.getByLabel("Send DM").fill("Sure");
  await detail.getByRole("button", { name: "Send DM" }).click();
  await expect(detail.getByRole("alert")).toContainText("Reconnect with an app password that allows DMs");
  await expect(detail.getByRole("alert").getByRole("link", { name: "Open Accounts" })).toHaveAttribute("href", "/app/connections");
});

test("empty states: no accounts, then no items", async ({ page }) => {
  await brain(page, "owner", { accounts: [] });
  await page.goto("/app/inbox");
  await expect(page.getByText("No accounts connected")).toBeVisible();
  await expect(page.getByRole("link", { name: "Connect an account" })).toHaveAttribute("href", "/app/connections");
  await page.unrouteAll({ behavior: "ignoreErrors" });
  await brain(page, "owner", { items: [] });
  await page.goto("/app/inbox");
  await expect(page.getByText("New comments, mentions and DMs show up here within a minute")).toBeVisible();
});

test("owners create, edit and delete an inbox; All is not editable", async ({ page }) => {
  const state = await brain(page, "owner");
  await page.goto("/app/inbox");
  await expect(page.getByRole("button", { name: "Edit All" })).toHaveCount(0);
  await page.getByRole("button", { name: "New inbox" }).click();
  const dialog = page.getByRole("dialog", { name: "New inbox" });
  await dialog.getByLabel("Name").fill("DMs");
  await dialog.getByLabel("Pick accounts").check();
  await dialog.getByRole("checkbox", { name: "Alice" }).check();
  await dialog.getByRole("checkbox", { name: "DMs" }).check();
  await expect(dialog.getByRole("checkbox", { name: "Bluesky" })).toBeChecked();
  await expect(dialog.getByRole("checkbox", { name: "Instagram" })).toBeDisabled();
  await dialog.getByLabel("Keywords").fill("price, link");
  await dialog.getByLabel("Keywords").press("Enter");
  await expect(dialog.getByRole("button", { name: "Remove price" })).toBeVisible();
  await dialog.getByLabel("Unanswered only").check();
  await dialog.getByRole("button", { name: "Create inbox" }).click();
  await expect(dialog).toBeHidden();
  expect(state.bodies[0]).toEqual({
    name: "DMs",
    filters: { social_set_id: null, account_ids: ["c1"], kinds: ["dm"], platforms: [], keywords: ["price", "link"], unanswered: true },
  });
  await expect(page.getByRole("navigation", { name: "Inboxes" }).getByRole("link", { name: "DMs" })).toBeVisible();

  await page.getByRole("button", { name: "Edit Questions" }).click();
  const edit = page.getByRole("dialog", { name: "Edit Questions" });
  await expect(edit.getByRole("button", { name: "Remove price" })).toBeVisible();
  await edit.getByRole("button", { name: "Delete inbox" }).click();
  await edit.getByRole("button", { name: "Yes, delete" }).click();
  await expect(edit).toBeHidden();
  await expect(page.getByRole("navigation", { name: "Inboxes" }).getByRole("link", { name: "Questions" })).toHaveCount(0);
});

test.describe("on a phone", () => {
  test.use({ viewport: { width: 390, height: 844 } });
  test("panes stack with back links", async ({ page }) => {
    await brain(page, "owner");
    await page.goto("/app/inbox");
    await expect(page.getByRole("navigation", { name: "Inboxes" })).toBeVisible();
    await expect(page.getByRole("region", { name: "All" })).toBeHidden();
    await page.getByRole("navigation", { name: "Inboxes" }).getByRole("link", { name: "Questions" }).click();
    await expect(page.getByRole("navigation", { name: "Inboxes" })).toBeHidden();
    await page.getByRole("link", { name: /What is the price/ }).click();
    await expect(page.getByRole("region", { name: "Item" }).getByRole("heading", { name: "Bob" })).toBeVisible();
    await expect(page.getByRole("region", { name: "Questions" })).toBeHidden();
    await page.getByRole("link", { name: "Back to Questions" }).click();
    await expect(page).toHaveURL("/app/inbox/i2");
    await page.getByRole("link", { name: "Inboxes", exact: true }).click();
    await expect(page).toHaveURL("/app/inbox");
  });
});

test("a kind filter asks brain for that kind, and load more keeps it", async ({ page }) => {
  await brain(page, "owner", { items: [item("p1", "comment", "First page")] });
  const asked: URLSearchParams[] = [];
  await page.route(/\/v1\/inboxes\/all\/items/, (route) => {
    const q = new URL(route.request().url()).searchParams;
    asked.push(q);
    if (q.get("kind") !== "dm") return route.fulfill({ json: { items: [item("p1", "comment", "First page")], next_cursor: null } });
    return route.fulfill({
      json: q.get("cursor")
        ? { items: [item("p9", "dm", "Older DM", { received_at: ago(600) })], next_cursor: null }
        : { items: [item("p8", "dm", "Newer DM")], next_cursor: "p8" },
    });
  });
  await page.goto("/app/inbox");
  await page.getByRole("button", { name: "DMs" }).click();
  await expect(page.getByRole("link", { name: /Newer DM/ })).toBeVisible();
  await expect(page.getByRole("link", { name: /First page/ })).toHaveCount(0);
  await page.getByRole("button", { name: "Load more" }).click();
  await expect(page.getByRole("link", { name: /Older DM/ })).toBeVisible();
  expect(asked.at(-1)?.get("kind")).toBe("dm");
  expect(asked.at(-1)?.get("cursor")).toBe("p8");
});

test("the open list picks up new items without a reload", async ({ page }) => {
  await page.clock.install();
  const state = await brain(page, "owner", { items: [item("p1", "comment", "Older comment")] });
  await page.goto("/app/inbox");
  await expect(page.getByRole("link", { name: /Older comment/ })).toBeVisible();
  state.items.unshift(item("p7", "comment", "Brand new comment"));
  await page.clock.runFor(31_000);
  const rows = page.getByRole("list", { name: "Items" }).getByRole("listitem");
  await expect(rows.first()).toContainText("Brand new comment");
  await expect(rows).toHaveCount(2);
});
