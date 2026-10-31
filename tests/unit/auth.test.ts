import { afterEach, describe, expect, it, vi } from "vitest";
import { getMe, requestLink, signOut } from "@/lib/auth";
import { apiUrl } from "@/lib/waitlist";

const respond = (status: number, body: unknown = null) =>
  vi.fn().mockResolvedValue(body === null ? new Response(null, { status }) : Response.json(body, { status }));
const offline = () => vi.fn().mockRejectedValue(new TypeError("offline"));

afterEach(() => vi.unstubAllGlobals());

describe("requestLink", () => {
  it("posts the email as JSON to /auth/link with credentials", async () => {
    const fetch = respond(202);
    vi.stubGlobal("fetch", fetch);
    expect(await requestLink("a@b.co")).toBe("sent");
    const [url, init] = fetch.mock.calls[0]!;
    expect(url).toBe(`${apiUrl}/auth/link`);
    expect(init).toMatchObject({ method: "POST", credentials: "include" });
    expect(JSON.parse(init.body)).toEqual({ email: "a@b.co" });
  });

  it("sends the Turnstile token when there is one", async () => {
    const fetch = respond(202);
    vi.stubGlobal("fetch", fetch);
    await requestLink("a@b.co", "tok");
    expect(JSON.parse(fetch.mock.calls[0]![1].body)).toEqual({ email: "a@b.co", turnstile_token: "tok" });
  });

  it.each([
    [422, "invalid"],
    [429, "rate_limited"],
    [500, "error"],
  ])("maps %i to %s", async (status, result) => {
    vi.stubGlobal("fetch", respond(status));
    expect(await requestLink("a@b.co")).toBe(result);
  });

  it.each([
    [422, "captcha_failed"],
    [503, "captcha_unavailable"],
  ])("maps %i %s to the captcha result", async (status, code) => {
    vi.stubGlobal("fetch", respond(status, { error: code }));
    expect(await requestLink("a@b.co", "tok")).toBe(code);
  });

  it("reports a network failure as error and a timeout as timeout", async () => {
    vi.stubGlobal("fetch", offline());
    expect(await requestLink("a@b.co")).toBe("error");
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new DOMException("slow", "TimeoutError")));
    expect(await requestLink("a@b.co")).toBe("timeout");
  });
});

describe("getMe", () => {
  it("returns the user from /auth/me, sending the cookie", async () => {
    const user = { id: "1", email: "a@b.co", name: "a", username: null };
    const fetch = respond(200, user);
    vi.stubGlobal("fetch", fetch);
    expect(await getMe()).toEqual({ user });
    expect(fetch).toHaveBeenCalledWith(`${apiUrl}/auth/me`, expect.objectContaining({ credentials: "include" }));
  });

  it("maps 401 to signed_out, other failures to error", async () => {
    vi.stubGlobal("fetch", respond(401));
    expect(await getMe()).toBe("signed_out");
    vi.stubGlobal("fetch", respond(500));
    expect(await getMe()).toBe("error");
    vi.stubGlobal("fetch", offline());
    expect(await getMe()).toBe("error");
  });
});

describe("signOut", () => {
  it("posts to /auth/logout with credentials and reports success", async () => {
    const fetch = respond(204);
    vi.stubGlobal("fetch", fetch);
    expect(await signOut()).toBe(true);
    expect(fetch).toHaveBeenCalledWith(
      `${apiUrl}/auth/logout`,
      expect.objectContaining({ method: "POST", credentials: "include" }),
    );
  });

  it("reports a failure", async () => {
    vi.stubGlobal("fetch", respond(500));
    expect(await signOut()).toBe(false);
    vi.stubGlobal("fetch", offline());
    expect(await signOut()).toBe(false);
  });
});
