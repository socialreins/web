import { expect, test, type Page } from "@playwright/test";

const user = {
  id: "1",
  email: "someone@example.com",
  name: "someone",
  username: null,
  current_team: { id: "t1", name: "someone's team", role: "owner" },
};
const signedIn = async (page: Page) => {
  await page.route("**/auth/me", (route) => route.fulfill({ json: user }));
  // /app loads these after the redirect; keep them offline.
  await page.route("**/v1/teams", (route) => route.fulfill({ json: [user.current_team] }));
};
const startOptions = {
  challenge_id: "c1",
  options: {
    publicKey: {
      rp: { id: "localhost", name: "SocialReins" },
      user: { id: "AQID", name: user.email, displayName: user.name },
      challenge: "3q2-7w",
      pubKeyCredParams: [{ type: "public-key", alg: -7 }],
      authenticatorSelection: { residentKey: "required", userVerification: "required" },
      attestation: "none",
    },
  },
};

test("welcome sends a signed-out visitor to login", async ({ page }) => {
  await page.route("**/auth/me", (route) => route.fulfill({ status: 401, json: { error: "unauthorized" } }));
  await page.goto("/welcome");
  await expect(page).toHaveURL("/login");
});

test("welcome goes straight to the app without WebAuthn", async ({ page }) => {
  await page.addInitScript(() => {
    // @ts-expect-error simulating a browser without WebAuthn
    delete window.PublicKeyCredential;
  });
  await signedIn(page);
  await page.goto("/welcome");
  await expect(page).toHaveURL("/app");
});

test("welcome adds a passkey with a virtual authenticator, then opens the app", async ({ page, context }) => {
  const cdp = await context.newCDPSession(page);
  await cdp.send("WebAuthn.enable");
  await cdp.send("WebAuthn.addVirtualAuthenticator", {
    options: { protocol: "ctap2", transport: "internal", hasResidentKey: true, hasUserVerification: true, isUserVerified: true },
  });
  await signedIn(page);
  await page.route("**/auth/passkeys/register/start", (route) => route.fulfill({ json: startOptions }));
  let finished = false;
  await page.route("**/auth/passkeys/register/finish", (route) => {
    finished = true;
    return route.fulfill({ status: 201, json: { id: "k1", name: "Passkey", created_at: "2026-10-29T10:00:00Z", last_used_at: null } });
  });
  await page.goto("/welcome");
  await expect(page.getByRole("heading", { name: "Add a passkey to sign in faster" })).toBeVisible();
  await expect(page.getByText(/Face ID, Touch ID or your device PIN/)).toBeVisible();
  await page.getByRole("button", { name: "Add a passkey" }).click();
  await expect(page).toHaveURL("/app");
  expect(finished).toBe(true);
});

test("welcome explains a cancelled prompt and can be skipped", async ({ page }) => {
  await page.addInitScript(() => {
    navigator.credentials.create = () => Promise.reject(new DOMException("cancelled", "NotAllowedError"));
  });
  await signedIn(page);
  await page.route("**/auth/passkeys/register/start", (route) => route.fulfill({ json: startOptions }));
  await page.goto("/welcome");
  await page.getByRole("button", { name: "Add a passkey" }).click();
  await expect(page.getByRole("alert").filter({ hasText: "Adding the passkey was cancelled" })).toBeVisible();
  await page.getByRole("link", { name: "Skip for now" }).click();
  await expect(page).toHaveURL("/app");
});

test("welcome goes to a safe next path after skipping, and ignores an unsafe one", async ({ page }) => {
  await signedIn(page);
  await page.route("**/v1/invitations/abc", (route) => route.fulfill({ status: 404, json: { error: "not_found" } }));
  await page.goto("/welcome?next=%2Finvitations%2Fabc");
  await expect(page.getByRole("link", { name: "Skip for now" })).toHaveAttribute("href", "/invitations/abc");
  await page.getByRole("link", { name: "Skip for now" }).click();
  await expect(page).toHaveURL("/invitations/abc");
  for (const bad of ["%2F%2Fevil.com", "https%3A%2F%2Fevil.com", "%2Fa%5Cb"]) {
    await page.goto(`/welcome?next=${bad}`);
    await expect(page.getByRole("link", { name: "Skip for now" })).toHaveAttribute("href", "/app");
  }
});

test("welcome goes to next after adding a passkey, and without WebAuthn", async ({ page, context }) => {
  const cdp = await context.newCDPSession(page);
  await cdp.send("WebAuthn.enable");
  await cdp.send("WebAuthn.addVirtualAuthenticator", {
    options: { protocol: "ctap2", transport: "internal", hasResidentKey: true, hasUserVerification: true, isUserVerified: true },
  });
  await signedIn(page);
  await page.route("**/v1/invitations/abc", (route) => route.fulfill({ status: 404, json: { error: "not_found" } }));
  await page.route("**/auth/passkeys/register/start", (route) => route.fulfill({ json: startOptions }));
  await page.route("**/auth/passkeys/register/finish", (route) =>
    route.fulfill({ status: 201, json: { id: "k1", name: "Passkey", created_at: "2026-10-29T10:00:00Z", last_used_at: null } }),
  );
  await page.goto("/welcome?next=%2Finvitations%2Fabc");
  await page.getByRole("button", { name: "Add a passkey" }).click();
  await expect(page).toHaveURL("/invitations/abc");
});

test("welcome without WebAuthn goes straight to next", async ({ page }) => {
  await page.addInitScript(() => {
    // @ts-expect-error simulating a browser without WebAuthn
    delete window.PublicKeyCredential;
  });
  await signedIn(page);
  await page.route("**/v1/invitations/abc", (route) => route.fulfill({ status: 404, json: { error: "not_found" } }));
  await page.goto("/welcome?next=%2Finvitations%2Fabc");
  await expect(page).toHaveURL("/invitations/abc");
});
