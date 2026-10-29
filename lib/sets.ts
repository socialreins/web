import { api } from "@/lib/auth";
import type { Connection } from "@/lib/connections";

export type SocialSet = {
  id: string;
  name: string;
  is_default: boolean;
  account_ids: string[];
  account_count: number;
  created_at: string;
  deleted_at: string | null;
};

// brain purges a deleted set this many days after deleted_at (scheduler::RESTORE_DAYS).
export const RESTORE_DAYS = 30;

const enc = encodeURIComponent;

// Live sets, Default first; with `deleted`, the ones that can still be restored.
export const listSets = (deleted = false) => api<SocialSet[]>(`/v1/social-sets${deleted ? "?deleted=true" : ""}`);
export const createSet = (name: string) => api<SocialSet>("/v1/social-sets", "POST", { name });
export const renameSet = (id: string, name: string) => api<SocialSet>(`/v1/social-sets/${enc(id)}`, "PATCH", { name });
// Needs a sign-in from the last 10 minutes, else brain answers reauth_required.
export const deleteSet = (id: string) => api(`/v1/social-sets/${enc(id)}`, "DELETE", {});
export const restoreSet = (id: string) => api<SocialSet>(`/v1/social-sets/${enc(id)}/restore`, "POST");
export const setAccountSets = (connectionId: string, setIds: string[]) =>
  api<Connection>(`/v1/connections/${enc(connectionId)}/sets`, "PUT", { set_ids: setIds });

export const purgeDate = (deletedAt: string) => new Date(Date.parse(deletedAt) + RESTORE_DAYS * 86_400_000);

// The names of the live sets an account is in, Default first; ids of deleted sets are skipped.
export const setNames = (setIds: string[], sets: SocialSet[]) =>
  sets.filter((s) => setIds.includes(s.id)).map((s) => s.name);
