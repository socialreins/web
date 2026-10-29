import { api } from "@/lib/auth";

export type Connection = {
  id: string;
  provider: string;
  external_id: string;
  handle: string | null;
  display_name: string | null;
  avatar_url: string | null;
  token_expires_at: string | null;
  set_ids: string[];
  created_at: string;
};
export type Provider = { provider: string; configured: boolean };

export const listConnections = () => api<Connection[]>("/v1/connections");
export const listProviders = () => api<Provider[]>("/v1/connections/providers");
// 201 for a new account, 200 when the team already had it and the app password was replaced.
export const connectBluesky = (handle: string, appPassword: string) =>
  api<Connection>("/v1/connections/bluesky", "POST", { handle, app_password: appPassword });
export const disconnect = (id: string) => api(`/v1/connections/${encodeURIComponent(id)}`, "DELETE");

// brain names Facebook and Instagram together as "meta".
export const providerKey = (platform: string) => (platform === "facebook" || platform === "instagram" ? "meta" : platform);

// Platforms with a connect flow in this web app. The rest wait for theirs.
export const connectable = new Set(["bluesky"]);

export type ProviderState = "available" | "coming_soon" | "not_configured";
export function providerState(platform: string, providers: Provider[]): ProviderState {
  const configured = providers.find((p) => p.provider === providerKey(platform))?.configured ?? false;
  if (!configured) return "not_configured";
  return connectable.has(platform) ? "available" : "coming_soon";
}

// Only Bluesky's CDN is allowed by the CSP's img-src, so anything else falls back to an initial.
export const safeAvatar = (url: string | null) => (url?.startsWith("https://cdn.bsky.app/") ? url : null);
