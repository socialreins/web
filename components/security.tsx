"use client";

import { useEffect, useRef, useState, type FormEvent, type ReactNode } from "react";
import { flushSync } from "react-dom";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  addPasskey,
  getMe,
  listPasskeys,
  removePasskey,
  setPassword,
  type Failure,
  type MeResult,
  type Passkey,
} from "@/lib/auth";

const signIn = (text: string) => (
  <Link href="/login" className="underline decoration-2 underline-offset-4">
    {text}
  </Link>
);

type Problem = Failure | "cancelled" | "unsupported" | "confirm_password";

const messages: Record<Problem, ReactNode> = {
  confirm_password: <>For your safety, enter your current password, or {signIn("sign in again")}.</>,
  reauth_required: <>For your safety, this needs a fresh sign-in. {signIn("Sign in again")}, then come back here.</>,
  signed_out: <>You are signed out. {signIn("Sign in again")} to continue.</>,
  rate_limited: "Too many attempts. Wait a minute, then try again.",
  invalid_current_password: "Your current password is wrong. Check it and try again.",
  invalid_password: "Use a password between 12 and 256 characters long.",
  invalid_name: "Keep the passkey name to 64 characters or fewer.",
  invalid_challenge: "That took too long. Try adding the passkey again.",
  invalid_passkey: "Your device's passkey couldn't be checked. Try again.",
  passkey_exists: "This device already has a passkey for your account.",
  not_found: "That passkey was already removed.",
  invalid_credentials: "Something went wrong. Try again in a moment.",
  timeout: "The server took too long to answer. Try again in a moment.",
  error: "Something went wrong. Try again in a moment.",
  cancelled: "Adding the passkey was cancelled.",
  unsupported: "This browser can't create passkeys.",
};

const linkButton =
  "font-bold underline decoration-signal decoration-2 underline-offset-4 hover:text-signal-deep disabled:cursor-progress disabled:opacity-70";

function Done({ text, focusKey }: { text: string; focusKey: number }) {
  const ref = useRef<HTMLParagraphElement>(null);
  useEffect(() => ref.current?.focus(), [focusKey]);
  return (
    <p ref={ref} tabIndex={-1} role="status" className="waitlist-done">
      {text}
    </p>
  );
}

// The session cookie is on the API host, invisible to Next server code, so the check runs here.
export function Security() {
  const router = useRouter();
  const [me, setMe] = useState<MeResult | null>(null);

  useEffect(() => {
    getMe().then((r) => {
      if (r === "signed_out") router.replace("/login");
      else setMe(r);
    });
  }, [router]);

  if (me === null || me === "signed_out") return <p className="text-ink-soft">Checking your sign-in...</p>;
  if (me === "error") return <p role="alert" className="waitlist-error">Sign-in couldn&apos;t be checked. Reload to try again.</p>;
  return (
    <>
      <PasswordSection hasPassword={me.user.has_password} onSaved={() => setMe({ user: { ...me.user, has_password: true } })} />
      <PasskeysSection hasPassword={me.user.has_password} />
    </>
  );
}

function PasswordSection({ hasPassword, onSaved }: { hasPassword: boolean; onSaved: () => void }) {
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [status, setStatus] = useState<"idle" | "saving" | "ok" | Failure>("idle");
  const [saved, setSaved] = useState(0);

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    // Clear the old message first so a repeated identical error is announced again.
    flushSync(() => setStatus("saving"));
    const r = await setPassword(next, hasPassword ? current : undefined);
    setStatus(r);
    if (r === "ok") {
      setCurrent("");
      setNext("");
      setSaved((n) => n + 1);
      onSaved();
    }
  }

  const failed = status !== "idle" && status !== "saving" && status !== "ok";
  return (
    <section aria-labelledby="password-heading" className="grid gap-3">
      <h2 id="password-heading" className="font-display text-2xl font-extrabold tracking-tight">
        Password
      </h2>
      <p className="text-ink-soft">
        {hasPassword ? "Change the password you sign in with." : "Add a password so you can sign in without an email link."}
      </p>
      {status === "ok" && <Done focusKey={saved} text="Password saved. Your other devices were signed out." />}
      <form onSubmit={onSubmit} className="waitlist">
        {hasPassword && (
          <>
            <label htmlFor="current-password">Current password</label>
            <input
              id="current-password"
              type="password"
              required
              autoComplete="current-password"
              value={current}
              onChange={(e) => setCurrent(e.target.value)}
              aria-invalid={status === "invalid_current_password" || undefined}
            />
          </>
        )}
        <label htmlFor="new-password">New password</label>
        <input
          id="new-password"
          type="password"
          required
          minLength={12}
          maxLength={256}
          autoComplete="new-password"
          value={next}
          onChange={(e) => setNext(e.target.value)}
          aria-invalid={status === "invalid_password" || undefined}
          aria-describedby="new-password-note"
        />
        <p id="new-password-note" className="waitlist-note">
          At least 12 characters.
        </p>
        {failed && (
          <p role="alert" className="waitlist-error">
            {messages[status]}
          </p>
        )}
        <div className="waitlist-row">
          <button type="submit" disabled={status === "saving"}>
            {status === "saving" ? "Saving..." : hasPassword ? "Change password" : "Set password"}
          </button>
        </div>
      </form>
    </section>
  );
}

const added = (iso: string) => new Date(iso).toLocaleDateString(undefined, { dateStyle: "medium" });

function PasskeysSection({ hasPassword }: { hasPassword: boolean }) {
  const [keys, setKeys] = useState<Passkey[] | Failure | null>(null);
  const [name, setName] = useState("");
  const [busy, setBusy] = useState<"adding" | "removing" | null>(null);
  const [problem, setProblem] = useState<Problem | null>(null);
  const [askPassword, setAskPassword] = useState(false);
  const [confirmPw, setConfirmPw] = useState("");
  const passwordRef = useRef<HTMLInputElement>(null);
  const [done, setDone] = useState<{ text: string; n: number } | null>(null);
  const [confirming, setConfirming] = useState<string | null>(null);
  const removeRefs = useRef(new Map<string, HTMLButtonElement>());
  const confirmRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    listPasskeys().then(setKeys);
  }, []);

  useEffect(() => {
    if (confirming) confirmRef.current?.focus();
  }, [confirming]);

  function start() {
    // Clear the old messages first so a repeated identical error is announced again.
    flushSync(() => {
      setProblem(null);
      setDone(null);
    });
  }

  async function onAdd(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    start();
    setBusy("adding");
    const r = await addPasskey(name.trim(), askPassword ? confirmPw : undefined);
    setBusy(null);
    if (r === "reauth_required" && hasPassword) {
      // Re-render first so the field exists, then put the cursor in it.
      flushSync(() => {
        setAskPassword(true);
        setProblem("confirm_password");
      });
      return passwordRef.current?.focus();
    }
    if (typeof r === "string") return setProblem(r);
    // Reload rather than append, so an earlier failed load is retried too.
    listPasskeys().then(setKeys);
    setName("");
    setConfirmPw("");
    setAskPassword(false);
    setDone((d) => ({ text: `Passkey "${r.name}" added.`, n: (d?.n ?? 0) + 1 }));
  }

  async function onRemove(key: Passkey) {
    start();
    setBusy("removing");
    const r = await removePasskey(key.id);
    setBusy(null);
    flushSync(() => setConfirming(null));
    if (r !== "ok") removeRefs.current.get(key.id)?.focus();
    if (r === "ok" || r === "not_found") setKeys((k) => (Array.isArray(k) ? k.filter((p) => p.id !== key.id) : k));
    if (r === "ok") return setDone((d) => ({ text: `Passkey "${key.name}" removed. Your other devices were signed out.`, n: (d?.n ?? 0) + 1 }));
    setProblem(r);
  }

  function cancelRemove(id: string) {
    flushSync(() => setConfirming(null));
    removeRefs.current.get(id)?.focus();
  }

  return (
    <section aria-labelledby="passkeys-heading" className="grid gap-3">
      <h2 id="passkeys-heading" className="font-display text-2xl font-extrabold tracking-tight">
        Passkeys
      </h2>
      <p className="text-ink-soft">Sign in with your fingerprint, face or device PIN instead of a password.</p>
      {done && <Done focusKey={done.n} text={done.text} />}
      {problem && (
        <p role="alert" className="waitlist-error">
          {messages[problem]}
        </p>
      )}
      {keys === null ? (
        <p className="text-ink-soft">Loading your passkeys...</p>
      ) : !Array.isArray(keys) ? (
        <p role="alert" className="waitlist-error">
          Your passkeys couldn&apos;t be loaded. {messages[keys]}
        </p>
      ) : keys.length === 0 ? (
        <p>You have no passkeys yet.</p>
      ) : (
        <ul className="grid gap-2">
          {keys.map((key) => (
            <li key={key.id} className="grid gap-1 border-l-4 border-ink bg-paper px-4 py-3">
              <p className="font-bold">{key.name}</p>
              <p className="text-sm text-ink-soft">Added {added(key.created_at)}</p>
              {confirming === key.id ? (
                <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
                  <p>Remove this passkey? You won&apos;t be able to sign in with it.</p>
                  <button
                    ref={confirmRef}
                    type="button"
                    disabled={busy !== null}
                    className={linkButton}
                    onClick={() => onRemove(key)}
                  >
                    {busy === "removing" ? "Removing..." : "Yes, remove it"}
                  </button>
                  <button type="button" disabled={busy !== null} className={linkButton} onClick={() => cancelRemove(key.id)}>
                    Keep it
                  </button>
                </div>
              ) : (
                <button
                  ref={(el) => {
                    if (el) removeRefs.current.set(key.id, el);
                    else removeRefs.current.delete(key.id);
                  }}
                  type="button"
                  disabled={busy !== null}
                  className={`justify-self-start ${linkButton}`}
                  aria-label={`Remove ${key.name}`}
                  onClick={() => setConfirming(key.id)}
                >
                  Remove
                </button>
              )}
            </li>
          ))}
        </ul>
      )}
      <form onSubmit={onAdd} className="waitlist">
        {askPassword && (
          <>
            <label htmlFor="passkey-password">Confirm with your password</label>
            <input
              ref={passwordRef}
              id="passkey-password"
              type="password"
              required
              autoComplete="current-password"
              value={confirmPw}
              onChange={(e) => setConfirmPw(e.target.value)}
              aria-invalid={problem === "confirm_password" || undefined}
            />
          </>
        )}
        <label htmlFor="passkey-name">Name for the new passkey (optional)</label>
        <div className="waitlist-row">
          <input
            id="passkey-name"
            maxLength={64}
            placeholder="Work laptop"
            value={name}
            onChange={(e) => setName(e.target.value)}
            aria-invalid={problem === "invalid_name" || undefined}
          />
          <button type="submit" disabled={busy !== null}>
            {busy === "adding" ? "Waiting for your device..." : "Add a passkey"}
          </button>
        </div>
      </form>
    </section>
  );
}
