export type Captcha = "captcha_failed" | "captcha_unavailable";
export type WaitlistResult = "joined" | "invalid" | Captcha | "rate_limited" | "timeout" | "error";

declare global {
  interface Window {
    __BRAIN_URL?: string;
  }
}

// Set by /config.js from BRAIN_URL at run time; the root layout loads it before any app code runs.
export const apiUrl = (typeof window === "undefined" ? undefined : window.__BRAIN_URL) ?? "http://localhost:8080";

const TIMEOUT_MS = 10_000;

// Brain's error code when a Turnstile check failed (422) or Turnstile itself couldn't be reached (503), else null.
export async function captchaError(res: Response): Promise<Captcha | null> {
  const code: unknown = (await res.json().catch(() => null))?.error;
  return code === "captcha_failed" || code === "captcha_unavailable" ? code : null;
}

// The API answers 200 for a new email and for a duplicate, so both count as joined.
// `token` is the Turnstile token, sent only when brain has Turnstile on.
export async function joinWaitlist(email: string, source = "landing", token: string | null = null): Promise<WaitlistResult> {
  try {
    const res = await fetch(`${apiUrl}/v1/waitlist`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, source, ...(token && { turnstile_token: token }) }),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    if (res.ok) return "joined";
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
