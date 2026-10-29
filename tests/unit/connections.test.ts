import { afterEach, describe, expect, it, vi } from "vitest";
import {
  connectBluesky,
  disconnect,
  listConnections,
  listProviders,
  providerState,
  safeAvatar,
} from "@/lib/connections";
import { apiUrl } from "@/lib/waitlist";

const reply = (status: number, body?: unknown) =>
  vi.fn(async () => (body === undefined ? new Response(null, { status }) : Response.json(body, { status })));
const call = (fetch: ReturnType<typeof vi.fn>) => fetch.mock.calls[0] as unknown as [string, RequestInit];

afterEach(() => vi.unstubAllGlobals());

describe("connection requests", () => {
  it("lists connections and providers with credentials", async () => {
    let fetch = reply(200, []);
    vi.stubGlobal("fetch", fetch);
    expect(await listConnections()).toEqual([]);
    expect(call(fetch)[0]).toBe(`${apiUrl}/v1/connections`);
    expect(call(fetch)[1]).toMatchObject({ credentials: "include" });
    fetch = reply(200, [{ provider: "bluesky", configured: true }]);
    vi.stubGlobal("fetch", fetch);
    expect(await listProviders()).toEqual([{ provider: "bluesky", configured: true }]);
    expect(call(fetch)[0]).toBe(`${apiUrl}/v1/connections/providers`);
  });

  it("posts the handle and app password to /v1/connections/bluesky", async () => {
    const fetch = reply(201, { id: "c1" });
    vi.stubGlobal("fetch", fetch);
    expect(await connectBluesky("alice.bsky.social", "abcd-efgh-ijkl-mnop")).toEqual({ id: "c1" });
    const [url, init] = call(fetch);
    expect(url).toBe(`${apiUrl}/v1/connections/bluesky`);
    expect(init).toMatchObject({ method: "POST", credentials: "include" });
    expect(JSON.parse(init.body as string)).toEqual({ handle: "alice.bsky.social", app_password: "abcd-efgh-ijkl-mnop" });
  });

  it.each([
    [422, "invalid_handle"],
    [422, "invalid_credentials"],
    [422, "unsupported_pds"],
    [502, "bluesky_unreachable"],
    [429, "rate_limited"],
    [403, "forbidden"],
  ])("maps connect failure %i %s", async (status, code) => {
    vi.stubGlobal("fetch", reply(status, { error: code }));
    expect(await connectBluesky("a", "b")).toBe(code);
  });

  it("disconnects with DELETE and maps 404", async () => {
    let fetch = reply(204);
    vi.stubGlobal("fetch", fetch);
    expect(await disconnect("c/1")).toBe("ok");
    expect(call(fetch)[0]).toBe(`${apiUrl}/v1/connections/c%2F1`);
    expect(call(fetch)[1]).toMatchObject({ method: "DELETE", credentials: "include" });
    fetch = reply(404, { error: "not_found" });
    vi.stubGlobal("fetch", fetch);
    expect(await disconnect("c1")).toBe("not_found");
  });
});

describe("provider state", () => {
  const providers = [
    { provider: "bluesky", configured: true },
    { provider: "meta", configured: true },
    { provider: "x", configured: false },
  ];
  it("knows which platforms can connect now", () => {
    expect(providerState("bluesky", providers)).toBe("available");
    expect(providerState("facebook", providers)).toBe("coming_soon");
    expect(providerState("instagram", providers)).toBe("coming_soon");
    expect(providerState("x", providers)).toBe("not_configured");
    expect(providerState("youtube", providers)).toBe("not_configured");
    expect(providerState("bluesky", [])).toBe("not_configured");
  });

  it("only keeps avatars from Bluesky's CDN", () => {
    expect(safeAvatar("https://cdn.bsky.app/img/avatar/plain/x.jpg")).toBe("https://cdn.bsky.app/img/avatar/plain/x.jpg");
    expect(safeAvatar("https://cdn.bsky.app.evil.com/x.jpg")).toBeNull();
    expect(safeAvatar("http://cdn.bsky.app/x.jpg")).toBeNull();
    expect(safeAvatar(null)).toBeNull();
  });
});
