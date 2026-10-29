import { afterEach, describe, expect, it, vi } from "vitest";
import { getProviders, googleStartUrl, safeNext, signInWithPasskey } from "@/lib/auth";
import { apiUrl } from "@/lib/waitlist";

const reply = (status: number, error?: string) =>
  vi.fn(async () => (error ? Response.json({ error }, { status }) : new Response(null, { status })));
const call = (fetch: ReturnType<typeof vi.fn>, i: number) => fetch.mock.calls[i] as unknown as [string, RequestInit];

afterEach(() => vi.unstubAllGlobals());

describe("getProviders", () => {
  it("reads /auth/providers with credentials", async () => {
    const fetch = vi.fn(async () => Response.json({ google: true }));
    vi.stubGlobal("fetch", fetch);
    expect(await getProviders()).toEqual({ google: true });
    expect(call(fetch, 0)[0]).toBe(`${apiUrl}/auth/providers`);
    expect(call(fetch, 0)[1]).toMatchObject({ credentials: "include" });
  });

  it("treats anything but google: true as no Google, without retrying an answer", async () => {
    for (const fetch of [
      vi.fn(async () => Response.json({ google: false })),
      vi.fn(async () => Response.json({ google: "yes" })),
      vi.fn(async () => Response.json({})),
      reply(500),
    ]) {
      vi.stubGlobal("fetch", fetch);
      expect(await getProviders(0)).toEqual({ google: false });
      expect(fetch).toHaveBeenCalledTimes(1);
    }
  });

  it("retries a network failure once", async () => {
    let fetch = vi.fn().mockRejectedValueOnce(new TypeError("offline")).mockResolvedValueOnce(Response.json({ google: true }));
    vi.stubGlobal("fetch", fetch);
    expect(await getProviders(0)).toEqual({ google: true });
    expect(fetch).toHaveBeenCalledTimes(2);
    fetch = vi.fn().mockRejectedValue(new TypeError("offline"));
    vi.stubGlobal("fetch", fetch);
    expect(await getProviders(0)).toEqual({ google: false });
    expect(fetch).toHaveBeenCalledTimes(2);
  });

  it("waits 2 seconds before the retry by default", async () => {
    vi.useFakeTimers();
    const fetch = vi.fn().mockRejectedValueOnce(new TypeError("offline")).mockResolvedValueOnce(Response.json({ google: true }));
    vi.stubGlobal("fetch", fetch);
    const pending = getProviders();
    await vi.advanceTimersByTimeAsync(1999);
    expect(fetch).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(1);
    expect(await pending).toEqual({ google: true });
    vi.useRealTimers();
  });

});

describe("googleStartUrl and safeNext", () => {
  it("points the browser at brain with an encoded, safe next path", () => {
    expect(googleStartUrl()).toBe(`${apiUrl}/auth/google/start?next=%2Fapp`);
    expect(googleStartUrl("/invitations/abc?x=1")).toBe(`${apiUrl}/auth/google/start?next=%2Finvitations%2Fabc%3Fx%3D1`);
    expect(googleStartUrl("https://evil.com")).toBe(`${apiUrl}/auth/google/start?next=%2Fapp`);
  });

  it.each([
    ["/invitations/abc", "/invitations/abc"],
    ["/app/team", "/app/team"],
    [null, "/app"],
    ["", "/app"],
    ["app", "/app"],
    ["//evil.com", "/app"],
    ["/a//evil.com", "/app"],
    ["/\\evil.com", "/app"],
    ["https://evil.com", "/app"],
    ["/a b", "/app"],
    ["/a\nb", "/app"],
    ["/" + "a".repeat(600), "/app"],
  ])("safeNext(%j) is %j", (raw, want) => {
    expect(safeNext(raw)).toBe(want);
  });
});

describe("signInWithPasskey", () => {
  const options = {
    publicKey: { challenge: "AAEC", rpId: "localhost", allowCredentials: [], userVerification: "preferred" },
  };
  const bytes = (...b: number[]) => new Uint8Array(b).buffer;
  const assertion = {
    id: "CQo",
    rawId: bytes(9, 10),
    type: "public-key",
    response: { authenticatorData: bytes(1), clientDataJSON: bytes(2), signature: bytes(3), userHandle: bytes(4) },
    getClientExtensionResults: () => ({}),
  };
  const started = () => vi.fn().mockResolvedValueOnce(Response.json({ challenge_id: "c1", options }));
  const stubGet = (get: unknown) => vi.stubGlobal("navigator", { credentials: { get } });

  it("runs start, the device ceremony and finish", async () => {
    const get = vi.fn().mockResolvedValue(assertion);
    stubGet(get);
    const fetch = started().mockResolvedValueOnce(Response.json({ id: "1" }));
    vi.stubGlobal("fetch", fetch);
    expect(await signInWithPasskey()).toBe("ok");
    expect(call(fetch, 0)[0]).toBe(`${apiUrl}/auth/passkeys/login/start`);
    expect([...get.mock.calls[0]![0].publicKey.challenge]).toEqual([0, 1, 2]);
    const [url, init] = call(fetch, 1);
    expect(url).toBe(`${apiUrl}/auth/passkeys/login/finish`);
    expect(JSON.parse(init.body as string)).toEqual({
      challenge_id: "c1",
      credential: {
        id: "CQo",
        rawId: "CQo",
        type: "public-key",
        response: { authenticatorData: "AQ", clientDataJSON: "Ag", signature: "Aw", userHandle: "BA" },
        clientExtensionResults: {},
      },
    });
  });

  it("maps start, ceremony and finish failures", async () => {
    stubGet(vi.fn().mockRejectedValue(new DOMException("no", "NotAllowedError")));
    vi.stubGlobal("fetch", reply(429, "rate_limited"));
    expect(await signInWithPasskey()).toBe("rate_limited");
    vi.stubGlobal("fetch", started());
    expect(await signInWithPasskey()).toBe("cancelled");
    stubGet(vi.fn().mockRejectedValue(new DOMException("odd", "SecurityError")));
    vi.stubGlobal("fetch", started());
    expect(await signInWithPasskey()).toBe("error");

    stubGet(vi.fn().mockResolvedValue(assertion));
    for (const [status, code] of [
      [401, "invalid_passkey"],
      [400, "invalid_challenge"],
      [429, "rate_limited"],
    ] as const) {
      vi.stubGlobal("fetch", started().mockResolvedValueOnce(Response.json({ error: code }, { status })));
      expect(await signInWithPasskey()).toBe(code);
    }
  });
});
