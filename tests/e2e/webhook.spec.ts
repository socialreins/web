import { expect, test, type Page } from "@playwright/test";

type Role = "owner" | "admin" | "member";
const me = (role: Role) => ({
  id: "u-me",
  email: "me@example.com",
  name: "Me",
  username: null,
  current_team: { id: "t1", name: "Acme", role },
});
const hook = (url: string) => ({ url, created_at: "2026-10-01T10:00:00Z", updated_at: "2026-10-01T10:00:00Z" });
const SECRET = "whsec_abcdefghijklmnopqrstuvwxyz0123456789abcdefgh";

const section = (page: Page) => page.getByRole("region", { name: "Webhook" });

// A small in-memory brain for the team webhook, so reloads see each change.
async function brain(page: Page, role: Role, url: string | null = null) {
  const state = {
    hook: url ? hook(url) : null,
    bodies: [] as unknown[],
    reauth: false,
    ping: { status: 200 as number | null, error: null as string | null },
  };
  await page.route("**/auth/me", (route) => route.fulfill({ json: me(role) }));
  await page.route(/\/v1\/social-sets$/, (route) => route.fulfill({ json: [] }));
  await page.route("**/v1/api-tokens", (route) => route.fulfill({ json: [] }));
  await page.route(/\/v1\/team\/webhook$/, (route) => {
    const req = route.request();
    if (role === "member") return route.fulfill({ status: 403, json: { error: "forbidden" } });
    if (req.method() === "DELETE") {
      state.hook = null;
      return route.fulfill({ status: 204 });
    }
    if (req.method() === "GET")
      return state.hook ? route.fulfill({ json: state.hook }) : route.fulfill({ status: 404, json: { error: "not_found" } });
    state.bodies.push(req.postDataJSON());
    if (state.reauth) return route.fulfill({ status: 403, json: { error: "reauth_required" } });
    const next = req.postDataJSON().url as string;
    if (!next.startsWith("https://")) return route.fulfill({ status: 422, json: { error: "invalid_url" } });
    const created = !state.hook;
    state.hook = hook(next);
    return created ? route.fulfill({ status: 201, json: { webhook: state.hook, secret: SECRET } }) : route.fulfill({ json: state.hook });
  });
  await page.route(/\/v1\/team\/webhook\/test$/, (route) => route.fulfill({ json: state.ping }));
  return state;
}

test("create asks for a fresh sign-in, then shows the secret once", async ({ page, context }) => {
  await context.grantPermissions(["clipboard-read", "clipboard-write"]);
  const state = await brain(page, "owner");
  state.reauth = true;
  await page.goto("/app/api-tokens");
  const s = section(page);
  await expect(s.getByText("No webhook yet.")).toBeVisible();
  await expect(s.getByText("post.target.published")).toBeVisible();
  await expect(s.getByRole("button", { name: "Send test" })).toHaveCount(0);
  await page.getByLabel("Webhook URL").fill("https://example.com/hook");
  await s.getByRole("button", { name: "Save" }).click();
  await expect(s.getByRole("alert").filter({ hasText: "needs a fresh sign-in" })).toBeVisible();
  await expect(page.getByLabel("Signing secret")).toHaveCount(0);

  state.reauth = false;
  await s.getByRole("button", { name: "Save" }).click();
  const secret = page.getByLabel("Signing secret");
  await expect(secret).toHaveValue(SECRET);
  await expect(secret).toHaveAttribute("readonly");
  await expect(secret).toBeFocused();
  await expect(s.getByText("It won't be shown again.")).toBeVisible();
  await expect(s.getByText("Sending to https://example.com/hook")).toBeVisible();
  await s.getByRole("button", { name: "Copy" }).click();
  await expect(s.getByRole("button", { name: "Copied" })).toBeVisible();
  expect(await page.evaluate(() => navigator.clipboard.readText())).toBe(SECRET);
  await s.getByRole("button", { name: "Done, hide the secret" }).click();
  await expect(page.getByLabel("Signing secret")).toHaveCount(0);
  await expect(page.getByLabel("Webhook URL")).toBeFocused();
  expect(state.bodies).toEqual([{ url: "https://example.com/hook" }, { url: "https://example.com/hook" }]);
  // Never in the URL or storage, so a reload shows only the URL.
  expect(page.url()).not.toContain(SECRET);
  expect(await page.evaluate(() => JSON.stringify({ ...localStorage, ...sessionStorage }))).not.toContain(SECRET);
  await page.reload();
  await expect(section(page).getByText("Sending to https://example.com/hook")).toBeVisible();
  await expect(page.getByText(SECRET)).toHaveCount(0);
});

test("update keeps the secret and explains a bad URL", async ({ page }) => {
  const state = await brain(page, "admin", "https://example.com/old");
  await page.goto("/app/api-tokens");
  const s = section(page);
  const input = page.getByLabel("Webhook URL");
  await expect(input).toHaveValue("https://example.com/old");
  // http passes the browser's url check but brain refuses it.
  await input.fill("http://example.com/new");
  await s.getByRole("button", { name: "Save" }).click();
  await expect(s.getByRole("alert").filter({ hasText: "public https:// URL" })).toBeVisible();
  await expect(input).toHaveAttribute("aria-invalid", "true");
  await input.fill("https://example.com/new");
  await s.getByRole("button", { name: "Save" }).click();
  await expect(s.getByText("Saved. Events now go to the new URL with the same secret.")).toBeFocused();
  await expect(s.getByText("Sending to https://example.com/new")).toBeVisible();
  await expect(page.getByLabel("Signing secret")).toHaveCount(0);
  expect(state.hook?.url).toBe("https://example.com/new");
});

test("send test shows what the receiver said", async ({ page }) => {
  const state = await brain(page, "owner", "https://example.com/hook");
  await page.goto("/app/api-tokens");
  const s = section(page);
  await s.getByRole("button", { name: "Send test" }).click();
  await expect(s.getByText("The receiver answered 200. Test delivered.")).toBeFocused();
  state.ping = { status: null, error: "timeout" };
  await s.getByRole("button", { name: "Send test" }).click();
  await expect(s.getByText("Test not delivered: it didn't answer within 10 seconds.")).toBeVisible();
});

test("remove asks first", async ({ page }) => {
  const state = await brain(page, "owner", "https://example.com/hook");
  await page.goto("/app/api-tokens");
  const s = section(page);
  await s.getByRole("button", { name: "Remove" }).click();
  const yes = s.getByRole("button", { name: "Yes, remove" });
  await expect(yes).toBeFocused();
  await s.getByRole("button", { name: "Cancel" }).click();
  await expect(s.getByRole("button", { name: "Remove" })).toBeFocused();
  expect(state.hook).not.toBeNull();
  await s.getByRole("button", { name: "Remove" }).click();
  await expect(yes).toHaveAccessibleDescription(/Remove the webhook\?/);
  await yes.click();
  await expect(s.getByText("Removed the webhook. No more events will be sent.")).toBeFocused();
  await expect(s.getByText("No webhook yet.")).toBeVisible();
  await expect(page.getByLabel("Webhook URL")).toHaveValue("");
  expect(state.hook).toBeNull();
});

test("a member sees no webhook form", async ({ page }) => {
  let read = false;
  await brain(page, "member");
  await page.route(/\/v1\/team\/webhook$/, (route) => {
    read = true;
    return route.fallback();
  });
  await page.goto("/app/api-tokens");
  await expect(page.getByText("Only team owners and admins can manage API tokens and the webhook.")).toBeVisible();
  await expect(page.getByLabel("Webhook URL")).toHaveCount(0);
  expect(read).toBe(false);
});
