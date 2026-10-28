"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { getMe, type Failure, type MeResult, type Team } from "@/lib/auth";
import { acceptInvitation, previewInvitation, type InvitationPreview } from "@/lib/teams";
import { isFailure, linkButton, problemText, roleName, Status, useAction } from "@/components/team-ui";

const gone = "This invitation has expired, was already used or was withdrawn. Ask the team for a new one.";
const date = (iso: string) => new Date(iso).toLocaleDateString(undefined, { dateStyle: "medium" });

export function InvitationView({ token }: { token: string }) {
  const [preview, setPreview] = useState<InvitationPreview | Failure | null>(null);
  const [me, setMe] = useState<MeResult | null>(null);
  const [joined, setJoined] = useState<Team | null>(null);
  const { busy, problem, done, run } = useAction();

  useEffect(() => {
    previewInvitation(token).then(setPreview);
    getMe().then(setMe);
  }, [token]);

  if (preview === null || me === null) return <p className="text-ink-soft">Loading the invitation...</p>;
  if (preview === "not_found") return <p role="alert" className="waitlist-error">{gone}</p>;
  if (isFailure(preview))
    return (
      <p role="alert" className="waitlist-error">
        The invitation couldn&apos;t be loaded. {problemText(preview)}
      </p>
    );

  const role = roleName[preview.role].toLowerCase();
  const signedInAs = typeof me === "object" ? me.user.email : null;
  const mismatch = signedInAs !== null && signedInAs.toLowerCase() !== preview.email.toLowerCase();
  const wrongAccount = (
    <>
      You are signed in as {signedInAs}, but this invitation is for {preview.email}. Sign out, then sign in as{" "}
      {preview.email} and open this link again.
    </>
  );

  return (
    <div className="grid gap-4">
      <p>
        {preview.invited_by ?? "Someone"} invited <strong>{preview.email}</strong> to join <strong>{preview.team}</strong> as{" "}
        {role}. The invitation expires on {date(preview.expires_at)}.
      </p>
      {joined ? null : me === "signed_out" ? (
        <p>
          Sign in as {preview.email} first, then open this invitation link again to accept it.{" "}
          <Link href="/login" className={linkButton}>
            Sign in
          </Link>
        </p>
      ) : me === "error" ? (
        <p role="alert" className="waitlist-error">
          Sign-in couldn&apos;t be checked. Reload to try again.
        </p>
      ) : mismatch ? (
        <p role="alert" className="waitlist-error">
          {wrongAccount}
        </p>
      ) : (
        <div className="waitlist">
          <div className="waitlist-row">
            <button
              type="button"
              disabled={busy !== null}
              onClick={() =>
                run("accept", () => acceptInvitation(token), (team) => {
                  setJoined(team);
                  return `You are in ${team.name} as ${roleName[team.role].toLowerCase()}. It is now your current team.`;
                })
              }
            >
              {busy ? "Joining..." : `Join ${preview.team}`}
            </button>
          </div>
        </div>
      )}
      <Status problem={problem} done={done} overrides={{ not_found: gone, email_mismatch: wrongAccount }} />
      {joined && (
        <Link href="/app" className={`justify-self-start ${linkButton}`}>
          Open the app
        </Link>
      )}
    </div>
  );
}
