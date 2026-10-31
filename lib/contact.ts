import { apiUrl } from "@/lib/waitlist";

const codes = [
  "invalid_name",
  "invalid_email",
  "invalid_message",
  "captcha_failed",
  "captcha_unavailable",
  "contact_unavailable",
] as const;
export type ContactResult = "sent" | (typeof codes)[number] | "rate_limited" | "timeout" | "error";
export type ContactMessage = { name: string; email: string; message: string };

const TIMEOUT_MS = 10_000;

// Public, no session, like the waitlist. 202 means brain took the message.
// `token` is the Turnstile token, sent only when brain has Turnstile on.
export async function sendContact(msg: ContactMessage, token: string | null = null): Promise<ContactResult> {
  try {
    const res = await fetch(`${apiUrl}/v1/contact`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...msg, ...(token && { turnstile_token: token }) }),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    if (res.ok) return "sent";
    if (res.status === 429) return "rate_limited";
    const code: unknown = (await res.json().catch(() => null))?.error;
    return codes.find((c) => c === code) ?? "error";
  } catch (e) {
    return e instanceof DOMException && e.name === "TimeoutError" ? "timeout" : "error";
  }
}
