import { api } from "@/lib/auth";

export type ApiToken = {
  id: string;
  name: string;
  // null: the token works across the whole team.
  social_set_id: string | null;
  prefix_hint: string;
  created_by: string | null;
  last_used_at: string | null;
  expires_at: string | null;
  created_at: string;
};
export type NewToken = { name: string; social_set_id?: string; expires_in_days?: number };

// Owners and admins only; brain answers forbidden to a member.
export const listTokens = () => api<ApiToken[]>("/v1/api-tokens");
// The secret comes back once, here, and never again.
// Needs a sign-in from the last 10 minutes, else brain answers reauth_required.
export const createToken = (t: NewToken) => api<{ token: ApiToken; secret: string }>("/v1/api-tokens", "POST", t);
export const revokeToken = (id: string) => api(`/v1/api-tokens/${encodeURIComponent(id)}`, "DELETE");
