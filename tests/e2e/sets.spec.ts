import { expect, test, type Page } from "@playwright/test";

type Role = "owner" | "admin" | "member";
const me = (role: Role) => ({
  id: "u-me",
  email: "me@example.com",
  name: "Me",
  username: null,
  has_password: true,
  current_team: { id: "t1", name: "Acme", role },
});
const account = (id: string, name: string) => ({
  id,
  provider: "bluesky",
  external_id: `did:plc:${id}`,
  handle: `${name.toLowerCase()}.bsky.social`,
  display_name: name,
  avatar_url: null,
  token_expires_at: null,
  set_ids: ["d"],
  created_at: "2026-10-20T10:00:00Z",
});
const set = (id: string, name: string, accountIds: string[], extra = {}) => ({
  id,
  name,
  is_default: id === "d",
  account_ids: accountIds,
  account_count: accountIds.length,
  created_at: "2026-10-01T10:00:00Z",
  deleted_at: null as string | null,
  ...extra,
});

// A small in-memory brain for sets, so reloads see each change.
async function brain(page: Page, role: Role) {
  const state = {
    live: [set("d", "Default", ["c1", "c2"]), set("s1", "Clients", ["c1"])],
    deleted: [set("s9", "Old", [], { deleted_at: "2026-10-20T10:00:00Z" })] as ReturnType<typeof set>[],
    accounts: [{ ...account("c1", "Alice"), set_ids: ["d", "s1"] }, account("c2", "Bob")],
  };
  await page.route("**/auth/me", (route) => route.fulfill({ json: me(role) }));
  await page.route("**/v1/connections", (route) => route.fulfill({ json: state.accounts }));
  await page.route("**/v1/connections/providers", (route) => route.fulfill({ json: [{ provider: "bluesky", configured: true }] }));
  await page.route(/\/v1\/social-sets(\?deleted=true)?$/, (route) => {
    const req = route.request();
    if (req.method() === "POST") {
      const created = set("s2", req.postDataJSON().name, []);
      state.live.push(created);
      return route.fulfill({ status: 201, json: created });
    }
    return route.fulfill({ json: req.url().endsWith("?deleted=true") ? state.deleted : state.live });
  });
  return state;
}

test("app and connections link to sets", async ({ page }) => {
  await brain(page, "owner");
  await page.goto("/app");
  await expect(page.getByRole("link", { name: "Sets", exact: true })).toHaveAttribute("href", "/app/sets");
  await page.goto("/app/connections");
  await page.getByRole("link", { name: "Manage sets" }).click();
  await expect(page).toHaveURL("/app/sets");
});

test("sets sends a signed-out visitor to login", async ({ page }) => {
  await page.route("**/auth/me", (route) => route.fulfill({ status: 401, json: { error: "unauthorized" } }));
  await page.goto("/app/sets");
  await expect(page).toHaveURL("/login");
});

test("lists sets with Default pinned and never deletable", async ({ page }) => {
  await brain(page, "owner");
  await page.goto("/app/sets");
  const items = page.getByRole("region", { name: "Sets" }).getByRole("listitem").filter({ has: page.locator("p.font-bold") });
  await expect(items.first()).toContainText("DefaultDefault, pinned");
  await expect(items.first()).toContainText("2 accounts");
  await expect(page.getByRole("list", { name: "Accounts in Clients" })).toHaveText("AAlice");
  await expect(page.getByRole("button", { name: "Rename Default" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Delete Default" })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Delete Clients" })).toBeVisible();
  await expect(page.getByText(/Old.*\n?.*0 accounts\. Deleted .*\. Gone for good on /)).toBeVisible();
});

test("create explains a taken name, then creates", async ({ page }) => {
  const state = await brain(page, "admin");
  let first = true;
  await page.route("**/v1/social-sets", (route) => {
    if (route.request().method() !== "POST" || !first) return route.fallback();
    first = false;
    return route.fulfill({ status: 409, json: { error: "name_taken" } });
  });
  await page.goto("/app/sets");
  await page.getByLabel("New set name").fill("Clients");
  await page.getByRole("button", { name: "Create set" }).click();
  await expect(page.getByRole("alert").filter({ hasText: "already has that name" })).toBeVisible();
  await page.getByLabel("New set name").fill("Friends");
  await page.getByRole("button", { name: "Create set" }).click();
  await expect(page.getByText("Created Friends.")).toBeFocused();
  expect(state.live.map((s) => s.name)).toEqual(["Default", "Clients", "Friends"]);
});

test("rename the Default set", async ({ page }) => {
  await brain(page, "owner");
  let body: unknown;
  await page.route("**/v1/social-sets/d", (route) => {
    body = route.request().postDataJSON();
    return route.fulfill({ json: set("d", "Everything", ["c1", "c2"]) });
  });
  await page.goto("/app/sets");
  await page.getByRole("button", { name: "Rename Default" }).click();
  const input = page.getByLabel("New name for Default");
  await expect(input).toBeFocused();
  await input.fill("Everything");
  await page.getByRole("button", { name: "Save name" }).click();
  await expect(page.getByText("Renamed to Everything.")).toBeFocused();
  expect(body).toEqual({ name: "Everything" });
});

test("delete asks first, needs the password or a fresh sign-in, then moves the set to Recently deleted", async ({ page }) => {
  const state = await brain(page, "owner");
  const bodies: unknown[] = [];
  await page.route("**/v1/social-sets/s1", (route) => {
    if (route.request().method() !== "DELETE") return route.fallback();
    bodies.push(route.request().postDataJSON());
    if (bodies.length === 1) return route.fulfill({ status: 403, json: { error: "reauth_required" } });
    const [gone] = state.live.splice(1, 1);
    state.deleted.unshift({ ...gone!, deleted_at: new Date().toISOString() });
    return route.fulfill({ status: 204 });
  });
  await page.goto("/app/sets");
  await page.getByRole("button", { name: "Delete Clients" }).click();
  await expect(page.getByLabel("Your password")).toBeFocused();
  await page.getByRole("button", { name: "Cancel" }).click();
  await expect(page.getByRole("button", { name: "Delete Clients" })).toBeFocused();
  await page.getByRole("button", { name: "Delete Clients" }).click();
  await expect(page.getByRole("button", { name: "Yes, delete" })).toHaveAccessibleDescription(/Delete Clients\?/);
  await page.getByRole("button", { name: "Yes, delete" }).click();
  const reauth = page.getByRole("alert").filter({ hasText: "you need a fresh sign-in" });
  await expect(reauth).toBeVisible();
  await expect(reauth.getByRole("link", { name: "sign in again" })).toHaveAttribute("href", "/login");
  await page.getByLabel("Your password").fill("secret");
  await page.getByRole("button", { name: "Yes, delete" }).click();
  await expect(page.getByText("Deleted Clients. You can restore it for 30 days.")).toBeFocused();
  await expect(page.getByRole("button", { name: "Restore Clients" })).toBeVisible();
  expect(bodies).toEqual([{}, { password: "secret" }]);
});

test("restore explains a taken name and the cap, then restores", async ({ page }) => {
  const state = await brain(page, "owner");
  let tries = 0;
  await page.route("**/v1/social-sets/s9/restore", (route) => {
    tries++;
    if (tries === 1) return route.fulfill({ status: 409, json: { error: "name_taken" } });
    if (tries === 2) return route.fulfill({ status: 409, json: { error: "too_many_sets" } });
    const [back] = state.deleted.splice(0, 1);
    state.live.push({ ...back!, deleted_at: null });
    return route.fulfill({ json: { ...back, deleted_at: null } });
  });
  await page.goto("/app/sets");
  const restore = page.getByRole("button", { name: "Restore Old" });
  await restore.click();
  await expect(page.getByRole("alert").filter({ hasText: "already has that name" })).toBeVisible();
  await restore.click();
  await expect(page.getByRole("alert").filter({ hasText: "50 sets" })).toBeVisible();
  await restore.click();
  await expect(page.getByText("Restored Old.")).toBeFocused();
  await expect(page.getByText("No recently deleted sets.")).toBeVisible();
  await expect(page.getByRole("button", { name: "Delete Old" })).toBeVisible();
});

test("a member sees sets read-only", async ({ page }) => {
  await brain(page, "member");
  await page.goto("/app/sets");
  await expect(page.getByText("Only team owners and admins can change sets.")).toBeVisible();
  await expect(page.getByLabel("New set name")).toHaveCount(0);
  await expect(page.getByRole("button", { name: /^(Rename|Delete|Restore)/ })).toHaveCount(0);
  await page.goto("/app/connections");
  await expect(page.getByText(/Sets: Default, Clients\./)).toBeVisible();
  await expect(page.getByRole("button", { name: /Edit sets/ })).toHaveCount(0);
});

test("connections edits an account's sets with Default locked", async ({ page }) => {
  const state = await brain(page, "owner");
  const bodies: unknown[] = [];
  await page.route("**/v1/connections/c2/sets", (route) => {
    bodies.push(route.request().postDataJSON());
    if (bodies.length === 1) return route.fulfill({ status: 422, json: { error: "invalid_sets" } });
    return route.fulfill({ json: { ...state.accounts[1], set_ids: ["d", "s1"] } });
  });
  await page.goto("/app/connections");
  await expect(page.getByText(/Sets: Default, Clients\./)).toBeVisible();
  await expect(page.getByText(/Sets: Default\.$/)).toBeVisible();
  await page.getByRole("button", { name: "Edit sets for Bob" }).click();
  const group = page.getByRole("group", { name: "Sets for Bob" });
  await expect(group.getByRole("checkbox", { name: /Default/ })).toBeChecked();
  await expect(group.getByRole("checkbox", { name: /Default/ })).toBeDisabled();
  await expect(group.getByRole("checkbox", { name: "Clients" })).toBeFocused();
  await group.getByRole("checkbox", { name: "Clients" }).check();
  await page.getByRole("button", { name: "Save sets" }).click();
  await expect(page.getByRole("alert").filter({ hasText: "no longer exists" })).toBeVisible();
  await page.getByRole("button", { name: "Save sets" }).click();
  await expect(page.getByText("Sets saved for Bob.")).toBeFocused();
  await expect(page.getByText(/Sets: Default, Clients\./)).toHaveCount(2);
  expect(bodies).toEqual([{ set_ids: ["d", "s1"] }, { set_ids: ["d", "s1"] }]);
});
