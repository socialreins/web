import { expect, test } from "@playwright/test";

test("landing page renders and the waitlist form joins", async ({ page }) => {
  await page.route("**/v1/waitlist", (route) => route.fulfill({ status: 200, body: "{}" }));
  await page.goto("/");
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
  await expect(page.getByRole("link", { name: "Follow on GitHub" })).toHaveAttribute(
    "href",
    "https://github.com/socialreins/socialreins",
  );
  await page.getByLabel("Email for the hosted version waitlist").fill("someone@example.com");
  await page.getByRole("button", { name: "Join the waitlist" }).click();
  await expect(page.getByRole("status")).toHaveText(/on the waitlist/);
});
