import { expect, test, type Page } from "@playwright/test";

type Role = "owner" | "admin" | "member";
const me = (role: Role) => ({
  id: "u-me",
  email: "me@example.com",
  name: "Me",
  username: null,
  current_team: { id: "t1", name: "Acme", role },
});
const set = (id: string, name: string) => ({
  id,
  name,
  is_default: id === "d",
  account_ids: [],
  account_count: 0,
  created_at: "2026-10-01T10:00:00Z",
  deleted_at: null,
});
const token = (id: string, name: string, extra = {}) => ({
  id,
  name,
  social_set_id: null as string | null,
  prefix_hint: `sr_team_live_${id}`,
  created_by: "u-me",
  last_used_at: null as string | null,
  expires_at: null as string | null,
  created_at: "2026-10-01T10:00:00Z",
  ...extra,
});
const SECRET = "sr_set_live_k2abcdefghijklmnopqrstuvwxyz0123456789abcdefghijkl";

const items = (page: Page) => page.getByRole("region", { name: "Tokens" }).getByRole("listitem");

// A small in-memory brain for API tokens, so reloads see each change.
async function brain(page: Page, role: Role) {
  const state = {
    tokens: [
      token("k1", "Content Machine", { last_used_at: "2026-10-20T10:00:00Z" }),
      token("k0", "Clients bot", { social_set_id: "s1", expires_at: "2027-01-01T10:00:00Z" }),
    ],
    bodies: [] as unknown[],
    reauth: false,
  };
  await page.route("**/auth/me", (route) => route.fulfill({ json: me(role) }));
  await page.route(/\/v1\/social-sets$/, (route) => route.fulfill({ json: [set("d", "Default"), set("s1", "Clients")] }));
  await page.route("**/v1/api-tokens", (route) => {
    const req = route.request();
    if (role === "member") return route.fulfill({ status: 403, json: { error: "forbidden" } });
    if (req.method() !== "POST") return route.fulfill({ json: state.tokens });
    state.bodies.push(req.postDataJSON());
    if (state.reauth) return route.fulfill({ status: 403, json: { error: "reauth_required" } });
    const body = req.postDataJSON();
    const made = token("k2", body.name, { social_set_id: body.social_set_id ?? null, prefix_hint: "sr_set_live_k2ab" });
    state.tokens.unshift(made);
    return route.fulfill({ status: 201, json: { token: made, secret: SECRET } });
  });
  await page.route(/\/v1\/api-tokens\/[^/]+$/, (route) => {
    const id = route.request().url().split("/").pop();
    state.tokens = state.tokens.filter((t) => t.id !== id);
    return route.fulfill({ status: 204 });
  });
  return state;
}

test("the sidebar links to API tokens", async ({ page }) => {
  await brain(page, "owner");
  await page.goto("/app");
  await page.getByRole("link", { name: "API tokens", exact: true }).click();
  await expect(page).toHaveURL("/app/api-tokens");
});

test("lists tokens with scope, prefix and dates", async ({ page }) => {
  await brain(page, "admin");
  await page.goto("/app/api-tokens");
  const list = items(page);
  await expect(list).toHaveCount(2);
  await expect(list.first()).toContainText("Content Machine");
  await expect(list.first()).toContainText("Whole team. sr_team_live_k1...");
  await expect(list.first()).toContainText(/Created .+\. Last used .+2026\. Never expires\./);
  await expect(list.nth(1)).toContainText("Clients. sr_team_live_k0...");
  await expect(list.nth(1)).toContainText(/Last used never\. Expires .+2027\./);
});

test("create asks for a fresh sign-in, then shows the secret once", async ({ page, context }) => {
  await context.grantPermissions(["clipboard-read", "clipboard-write"]);
  const state = await brain(page, "owner");
  state.reauth = true;
  await page.goto("/app/api-tokens");
  await page.getByLabel("Token name").fill("Clients CM");
  await page.getByLabel("Scope").selectOption({ label: "Clients" });
  await page.getByLabel("Expires").selectOption({ label: "90 days" });
  await page.getByRole("button", { name: "Create token" }).click();
  const reauth = page.getByRole("alert").filter({ hasText: "needs a fresh sign-in" });
  await expect(reauth).toBeVisible();
  await expect(reauth.getByRole("link", { name: "Sign in again" })).toHaveAttribute("href", "/login?next=%2Fapp%2Fapi-tokens");
  await expect(page.getByLabel(/Secret for/)).toHaveCount(0);

  state.reauth = false;
  await page.getByRole("button", { name: "Create token" }).click();
  const secret = page.getByLabel("Secret for Clients CM");
  await expect(secret).toHaveValue(SECRET);
  await expect(secret).toHaveAttribute("readonly");
  await expect(secret).toBeFocused();
  await expect(page.getByText("It won't be shown again.")).toBeVisible();
  await expect(page.getByText(/curl -H "Authorization: Bearer <token>" http:\/\/\S+\/v1\/me/)).toBeVisible();
  await page.getByRole("button", { name: "Copy" }).click();
  await expect(page.getByRole("button", { name: "Copied" })).toBeVisible();
  expect(await page.evaluate(() => navigator.clipboard.readText())).toBe(SECRET);
  await page.getByRole("button", { name: "Done, hide the secret" }).click();
  await expect(page.getByLabel(/Secret for/)).toHaveCount(0);
  await expect(page.getByLabel("Token name")).toBeFocused();
  await expect(items(page).first()).toContainText("Clients CM");
  expect(state.bodies).toEqual([
    { name: "Clients CM", social_set_id: "s1", expires_in_days: 90 },
    { name: "Clients CM", social_set_id: "s1", expires_in_days: 90 },
  ]);
  // Never in the URL or storage, so a reload leaves only the hint.
  expect(page.url()).not.toContain(SECRET);
  expect(await page.evaluate(() => JSON.stringify({ ...localStorage, ...sessionStorage }))).not.toContain(SECRET);
  await page.reload();
  await expect(items(page).first()).toContainText("Clients CM");
  await expect(page.getByLabel(/Secret for/)).toHaveCount(0);
  await expect(page.getByText(SECRET)).toHaveCount(0);
});

test("explains the token limit", async ({ page }) => {
  await brain(page, "owner");
  await page.route("**/v1/api-tokens", (route) =>
    route.request().method() === "POST" ? route.fulfill({ status: 409, json: { error: "too_many_tokens" } }) : route.fallback(),
  );
  await page.goto("/app/api-tokens");
  await page.getByLabel("Token name").fill("One more");
  await page.getByRole("button", { name: "Create token" }).click();
  await expect(page.getByRole("alert").filter({ hasText: "20 tokens" })).toBeVisible();
});

test("revoke asks first", async ({ page }) => {
  const state = await brain(page, "owner");
  await page.goto("/app/api-tokens");
  await page.getByRole("button", { name: "Revoke Content Machine" }).click();
  const yes = page.getByRole("button", { name: "Yes, revoke" });
  await expect(yes).toBeFocused();
  await page.getByRole("button", { name: "Cancel" }).click();
  await expect(page.getByRole("button", { name: "Revoke Content Machine" })).toBeFocused();
  expect(state.tokens).toHaveLength(2);
  await page.getByRole("button", { name: "Revoke Content Machine" }).click();
  await expect(yes).toHaveAccessibleDescription(/Revoke Content Machine\?/);
  await yes.click();
  await expect(page.getByText("Revoked Content Machine. It stops working at once.")).toBeFocused();
  await expect(items(page)).toHaveCount(1);
  expect(state.tokens.map((t) => t.id)).toEqual(["k0"]);
});

test("a member sees who manages tokens", async ({ page }) => {
  let listed = false;
  await brain(page, "member");
  await page.route("**/v1/api-tokens", (route) => {
    listed = true;
    return route.fallback();
  });
  await page.goto("/app/api-tokens");
  await expect(page.getByText("Only team owners and admins can manage API tokens.")).toBeVisible();
  await expect(page.getByLabel("Token name")).toHaveCount(0);
  await expect(page.getByRole("button", { name: /^Revoke/ })).toHaveCount(0);
  expect(listed).toBe(false);
});
