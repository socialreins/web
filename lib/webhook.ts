import { api } from "@/lib/auth";

export type Webhook = { url: string; created_at: string; updated_at: string };
// The receiver's HTTP status, or why it wasn't reached: blocked_address, timeout or unreachable.
export type Ping = { status: number | null; error: string | null };

// Owners and admins only; brain answers forbidden to a member, and not_found when there is none.
export const getWebhook = () => api<Webhook>("/v1/team/webhook");
// A new webhook comes back with its secret, once, and never again; a changed URL keeps the secret.
// Needs a sign-in from the last 10 minutes, else brain answers reauth_required.
export const setWebhook = (url: string) =>
  api<Webhook | { webhook: Webhook; secret: string }>("/v1/team/webhook", "PUT", { url });
export const removeWebhook = () => api("/v1/team/webhook", "DELETE");
// Brain waits up to 10 seconds for the receiver, so allow longer than the usual timeout.
export const testWebhook = () => api<Ping>("/v1/team/webhook/test", "POST", undefined, 20_000);

const pingErrors: Record<string, string> = {
  blocked_address: "the URL points at a private address",
  timeout: "it didn't answer within 10 seconds",
  unreachable: "it couldn't be reached",
};

// What the test ping did, in a sentence. Brain retries a real event on anything but a 2xx.
export function pingText(p: Ping) {
  if (p.status === null) return `Test not delivered: ${pingErrors[p.error ?? ""] ?? "it couldn't be reached"}.`;
  const ok = p.status >= 200 && p.status < 300;
  return `The receiver answered ${p.status}. ${ok ? "Test delivered." : "A real event would be retried."}`;
}
