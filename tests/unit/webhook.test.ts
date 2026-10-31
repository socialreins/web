import { afterEach, describe, expect, it, vi } from "vitest";
import { getWebhook, pingText, removeWebhook, setWebhook, testWebhook } from "@/lib/webhook";
import { apiUrl } from "@/lib/waitlist";

const reply = (status: number, body?: unknown) =>
  vi.fn(async () => (body === undefined ? new Response(null, { status }) : Response.json(body, { status })));
const call = (fetch: ReturnType<typeof vi.fn>) => fetch.mock.calls[0] as unknown as [string, RequestInit];
const hook = { url: "https://example.com/hook", created_at: "2026-10-01T10:00:00Z", updated_at: "2026-10-01T10:00:00Z" };

afterEach(() => vi.unstubAllGlobals());

describe("webhook requests", () => {
  it("reads the webhook with the session cookie", async () => {
    const fetch = reply(200, hook);
    vi.stubGlobal("fetch", fetch);
    expect(await getWebhook()).toEqual(hook);
    expect(call(fetch)[0]).toBe(`${apiUrl}/v1/team/webhook`);
    expect(call(fetch)[1]).toMatchObject({ credentials: "include" });
  });

  it("reads none as not_found", async () => {
    vi.stubGlobal("fetch", reply(404, { error: "not_found" }));
    expect(await getWebhook()).toBe("not_found");
  });

  it("creates a webhook and returns its secret", async () => {
    const created = { webhook: hook, secret: "whsec_abc" };
    const fetch = reply(201, created);
    vi.stubGlobal("fetch", fetch);
    expect(await setWebhook(hook.url)).toEqual(created);
    const [url, init] = call(fetch);
    expect(url).toBe(`${apiUrl}/v1/team/webhook`);
    expect(init).toMatchObject({ method: "PUT", credentials: "include" });
    expect(JSON.parse(init.body as string)).toEqual({ url: hook.url });
  });

  it("updates the URL without a new secret", async () => {
    vi.stubGlobal("fetch", reply(200, hook));
    expect(await setWebhook(hook.url)).toEqual(hook);
  });

  it("removes without a body", async () => {
    const fetch = reply(204);
    vi.stubGlobal("fetch", fetch);
    expect(await removeWebhook()).toBe("ok");
    expect(call(fetch)[1]).toMatchObject({ method: "DELETE" });
    expect(call(fetch)[1].body).toBeUndefined();
  });

  it("sends a test ping", async () => {
    const fetch = reply(200, { status: 204, error: null });
    vi.stubGlobal("fetch", fetch);
    expect(await testWebhook()).toEqual({ status: 204, error: null });
    expect(call(fetch)[0]).toBe(`${apiUrl}/v1/team/webhook/test`);
    expect(call(fetch)[1]).toMatchObject({ method: "POST" });
  });

  it.each([
    [403, "reauth_required"],
    [403, "forbidden"],
    [422, "invalid_url"],
    [429, "rate_limited"],
  ])("maps %i %s", async (status, code) => {
    vi.stubGlobal("fetch", reply(status, { error: code }));
    expect(await setWebhook("x")).toBe(code);
  });
});

describe("pingText", () => {
  it.each([
    [{ status: 200, error: null }, "The receiver answered 200. Test delivered."],
    [{ status: 500, error: null }, "The receiver answered 500. A real event would be retried."],
    [{ status: null, error: "timeout" }, "Test not delivered: it didn't answer within 10 seconds."],
    [{ status: null, error: "blocked_address" }, "Test not delivered: the URL points at a private address."],
    [{ status: null, error: "something_new" }, "Test not delivered: it couldn't be reached."],
  ])("%j", (ping, text) => expect(pingText(ping)).toBe(text));
});
