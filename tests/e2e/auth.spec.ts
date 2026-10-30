import { expect, test } from "@playwright/test";

const user = { id: "1", email: "someone@example.com", name: "someone", username: null, current_team: { id: "t1", name: "Acme", role: "owner" } };

test("login sends a link and shows the check-your-email state", async ({ page }) => {
  let body: unknown;
  await page.route("**/auth/link", (route) => {
    body = route.request().postDataJSON();
    return route.fulfill({ status: 202, json: { status: "sent" } });
  });
  await page.goto("/login");
  await page.getByLabel("Email").fill("someone@example.com");
  await page.getByRole("button", { name: "Email me a link" }).click();
  const done = page.getByRole("heading", { name: "Check your email" });
  await expect(done).toBeFocused();
  expect(body).toEqual({ email: "someone@example.com" });
  await page.getByRole("button", { name: "Use a different email" }).click();
  await expect(page.getByLabel("Email")).toBeFocused();
});

test("login explains rate limits and bad links", async ({ page }) => {
  await page.route("**/auth/link", (route) => route.fulfill({ status: 429, json: { error: "rate_limited" } }));
  await page.goto("/login?error=invalid_link");
  await expect(page.getByText(/expired or was already used/)).toHaveAttribute("role", "alert");
  await page.getByLabel("Email").fill("someone@example.com");
  await page.keyboard.press("Enter");
  await expect(page.getByRole("status")).toHaveText(/Too many attempts/);
});

test("login shows a generic message for an unknown or prototype-named error", async ({ page }) => {
  for (const error of ["__proto__", "constructor", "something_new"]) {
    await page.goto(`/login?error=${error}`);
    await expect(page.getByText("That sign-in didn't work. Try again, or ask for an email link below.")).toBeVisible();
    await expect(page.getByRole("button", { name: "Email me a link" })).toBeVisible();
  }
});

test("login form is in the server-rendered HTML", async ({ request }) => {
  const html = await (await request.get("/login")).text();
  expect(html).toContain("Email me a link");
});

test("app shows the signed-in user and signs out", async ({ page }) => {
  await page.route("**/auth/me", (route) => route.fulfill({ json: user }));
  await page.route("**/auth/logout", (route) => route.fulfill({ status: 204 }));
  await page.goto("/app");
  await expect(page.getByText("Signed in as someone@example.com")).toBeVisible();
  await page.getByRole("button", { name: "Sign out" }).click();
  await expect(page).toHaveURL("/");
});

test("app sends a signed-out visitor to login", async ({ page }) => {
  await page.route("**/auth/me", (route) => route.fulfill({ status: 401, json: { error: "unauthorized" } }));
  await page.goto("/app");
  await expect(page).toHaveURL("/login");
});

test("header links to sign in, or to the app when signed in", async ({ page }) => {
  await page.route("**/auth/me", (route) => route.fulfill({ status: 401, json: { error: "unauthorized" } }));
  await page.goto("/");
  await expect(page.getByRole("link", { name: "Sign in" })).toHaveAttribute("href", "/login");
  await page.unrouteAll();
  await page.route("**/auth/me", (route) => route.fulfill({ json: user }));
  await page.reload();
  await expect(page.getByRole("link", { name: "Open the app" })).toHaveAttribute("href", "/app");
});
