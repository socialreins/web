import { api, type Role, type Team } from "@/lib/auth";

export type Member = { id: string; name: string; email: string; role: Role; joined_at: string };
export type Invitation = {
  id: string;
  email: string;
  role: Exclude<Role, "owner">;
  invited_by: string | null;
  expires_at: string;
  created_at: string;
};
export type InvitationPreview = {
  team: string;
  email: string;
  role: Role;
  invited_by: string | null;
  expires_at: string;
};

const enc = encodeURIComponent;

export const listTeams = () => api<Team[]>("/v1/teams");
export const createTeam = (name: string) => api<Team>("/v1/teams", "POST", { name });
export const switchTeam = (teamId: string) => api<Team>("/v1/current-team", "PUT", { team_id: teamId });
export const renameTeam = (name: string) => api<Team>("/v1/team", "PATCH", { name });
// Needs a sign-in from the last 10 minutes, else brain answers reauth_required.
export const deleteTeam = () => api("/v1/team", "DELETE", {});
export const listMembers = () => api<Member[]>("/v1/team/members");
export const setRole = (userId: string, role: Role) => api<Member>(`/v1/team/members/${enc(userId)}`, "PATCH", { role });
// Removing yourself is leaving the team.
export const removeMember = (userId: string) => api(`/v1/team/members/${enc(userId)}`, "DELETE");
export const listInvitations = () => api<Invitation[]>("/v1/team/invitations");
export const invite = (email: string, role: Invitation["role"]) =>
  api<Invitation>("/v1/team/invitations", "POST", { email, role });
export const revokeInvitation = (id: string) => api(`/v1/team/invitations/${enc(id)}`, "DELETE");
export const previewInvitation = (token: string) => api<InvitationPreview>(`/v1/invitations/${enc(token)}`);
export const acceptInvitation = (token: string) => api<Team>(`/v1/invitations/${enc(token)}`, "POST");

export const manages = (role: Role) => role !== "member";

// Mirrors brain's Role::may_change: only an owner touches the owner role, on either side.
export const mayChange = (mine: Role, theirs: Role) => mine === "owner" || (mine === "admin" && theirs !== "owner");

// The roles `mine` may hand out.
export const grantable = (mine: Role): Role[] =>
  mine === "owner" ? ["owner", "admin", "member"] : mine === "admin" ? ["admin", "member"] : [];
