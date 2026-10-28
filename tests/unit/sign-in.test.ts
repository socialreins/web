import { afterEach, describe, expect, it, vi } from "vitest";
import { signInWithPasskey, signInWithPassword } from "@/lib/auth";
import { apiUrl } from "@/lib/waitlist";

const reply = (status: number, error?: string) =>
  vi.fn(async () => (error ? Response.json({ error }, { status }) : new Response(null, { status })));
const call = (fetch: ReturnType<typeof vi.fn>, i: number) => fetch.mock.calls[i] as unknown as [string, RequestInit];

afterEach(() => vi.unstubAllGlobals());

describe("signInWithPassword", () => {
  it("posts email and password to /auth/login with credentials", async () => {
    const fetch = vi.fn(async () => Response.json({ id: "1" }));
    vi.stubGlobal("fetch", fetch);
    expect(await signInWithPassword("a@b.co", "secret")).toBe("ok");
    const [url, init] = call(fetch, 0);
    expect(url).toBe(`${apiUrl}/auth/login`);
    expect(init).toMatchObject({ method: "POST", credentials: "include" });
    expect(JSON.parse(init.body as string)).toEqual({ email: "a@b.co", password: "secret" });
  });

  it.each([
    [401, "invalid_credentials", "invalid_credentials"],
    [429, "rate_limited", "rate_limited"],
    [403, "forbidden_origin", "error"],
    [422, "invalid_body", "error"],
    [500, undefined, "error"],
  ])("maps %i %s to %s", async (status, code, result) => {
    vi.stubGlobal("fetch", reply(status, code));
    expect(await signInWithPassword("a@b.co", "x")).toBe(result);
  });

  it("reports a timeout", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new DOMException("slow", "TimeoutError")));
    expect(await signInWithPassword("a@b.co", "x")).toBe("timeout");
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
