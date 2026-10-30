import { expect, test, type Page } from "@playwright/test";

type Role = "owner" | "admin" | "member";
const acme = (role: Role) => ({ id: "t1", name: "Acme", role });
const me = (role: Role, extra = {}) => ({
  id: "u-me",
  email: "me@example.com",
  name: "Me",
  username: null,

  current_team: acme(role),
  ...extra,
});
const members = (role: Role) => [
  { id: "u-olive", name: "Olive", email: "olive@example.com", role: "owner", joined_at: "2026-10-01T10:00:00Z" },
  { id: "u-me", name: "Me", email: "me@example.com", role, joined_at: "2026-10-02T10:00:00Z" },
  { id: "u-max", name: "Max", email: "max@example.com", role: "member", joined_at: "2026-10-03T10:00:00Z" },
];
const invitation = {
  id: "i1",
  email: "new@example.com",
  role: "member",
  invited_by: "u-me",
  expires_at: "2026-11-04T10:00:00Z",
  created_at: "2026-10-28T10:00:00Z",
};

async function signedIn(page: Page, role: Role) {
  const loads = { invitations: 0 };
  await page.route("**/auth/me", (route) => route.fulfill({ json: me(role) }));
  await page.route("**/v1/team/members", (route) => route.fulfill({ json: members(role) }));
  await page.route("**/v1/team/invitations", (route) => {
    if (route.request().method() !== "GET") return route.fallback();
    loads.invitations++;
    return route.fulfill({ json: [invitation] });
  });
  return loads;
}

test("app shows the team switcher, switches and creates a team", async ({ page }) => {
  await page.route("**/auth/me", (route) => route.fulfill({ json: me("owner") }));
  await page.route("**/v1/teams", (route) =>
    route.request().method() === "GET"
      ? route.fulfill({ json: [acme("owner"), { id: "t2", name: "Beta", role: "member" }] })
      : route.fulfill({ status: 201, json: { id: "t3", name: route.request().postDataJSON().name, role: "owner" } }),
  );
  let switched: unknown;
  await page.route("**/v1/current-team", (route) => {
    switched = route.request().postDataJSON();
    return route.fulfill({ json: { id: "t2", name: "Beta", role: "member" } });
  });
  await page.goto("/app");
  const team = page.getByRole("region", { name: "Team" });
  await expect(team).toContainText("AcmeOwner");
  await expect(page.getByRole("link", { name: "Manage team" })).toHaveAttribute("href", "/app/team");
  await page.getByRole("button", { name: "Switch", exact: true }).click();
  await expect(page.getByText("Switched to Beta.")).toBeFocused();
  expect(switched).toEqual({ team_id: "t2" });
  await expect(team).toContainText("BetaMember");

  await page.getByRole("button", { name: "New team" }).click();
  await expect(page.getByLabel("New team name")).toBeFocused();
  await page.getByLabel("New team name").fill("Gamma");
  await page.getByRole("button", { name: "Create team" }).click();
  await expect(page.getByText("Created Gamma. It is now your current team.")).toBeFocused();
  await expect(team).toContainText("GammaOwner");
});

test("long team names and emails stay inside the sidebar", async ({ page }) => {
  const long = "Bytech Social Media Marketing Agency International";
  await page.route("**/auth/me", (route) =>
    route.fulfill({ json: me("owner", { email: "someone.with.a.really.long.address@example-company.com", current_team: { id: "t1", name: long, role: "owner" } }) }),
  );
  await page.route("**/v1/teams", (route) =>
    route.fulfill({ json: [{ id: "t1", name: long, role: "owner" }, { id: "t2", name: `${long} Second Office`, role: "member" }] }),
  );
  await page.goto("/app");
  const team = page.getByRole("region", { name: "Team" });
  await expect(team).toContainText(long);
  await expect(page.getByLabel("Switch to another team")).toBeVisible();
  const [card, aside] = await Promise.all([team.boundingBox(), page.locator("aside").boundingBox()]);
  expect(card!.x + card!.width).toBeLessThanOrEqual(aside!.x + aside!.width);
});

test("app explains when sign-in can't be checked", async ({ page }) => {
  await page.route("**/auth/me", (route) => route.fulfill({ status: 500 }));
  await page.goto("/app");
  await expect(page.getByRole("alert").filter({ hasText: "Sign-in couldn't be checked." })).toBeVisible();
});

test("team page sends a signed-out visitor to login", async ({ page }) => {
  await page.route("**/auth/me", (route) => route.fulfill({ status: 401, json: { error: "unauthorized" } }));
  await page.goto("/app/team");
  await expect(page).toHaveURL("/login");
});

test("an admin manages members and invitations but can't touch owners or delete the team", async ({ page }) => {
  const loads = await signedIn(page, "admin");
  const calls: string[] = [];
  await page.route("**/v1/team/members/*", (route) => {
    const req = route.request();
    calls.push(`${req.method()} ${new URL(req.url()).pathname} ${req.postData() ?? ""}`);
    return req.method() === "PATCH"
      ? route.fulfill({ json: { ...members("admin")[2], role: "admin" } })
      : route.fulfill({ status: 204 });
  });
  await page.route("**/v1/team/invitations", (route) => {
    if (route.request().method() !== "POST") return route.fallback();
    const body = route.request().postDataJSON();
    return body.email === "dup@example.com"
      ? route.fulfill({ status: 409, json: { error: "already_member" } })
      : route.fulfill({ status: 201, json: { ...invitation, id: "i2", email: body.email, role: body.role } });
  });
  await page.route("**/v1/team/invitations/i1", (route) => route.fulfill({ status: 204 }));
  await page.goto("/app/team");

  await expect(page.getByLabel("Name", { exact: true })).toHaveValue("Acme");
  await expect(page.getByRole("heading", { name: "Delete team" })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Remove Olive" })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Leave team" })).toBeVisible();
  const role = page.getByLabel("Role for Max");
  await expect(role.locator("option")).toHaveText(["Admin", "Member"]);
  await role.selectOption("admin");
  await page.getByRole("button", { name: "Change Max's role" }).click();
  await expect(page.getByText("Max is now admin.")).toBeFocused();
  await expect.poll(() => loads.invitations).toBe(2);

  await page.getByRole("button", { name: "Remove Max" }).click();
  await expect(page.getByRole("button", { name: "Yes, remove" })).toBeFocused();
  await page.getByRole("button", { name: "Cancel" }).click();
  await expect(page.getByRole("button", { name: "Remove Max" })).toBeFocused();
  await page.getByRole("button", { name: "Remove Max" }).click();
  await expect(page.getByRole("button", { name: "Yes, remove" })).toHaveAccessibleDescription("Remove Max from the team?");
  await page.getByRole("button", { name: "Yes, remove" }).click();
  await expect(page.getByText("Max was removed from the team.")).toBeFocused();
  await expect.poll(() => loads.invitations).toBe(3);
  expect(calls).toEqual(['PATCH /v1/team/members/u-max {"role":"admin"}', "DELETE /v1/team/members/u-max "]);

  await page.getByLabel("Email").fill("dup@example.com");
  await page.getByRole("button", { name: "Send invitation" }).click();
  await expect(page.getByRole("alert").filter({ hasText: "already in this team" })).toBeVisible();
  await page.getByLabel("Email").fill("pal@example.com");
  await page.getByLabel("Role", { exact: true }).last().selectOption("admin");
  await page.getByRole("button", { name: "Send invitation" }).click();
  await expect(page.getByText("Invitation sent to pal@example.com.")).toBeFocused();
  await page.getByRole("button", { name: "Revoke the invitation for new@example.com" }).click();
  await expect(page.getByText("The invitation for new@example.com was revoked.")).toBeFocused();
  await expect(page.getByText("pal@example.com", { exact: true })).toBeVisible();
});

test("a member sees no management controls and can leave", async ({ page }) => {
  await signedIn(page, "member");
  let left = "";
  await page.route("**/v1/team/members/*", (route) => {
    left = `${route.request().method()} ${new URL(route.request().url()).pathname}`;
    return route.fulfill({ status: 204 });
  });
  await page.route("**/v1/teams", (route) => route.fulfill({ json: [acme("member")] }));
  await page.goto("/app/team");
  await expect(page.getByText("You are a member of Acme.")).toBeVisible();
  await expect(page.getByRole("heading", { name: "Team name" })).toHaveCount(0);
  await expect(page.getByRole("heading", { name: "Invitations" })).toHaveCount(0);
  await expect(page.getByRole("button", { name: /^Remove/ })).toHaveCount(0);
  await expect(page.getByRole("combobox")).toHaveCount(0);
  await page.getByRole("button", { name: "Leave team" }).click();
  await page.getByRole("button", { name: "Yes, leave" }).click();
  await expect(page).toHaveURL("/app/posts");
  expect(left).toBe("DELETE /v1/team/members/u-me");
});

test("the last owner leaving is explained", async ({ page }) => {
  await signedIn(page, "owner");
  await page.route("**/v1/team/members/*", (route) => route.fulfill({ status: 409, json: { error: "last_owner" } }));
  await page.goto("/app/team");
  await page.getByRole("button", { name: "Leave team" }).click();
  await page.getByRole("button", { name: "Yes, leave" }).click();
  await expect(page.getByRole("alert").filter({ hasText: "at least one owner" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Leave team" })).toBeFocused();
});

test("an owner deletes the team after typing its name, signing in again when needed", async ({ page }) => {
  await signedIn(page, "owner");
  const bodies: unknown[] = [];
  await page.route("**/v1/team", (route) => {
    if (route.request().method() !== "DELETE") return route.fallback();
    bodies.push(route.request().postDataJSON());
    return bodies.length === 1
      ? route.fulfill({ status: 403, json: { error: "reauth_required" } })
      : bodies.length === 2
        ? route.fulfill({ status: 409, json: { error: "last_team" } })
        : route.fulfill({ status: 204 });
  });
  await page.route("**/v1/teams", (route) => route.fulfill({ json: [acme("owner")] }));
  await page.goto("/app/team");
  const del = page.getByRole("button", { name: "Delete team" });
  await expect(del).toBeDisabled();
  await page.getByLabel("Type Acme to confirm").fill("Acm");
  await expect(del).toBeDisabled();
  await page.getByLabel("Type Acme to confirm").fill("Acme");
  await del.click();
  const reauth = page.getByRole("alert").filter({ hasText: "needs a fresh sign-in" });
  await expect(reauth).toBeVisible();
  await expect(reauth.getByRole("link", { name: "Sign in again" })).toHaveAttribute("href", "/login?next=%2Fapp%2Fteam");
  await expect(page.locator('input[type="password"]')).toHaveCount(0);
  await del.click();
  await expect(page.getByRole("alert").filter({ hasText: "your only team" })).toBeVisible();
  await del.click();
  await expect(page).toHaveURL("/app/posts");
  expect(bodies).toEqual([{}, {}, {}]);
});

const preview = {
  team: "Acme",
  email: "me@example.com",
  role: "admin",
  invited_by: "Olive",
  expires_at: "2026-11-04T10:00:00Z",
};

test("invitation preview asks a signed-out visitor to sign in and come back", async ({ page }) => {
  await page.route("**/v1/invitations/tok", (route) => route.fulfill({ json: preview }));
  await page.route("**/auth/me", (route) => route.fulfill({ status: 401, json: { error: "unauthorized" } }));
  await page.goto("/invitations/tok");
  await expect(page.getByText("Olive invited me@example.com to join Acme as admin.")).toBeVisible();
  await expect(page.getByText(/open this invitation link again/)).toBeVisible();
  await expect(page.getByRole("link", { name: "Sign in", exact: true })).toHaveAttribute("href", "/login");
  await expect(page.getByRole("button", { name: /Join/ })).toHaveCount(0);
});

test("invitation accept joins the team", async ({ page }) => {
  await page.route("**/v1/invitations/tok", (route) =>
    route.request().method() === "POST" ? route.fulfill({ json: acme("admin") }) : route.fulfill({ json: preview }),
  );
  await page.route("**/auth/me", (route) => route.fulfill({ json: me("owner") }));
  await page.goto("/invitations/tok");
  await page.getByRole("button", { name: "Join Acme" }).click();
  await expect(page.getByText("You are in Acme as admin. It is now your current team.")).toBeFocused();
  await expect(page.getByRole("link", { name: "Open the app" })).toHaveAttribute("href", "/app");
});

test("invitation explains a wrong account, an expired link and a used one", async ({ page }) => {
  await page.route("**/auth/me", (route) => route.fulfill({ json: me("owner", { email: "other@example.com" }) }));
  await page.route("**/v1/invitations/tok", (route) => route.fulfill({ json: preview }));
  await page.goto("/invitations/tok");
  await expect(page.getByRole("alert").filter({ hasText: "signed in as other@example.com" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Join Acme" })).toHaveCount(0);

  await page.route("**/v1/invitations/gone", (route) => route.fulfill({ status: 404, json: { error: "not_found" } }));
  await page.goto("/invitations/gone");
  await expect(page.getByRole("alert").filter({ hasText: "expired, was already used" })).toBeVisible();

  await page.unrouteAll();
  await page.route("**/auth/me", (route) => route.fulfill({ json: me("owner") }));
  await page.route("**/v1/invitations/tok", (route) =>
    route.request().method() === "POST"
      ? route.fulfill({ status: 404, json: { error: "not_found" } })
      : route.fulfill({ json: preview }),
  );
  await page.goto("/invitations/tok");
  await page.getByRole("button", { name: "Join Acme" }).click();
  await expect(page.getByRole("alert").filter({ hasText: "expired, was already used" })).toBeVisible();
});

test("role change, removal and an admin invite ask to sign in again when brain needs it", async ({ page }) => {
  await signedIn(page, "owner");
  await page.route("**/v1/team/members/u-max", (route) => route.fulfill({ status: 403, json: { error: "reauth_required" } }));
  await page.route("**/v1/team/invitations", (route) =>
    route.request().method() === "POST" ? route.fulfill({ status: 403, json: { error: "reauth_required" } }) : route.fallback(),
  );
  await page.goto("/app/team");
  const again = (region: string) =>
    page.getByRole("region", { name: region }).getByRole("alert").filter({ hasText: "needs a fresh sign-in" });

  await page.getByLabel("Role for Max").selectOption("admin");
  await page.getByRole("button", { name: "Change Max's role" }).click();
  await expect(again("Members")).toBeVisible();
  await expect(again("Members").getByRole("link", { name: "Sign in again" })).toHaveAttribute("href", "/login?next=%2Fapp%2Fteam");

  await page.getByRole("button", { name: "Remove Max" }).click();
  await page.getByRole("button", { name: "Yes, remove" }).click();
  await expect(again("Members")).toBeVisible();
  await expect(page.getByRole("button", { name: "Remove Max" })).toBeVisible();

  await page.getByLabel("Email").fill("boss@example.com");
  await page.getByLabel("Role", { exact: true }).last().selectOption("admin");
  await page.getByRole("button", { name: "Send invitation" }).click();
  await expect(again("Invitations")).toBeVisible();
});
