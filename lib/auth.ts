import { apiUrl } from "@/lib/waitlist";
import { createCredential, getCredential, type CreationOptionsJSON, type RequestOptionsJSON } from "@/lib/webauthn";

export type LinkResult = "sent" | "invalid" | "rate_limited" | "timeout" | "error";
export type Role = "owner" | "admin" | "member";
export type Team = { id: string; name: string; role: Role };
export type User = {
  id: string;
  email: string;
  name: string;
  username: string | null;
  has_password: boolean;
  current_team: Team;
};
export type MeResult = { user: User } | "signed_out" | "error";

const TIMEOUT_MS = 10_000;
// The session cookie lives on the API host, so every call sends it with credentials.
const opts = (init: RequestInit = {}): RequestInit => ({
  credentials: "include",
  ...init,
  signal: init.signal ?? AbortSignal.timeout(TIMEOUT_MS),
});

// The API answers 202 for any valid email, so the reply never says whether an account exists.
export async function requestLink(email: string): Promise<LinkResult> {
  try {
    const res = await fetch(
      `${apiUrl}/auth/link`,
      opts({ method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email }) }),
    );
    if (res.ok) return "sent";
    if (res.status === 422) return "invalid";
    if (res.status === 429) return "rate_limited";
    return "error";
  } catch (e) {
    return e instanceof DOMException && e.name === "TimeoutError" ? "timeout" : "error";
  }
}

export async function getMe(): Promise<MeResult> {
  try {
    const res = await fetch(`${apiUrl}/auth/me`, opts());
    if (res.status === 401) return "signed_out";
    if (!res.ok) return "error";
    return { user: (await res.json()) as User };
  } catch {
    return "error";
  }
}

export async function signOut(): Promise<boolean> {
  try {
    return (await fetch(`${apiUrl}/auth/logout`, opts({ method: "POST" }))).ok;
  } catch {
    return false;
  }
}

// Error codes brain sends for the auth endpoints.
const codes = [
  "invalid_credentials",
  "reauth_required",
  "invalid_current_password",
  "invalid_password",
  "invalid_name",
  "invalid_challenge",
  "invalid_passkey",
  "passkey_exists",
  "not_found",
  "forbidden",
  "last_team",
  "last_owner",
  "invalid_role",
  "invalid_email",
  "already_member",
  "already_invited",
  "mail_failed",
  "email_mismatch",
  "invalid_handle",
  "unsupported_pds",
  "bluesky_unreachable",
] as const;
export type Failure = (typeof codes)[number] | "rate_limited" | "signed_out" | "timeout" | "error";
export type Passkey = { id: string; name: string; created_at: string; last_used_at: string | null };
export type AddResult = Passkey | Failure | "cancelled" | "unsupported";

// Sign-in failures are 401 with a code; any other 401 means the session is gone.
async function failure(res: Response): Promise<Failure> {
  if (res.status === 429) return "rate_limited";
  const code: unknown = (await res.json().catch(() => null))?.error;
  return codes.find((c) => c === code) ?? (res.status === 401 ? "signed_out" : "error");
}

const caught = (e: unknown): Failure =>
  e instanceof DOMException && e.name === "TimeoutError" ? "timeout" : "error";

const send = (method: string, body: unknown, ms = TIMEOUT_MS) =>
  opts({
    method,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(ms),
  });

// Sets the first password (needs a recent sign-in) or changes it (needs the current one).
export async function setPassword(password: string, currentPassword?: string): Promise<"ok" | Failure> {
  try {
    const res = await fetch(`${apiUrl}/auth/password`, send("PUT", { password, current_password: currentPassword }));
    return res.ok ? "ok" : await failure(res);
  } catch (e) {
    return caught(e);
  }
}

export async function listPasskeys(): Promise<Passkey[] | Failure> {
  try {
    const res = await fetch(`${apiUrl}/auth/passkeys`, opts());
    return res.ok ? ((await res.json()) as Passkey[]) : await failure(res);
  } catch (e) {
    return caught(e);
  }
}

export async function removePasskey(id: string): Promise<"ok" | Failure> {
  try {
    const res = await fetch(`${apiUrl}/auth/passkeys/${encodeURIComponent(id)}`, opts({ method: "DELETE" }));
    return res.ok ? "ok" : await failure(res);
  } catch (e) {
    return caught(e);
  }
}

// Start, the device ceremony, then finish. A blank name becomes "Passkey" on the server.
// brain takes the account password instead of a recent sign-in; a wrong one is also reauth_required.
export async function addPasskey(name: string, password?: string): Promise<AddResult> {
  if (typeof window === "undefined" || !window.PublicKeyCredential) return "unsupported";
  try {
    const start = await fetch(`${apiUrl}/auth/passkeys/register/start`, send("POST", password === undefined ? {} : { password }));
    if (!start.ok) return await failure(start);
    const { challenge_id, options } = (await start.json()) as { challenge_id: string; options: CreationOptionsJSON };
    let credential;
    try {
      credential = await createCredential(options);
    } catch (e) {
      // NotAllowedError: cancelled or timed out. InvalidStateError: this device already holds one.
      if (e instanceof DOMException && e.name === "NotAllowedError") return "cancelled";
      if (e instanceof DOMException && e.name === "InvalidStateError") return "passkey_exists";
      return "error";
    }
    const finish = await fetch(`${apiUrl}/auth/passkeys/register/finish`, send("POST", { challenge_id, credential, name }));
    return finish.ok ? ((await finish.json()) as Passkey) : await failure(finish);
  } catch (e) {
    return caught(e);
  }
}

// brain answers the same 401 invalid_credentials for an unknown email, no password and a wrong one.
export async function signInWithPassword(email: string, password: string): Promise<"ok" | Failure> {
  try {
    const res = await fetch(`${apiUrl}/auth/login`, send("POST", { email, password }));
    return res.ok ? "ok" : await failure(res);
  } catch (e) {
    return caught(e);
  }
}

// Discoverable credential: the device picks the account, so no email is asked for.
export async function signInWithPasskey(): Promise<"ok" | Failure | "cancelled"> {
  try {
    const start = await fetch(`${apiUrl}/auth/passkeys/login/start`, opts({ method: "POST" }));
    if (!start.ok) return await failure(start);
    const { challenge_id, options } = (await start.json()) as { challenge_id: string; options: RequestOptionsJSON };
    let credential;
    try {
      credential = await getCredential(options);
    } catch (e) {
      // NotAllowedError: cancelled, timed out or no passkey on this device.
      return e instanceof DOMException && e.name === "NotAllowedError" ? "cancelled" : "error";
    }
    const finish = await fetch(`${apiUrl}/auth/passkeys/login/finish`, send("POST", { challenge_id, credential }));
    return finish.ok ? "ok" : await failure(finish);
  } catch (e) {
    return caught(e);
  }
}

// One JSON call to brain: the parsed body on success ("ok" for 204), else the mapped failure.
// `ms` raises the timeout for calls brain answers only after its own outbound requests.
export async function api<T = "ok">(path: string, method = "GET", body?: unknown, ms = TIMEOUT_MS): Promise<T | Failure> {
  try {
    const init = body === undefined ? opts({ method, signal: AbortSignal.timeout(ms) }) : send(method, body, ms);
    const res = await fetch(`${apiUrl}${path}`, init);
    if (!res.ok) return await failure(res);
    return (res.status === 204 ? "ok" : await res.json()) as T;
  } catch (e) {
    return caught(e);
  }
}
