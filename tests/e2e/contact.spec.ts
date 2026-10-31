import { expect, test, type Page, type Request } from "@playwright/test";

type Stub = { callback(t: string): void; action: string; sitekey: string };
declare global {
  interface Window {
    __turnstile?: Stub;
    __resets?: number;
    __renders?: number;
  }
}

const providers = (page: Page, key: string | null) =>
  page.route("**/auth/providers", (route) => route.fulfill({ json: { google: false, turnstile_site_key: key } }));

// Stands in for Cloudflare's script: render keeps the options so a test can hand out a token.
async function stubTurnstile(page: Page) {
  await page.route("https://challenges.cloudflare.com/**", (route) => route.fulfill({ contentType: "text/javascript", body: "" }));
  await page.addInitScript(() => {
    window.__resets = 0;
    window.turnstile = {
      render: (_el, opts) => {
        window.__turnstile = opts as unknown as Stub;
        window.__renders = (window.__renders ?? 0) + 1;
        return `w${window.__renders}`;
      },
      reset: () => void (window.__resets! += 1),
      remove: () => {},
    };
  });
}

const solve = (page: Page, token = "tok-1") => page.evaluate((t) => window.__turnstile!.callback(t), token);
const body = (req: Request) => req.postDataJSON() as Record<string, unknown>;

async function fillContact(page: Page) {
  await page.getByLabel("Name").fill("Ann");
  await page.getByLabel("Email").fill("ann@example.com");
  await page.getByLabel("Message").fill("Hello there");
}

test("contact form sends and thanks the sender, without Turnstile when brain has it off", async ({ page }) => {
  await providers(page, null);
  let sent: Record<string, unknown> | undefined;
  await page.route("**/v1/contact", (route) => {
    sent = body(route.request());
    return route.fulfill({ status: 202, json: {} });
  });
  await page.goto("/contact");
  await expect(page).toHaveTitle("Contact: SocialReins");
  await expect(page.getByRole("heading", { name: "Contact us", level: 1 })).toBeVisible();
  await expect(page.getByLabel("Name")).toHaveAttribute("maxlength", "100");
  await expect(page.getByLabel("Email")).toHaveAttribute("maxlength", "254");
  await expect(page.getByLabel("Message")).toHaveAttribute("maxlength", "5000");
  await fillContact(page);
  await page.getByRole("button", { name: "Send" }).click();
  await expect(page.getByRole("status")).toHaveText("Thanks, we'll get back to you by email.");
  expect(sent).toEqual({ name: "Ann", email: "ann@example.com", message: "Hello there" });
});

for (const [status, error, text] of [
  [422, "invalid_name", /Add your name/],
  [422, "invalid_email", /doesn't look right/],
  [422, "invalid_message", /Write a message/],
  [422, "captcha_failed", "The check didn't pass. Try again."],
  [429, undefined, /Too many messages/],
  [503, "contact_unavailable", /can't be sent right now/],
  [503, "captcha_unavailable", "We couldn't check that right now. Try again in a minute."],
] as const) {
  test(`contact form shows ${error ?? status}`, async ({ page }) => {
    await providers(page, null);
    await page.route("**/v1/contact", (route) => route.fulfill({ status, json: error ? { error } : {} }));
    await page.goto("/contact");
    await fillContact(page);
    await page.getByRole("button", { name: "Send" }).click();
    await expect(page.getByRole("status")).toHaveText(text);
    await expect(page.getByRole("button", { name: "Send" })).toBeEnabled();
  });
}

test("with Turnstile on, contact waits for a token, sends it and resets the widget", async ({ page }) => {
  await stubTurnstile(page);
  await providers(page, "0xSITE");
  const sent: Record<string, unknown>[] = [];
  await page.route("**/v1/contact", (route) => {
    sent.push(body(route.request()));
    return route.fulfill({ status: 422, json: { error: "captcha_failed" } });
  });
  await page.goto("/contact");
  await fillContact(page);
  await expect(page.getByRole("button", { name: "Send" })).toBeDisabled();
  expect(await page.evaluate(() => [window.__turnstile!.sitekey, window.__turnstile!.action])).toEqual(["0xSITE", "contact"]);
  await solve(page);
  await page.getByRole("button", { name: "Send" }).click();
  await expect(page.getByRole("status")).toHaveText("The check didn't pass. Try again.");
  expect(sent[0]).toMatchObject({ turnstile_token: "tok-1" });
  expect(await page.evaluate(() => window.__resets)).toBe(1);
  await expect(page.getByRole("button", { name: "Send" })).toBeDisabled();
});

test("with Turnstile on, the waitlist sends the token", async ({ page }) => {
  await stubTurnstile(page);
  await providers(page, "0xSITE");
  await page.route("**/auth/me", (route) => route.fulfill({ status: 401, json: { error: "unauthorized" } }));
  let sent: Record<string, unknown> | undefined;
  await page.route("**/v1/waitlist", (route) => {
    sent = body(route.request());
    return route.fulfill({ status: 200, body: "{}" });
  });
  await page.goto("/");
  await page.getByLabel("Email for the hosted version waitlist").fill("someone@example.com");
  await expect(page.getByRole("button", { name: "Join the waitlist" })).toBeDisabled();
  await solve(page, "tok-w");
  await page.getByRole("button", { name: "Join the waitlist" }).click();
  await expect(page.getByRole("status")).toHaveText(/on the waitlist/);
  expect(sent).toEqual({ email: "someone@example.com", source: "landing", turnstile_token: "tok-w" });
});

test("with Turnstile on, the login link request sends the token and maps captcha_unavailable", async ({ page }) => {
  await stubTurnstile(page);
  await providers(page, "0xSITE");
  let sent: Record<string, unknown> | undefined;
  await page.route("**/auth/link", (route) => {
    sent = body(route.request());
    return route.fulfill({ status: 503, json: { error: "captcha_unavailable" } });
  });
  await page.goto("/login");
  await page.getByLabel("Email", { exact: true }).fill("someone@example.com");
  await expect(page.getByRole("button", { name: "Email me a link" })).toBeDisabled();
  await solve(page, "tok-l");
  await page.getByRole("button", { name: "Email me a link" }).click();
  await expect(page.locator("#login-message")).toHaveText("We couldn't check that right now. Try again in a minute.");
  expect(sent).toEqual({ email: "someone@example.com", turnstile_token: "tok-l" });
});

test("with Turnstile on, Use a different email renders the widget again and sends a fresh token", async ({ page }) => {
  await stubTurnstile(page);
  await providers(page, "0xSITE");
  const sent: Record<string, unknown>[] = [];
  await page.route("**/auth/link", (route) => {
    sent.push(body(route.request()));
    return route.fulfill({ status: 202, json: {} });
  });
  await page.goto("/login");
  await page.getByLabel("Email", { exact: true }).fill("one@example.com");
  await solve(page, "tok-1");
  await page.getByRole("button", { name: "Email me a link" }).click();
  await page.getByRole("button", { name: "Use a different email" }).click();
  await expect.poll(() => page.evaluate(() => window.__renders)).toBe(2);
  await page.getByLabel("Email", { exact: true }).fill("two@example.com");
  await expect(page.getByRole("button", { name: "Email me a link" })).toBeDisabled();
  await solve(page, "tok-2");
  await page.getByRole("button", { name: "Email me a link" }).click();
  await expect(page.getByRole("heading", { name: "Check your email" })).toBeVisible();
  expect(sent).toEqual([
    { email: "one@example.com", turnstile_token: "tok-1" },
    { email: "two@example.com", turnstile_token: "tok-2" },
  ]);
});

test("with Turnstile off, the waitlist and login link submit without a token", async ({ page }) => {
  await providers(page, null);
  await page.route("**/auth/me", (route) => route.fulfill({ status: 401, json: { error: "unauthorized" } }));
  const sent: Record<string, unknown>[] = [];
  await page.route("**/v1/waitlist", (route) => {
    sent.push(body(route.request()));
    return route.fulfill({ status: 200, body: "{}" });
  });
  await page.route("**/auth/link", (route) => {
    sent.push(body(route.request()));
    return route.fulfill({ status: 202, json: {} });
  });
  await page.goto("/");
  await page.getByLabel("Email for the hosted version waitlist").fill("someone@example.com");
  await page.getByRole("button", { name: "Join the waitlist" }).click();
  await expect(page.getByRole("status")).toHaveText(/on the waitlist/);
  await page.goto("/login");
  await page.getByLabel("Email", { exact: true }).fill("someone@example.com");
  await page.getByRole("button", { name: "Email me a link" }).click();
  await expect(page.getByRole("heading", { name: "Check your email" })).toBeVisible();
  expect(sent).toEqual([{ email: "someone@example.com", source: "landing" }, { email: "someone@example.com" }]);
});

test("the CSP lets Turnstile load", async ({ request }) => {
  const csp = (await request.get("/contact")).headers()["content-security-policy"];
  expect(csp).toMatch(/script-src [^;]*https:\/\/challenges\.cloudflare\.com/);
  expect(csp).toMatch(/frame-src https:\/\/challenges\.cloudflare\.com/);
});

test("public pages show no email address and link to the contact page", async ({ page }) => {
  await page.route("**/auth/me", (route) => route.fulfill({ status: 401, json: { error: "unauthorized" } }));
  for (const path of ["/", "/privacy", "/terms", "/contact"]) {
    await page.goto(path);
    const html = await page.content();
    expect(html, path).not.toContain("mailto:");
    expect(html, path).not.toContain("@socialreins.com");
  }
  await page.goto("/");
  await expect(page.getByRole("contentinfo").getByRole("link", { name: "Contact" })).toHaveAttribute("href", "/contact");
  for (const path of ["/privacy", "/terms"]) {
    await page.goto(path);
    await expect(page.getByRole("link", { name: "contact us" }).first()).toHaveAttribute("href", "/contact");
  }
});
