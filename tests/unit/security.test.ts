import { afterEach, describe, expect, it, vi } from "vitest";
import { addPasskey, listPasskeys, removePasskey, setPassword } from "@/lib/auth";
import { fromBase64url, toBase64url } from "@/lib/webauthn";
import { apiUrl } from "@/lib/waitlist";

const respond = (status: number, body: unknown = null) =>
  vi.fn().mockResolvedValue(body === null ? new Response(null, { status }) : Response.json(body, { status }));
const err = (status: number, error: string) => respond(status, { error });

afterEach(() => vi.unstubAllGlobals());

describe("setPassword", () => {
  it("puts the password and current password to /auth/password with credentials", async () => {
    const fetch = respond(204);
    vi.stubGlobal("fetch", fetch);
    expect(await setPassword("new password 1", "old password 1")).toBe("ok");
    const [url, init] = fetch.mock.calls[0]!;
    expect(url).toBe(`${apiUrl}/auth/password`);
    expect(init).toMatchObject({ method: "PUT", credentials: "include" });
    expect(JSON.parse(init.body)).toEqual({ password: "new password 1", current_password: "old password 1" });
  });

  it.each([
    [err(403, "reauth_required"), "reauth_required"],
    [err(403, "invalid_current_password"), "invalid_current_password"],
    [err(422, "invalid_password"), "invalid_password"],
    [err(429, "rate_limited"), "rate_limited"],
    [respond(429), "rate_limited"],
    [err(401, "unauthorized"), "signed_out"],
    [err(403, "forbidden_origin"), "error"],
    [err(403, "__proto__"), "error"],
    [respond(500), "error"],
  ])("maps a failure to %#", async (fetch, result) => {
    vi.stubGlobal("fetch", fetch);
    expect(await setPassword("x")).toBe(result);
  });

  it("reports a network failure as error and a timeout as timeout", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new TypeError("offline")));
    expect(await setPassword("x")).toBe("error");
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new DOMException("slow", "TimeoutError")));
    expect(await setPassword("x")).toBe("timeout");
  });
});

describe("listPasskeys and removePasskey", () => {
  const key = { id: "k1", name: "Laptop", created_at: "2026-10-28T10:00:00Z", last_used_at: null };

  it("lists the passkeys, or maps the failure", async () => {
    vi.stubGlobal("fetch", respond(200, [key]));
    expect(await listPasskeys()).toEqual([key]);
    vi.stubGlobal("fetch", err(401, "unauthorized"));
    expect(await listPasskeys()).toBe("signed_out");
  });

  it("deletes /auth/passkeys/{id} and maps 403, 404 and 204", async () => {
    const fetch = respond(204);
    vi.stubGlobal("fetch", fetch);
    expect(await removePasskey("k1")).toBe("ok");
    expect(fetch).toHaveBeenCalledWith(
      `${apiUrl}/auth/passkeys/k1`,
      expect.objectContaining({ method: "DELETE", credentials: "include" }),
    );
    vi.stubGlobal("fetch", err(403, "reauth_required"));
    expect(await removePasskey("k1")).toBe("reauth_required");
    vi.stubGlobal("fetch", err(404, "not_found"));
    expect(await removePasskey("k1")).toBe("not_found");
  });
});

describe("addPasskey", () => {
  const options = {
    publicKey: {
      challenge: "AAEC",
      user: { id: "AwQF", name: "a@b.co", displayName: "a" },
      excludeCredentials: [{ id: "BgcI", type: "public-key" }],
      rp: { id: "localhost", name: "SocialReins" },
      pubKeyCredParams: [],
    },
  };
  const bytes = (...b: number[]) => new Uint8Array(b).buffer;
  const credential = {
    id: "CQo",
    rawId: bytes(9, 10),
    type: "public-key",
    response: { attestationObject: bytes(1), clientDataJSON: bytes(2), getTransports: () => ["internal"] },
    getClientExtensionResults: () => ({}),
  };
  const stubBrowser = (create: unknown) => {
    vi.stubGlobal("window", { PublicKeyCredential: class {} });
    vi.stubGlobal("navigator", { credentials: { create } });
  };

  it("runs start, the device ceremony and finish", async () => {
    const created = { id: "k1", name: "Laptop", created_at: "2026-10-28T10:00:00Z", last_used_at: null };
    const fetch = vi
      .fn()
      .mockResolvedValueOnce(Response.json({ challenge_id: "c1", options }))
      .mockResolvedValueOnce(Response.json(created, { status: 201 }));
    const create = vi.fn().mockResolvedValue(credential);
    vi.stubGlobal("fetch", fetch);
    stubBrowser(create);
    expect(await addPasskey("Laptop")).toEqual(created);
    const pk = create.mock.calls[0]![0].publicKey;
    expect([...pk.challenge]).toEqual([0, 1, 2]);
    expect([...pk.user.id]).toEqual([3, 4, 5]);
    expect([...pk.excludeCredentials[0].id]).toEqual([6, 7, 8]);
    expect(fetch.mock.calls[0]![0]).toBe(`${apiUrl}/auth/passkeys/register/start`);
    const [url, init] = fetch.mock.calls[1]!;
    expect(url).toBe(`${apiUrl}/auth/passkeys/register/finish`);
    expect(JSON.parse(init.body)).toEqual({
      challenge_id: "c1",
      name: "Laptop",
      credential: {
        id: "CQo",
        rawId: "CQo",
        type: "public-key",
        response: { attestationObject: "AQ", clientDataJSON: "Ag", transports: ["internal"] },
        clientExtensionResults: {},
      },
    });
  });

  it("maps start, ceremony and finish failures", async () => {
    stubBrowser(vi.fn().mockRejectedValue(new DOMException("no", "NotAllowedError")));
    vi.stubGlobal("fetch", err(403, "reauth_required"));
    expect(await addPasskey("")).toBe("reauth_required");
    vi.stubGlobal("fetch", err(429, "rate_limited"));
    expect(await addPasskey("")).toBe("rate_limited");

    const started = () => vi.fn().mockResolvedValueOnce(Response.json({ challenge_id: "c1", options }));
    vi.stubGlobal("fetch", started());
    expect(await addPasskey("")).toBe("cancelled");
    stubBrowser(vi.fn().mockRejectedValue(new DOMException("dup", "InvalidStateError")));
    vi.stubGlobal("fetch", started());
    expect(await addPasskey("")).toBe("passkey_exists");

    stubBrowser(vi.fn().mockResolvedValue(credential));
    for (const [status, code] of [
      [400, "invalid_challenge"],
      [422, "invalid_passkey"],
      [422, "invalid_name"],
      [409, "passkey_exists"],
    ] as const) {
      vi.stubGlobal("fetch", started().mockResolvedValueOnce(Response.json({ error: code }, { status })));
      expect(await addPasskey("")).toBe(code);
    }
  });

  it("sends the password to start only when given", async () => {
    stubBrowser(vi.fn());
    const fetch = vi.fn(async () => Response.json({ error: "reauth_required" }, { status: 403 }));
    vi.stubGlobal("fetch", fetch);
    expect(await addPasskey("")).toBe("reauth_required");
    expect(await addPasskey("", "my password")).toBe("reauth_required");
    expect(JSON.parse((fetch.mock.calls[0] as unknown as [string, RequestInit])[1].body as string)).toEqual({});
    expect(JSON.parse((fetch.mock.calls[1] as unknown as [string, RequestInit])[1].body as string)).toEqual({ password: "my password" });
  });

  it("reports a browser without WebAuthn as unsupported", async () => {
    vi.stubGlobal("window", {});
    expect(await addPasskey("")).toBe("unsupported");
  });
});

describe("base64url", () => {
  it("round-trips bytes without padding or + and /", () => {
    const b = new Uint8Array([251, 255, 191, 0, 1]);
    const s = toBase64url(b.buffer);
    expect(s).toBe("-_-_AAE");
    expect([...fromBase64url(s)]).toEqual([...b]);
  });
});
