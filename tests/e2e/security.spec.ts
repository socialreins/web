import { expect, test, type Page } from "@playwright/test";

const user = { id: "1", email: "someone@example.com", name: "someone", username: null, has_password: false };
const key = { id: "k1", name: "Old phone", created_at: "2026-10-01T10:00:00Z", last_used_at: null };
const signedIn = (page: Page, passkeys: unknown[] = []) =>
  Promise.all([
    page.route("**/auth/me", (route) => route.fulfill({ json: user })),
    page.route("**/auth/passkeys", (route) => route.fulfill({ json: passkeys })),
  ]);

test("app links to the security page", async ({ page }) => {
  await signedIn(page);
  await page.goto("/app");
  await page.getByRole("link", { name: "Password and passkeys" }).click();
  await expect(page).toHaveURL("/app/security");
  await expect(page.getByRole("heading", { name: "Password and passkeys" })).toBeVisible();
});

test("security sends a signed-out visitor to login", async ({ page }) => {
  await page.route("**/auth/me", (route) => route.fulfill({ status: 401, json: { error: "unauthorized" } }));
  await page.goto("/app/security");
  await expect(page).toHaveURL("/login");
});

test("set a first password, then the form asks for the current one", async ({ page }) => {
  await signedIn(page);
  const bodies: unknown[] = [];
  let reply: { status: number; json?: unknown } = { status: 403, json: { error: "reauth_required" } };
  await page.route("**/auth/password", (route) => {
    bodies.push(route.request().postDataJSON());
    return route.fulfill(reply);
  });
  await page.goto("/app/security");
  await page.getByLabel("New password").fill("a long new password");
  await page.getByRole("button", { name: "Set password" }).click();
  const alert = page.getByRole("alert").filter({ hasText: "needs a fresh sign-in" });
  await expect(alert).toBeVisible();
  await expect(alert.getByRole("link", { name: "Sign in again" })).toHaveAttribute("href", "/login");

  reply = { status: 204 };
  await page.getByRole("button", { name: "Set password" }).click();
  await expect(page.getByText("Password saved.", { exact: false })).toBeFocused();
  expect(bodies[1]).toEqual({ password: "a long new password" });
  await expect(page.getByLabel("Current password")).toBeVisible();
  await expect(page.getByRole("button", { name: "Change password" })).toBeVisible();
});

test("wrong current password is explained", async ({ page }) => {
  await page.route("**/auth/me", (route) => route.fulfill({ json: { ...user, has_password: true } }));
  await page.route("**/auth/passkeys", (route) => route.fulfill({ json: [] }));
  await page.route("**/auth/password", (route) =>
    route.fulfill({ status: 403, json: { error: "invalid_current_password" } }),
  );
  await page.goto("/app/security");
  await page.getByLabel("Current password").fill("wrong one");
  await page.getByLabel("New password").fill("a long new password");
  await page.getByRole("button", { name: "Change password" }).click();
  await expect(page.getByRole("alert").filter({ hasText: "current password is wrong" })).toBeVisible();
  await expect(page.getByLabel("Current password")).toHaveAttribute("aria-invalid", "true");
});

test("remove a passkey after confirming", async ({ page }) => {
  await signedIn(page, [key]);
  let deleted = false;
  await page.route("**/auth/passkeys/k1", (route) => {
    deleted = route.request().method() === "DELETE";
    return route.fulfill({ status: 204 });
  });
  await page.goto("/app/security");
  await expect(page.getByText("Old phone")).toBeVisible();
  await expect(page.getByText(/^Added /)).toBeVisible();
  await page.getByRole("button", { name: "Remove Old phone" }).click();
  await expect(page.getByRole("button", { name: "Yes, remove it" })).toBeFocused();
  await page.getByRole("button", { name: "Keep it" }).click();
  await expect(page.getByRole("button", { name: "Remove Old phone" })).toBeFocused();
  expect(deleted).toBe(false);
  await page.getByRole("button", { name: "Remove Old phone" }).click();
  await page.getByRole("button", { name: "Yes, remove it" }).click();
  await expect(page.getByText(/Passkey "Old phone" removed/)).toBeFocused();
  await expect(page.getByText("You have no passkeys yet.")).toBeVisible();
  expect(deleted).toBe(true);
});

test("add a passkey with a virtual authenticator", async ({ page, context }) => {
  const cdp = await context.newCDPSession(page);
  await cdp.send("WebAuthn.enable");
  await cdp.send("WebAuthn.addVirtualAuthenticator", {
    options: {
      protocol: "ctap2",
      transport: "internal",
      hasResidentKey: true,
      hasUserVerification: true,
      isUserVerified: true,
    },
  });
  await signedIn(page);
  await page.route("**/auth/passkeys/register/start", (route) =>
    route.fulfill({
      json: {
        challenge_id: "c1",
        options: {
          publicKey: {
            rp: { id: "localhost", name: "SocialReins" },
            user: { id: "AQID", name: user.email, displayName: user.name },
            challenge: "3q2-7w",
            pubKeyCredParams: [{ type: "public-key", alg: -7 }],
            timeout: 60000,
            authenticatorSelection: { residentKey: "required", requireResidentKey: true, userVerification: "required" },
            attestation: "none",
          },
        },
      },
    }),
  );
  let finish: { challenge_id: string; name: string; credential: { rawId: string; response: Record<string, string> } } | undefined;
  await page.route("**/auth/passkeys/register/finish", (route) => {
    finish = route.request().postDataJSON();
    return route.fulfill({ status: 201, json: { ...key, id: "k2", name: "Work laptop" } });
  });
  await page.goto("/app/security");
  await page.getByLabel(/Name for the new passkey/).fill("Work laptop");
  await page.getByRole("button", { name: "Add a passkey" }).click();
  await expect(page.getByText('Passkey "Work laptop" added.')).toBeFocused();
  expect(finish?.challenge_id).toBe("c1");
  expect(finish?.name).toBe("Work laptop");
  expect(finish?.credential.rawId).toMatch(/^[\w-]+$/);
  const clientData = JSON.parse(Buffer.from(finish!.credential.response.clientDataJSON!, "base64url").toString());
  expect(clientData).toMatchObject({ type: "webauthn.create", challenge: "3q2-7w" });
});

test("adding a passkey asks for the password when a fresh sign-in is needed, then reloads the list", async ({
  page,
  context,
}) => {
  const cdp = await context.newCDPSession(page);
  await cdp.send("WebAuthn.enable");
  await cdp.send("WebAuthn.addVirtualAuthenticator", {
    options: { protocol: "ctap2", transport: "internal", hasResidentKey: true, hasUserVerification: true, isUserVerified: true },
  });
  await page.route("**/auth/me", (route) => route.fulfill({ json: { ...user, has_password: true } }));
  // The first load fails; after the add the reload returns both keys.
  let loads = 0;
  await page.route("**/auth/passkeys", (route) =>
    ++loads === 1 ? route.fulfill({ status: 500 }) : route.fulfill({ json: [key, { ...key, id: "k2", name: "Work laptop" }] }),
  );
  const starts: unknown[] = [];
  await page.route("**/auth/passkeys/register/start", (route) => {
    const body = route.request().postDataJSON();
    starts.push(body);
    if (!body.password) return route.fulfill({ status: 403, json: { error: "reauth_required" } });
    return route.fulfill({
      json: {
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
      },
    });
  });
  await page.route("**/auth/passkeys/register/finish", (route) =>
    route.fulfill({ status: 201, json: { ...key, id: "k2", name: "Work laptop" } }),
  );
  await page.goto("/app/security");
  await expect(page.getByText("Your passkeys couldn't be loaded.", { exact: false })).toBeVisible();
  await page.getByRole("button", { name: "Add a passkey" }).click();
  const alert = page.getByRole("alert").filter({ hasText: "enter your current password" });
  await expect(alert).toBeVisible();
  await expect(alert.getByRole("link", { name: "sign in again" })).toHaveAttribute("href", "/login");
  await expect(page.getByLabel("Confirm with your password")).toBeFocused();
  await page.getByLabel("Confirm with your password").fill("my password");
  await page.getByRole("button", { name: "Add a passkey" }).click();
  await expect(page.getByText('Passkey "Work laptop" added.')).toBeFocused();
  expect(starts).toEqual([{}, { password: "my password" }]);
  await expect(page.getByText("Old phone")).toBeVisible();
  await expect(page.getByText("Work laptop", { exact: true })).toBeVisible();
  await expect(page.getByLabel("Confirm with your password")).toBeHidden();
});
