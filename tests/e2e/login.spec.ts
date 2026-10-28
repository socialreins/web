import { generateKeyPairSync } from "node:crypto";
import { expect, test } from "@playwright/test";

const user = { id: "1", email: "someone@example.com", name: "someone", username: null, has_password: true };

test("password sign-in explains a bad password, then goes to the app", async ({ page }) => {
  const bodies: unknown[] = [];
  await page.route("**/auth/login", (route) => {
    bodies.push(route.request().postDataJSON());
    return bodies.length === 1
      ? route.fulfill({ status: 401, json: { error: "invalid_credentials" } })
      : route.fulfill({ json: user });
  });
  await page.route("**/auth/me", (route) => route.fulfill({ json: user }));
  await page.goto("/login");
  await page.getByRole("button", { name: "Sign in with a password" }).click();
  await expect(page.getByLabel("Password")).toBeFocused();
  await page.getByLabel("Email").fill("someone@example.com");
  await page.getByLabel("Password").fill("wrong one");
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await expect(page.getByRole("alert").filter({ hasText: "That email and password didn't work." })).toBeVisible();
  await expect(page.getByLabel("Password")).toHaveAttribute("aria-invalid", "true");
  await page.getByLabel("Password").fill("the right one");
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await expect(page).toHaveURL("/app");
  expect(bodies).toEqual([
    { email: "someone@example.com", password: "wrong one" },
    { email: "someone@example.com", password: "the right one" },
  ]);
});

test("password sign-in can switch back to the email link", async ({ page }) => {
  await page.goto("/login");
  await page.getByRole("button", { name: "Sign in with a password" }).click();
  await page.getByRole("button", { name: "Sign in with an email link" }).click();
  await expect(page.getByLabel("Email")).toBeFocused();
  await expect(page.getByLabel("Password")).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Email me a sign-in link" })).toBeVisible();
});

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
  await expect(page.getByRole("button", { name: "Sign in with a password" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Sign in with a passkey" })).toHaveCount(0);
});
