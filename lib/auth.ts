import { apiUrl, captchaError, type Captcha } from "@/lib/waitlist";
import { createCredential, getCredential, type CreationOptionsJSON, type RequestOptionsJSON } from "@/lib/webauthn";

export type LinkResult = "sent" | "invalid" | Captcha | "rate_limited" | "timeout" | "error";
export type Role = "owner" | "admin" | "member";
export type Team = { id: string; name: string; role: Role };
export type User = {
  id: string;
  email: string;
  name: string;
  username: string | null;
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
// `token` is the Turnstile token, sent only when brain has Turnstile on.
export async function requestLink(email: string, token: string | null = null): Promise<LinkResult> {
  try {
    const res = await fetch(
      `${apiUrl}/auth/link`,
      opts({ method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email, ...(token && { turnstile_token: token }) }) }),
    );
    if (res.ok) return "sent";
    if (res.status === 422 || res.status === 503) {
      const captcha = await captchaError(res);
      if (captcha) return captcha;
    }
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
  "invalid_query",
  "too_many_sets",
  "name_taken",
  "default_set",
  "invalid_sets",
  "default_set_required",
  "too_long",
  "too_many_images",
  "invalid_media",
  "empty_post",
  "invalid_set",
  "unsupported_platform",
  "too_many_posts",
  "not_editable",
  "not_deletable",
  "publish_quota",
  "invalid_filters",
  "too_many_inboxes",
  "all_inbox",
  "invalid_state",
  "invalid_text",
  "reply_in_progress",
  "invalid_trigger",
  "invalid_conditions",
  "invalid_actions",
  "invalid_fallback",
  "too_many_automations",
  "invalid_expiry",
  "too_many_tokens",
  "invalid_post",
  "invalid_order",
  "invalid_position",
  "invalid_url",
] as const;
export type Failure = (typeof codes)[number] | "rate_limited" | "signed_out" | "timeout" | "error";
export type Passkey = { id: string; name: string; created_at: string; last_used_at: string | null };
export type AddResult = Passkey | Failure | "cancelled" | "unsupported";

// Sign-in failures are 401 with a code; any other 401 means the session is gone.
// A known code wins (a 429 can be publish_quota); any other 429 is a rate limit.
export async function failure(res: Response): Promise<Failure> {
  const code: unknown = (await res.json().catch(() => null))?.error;
  const known = codes.find((c) => c === code);
  if (known) return known;
  if (res.status === 429) return "rate_limited";
  return res.status === 401 ? "signed_out" : "error";
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
// Needs a sign-in from the last 10 minutes, else brain answers reauth_required.
export async function addPasskey(name: string): Promise<AddResult> {
  if (typeof window === "undefined" || !window.PublicKeyCredential) return "unsupported";
  try {
    const start = await fetch(`${apiUrl}/auth/passkeys/register/start`, send("POST", {}));
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

// One call to brain, for callers that read the raw response (e.g. an error body with extra fields).
export async function request(path: string, method = "GET", body?: unknown, ms = TIMEOUT_MS): Promise<Response | Failure> {
  try {
    const init = body === undefined ? opts({ method, signal: AbortSignal.timeout(ms) }) : send(method, body, ms);
    return await fetch(`${apiUrl}${path}`, init);
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

export type Providers = { google: boolean; turnstileSiteKey: string | null };

// Sign-in methods this brain offers besides email links and passkeys; self-hosters may skip Google.
// turnstileSiteKey is null when brain has Turnstile off, so forms submit without a token.
// A network failure is retried once after `retryMs`; any answer from brain, even an error, is final.
export async function getProviders(retryMs = 2000): Promise<Providers> {
  let res = await request("/auth/providers");
  if (typeof res === "string") {
    await new Promise((done) => setTimeout(done, retryMs));
    res = await request("/auth/providers");
  }
  if (typeof res === "string" || !res.ok) return { google: false, turnstileSiteKey: null };
  const body = await res.json().catch(() => null);
  const key: unknown = body?.turnstile_site_key;
  return { google: body?.google === true, turnstileSiteKey: typeof key === "string" && key ? key : null };
}

// A path on this site to return to after sign-in, else /app. Mirrors brain's oauth::safe_next, and
// also refuses "//" anywhere, so "/a//evil.com" can't turn into another host.
export function safeNext(raw: string | null | undefined): string {
  const ok =
    !!raw &&
    raw.startsWith("/") &&
    !raw.includes("//") &&
    !raw.includes("\\") &&
    raw.length <= 512 &&
    !/[\s\p{Cc}]/u.test(raw);
  return ok ? raw : "/app";
}

// A full-page navigation, not a fetch: brain sends the browser to Google and back to `next`.
export const googleStartUrl = (next?: string | null) =>
  `${apiUrl}/auth/google/start?next=${encodeURIComponent(safeNext(next))}`;
