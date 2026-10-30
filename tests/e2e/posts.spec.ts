import { expect, test, type Page } from "@playwright/test";

// Fixed zone so "Publish at" converts to a known UTC time.
test.use({ timezoneId: "Europe/Berlin" });

const me = {
  id: "u-me",
  email: "me@example.com",
  name: "Me",
  username: null,

  current_team: { id: "t1", name: "Acme", role: "member" },
};
const sets = [
  { id: "d", name: "Default", is_default: true, account_ids: ["c1"], account_count: 1, created_at: "2026-10-01T10:00:00Z", deleted_at: null },
  { id: "s1", name: "Clients", is_default: false, account_ids: [], account_count: 0, created_at: "2026-10-01T10:00:00Z", deleted_at: null },
];
const alice = {
  id: "c1",
  provider: "bluesky",
  external_id: "did:plc:alice",
  handle: "alice.bsky.social",
  display_name: "Alice",
  avatar_url: null,
  token_expires_at: null,
  set_ids: ["d"],
  created_at: "2026-10-20T10:00:00Z",
};
type Post = ReturnType<typeof post>;
const post = (id: string, extra: Record<string, unknown> = {}) => ({
  id,
  social_set_id: "d",
  platform: "bluesky",
  body: `Body of ${id}`,
  media: [] as string[],
  status: "draft",
  scheduled_at: null as string | null,
  published_at: null as string | null,
  error: null as string | null,
  created_by: "u-me",
  created_at: "2026-11-01T10:00:00Z",
  updated_at: "2026-11-01T10:00:00Z",
  targets: [] as Record<string, unknown>[],
  ...extra,
});
const target = (extra: Record<string, unknown> = {}) => ({
  id: "tg1",
  social_account_id: "c1",
  status: "published",
  remote_id: "at://did:plc:alice/app.bsky.feed.post/1",
  remote_url: "https://bsky.app/profile/alice.bsky.social/post/1",
  error: null,
  published_at: "2026-11-03T08:00:00Z",
  ...extra,
});

async function brain(page: Page, { accounts = [alice] }: { accounts?: unknown[] } = {}) {
  await page.route("**/auth/me", (route) => route.fulfill({ json: me }));
  await page.route(/\/v1\/social-sets$/, (route) => route.fulfill({ json: sets }));
  await page.route("**/v1/connections", (route) => route.fulfill({ json: accounts }));
}

test("app links to posts", async ({ page }) => {
  await brain(page);
  await page.route(/\/v1\/posts(\?.*)?$/, (route) => route.fulfill({ json: [] }));
  await page.goto("/app");
  await page.getByRole("link", { name: "Posts", exact: true }).click();
  await expect(page).toHaveURL("/app/posts");
});

test("posts sends a signed-out visitor to login", async ({ page }) => {
  await page.route("**/auth/me", (route) => route.fulfill({ status: 401, json: { error: "unauthorized" } }));
  await page.goto("/app/posts");
  await expect(page).toHaveURL("/login");
});

test("calendar shows the month's posts, drafts below, with filter and month steps", async ({ page }) => {
  await page.clock.setFixedTime(new Date("2026-11-10T12:00:00+01:00"));
  await brain(page);
  const queries: URLSearchParams[] = [];
  await page.route(/\/v1\/posts(\?.*)?$/, (route) => {
    const q = new URL(route.request().url()).searchParams;
    queries.push(q);
    if (q.get("status") === "draft") return route.fulfill({ json: [post("p-draft", { body: "An unfinished thought" })] });
    if (q.get("from")?.startsWith("2026-10-31")) {
      return route.fulfill({
        json: [
          post("p-sched", { status: "scheduled", scheduled_at: "2026-11-12T09:30:00Z", body: "Launch day" }),
          post("p-pub", { status: "published", scheduled_at: "2026-11-03T08:00:00Z", published_at: "2026-11-03T08:00:00Z", body: "Hello Bluesky", targets: [target()] }),
        ],
      });
    }
    return route.fulfill({ json: [] });
  });
  await page.goto("/app/posts");
  await expect(page.getByRole("heading", { name: "November 2026" })).toBeVisible();
  const table = page.getByRole("table", { name: "Posts in November 2026" });
  await expect(table.getByRole("link", { name: /^10:30.*Launch day$/ })).toHaveAttribute("href", "/app/posts/p-sched");
  await expect(table.getByRole("link", { name: /^0?9:00.*Hello Bluesky$/ })).toHaveAttribute("href", "/app/posts/p-pub");
  await expect(table.getByRole("link", { name: "View on Bluesky" })).toHaveAttribute("href", "https://bsky.app/profile/alice.bsky.social/post/1");
  await expect(page.getByRole("region", { name: "Drafts" }).getByRole("link", { name: "An unfinished thought" })).toHaveAttribute("href", "/app/posts/p-draft");
  expect(queries[0]?.get("to")).toBe("2026-11-30T23:00:00.000Z");

  await page.getByRole("button", { name: "Next month" }).click();
  await expect(page.getByRole("heading", { name: "December 2026" })).toBeVisible();
  await expect.poll(() => queries.some((q) => q.get("from") === "2026-11-30T23:00:00.000Z")).toBe(true);
  await page.getByLabel("Set").selectOption("s1");
  await expect.poll(() => queries.some((q) => q.get("social_set_id") === "s1" && q.get("status") === "draft")).toBe(true);
});

test("on a phone the month is a list of days, not a wide grid", async ({ page }) => {
  await page.clock.setFixedTime(new Date("2026-11-10T12:00:00+01:00"));
  await page.setViewportSize({ width: 390, height: 844 });
  await brain(page);
  await page.route(/\/v1\/posts(\?.*)?$/, (route) =>
    route.fulfill({
      json: new URL(route.request().url()).searchParams.get("status") === "draft" ? [] : [post("p-sched", { status: "scheduled", scheduled_at: "2026-11-12T09:30:00Z", body: "Launch day" })],
    }),
  );
  await page.goto("/app/posts");
  await expect(page.getByRole("table")).toBeHidden();
  const days = page.getByRole("list", { name: "Posts in November 2026" });
  await expect(days.getByRole("link", { name: /Launch day/ })).toHaveAttribute("href", "/app/posts/p-sched");
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
});

test("a team without Bluesky sees a note linking to connections", async ({ page }) => {
  await brain(page, { accounts: [] });
  await page.goto("/app/posts/new");
  const note = page.getByText("No Bluesky account is connected to this team yet");
  await expect(note).toBeVisible();
  await expect(page.getByRole("link", { name: "Connect an account" })).toHaveAttribute("href", "/app/connections");
});

test("compose checks length, images and schedule before asking brain", async ({ page }) => {
  await brain(page);
  let creates = 0;
  await page.route("**/v1/posts", (route) => {
    creates++;
    return route.fulfill({ status: 422, json: { error: "invalid_media" } });
  });
  await page.goto("/app/posts/new");
  const body = page.getByLabel("Post", { exact: true });
  await body.fill("👨‍👩‍👧");
  await expect(page.getByText("1 of 300 characters")).toBeVisible();
  await body.fill("a".repeat(301));
  await expect(page.getByText("301 of 300 characters")).toBeVisible();
  await expect(body).toHaveAttribute("aria-invalid", "true");
  await expect(page.getByRole("alert").filter({ hasText: "1 over Bluesky's limit" })).toBeVisible();
  await page.getByRole("button", { name: "Save draft" }).click();
  await expect(page.getByRole("alert").filter({ hasText: "at most 300 characters" })).toBeVisible();

  await body.fill("");
  await page.getByRole("button", { name: "Save draft" }).click();
  await expect(page.getByRole("alert").filter({ hasText: "Write something or add an image" })).toBeVisible();

  await body.fill("Hello");
  await page.getByRole("button", { name: "Add image" }).click();
  await expect(page.getByLabel("Image 1 link")).toBeFocused();
  await page.getByLabel("Image 1 link").fill("http://example.com/a.png");
  await page.getByRole("button", { name: "Save draft" }).click();
  await expect(page.getByRole("alert").filter({ hasText: "must be https links" })).toBeVisible();
  await page.getByLabel("Image 1 link").fill("");
  await page.getByRole("button", { name: "Schedule" }).click();
  await expect(page.getByRole("alert").filter({ hasText: "Pick a date and time" })).toBeVisible();
  expect(creates).toBe(0);

  // brain still judges, e.g. an image over 1 MB.
  await page.getByLabel("Image 1 link").fill("https://example.com/huge.png");
  await page.getByRole("button", { name: "Save draft" }).click();
  await expect(page.getByRole("alert").filter({ hasText: "must be https links" })).toBeVisible();
  expect(creates).toBe(1);
});

test("schedule sends the local time as UTC and moves to the post's address", async ({ page }) => {
  await brain(page);
  let sent: Record<string, unknown> | undefined;
  await page.route("**/v1/posts", (route) => {
    sent = route.request().postDataJSON();
    return route.fulfill({ status: 201, json: post("p1", { ...sent, status: "scheduled" }) });
  });
  await page.goto("/app/posts/new");
  await page.getByLabel("Set").selectOption("s1");
  await page.getByLabel("Post", { exact: true }).fill("Launch day");
  await page.getByRole("button", { name: "Add image" }).click();
  await page.getByLabel("Image 1 link").fill("https://example.com/a.png");
  await page.getByLabel("Publish at").fill("2026-11-20T09:30");
  await expect(page.getByText("In your time zone, Europe/Berlin.", { exact: false })).toBeVisible();
  await page.getByRole("button", { name: "Schedule" }).click();
  await expect(page.getByText(/^Scheduled for .*20, 2026/).last()).toBeFocused();
  await expect(page).toHaveURL("/app/posts/p1");
  expect(sent).toEqual({
    social_set_id: "s1",
    platform: "bluesky",
    body: "Launch day",
    media: ["https://example.com/a.png"],
    scheduled_at: "2026-11-20T08:30:00.000Z",
  });
});

test("publish now polls until the post is published", async ({ page }) => {
  await brain(page);
  let state: Post = post("p2");
  let polls = 0;
  await page.route("**/v1/posts", (route) => {
    state = post("p2", { body: route.request().postDataJSON().body });
    return route.fulfill({ status: 201, json: state });
  });
  await page.route("**/v1/posts/p2/publish", (route) => {
    state = { ...state, status: "queued", scheduled_at: new Date().toISOString() };
    return route.fulfill({ status: 202, json: state });
  });
  await page.route("**/v1/posts/p2", (route) => {
    polls++;
    if (polls >= 2) state = { ...state, status: "published", published_at: new Date().toISOString(), targets: [target()] };
    return route.fulfill({ json: state });
  });
  await page.goto("/app/posts/new");
  await page.getByLabel("Post", { exact: true }).fill("Right now");
  await page.getByRole("button", { name: "Publish now" }).click();
  await expect(page.getByRole("status").filter({ hasText: "Publishing. This page updates by itself." })).toBeFocused();
  await expect(page.getByRole("status").filter({ hasText: /^Published on / })).toBeVisible({ timeout: 10_000 });
  // No "publishing" message is left behind once the post is out.
  await expect(page.getByText(/Publishing|Sent to Bluesky/)).toHaveCount(0);
  await expect(page.getByRole("link", { name: "View on Bluesky" })).toHaveAttribute("href", "https://bsky.app/profile/alice.bsky.social/post/1");
  await expect(page.getByText("Alice: published")).toBeVisible();
  expect(polls).toBe(2);
});

test("publish now explains the daily quota", async ({ page }) => {
  await brain(page);
  await page.route("**/v1/posts", (route) => route.fulfill({ status: 201, json: post("p4") }));
  await page.route("**/v1/posts/p4/publish", (route) => route.fulfill({ status: 429, json: { error: "publish_quota" } }));
  await page.goto("/app/posts/new");
  await page.getByLabel("Post", { exact: true }).fill("One too many");
  await page.getByRole("button", { name: "Publish now" }).click();
  await expect(page.getByRole("alert").filter({ hasText: "limit of 100 published posts today" })).toBeVisible();
  await expect(page).toHaveURL("/app/posts/p4");
});

test("take down shows brain's message when it can't finish, then succeeds", async ({ page }) => {
  await brain(page);
  const published = post("p3", { status: "published", scheduled_at: "2026-11-03T08:00:00Z", published_at: "2026-11-03T08:00:00Z", targets: [target()] });
  let deletes = 0;
  await page.route("**/v1/posts/p3", (route) => {
    if (route.request().method() === "GET") return route.fulfill({ json: published });
    deletes++;
    return deletes === 1
      ? route.fulfill({ status: 422, json: { error: "takedown_failed", message: "Alice's app password was revoked. Delete the post on Bluesky by hand." } })
      : route.fulfill({ json: { ...published, status: "deleted", targets: [target({ status: "deleted" })] } });
  });
  await page.goto("/app/posts/p3");
  await expect(page.getByLabel("Post", { exact: true })).toHaveCount(0);
  await page.getByRole("button", { name: "Take down" }).click();
  await expect(page.getByRole("button", { name: "Yes, take it down" })).toBeFocused();
  await page.getByRole("button", { name: "Yes, take it down" }).click();
  await expect(page.getByRole("alert").filter({ hasText: "Alice's app password was revoked. Delete the post on Bluesky by hand." })).toBeVisible();
  await expect(page.getByRole("button", { name: "Take down" })).toBeFocused();
  await page.getByRole("button", { name: "Take down" }).click();
  await page.getByRole("button", { name: "Yes, take it down" }).click();
  await expect(page.getByText("Taken down from Bluesky.")).toBeFocused();
  await expect(page.getByRole("status").filter({ hasText: "Taken down." })).toBeVisible();
  await expect(page.getByRole("button", { name: "Take down" })).toHaveCount(0);
});

test("a failed post is read-only with its error and target statuses", async ({ page }) => {
  await brain(page);
  await page.route("**/v1/posts/p5", (route) =>
    route.fulfill({
      json: post("p5", {
        status: "failed",
        error: "Alice: the image is over 1 MB.",
        targets: [target({ status: "failed", remote_url: null, error: "image too large" })],
      }),
    }),
  );
  await page.goto("/app/posts/p5");
  await expect(page.getByRole("status").filter({ hasText: "Failed." })).toBeVisible();
  await expect(page.getByText("What went wrong: Alice: the image is over 1 MB.")).toBeVisible();
  await expect(page.getByText("Alice: failed. image too large")).toBeVisible();
  await expect(page.getByRole("button", { name: /Delete|Take down|Save draft/ })).toHaveCount(0);
});

test("a draft can be edited and deleted", async ({ page }) => {
  await brain(page);
  const calls: string[] = [];
  await page.route("**/v1/posts/p6", (route) => {
    const m = route.request().method();
    calls.push(m);
    if (m === "GET") return route.fulfill({ json: post("p6", { body: "Old words" }) });
    if (m === "PUT") return route.fulfill({ json: post("p6", { body: route.request().postDataJSON().body }) });
    return route.fulfill({ status: 204 });
  });
  await page.route(/\/v1\/posts(\?.*)?$/, (route) => route.fulfill({ json: [] }));
  await page.goto("/app/posts/p6");
  await expect(page.getByLabel("Post", { exact: true })).toHaveValue("Old words");
  await page.getByLabel("Post", { exact: true }).fill("New words");
  await page.getByRole("button", { name: "Save draft" }).click();
  await expect(page.getByText("Draft saved.")).toBeFocused();
  await page.getByRole("button", { name: "Delete" }).click();
  await page.getByRole("button", { name: "Yes, delete" }).click();
  await expect(page).toHaveURL("/app/posts");
  expect(calls).toEqual(["GET", "PUT", "DELETE"]);
});
