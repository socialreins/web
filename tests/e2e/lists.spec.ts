import { expect, test, type Page } from "@playwright/test";

test.use({ timezoneId: "Europe/Berlin" });

const me = { id: "u-me", email: "me@example.com", name: "Me", username: null, current_team: { id: "t1", name: "Acme", role: "member" } };
const sets = [
  { id: "d", name: "Default", is_default: true, account_ids: [], account_count: 0, created_at: "2026-10-01T10:00:00Z", deleted_at: null },
  { id: "s1", name: "Clients", is_default: false, account_ids: [], account_count: 0, created_at: "2026-10-01T10:00:00Z", deleted_at: null },
];
type Ref = { id: string; name: string; position: number };
const post = (id: string, extra: Record<string, unknown> = {}) => ({
  id,
  social_set_id: "d",
  platform: "bluesky",
  body: `Body of ${id}`,
  media: [] as string[],
  status: "scheduled",
  scheduled_at: "2026-11-12T09:30:00Z" as string | null,
  published_at: null,
  error: null,
  created_by: "u-me",
  created_at: "2026-11-01T10:00:00Z",
  updated_at: "2026-11-01T10:00:00Z",
  targets: [],
  lists: [] as Ref[],
  ...extra,
});
const list = (extra: Record<string, unknown> = {}) => ({
  id: "l1",
  social_set_id: null as string | null,
  name: "Series",
  remote_ids: {},
  created_at: "2026-11-01T10:00:00Z",
  updated_at: "2026-11-01T10:00:00Z",
  ...extra,
});

async function brain(page: Page) {
  await page.route("**/auth/me", (route) => route.fulfill({ json: me }));
  await page.route(/\/v1\/social-sets$/, (route) => route.fulfill({ json: sets }));
  await page.route("**/v1/connections", (route) => route.fulfill({ json: [] }));
}

test("app links to lists", async ({ page }) => {
  await brain(page);
  await page.route(/\/v1\/lists$/, (route) => route.fulfill({ json: [] }));
  await page.route(/\/v1\/posts(\?.*)?$/, (route) => route.fulfill({ json: [] }));
  await page.goto("/app/posts");
  await page.getByRole("link", { name: "Lists", exact: true }).click();
  await expect(page).toHaveURL("/app/lists");
});

test("creates, renames and deletes a list", async ({ page }) => {
  await brain(page);
  let sent: unknown = null;
  await page.route(/\/v1\/lists$/, (route) => {
    if (route.request().method() === "POST") {
      sent = route.request().postDataJSON();
      return route.fulfill({ status: 201, json: { ...list({ social_set_id: "s1" }), items: [] } });
    }
    return route.fulfill({ json: [list({ id: "l0", name: "Alpha" })] });
  });
  await page.route(/\/v1\/lists\/l0$/, (route) => route.fulfill({ status: 204 }));
  await page.route(/\/v1\/lists\/l1$/, (route) =>
    route.request().method() === "DELETE"
      ? route.fulfill({ status: 204 })
      : route.fulfill({ json: { ...list({ social_set_id: "s1", name: "Tips" }), items: [] } }),
  );
  await page.goto("/app/lists");
  await expect(page.getByRole("link", { name: "Alpha" })).toBeVisible();
  await page.getByLabel("New list name").fill("Series");
  await page.getByLabel("Set").selectOption("s1");
  await page.getByRole("button", { name: "Create list" }).click();
  await expect(page.getByText("Created Series.")).toBeVisible();
  expect(sent).toEqual({ name: "Series", social_set_id: "s1" });
  await expect(page.getByRole("link", { name: "Series" })).toHaveAttribute("href", "/app/lists/l1");
  await expect(page.getByText("Clients", { exact: true }).last()).toBeVisible();

  await page.getByRole("button", { name: "Rename Series" }).click();
  await page.getByLabel("New name for Series").fill("Tips");
  await page.getByRole("button", { name: "Save name" }).click();
  await expect(page.getByRole("link", { name: "Tips" })).toBeVisible();
  await expect(page.getByText("Renamed to Tips.")).toBeAttached();
  await expect(page.getByRole("button", { name: "Rename Tips" })).toBeFocused();

  // Deleting moves focus to the next list, or to the name field after the last one.
  await page.getByRole("button", { name: "Delete Alpha" }).click();
  await page.getByRole("button", { name: "Yes, delete" }).click();
  await expect(page.getByRole("link", { name: "Alpha" })).toBeHidden();
  await expect(page.getByRole("link", { name: "Tips" })).toBeFocused();

  await page.getByRole("button", { name: "Delete Tips" }).click();
  await expect(page.getByRole("button", { name: "Yes, delete" })).toBeFocused();
  await page.getByRole("button", { name: "Yes, delete" }).click();
  await expect(page.getByText("Deleted Tips. Its posts stay.")).toBeAttached();
  await expect(page.getByRole("link", { name: "Tips" })).toBeHidden();
  await expect(page.getByLabel("New list name")).toBeFocused();
});

test("adds, reorders and removes posts in a list", async ({ page }) => {
  await brain(page);
  const all = [post("p1", { body: "First video" }), post("p2", { body: "Second video" }), post("p3", { body: "Third video", social_set_id: "s1" })];
  let ids = ["p1"];
  const detail = () => ({ ...list(), items: ids.map((id, i) => ({ post_id: id, position: i + 1, post: all.find((p) => p.id === id) })) });
  const orders: unknown[] = [];
  await page.route(/\/v1\/posts(\?.*)?$/, (route) => route.fulfill({ json: all }));
  await page.route(/\/v1\/lists\/l1$/, (route) => route.fulfill({ json: detail() }));
  await page.route(/\/v1\/lists\/l1\/posts$/, (route) => {
    ids = [...ids, route.request().postDataJSON().post_id];
    return route.fulfill({ json: detail() });
  });
  await page.route(/\/v1\/lists\/l1\/order$/, (route) => {
    ids = route.request().postDataJSON().post_ids;
    orders.push(ids);
    return route.fulfill({ json: detail() });
  });
  await page.route(/\/v1\/lists\/l1\/posts\/p\d$/, (route) => {
    ids = ids.filter((id) => !route.request().url().endsWith(id));
    return route.fulfill({ status: 204 });
  });

  await page.goto("/app/lists/l1");
  await expect(page.getByRole("heading", { name: "Series" })).toBeVisible();
  await expect(page.getByText("All sets")).toBeVisible();
  const items = page.getByRole("list", { name: "Posts in Series" }).getByRole("listitem");
  await expect(items).toHaveCount(1);

  // Team-wide: posts of any set that are not in the list yet.
  const add = page.getByLabel("Add post");
  await expect(add.getByRole("option")).toHaveText(["Pick a post", "Second video", "Third video"]);
  await add.selectOption({ label: "Second video" });
  await page.getByRole("button", { name: "Add to list" }).click();
  await expect(page.getByRole("status").filter({ hasText: "Added as Part 2." })).toBeVisible();
  await expect(items).toHaveCount(2);
  await expect(items.nth(1)).toContainText("Part 2");
  await expect(items.nth(1)).toContainText("Second video");

  await page.getByRole("button", { name: "Move Part 2 up" }).click();
  await expect(page.getByText("Moved to Part 1.")).toBeAttached();
  expect(orders).toEqual([["p2", "p1"]]);
  await expect(items.nth(0)).toContainText("Second video");
  await expect(items.nth(0)).toContainText("Part 1");
  // At the top Move up is off, so focus lands on Move down.
  await expect(page.getByRole("button", { name: "Move Part 1 down" })).toBeFocused();

  await page.getByRole("button", { name: "Remove Part 1 from the list" }).click();
  await expect(page.getByText("Removed from the list. The post stays.")).toBeAttached();
  await expect(items).toHaveCount(1);
  await expect(items.nth(0)).toContainText("Part 1");
  await expect(items.nth(0)).toContainText("First video");
  // Focus goes to the next post's Remove, then to Add post once the list is empty.
  await expect(page.getByRole("button", { name: "Remove Part 1 from the list" })).toBeFocused();
  await page.getByRole("button", { name: "Remove Part 1 from the list" }).click();
  await expect(page.getByText("No posts in this list yet")).toBeVisible();
  await expect(page.getByLabel("Add post")).toBeFocused();
});

test("the calendar and phone list show Part N of a list", async ({ page }) => {
  await page.clock.setFixedTime(new Date("2026-11-10T12:00:00+01:00"));
  await brain(page);
  await page.route(/\/v1\/posts(\?.*)?$/, (route) =>
    route.fulfill({
      json:
        new URL(route.request().url()).searchParams.get("status") === "draft"
          ? []
          : [post("p1", { body: "Launch day", lists: [{ id: "l1", name: "Series", position: 2 }] })],
    }),
  );
  await page.goto("/app/posts");
  const table = page.getByRole("table", { name: "Posts in November 2026" });
  await expect(table.getByRole("link", { name: /^Part 2 · Series.*Launch day$/ })).toBeVisible();

  await page.setViewportSize({ width: 390, height: 844 });
  await expect(page.getByRole("list", { name: "Posts in November 2026" }).getByRole("link", { name: /^Part 2 · Series/ })).toBeVisible();
});

test("the post editor puts a new post in a list", async ({ page }) => {
  await brain(page);
  await page.route(/\/v1\/lists$/, (route) => route.fulfill({ json: [list(), list({ id: "l2", name: "Other set", social_set_id: "s1" })] }));
  let sent: Record<string, unknown> = {};
  await page.route(/\/v1\/posts$/, (route) => {
    sent = route.request().postDataJSON();
    return route.fulfill({ status: 201, json: post("p9", { status: "draft", scheduled_at: null, lists: [{ id: "l1", name: "Series", position: 1 }] }) });
  });
  await page.goto("/app/posts/new");
  const select = page.getByLabel("List", { exact: true });
  // Only lists the Default set's posts can join.
  await expect(select.getByRole("option")).toHaveText(["No list", "Series"]);
  await select.selectOption({ label: "Series" });
  await page.getByLabel("Post", { exact: true }).fill("Part one");
  await page.getByRole("button", { name: "Save draft" }).click();
  await expect(page.getByRole("status")).toHaveText("Draft saved.");
  expect(sent.list_id).toBe("l1");
  await expect(page.getByText("Now Part 1 · Series.")).toBeVisible();
  await expect(select).toHaveValue("");
});

test("a move refused as stale reloads the list", async ({ page }) => {
  await brain(page);
  const a = post("p1", { body: "First video" });
  const b = post("p2", { body: "Second video" });
  let gets = 0;
  await page.route(/\/v1\/posts(\?.*)?$/, (route) => route.fulfill({ json: [a, b] }));
  await page.route(/\/v1\/lists\/l1$/, (route) => {
    gets += 1;
    const order = gets === 1 ? [a, b] : [b, a];
    return route.fulfill({ json: { ...list(), items: order.map((p, i) => ({ post_id: p.id, position: i + 1, post: p })) } });
  });
  await page.route(/\/v1\/lists\/l1\/order$/, (route) => route.fulfill({ status: 422, json: { error: "invalid_order" } }));
  await page.goto("/app/lists/l1");
  await page.getByRole("button", { name: "Move Part 2 up" }).click();
  await expect(page.getByText("The list changed elsewhere, so it was reloaded.", { exact: false })).toBeVisible();
  const items = page.getByRole("list", { name: "Posts in Series" }).getByRole("listitem");
  await expect(items.nth(0)).toContainText("Second video");
});
