export type WaitlistResult = "joined" | "invalid" | "rate_limited" | "timeout" | "error";

declare global {
  interface Window {
    __BRAIN_URL?: string;
  }
}

// Set by /config.js from BRAIN_URL at run time; the root layout loads it before any app code runs.
export const apiUrl = (typeof window === "undefined" ? undefined : window.__BRAIN_URL) ?? "http://localhost:8080";

const TIMEOUT_MS = 10_000;

// The API answers 200 for a new email and for a duplicate, so both count as joined.
export async function joinWaitlist(email: string, source = "landing"): Promise<WaitlistResult> {
  try {
    const res = await fetch(`${apiUrl}/v1/waitlist`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, source }),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    if (res.ok) return "joined";
    if (res.status === 422) return "invalid";
    if (res.status === 429) return "rate_limited";
    return "error";
  } catch (e) {
    return e instanceof DOMException && e.name === "TimeoutError" ? "timeout" : "error";
  }
}
