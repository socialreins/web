import { expect, test } from "@playwright/test";

test("landing page renders and the waitlist form joins", async ({ page }) => {
  await page.route("**/auth/me", (route) => route.fulfill({ status: 401, json: { error: "unauthorized" } }));
  await page.route("**/v1/waitlist", (route) => route.fulfill({ status: 200, body: "{}" }));
  await page.goto("/");
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
  await expect(page.getByRole("link", { name: "SocialReins", exact: true })).toHaveAttribute("href", "/");
  const menu = page.locator("details").filter({ hasText: "Follow on GitHub" });
  await menu.getByText("Follow on GitHub").click();
  await expect(menu.getByRole("link", { name: /socialreins\/web/ })).toHaveAttribute(
    "href",
    "https://github.com/socialreins/web",
  );
  await expect(menu.getByRole("link", { name: /socialreins\/web/ })).toContainText("main");
  await expect(menu.getByRole("link", { name: /socialreins\/brain/ })).toHaveAttribute(
    "href",
    "https://github.com/socialreins/brain",
  );
  await page.getByLabel("Email for the hosted version waitlist").fill("someone@example.com");
  await page.getByRole("button", { name: "Join the waitlist" }).click();
  await expect(page.getByRole("status")).toHaveText(/on the waitlist/);
});

test("the header GitHub menu shows the GitHub mark", async ({ page }) => {
  await page.route("**/auth/me", (route) => route.fulfill({ status: 401, json: { error: "unauthorized" } }));
  await page.goto("/");
  const summary = page.getByRole("banner").locator("summary");
  await expect(summary).toContainText("GitHub");
  await expect(summary.locator("svg")).toHaveCount(1);
});

test("the web app manifest lists the home-screen icons", async ({ request }) => {
  const manifest = await (await request.get("/manifest.webmanifest")).json();
  expect(manifest.icons.map((i: { src: string }) => i.src)).toContain("/icon-512.png");
  for (const src of ["/icon-192.png", "/icon-512.png"]) {
    const res = await request.get(src);
    expect(res.status()).toBe(200);
    expect(res.headers()["content-type"]).toBe("image/png");
  }
});
