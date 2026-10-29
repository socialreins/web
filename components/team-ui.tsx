"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { flushSync } from "react-dom";
import Link from "next/link";
import { usePathname } from "next/navigation";
import type { Failure, Role } from "@/lib/auth";

// Back to this page after signing in (with Google or a passkey; an emailed link always lands on /app).
function SignInAgain({ text }: { text: string }) {
  const path = usePathname();
  return (
    <Link href={`/login?next=${encodeURIComponent(path)}`} className="underline decoration-2 underline-offset-4">
      {text}
    </Link>
  );
}

export const signInLink = (text: string) => <SignInAgain text={text} />;

const messages: Partial<Record<Failure, ReactNode>> = {
  forbidden: "Your role in this team can't do that.",
  not_found: "That is no longer there. Reload the page to see the latest.",
  invalid_name: "Use a name of 1 to 60 characters.",
  name_taken: "Another set already has that name. Pick a different one.",
  too_many_sets: "This team already has 50 sets, the most allowed. Delete one first.",
  default_set: "The Default set can't be deleted.",
  invalid_sets: "One of those sets no longer exists. Reload the page and try again.",
  default_set_required: "Every account stays in the Default set.",
  invalid_role: "Pick one of the roles in the list.",
  invalid_email: "That email address doesn't look right. Check it and try again.",
  already_member: "That person is already in this team.",
  already_invited: "That email was invited a moment ago. Try again.",
  mail_failed: "The invitation email couldn't be sent, so no invitation was made. Try again later.",
  last_owner: "A team needs at least one owner. Make someone else an owner first.",
  last_team: "This is your only team, so it can't be deleted. Create or join another team first.",
  reauth_required: <>For your safety, this needs a fresh sign-in. {signInLink("Sign in again")}, then come back here.</>,
  signed_out: <>You are signed out. {signInLink("Sign in again")} to continue.</>,
  rate_limited: "Too many attempts. Wait a while, then try again.",
  timeout: "The server took too long to answer. Try again in a moment.",
  error: "Something went wrong. Try again in a moment.",
};

export const problemText = (p: Failure, overrides: Partial<Record<Failure, ReactNode>> = {}) =>
  overrides[p] ?? messages[p] ?? messages.error;

export const roleName: Record<Role, string> = { owner: "Owner", admin: "Admin", member: "Member" };

export const linkButton =
  "font-bold underline decoration-signal decoration-2 underline-offset-4 hover:text-signal-deep disabled:cursor-progress disabled:opacity-70";

export const isFailure = (r: unknown): r is Failure => typeof r === "string" && r !== "ok";

// One status line per section: a pending key, the last failure, or a success message that takes focus.
export function useAction() {
  const [busy, setBusy] = useState<string | null>(null);
  const [problem, setProblem] = useState<Failure | null>(null);
  const [done, setDone] = useState<{ text: string; n: number } | null>(null);
  // Which action the current problem came from, when one section runs several.
  const [failedKey, setFailedKey] = useState<string | null>(null);

  async function run<T>(key: string, call: () => Promise<T | Failure>, onOk: (r: T) => string | void) {
    // Clear the old messages first so a repeated identical one is announced again.
    flushSync(() => {
      setProblem(null);
      setFailedKey(null);
      setDone(null);
      setBusy(key);
    });
    const r = await call();
    // Re-enable the buttons now, so a caller can move focus back onto one.
    flushSync(() => setBusy(null));
    if (isFailure(r)) {
      setProblem(r);
      setFailedKey(key);
      return false;
    }
    const text = onOk(r as T);
    if (text) setDone((d) => ({ text, n: (d?.n ?? 0) + 1 }));
    return true;
  }

  return { busy, problem, failedKey, done, run };
}

export function Status({
  problem,
  done,
  overrides,
}: {
  problem: Failure | null;
  done: { text: string; n: number } | null;
  overrides?: Partial<Record<Failure, ReactNode>>;
}) {
  const ref = useRef<HTMLParagraphElement>(null);
  const n = done?.n;
  useEffect(() => {
    if (n) ref.current?.focus();
  }, [n]);
  if (problem)
    return (
      <p role="alert" className="waitlist-error">
        {problemText(problem, overrides)}
      </p>
    );
  if (done)
    return (
      <p ref={ref} tabIndex={-1} role="status" className="waitlist-done">
        {done.text}
      </p>
    );
  return null;
}
