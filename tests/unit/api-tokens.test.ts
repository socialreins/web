import { afterEach, describe, expect, it, vi } from "vitest";
import { createToken, listTokens, revokeToken } from "@/lib/api-tokens";
import { apiUrl } from "@/lib/waitlist";

const reply = (status: number, body?: unknown) =>
  vi.fn(async () => (body === undefined ? new Response(null, { status }) : Response.json(body, { status })));
const call = (fetch: ReturnType<typeof vi.fn>) => fetch.mock.calls[0] as unknown as [string, RequestInit];

afterEach(() => vi.unstubAllGlobals());

describe("api token requests", () => {
  it("lists tokens with the session cookie", async () => {
    const fetch = reply(200, []);
    vi.stubGlobal("fetch", fetch);
    expect(await listTokens()).toEqual([]);
    expect(call(fetch)[0]).toBe(`${apiUrl}/v1/api-tokens`);
    expect(call(fetch)[1]).toMatchObject({ credentials: "include" });
  });

  it("creates a token and returns its secret", async () => {
    const created = { token: { id: "k1", name: "CM" }, secret: "sr_set_live_abc" };
    const fetch = reply(201, created);
    vi.stubGlobal("fetch", fetch);
    expect(await createToken({ name: "CM", social_set_id: "s1", expires_in_days: 30 })).toEqual(created);
    const [url, init] = call(fetch);
    expect(url).toBe(`${apiUrl}/v1/api-tokens`);
    expect(init).toMatchObject({ method: "POST", credentials: "include" });
    expect(JSON.parse(init.body as string)).toEqual({ name: "CM", social_set_id: "s1", expires_in_days: 30 });
  });

  it("revokes by id without a body", async () => {
    const fetch = reply(204);
    vi.stubGlobal("fetch", fetch);
    expect(await revokeToken("k/1")).toBe("ok");
    expect(call(fetch)[0]).toBe(`${apiUrl}/v1/api-tokens/k%2F1`);
    expect(call(fetch)[1]).toMatchObject({ method: "DELETE" });
    expect(call(fetch)[1].body).toBeUndefined();
  });

  it.each([
    [403, "reauth_required"],
    [403, "forbidden"],
    [409, "too_many_tokens"],
    [422, "invalid_name"],
    [422, "invalid_set"],
    [422, "invalid_expiry"],
    [422, "invalid_body"],
    [429, "rate_limited"],
  ])("maps %i %s", async (status, code) => {
    vi.stubGlobal("fetch", reply(status, { error: code }));
    // invalid_body only follows a malformed request, so it reads as a generic error.
    expect(await createToken({ name: "CM" })).toBe(code === "invalid_body" ? "error" : code);
  });
});
