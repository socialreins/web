import { afterEach, describe, expect, it, vi } from "vitest";
import {
  acceptInvitation,
  createTeam,
  deleteTeam,
  grantable,
  invite,
  listMembers,
  mayChange,
  previewInvitation,
  removeMember,
  renameTeam,
  revokeInvitation,
  setRole,
  switchTeam,
} from "@/lib/teams";
import { apiUrl } from "@/lib/waitlist";

const reply = (status: number, body?: unknown) =>
  vi.fn(async () => (body === undefined ? new Response(null, { status }) : Response.json(body, { status })));
const call = (fetch: ReturnType<typeof vi.fn>) => fetch.mock.calls[0] as unknown as [string, RequestInit];

afterEach(() => vi.unstubAllGlobals());

describe("team requests", () => {
  const team = { id: "t1", name: "Acme", role: "owner" };

  it.each([
    ["createTeam", () => createTeam("Acme"), "/v1/teams", "POST", { name: "Acme" }],
    ["switchTeam", () => switchTeam("t1"), "/v1/current-team", "PUT", { team_id: "t1" }],
    ["renameTeam", () => renameTeam("Acme"), "/v1/team", "PATCH", { name: "Acme" }],
    ["setRole", () => setRole("u/1", "admin"), "/v1/team/members/u%2F1", "PATCH", { role: "admin" }],
    ["invite", () => invite("a@b.co", "member"), "/v1/team/invitations", "POST", { email: "a@b.co", role: "member" }],
  ] as const)("%s sends JSON with credentials", async (_, run, path, method, body) => {
    const fetch = reply(200, team);
    vi.stubGlobal("fetch", fetch);
    expect(await run()).toEqual(team);
    const [url, init] = call(fetch);
    expect(url).toBe(`${apiUrl}${path}`);
    expect(init).toMatchObject({ method, credentials: "include" });
    expect(JSON.parse(init.body as string)).toEqual(body);
  });

  it("deletes the team with an empty body, relying on a recent sign-in", async () => {
    const fetch = reply(204);
    vi.stubGlobal("fetch", fetch);
    expect(await deleteTeam()).toBe("ok");
    expect(JSON.parse(call(fetch)[1].body as string)).toEqual({});
  });

  it("removes, revokes and accepts without a body", async () => {
    for (const [run, path, method] of [
      [() => removeMember("u1"), "/v1/team/members/u1", "DELETE"],
      [() => revokeInvitation("i1"), "/v1/team/invitations/i1", "DELETE"],
      [() => acceptInvitation("tok"), "/v1/invitations/tok", "POST"],
    ] as const) {
      const fetch = reply(204);
      vi.stubGlobal("fetch", fetch);
      expect(await run()).toBe("ok");
      expect(call(fetch)[0]).toBe(`${apiUrl}${path}`);
      expect(call(fetch)[1]).toMatchObject({ method, credentials: "include" });
      expect(call(fetch)[1].body).toBeUndefined();
    }
  });

  it.each([
    [403, "forbidden"],
    [403, "reauth_required"],
    [403, "email_mismatch"],
    [404, "not_found"],
    [409, "last_owner"],
    [409, "last_team"],
    [409, "already_member"],
    [409, "already_invited"],
    [422, "invalid_name"],
    [422, "invalid_role"],
    [422, "invalid_email"],
    [429, "rate_limited"],
    [502, "mail_failed"],
  ])("maps %i %s", async (status, code) => {
    vi.stubGlobal("fetch", reply(status, { error: code }));
    expect(await listMembers()).toBe(code);
  });

  it("maps 401, unknown codes, network failures and timeouts", async () => {
    vi.stubGlobal("fetch", reply(401, { error: "unauthorized" }));
    expect(await previewInvitation("t")).toBe("signed_out");
    vi.stubGlobal("fetch", reply(403, { error: "forbidden_origin" }));
    expect(await previewInvitation("t")).toBe("error");
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new TypeError("offline")));
    expect(await previewInvitation("t")).toBe("error");
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new DOMException("slow", "TimeoutError")));
    expect(await previewInvitation("t")).toBe("timeout");
  });
});

describe("role rules", () => {
  it("lets only an owner touch the owner role", () => {
    expect(mayChange("owner", "owner")).toBe(true);
    expect(mayChange("admin", "owner")).toBe(false);
    expect(mayChange("admin", "member")).toBe(true);
    expect(mayChange("member", "member")).toBe(false);
    expect(grantable("owner")).toEqual(["owner", "admin", "member"]);
    expect(grantable("admin")).toEqual(["admin", "member"]);
    expect(grantable("member")).toEqual([]);
  });
});
