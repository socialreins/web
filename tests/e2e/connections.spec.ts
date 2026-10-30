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
  avatar_url: "https://cdn.bsky.app/img/avatar/plain/did:plc:alice/a@jpeg",
  token_expires_at: null,
  set_ids: ["s1"],
  created_at: "2026-10-20T10:00:00Z",
};
const providers = [
  { provider: "bluesky", configured: true },
  { provider: "meta", configured: true },
  { provider: "threads", configured: false },
  { provider: "linkedin", configured: false },
  { provider: "x", configured: false },
  { provider: "tiktok", configured: false },
  { provider: "youtube", configured: false },
];

async function signedIn(page: Page, role: Role, accounts: unknown[] = [alice]) {
  const loads = { list: 0 };
  await page.route("**/auth/me", (route) => route.fulfill({ json: me(role) }));
  await page.route("**/v1/connections", (route) => {
    loads.list++;
    return route.fulfill({ json: loads.list === 1 ? accounts : [...accounts, { ...alice, id: "c2", handle: "bob.bsky.social", display_name: null, avatar_url: null }] });
  });
  await page.route("**/v1/connections/providers", (route) => route.fulfill({ json: providers }));
  // Avatars come from Bluesky's CDN; keep tests offline.
  await page.route("https://cdn.bsky.app/**", (route) => route.fulfill({ status: 404 }));
  return loads;
}

test("app links to connected accounts", async ({ page }) => {
  await signedIn(page, "owner");
  await page.goto("/app");
  await page.getByRole("link", { name: "Accounts", exact: true }).click();
  await expect(page).toHaveURL("/app/connections");
});

test("connections sends a signed-out visitor to login", async ({ page }) => {
  await page.route("**/auth/me", (route) => route.fulfill({ status: 401, json: { error: "unauthorized" } }));
  await page.goto("/app/connections");
  await expect(page).toHaveURL("/login");
});

test("lists accounts and the provider grid", async ({ page }) => {
  await signedIn(page, "admin");
  await page.goto("/app/connections");
  await expect(page.getByText("Alice", { exact: true })).toBeVisible();
  await expect(page.getByText(/Bluesky, @alice\.bsky\.social\. Connected .*\./)).toBeVisible();
  await expect(page.getByRole("form", { name: "Connect Bluesky" }).getByText("Available")).toBeVisible();
  const group = (name: string) => page.getByRole("heading", { name, level: 3 }).locator("xpath=following-sibling::ul[1]");
  await expect(group("Coming soon")).toContainText("Facebook");
  await expect(group("Coming soon")).toContainText("Instagram");
  await expect(group("Not set up on this server")).toContainText("YouTube");
  await expect(group("Not set up on this server")).not.toContainText("Bluesky");
  const link = page.getByRole("link", { name: "open App passwords" });
  await expect(link).toHaveAttribute("href", "https://bsky.app/settings/app-passwords");
  await expect(link).toHaveAttribute("rel", "noopener noreferrer");
});

test("connect Bluesky explains a refused password, clears it, then connects", async ({ page }) => {
  const loads = await signedIn(page, "owner");
  const bodies: unknown[] = [];
  await page.route("**/v1/connections/bluesky", (route) => {
    bodies.push(route.request().postDataJSON());
    return bodies.length === 1
      ? route.fulfill({ status: 422, json: { error: "invalid_credentials" } })
      : route.fulfill({ status: 201, json: { ...alice, id: "c2", handle: "bob.bsky.social" } });
  });
  await page.goto("/app/connections");
  await page.getByLabel("Bluesky handle").fill("@bob.bsky.social");
  await page.getByLabel("App password").fill("my-main-password");
  await page.getByRole("button", { name: "Connect Bluesky" }).click();
  await expect(page.getByRole("alert").filter({ hasText: "not your main Bluesky password" })).toBeVisible();
  await expect(page.getByLabel("App password")).toHaveValue("");
  await expect(page.getByLabel("App password")).toHaveAttribute("aria-invalid", "true");

  await page.getByLabel("App password").fill("abcd-efgh-ijkl-mnop");
  await page.getByRole("button", { name: "Connect Bluesky" }).click();
  await expect(page.getByText("Connected @bob.bsky.social.")).toBeFocused();
  await expect(page.getByLabel("App password")).toHaveValue("");
  await expect(page.getByText("@bob.bsky.social", { exact: true })).toBeVisible();
  expect(loads.list).toBe(2);
  expect(bodies).toEqual([
    { handle: "@bob.bsky.social", app_password: "my-main-password" },
    { handle: "@bob.bsky.social", app_password: "abcd-efgh-ijkl-mnop" },
  ]);
});

for (const [code, status, text] of [
  ["invalid_handle", 422, "wasn't found on Bluesky"],
  ["unsupported_pds", 422, "can't connect to"],
  ["bluesky_unreachable", 502, "Bluesky couldn't be reached"],
  ["rate_limited", 429, "Too many connection attempts"],
  ["forbidden", 403, "Only team owners and admins"],
] as const) {
  test(`connect Bluesky explains ${code}`, async ({ page }) => {
    await signedIn(page, "owner");
    await page.route("**/v1/connections/bluesky", (route) => route.fulfill({ status, json: { error: code } }));
    await page.goto("/app/connections");
    await page.getByLabel("Bluesky handle").fill("alice.bsky.social");
    await page.getByLabel("App password").fill("abcd-efgh-ijkl-mnop");
    await page.getByRole("button", { name: "Connect Bluesky" }).click();
    await expect(page.getByRole("alert").filter({ hasText: text })).toBeVisible();
    await expect(page.getByLabel("App password")).toHaveValue("");
  });
}

test("disconnect asks first, then removes the account", async ({ page }) => {
  await signedIn(page, "owner");
  let method = "";
  await page.route("**/v1/connections/c1", (route) => {
    method = route.request().method();
    return route.fulfill({ status: 204 });
  });
  await page.goto("/app/connections");
  await page.getByRole("button", { name: "Disconnect Alice" }).click();
  const yes = page.getByRole("button", { name: "Yes, disconnect" });
  await expect(yes).toBeFocused();
  await expect(yes).toHaveAccessibleDescription(/Disconnect Alice\?/);
  await page.getByRole("button", { name: "Cancel" }).click();
  await expect(page.getByRole("button", { name: "Disconnect Alice" })).toBeFocused();
  expect(method).toBe("");
  await page.getByRole("button", { name: "Disconnect Alice" }).click();
  await yes.click();
  await expect(page.getByText("Alice was disconnected.")).toBeFocused();
  await expect(page.getByText("No accounts connected yet.")).toBeVisible();
  expect(method).toBe("DELETE");
});

test("disconnecting an account that is already gone moves focus to the heading", async ({ page }) => {
  await signedIn(page, "owner");
  await page.route("**/v1/connections/c1", (route) => route.fulfill({ status: 404, json: { error: "not_found" } }));
  await page.goto("/app/connections");
  await page.getByRole("button", { name: "Disconnect Alice" }).click();
  await page.getByRole("button", { name: "Yes, disconnect" }).click();
  await expect(page.getByRole("alert").filter({ hasText: "already disconnected" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Connected accounts", level: 2 })).toBeFocused();
  await expect(page.getByText("No accounts connected yet.")).toBeVisible();
});

test("a connect that times out reloads the list, since brain may still finish", async ({ page }) => {
  // Make only the 30 second connect timeout fire at once; every other call keeps its real signal.
  await page.addInitScript(() => {
    const real = AbortSignal.timeout.bind(AbortSignal);
    AbortSignal.timeout = (ms: number) =>
      ms === 30_000 ? AbortSignal.abort(new DOMException("slow", "TimeoutError")) : real(ms);
  });
  const loads = await signedIn(page, "owner");
  await page.goto("/app/connections");
  await expect(page.getByText("Alice", { exact: true })).toBeVisible();
  await page.getByLabel("Bluesky handle").fill("bob.bsky.social");
  await page.getByLabel("App password").fill("abcd-efgh-ijkl-mnop");
  await page.getByRole("button", { name: "Connect Bluesky" }).click();
  await expect(page.getByRole("alert").filter({ hasText: "taking a long time" })).toBeVisible();
  await expect(page.getByLabel("App password")).toHaveValue("");
  await expect(page.getByText("@bob.bsky.social", { exact: true })).toBeVisible();
  expect(loads.list).toBe(2);
});

test("the CSP allows only Bluesky's image path for avatars", async ({ request }) => {
  const csp = (await request.get("/app/connections")).headers()["content-security-policy"];
  expect(csp).toContain("img-src 'self' data: https://cdn.bsky.app/img/;");
});

test("a member sees the list read-only", async ({ page }) => {
  await signedIn(page, "member");
  await page.goto("/app/connections");
  await expect(page.getByText("Alice", { exact: true })).toBeVisible();
  await expect(page.getByText("Only team owners and admins can connect or disconnect accounts.")).toBeVisible();
  await expect(page.getByRole("button", { name: /Disconnect/ })).toHaveCount(0);
  await expect(page.getByLabel("App password")).toHaveCount(0);
  await expect(page.getByRole("heading", { name: "Add an account" })).toHaveCount(0);
});

test("disconnect asks to sign in again when brain needs it", async ({ page }) => {
  await signedIn(page, "owner");
  await page.route("**/v1/connections/c1", (route) => route.fulfill({ status: 403, json: { error: "reauth_required" } }));
  await page.goto("/app/connections");
  await page.getByRole("button", { name: "Disconnect Alice" }).click();
  await page.getByRole("button", { name: "Yes, disconnect" }).click();
  const alert = page.getByRole("alert").filter({ hasText: "needs a fresh sign-in" });
  await expect(alert).toBeVisible();
  await expect(alert.getByRole("link", { name: "Sign in again" })).toHaveAttribute("href", "/login?next=%2Fapp%2Fconnections");
  await expect(page.getByText("Alice", { exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "Disconnect Alice" })).toBeFocused();
});
