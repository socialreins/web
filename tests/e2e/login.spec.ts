import { generateKeyPairSync } from "node:crypto";
import { expect, test } from "@playwright/test";

const user = { id: "1", email: "someone@example.com", name: "someone", username: null };

test("passkey sign-in with a virtual authenticator goes to the app", async ({ page, context }) => {
  const cdp = await context.newCDPSession(page);
  await cdp.send("WebAuthn.enable");
  const { authenticatorId } = await cdp.send("WebAuthn.addVirtualAuthenticator", {
    options: { protocol: "ctap2", transport: "internal", hasResidentKey: true, hasUserVerification: true, isUserVerified: true },
  });
  const { privateKey } = generateKeyPairSync("ec", { namedCurve: "P-256" });
  await cdp.send("WebAuthn.addCredential", {
    authenticatorId,
    credential: {
      credentialId: Buffer.from("cred-1").toString("base64"),
      isResidentCredential: true,
      rpId: "localhost",
      privateKey: privateKey.export({ format: "der", type: "pkcs8" }).toString("base64"),
      userHandle: Buffer.from("user-1").toString("base64"),
      signCount: 0,
    },
  });
  await page.route("**/auth/passkeys/login/start", (route) =>
    route.fulfill({
      json: {
        challenge_id: "c1",
        options: { publicKey: { challenge: "3q2-7w", rpId: "localhost", allowCredentials: [], userVerification: "preferred" } },
      },
    }),
  );
  let finish: { challenge_id: string; credential: { rawId: string; response: Record<string, string> } } | undefined;
  await page.route("**/auth/passkeys/login/finish", (route) => {
    finish = route.request().postDataJSON();
    return route.fulfill({ json: user });
  });
  await page.route("**/auth/me", (route) => route.fulfill({ json: user }));
  await page.goto("/login");
  await page.getByRole("button", { name: "Sign in with a passkey" }).click();
  await expect(page).toHaveURL("/app");
  expect(finish?.challenge_id).toBe("c1");
  expect(finish?.credential.rawId).toBe(Buffer.from("cred-1").toString("base64url"));
  expect(finish?.credential.response.userHandle).toBe(Buffer.from("user-1").toString("base64url"));
  const clientData = JSON.parse(Buffer.from(finish!.credential.response.clientDataJSON!, "base64url").toString());
  expect(clientData).toMatchObject({ type: "webauthn.get", challenge: "3q2-7w" });
});

test("passkey sign-in explains a rate limit", async ({ page }) => {
  await page.route("**/auth/passkeys/login/start", (route) =>
    route.fulfill({ status: 429, json: { error: "rate_limited" } }),
  );
  await page.goto("/login");
  await page.getByRole("button", { name: "Sign in with a passkey" }).click();
  await expect(page.getByRole("alert").filter({ hasText: "Too many attempts" })).toBeVisible();
});

test("passkey button is hidden without WebAuthn", async ({ page }) => {
  await page.addInitScript(() => {
    // @ts-expect-error simulating a browser without WebAuthn
    delete window.PublicKeyCredential;
  });
  await page.goto("/login");
  await expect(page.getByRole("button", { name: "Email me a link" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Sign in with a passkey" })).toHaveCount(0);
});

test("a cancelled passkey prompt is a quiet status, not an alert", async ({ page }) => {
  await page.addInitScript(() => {
    navigator.credentials.get = () => Promise.reject(new DOMException("cancelled", "NotAllowedError"));
  });
  await page.route("**/auth/passkeys/login/start", (route) =>
    route.fulfill({ json: { challenge_id: "c1", options: { publicKey: { challenge: "3q2-7w", allowCredentials: [] } } } }),
  );
  await page.goto("/login");
  await page.getByRole("button", { name: "Sign in with a passkey" }).click();
  await expect(page.getByRole("status").filter({ hasText: "Passkey sign-in was cancelled" })).toBeVisible();
  await expect(page.getByRole("alert").filter({ hasText: "Passkey sign-in was cancelled" })).toHaveCount(0);
});

test("Continue with Google shows only when brain offers it, and starts at brain", async ({ page }) => {
  await page.route("**/auth/providers", (route) => route.fulfill({ json: { google: true } }));
  await page.goto("/login");
  const google = page.getByRole("link", { name: "Continue with Google" });
  await expect(google).toHaveAttribute("href", /\/auth\/google\/start\?next=%2Fapp$/);
  await expect(page.getByText("or", { exact: true })).toBeVisible();

  await page.unrouteAll();
  await page.route("**/auth/providers", (route) => route.fulfill({ json: { google: false } }));
  await page.reload();
  await expect(page.getByRole("button", { name: "Email me a link" })).toBeVisible();
  await expect(page.getByRole("link", { name: "Continue with Google" })).toHaveCount(0);
});

test("Continue with Google stays hidden when brain can't say", async ({ page }) => {
  await page.route("**/auth/providers", (route) => route.fulfill({ status: 500 }));
  await page.goto("/login");
  await expect(page.getByRole("button", { name: "Email me a link" })).toBeVisible();
  await expect(page.getByRole("link", { name: "Continue with Google" })).toHaveCount(0);
});

test("login explains Google and closed sign-up errors", async ({ page }) => {
  await page.goto("/login?error=google_failed");
  await expect(page.getByRole("alert").filter({ hasText: "Google sign-in didn't finish" })).toBeVisible();
  await page.goto("/login?error=registration_disabled");
  await expect(page.getByRole("alert").filter({ hasText: "New accounts are closed on this server" })).toBeVisible();
});

test("login has no password field and links the terms and privacy policy", async ({ page }) => {
  await page.goto("/login");
  await expect(page.getByRole("heading", { name: "Sign in or create an account" })).toBeVisible();
  await expect(page.locator('input[type="password"]')).toHaveCount(0);
  await expect(page.getByRole("link", { name: "Terms" })).toHaveAttribute("href", "/terms");
  await expect(page.getByRole("link", { name: "Privacy Policy" })).toHaveAttribute("href", "/privacy");
});
