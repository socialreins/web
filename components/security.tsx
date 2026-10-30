"use client";

import { useEffect, useRef, useState, type FormEvent, type ReactNode } from "react";
import { flushSync } from "react-dom";
import {
  addPasskey,
  listPasskeys,
  removePasskey,
  type Failure,
  type Passkey,
} from "@/lib/auth";
import { signInLink } from "@/components/team-ui";

const signIn = signInLink;

type Problem = Failure | "cancelled" | "unsupported";

const messages: Partial<Record<Problem, ReactNode>> = {
  reauth_required: <>For your safety, this needs a fresh sign-in. {signIn("Sign in again")}, then come back here.</>,
  signed_out: <>You are signed out. {signIn("Sign in again")} to continue.</>,
  rate_limited: "Too many attempts. Wait a minute, then try again.",
  invalid_name: "Keep the passkey name to 64 characters or fewer.",
  invalid_challenge: "That took too long. Try adding the passkey again.",
  invalid_passkey: "Your device's passkey couldn't be checked. Try again.",
  passkey_exists: "This device already has a passkey for your account.",
  not_found: "That passkey was already removed.",
  timeout: "The server took too long to answer. Try again in a moment.",
  error: "Something went wrong. Try again in a moment.",
  cancelled: "Adding the passkey was cancelled.",
  unsupported: "This browser can't create passkeys.",
};

const say = (p: Problem) => messages[p] ?? messages.error;

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

export function Security() {
  return <PasskeysSection />;
}

const added = (iso: string) => new Date(iso).toLocaleDateString(undefined, { dateStyle: "medium" });

function PasskeysSection() {
  const [keys, setKeys] = useState<Passkey[] | Failure | null>(null);
  const [name, setName] = useState("");
  const [busy, setBusy] = useState<"adding" | "removing" | null>(null);
  const [problem, setProblem] = useState<Problem | null>(null);
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
    const r = await addPasskey(name.trim());
    setBusy(null);
    if (typeof r === "string") return setProblem(r);
    // Reload rather than append, so an earlier failed load is retried too.
    listPasskeys().then(setKeys);
    setName("");
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
      <h2 id="passkeys-heading" className="font-display text-xl font-extrabold tracking-tight">
        Passkeys
      </h2>
      <p className="text-ink-soft">Sign in with Face ID, Touch ID or your device PIN.</p>
      {done && <Done focusKey={done.n} text={done.text} />}
      {problem && (
        <p role="alert" className="waitlist-error">
          {say(problem)}
        </p>
      )}
      {keys === null ? (
        <p className="text-ink-soft">Loading your passkeys...</p>
      ) : !Array.isArray(keys) ? (
        <p role="alert" className="waitlist-error">
          Your passkeys couldn&apos;t be loaded. {say(keys)}
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
