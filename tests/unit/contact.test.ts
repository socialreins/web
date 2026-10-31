import { afterEach, describe, expect, it, vi } from "vitest";
import { sendContact } from "@/lib/contact";
import { apiUrl } from "@/lib/waitlist";

const msg = { name: "Ann", email: "a@b.co", message: "Hi" };
const respond = (status: number, error?: string) =>
  vi.fn().mockResolvedValue(error ? Response.json({ error }, { status }) : new Response("{}", { status }));

afterEach(() => vi.unstubAllGlobals());

describe("sendContact", () => {
  it("posts the message to /v1/contact without a session, with the token only when there is one", async () => {
    const fetch = respond(202);
    vi.stubGlobal("fetch", fetch);
    expect(await sendContact(msg, "tok")).toBe("sent");
    const [url, init] = fetch.mock.calls[0]!;
    expect(url).toBe(`${apiUrl}/v1/contact`);
    expect(init.method).toBe("POST");
    expect(init.credentials).toBeUndefined();
    expect(JSON.parse(init.body)).toEqual({ ...msg, turnstile_token: "tok" });
    await sendContact(msg);
    expect(JSON.parse(fetch.mock.calls[1]![1].body)).toEqual(msg);
  });

  it.each([
    [422, "invalid_name"],
    [422, "invalid_email"],
    [422, "invalid_message"],
    [422, "captcha_failed"],
    [503, "captcha_unavailable"],
    [503, "contact_unavailable"],
  ])("maps %i %s", async (status, code) => {
    vi.stubGlobal("fetch", respond(status, code));
    expect(await sendContact(msg)).toBe(code);
  });

  it("maps 429, unknown errors, network failures and timeouts", async () => {
    vi.stubGlobal("fetch", respond(429));
    expect(await sendContact(msg)).toBe("rate_limited");
    vi.stubGlobal("fetch", respond(500));
    expect(await sendContact(msg)).toBe("error");
    vi.stubGlobal("fetch", respond(422, "something_new"));
    expect(await sendContact(msg)).toBe("error");
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new TypeError("offline")));
    expect(await sendContact(msg)).toBe("error");
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new DOMException("slow", "TimeoutError")));
    expect(await sendContact(msg)).toBe("timeout");
  });
});
