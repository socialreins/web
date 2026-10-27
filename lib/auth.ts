import { apiUrl } from "@/lib/waitlist";

export type LinkResult = "sent" | "invalid" | "rate_limited" | "timeout" | "error";
export type User = { id: string; email: string; name: string; username: string | null };
export type MeResult = { user: User } | "signed_out" | "error";

const TIMEOUT_MS = 10_000;
// The session cookie lives on the API host, so every call sends it with credentials.
const opts = (init: RequestInit = {}): RequestInit => ({
  credentials: "include",
  signal: AbortSignal.timeout(TIMEOUT_MS),
  ...init,
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
