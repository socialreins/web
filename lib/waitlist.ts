export type WaitlistResult = "joined" | "invalid" | "rate_limited" | "error";

// NEXT_PUBLIC_* is inlined at build time; the Dockerfile refuses to build without it.
export const apiUrl = (process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8080").replace(/\/+$/, "");

// The API answers 200 for a new email and for a duplicate, so both count as joined.
export async function joinWaitlist(email: string, source = "landing"): Promise<WaitlistResult> {
  try {
    const res = await fetch(`${apiUrl}/v1/waitlist`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, source }),
    });
    if (res.ok) return "joined";
    if (res.status === 422) return "invalid";
    if (res.status === 429) return "rate_limited";
    return "error";
  } catch {
    return "error";
  }
}
