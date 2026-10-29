import { afterEach, describe, expect, it, vi } from "vitest";
import {
  createSet,
  deleteSet,
  listSets,
  purgeDate,
  renameSet,
  restoreSet,
  setAccountSets,
  setNames,
  type SocialSet,
} from "@/lib/sets";
import { apiUrl } from "@/lib/waitlist";

const reply = (status: number, body?: unknown) =>
  vi.fn(async () => (body === undefined ? new Response(null, { status }) : Response.json(body, { status })));
const call = (fetch: ReturnType<typeof vi.fn>) => fetch.mock.calls[0] as unknown as [string, RequestInit];

afterEach(() => vi.unstubAllGlobals());

describe("set requests", () => {
  it("lists live and deleted sets", async () => {
    let fetch = reply(200, []);
    vi.stubGlobal("fetch", fetch);
    await listSets();
    expect(call(fetch)[0]).toBe(`${apiUrl}/v1/social-sets`);
    fetch = reply(200, []);
    vi.stubGlobal("fetch", fetch);
    await listSets(true);
    expect(call(fetch)[0]).toBe(`${apiUrl}/v1/social-sets?deleted=true`);
    expect(call(fetch)[1]).toMatchObject({ credentials: "include" });
  });

  it.each([
    ["createSet", () => createSet("Clients"), "/v1/social-sets", "POST", { name: "Clients" }],
    ["renameSet", () => renameSet("s/1", "Clients"), "/v1/social-sets/s%2F1", "PATCH", { name: "Clients" }],
    ["deleteSet with password", () => deleteSet("s1", "pw"), "/v1/social-sets/s1", "DELETE", { password: "pw" }],
    ["deleteSet without", () => deleteSet("s1"), "/v1/social-sets/s1", "DELETE", {}],
    ["setAccountSets", () => setAccountSets("c1", ["d", "s1"]), "/v1/connections/c1/sets", "PUT", { set_ids: ["d", "s1"] }],
  ] as const)("%s sends JSON", async (_, run, path, method, body) => {
    const fetch = reply(200, {});
    vi.stubGlobal("fetch", fetch);
    await run();
    const [url, init] = call(fetch);
    expect(url).toBe(`${apiUrl}${path}`);
    expect(init).toMatchObject({ method, credentials: "include" });
    expect(JSON.parse(init.body as string)).toEqual(body);
  });

  it("restores without a body", async () => {
    const fetch = reply(200, { id: "s1" });
    vi.stubGlobal("fetch", fetch);
    expect(await restoreSet("s1")).toEqual({ id: "s1" });
    expect(call(fetch)[0]).toBe(`${apiUrl}/v1/social-sets/s1/restore`);
    expect(call(fetch)[1]).toMatchObject({ method: "POST" });
    expect(call(fetch)[1].body).toBeUndefined();
  });

  it.each([
    [409, "default_set"],
    [409, "name_taken"],
    [409, "too_many_sets"],
    [422, "invalid_name"],
    [422, "invalid_query"],
    [422, "invalid_sets"],
    [422, "default_set_required"],
    [403, "reauth_required"],
    [403, "forbidden"],
    [404, "not_found"],
    [429, "rate_limited"],
  ])("maps %i %s", async (status, code) => {
    vi.stubGlobal("fetch", reply(status, { error: code }));
    expect(await deleteSet("s1")).toBe(code);
  });
});

describe("set helpers", () => {
  it("purges 30 days after deletion", () => {
    expect(purgeDate("2026-10-01T10:00:00Z").toISOString()).toBe("2026-10-31T10:00:00.000Z");
  });

  it("names the live sets an account is in, in list order", () => {
    const set = (id: string, name: string) => ({ id, name }) as SocialSet;
    const sets = [set("d", "Default"), set("a", "Clients"), set("b", "Friends")];
    expect(setNames(["b", "d", "gone"], sets)).toEqual(["Default", "Friends"]);
  });
});
