"use client";

import { useEffect, useRef, useState, useSyncExternalStore, type FormEvent } from "react";
import { flushSync } from "react-dom";
import { useRouter, useSearchParams } from "next/navigation";
import { requestLink, signInWithPasskey, signInWithPassword, type Failure, type LinkResult } from "@/lib/auth";

const failures: Record<Exclude<LinkResult, "sent">, string> = {
  invalid: "That email address doesn't look right. Check it and try again.",
  rate_limited: "Too many attempts from this connection. Wait a minute, then try again.",
  timeout: "Sign-in took too long to answer. Try again in a moment.",
  error: "Sign-in couldn't be reached. Try again in a moment.",
};

// Values brain puts in /login?error= when an emailed link cannot be used.
const linkErrors: Record<string, string> = {
  invalid_link: "That sign-in link has expired or was already used. Ask for a new one below.",
  registration_disabled: "New accounts are closed on this server, so that link can't create one.",
};
const unknownLinkError = "That sign-in link didn't work. Ask for a new one below.";

// Never say whether an account exists: brain gives one answer for every bad email and password.
const signInFailures: Partial<Record<Failure | "cancelled", string>> = {
  invalid_credentials: "That email and password didn't work. Check them, or sign in with an email link.",
  invalid_passkey: "That passkey didn't work. Try another, or sign in with an email link.",
  invalid_challenge: "That took too long. Try again.",
  cancelled: "Passkey sign-in was cancelled or no passkey was found on this device.",
  rate_limited: failures.rate_limited,
  timeout: failures.timeout,
};
const signInFailed = (r: Failure | "cancelled") => signInFailures[r] ?? failures.error;

const noSubscribe = () => () => {};
const hasWebAuthn = () => typeof window.PublicKeyCredential === "function";

const linkButton =
  "justify-self-start font-bold underline decoration-signal decoration-2 underline-offset-4 hover:text-signal-deep disabled:cursor-progress disabled:opacity-70";

// Reads ?error= on the client; the page shows <LoginForm linkError={null} /> as its server-rendered fallback.
export function LoginFormWithError() {
  return <LoginForm linkError={useSearchParams().get("error")} />;
}

export function LoginForm({ linkError }: { linkError: string | null }) {
  const router = useRouter();
  const [mode, setMode] = useState<"link" | "password">("link");
  const [password, setPassword] = useState("");
  const [signIn, setSignIn] = useState<"idle" | "password" | "passkey" | Failure | "cancelled">("idle");
  // Only known after hydration, so the server HTML never shows a button the browser can't use.
  const passkeys = useSyncExternalStore(noSubscribe, hasWebAuthn, () => false);
  const passwordRef = useRef<HTMLInputElement>(null);
  const [status, setStatus] = useState<LinkResult | "idle" | "sending">("idle");
  const [email, setEmail] = useState("");
  const [submitted, setSubmitted] = useState(false);
  const doneRef = useRef<HTMLHeadingElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (status === "sent") doneRef.current?.focus();
  }, [status]);

  async function finish(run: () => Promise<"ok" | Failure | "cancelled">, pending: "password" | "passkey") {
    setSubmitted(true);
    // Commit the empty message first so a repeated identical error is announced again.
    flushSync(() => setSignIn(pending));
    const r = await run();
    if (r === "ok") return router.push("/app");
    setSignIn(r);
  }

  function switchTo(next: "link" | "password") {
    flushSync(() => {
      setMode(next);
      setPassword("");
      setSignIn("idle");
      setStatus("idle");
    });
    (next === "password" ? passwordRef : inputRef).current?.focus();
  }

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const value = email.trim();
    setSubmitted(true);
    // Commit the empty message first so a repeated identical error is announced again.
    flushSync(() => setStatus("sending"));
    setStatus(await requestLink(value));
  }

  if (status === "sent") {
    return (
      <div className="grid gap-3">
        <h2 id="login-done" ref={doneRef} tabIndex={-1} className="font-display text-2xl font-extrabold tracking-tight">
          Check your email
        </h2>
        <p className="waitlist-done">
          If {email.trim()} can sign in, a link is on its way. It works once and expires in 15 minutes.
        </p>
        <button
          type="button"
          className="justify-self-start font-bold underline decoration-signal decoration-2 underline-offset-4 hover:text-signal-deep"
          onClick={() => {
            flushSync(() => setStatus("idle"));
            inputRef.current?.focus();
          }}
        >
          Use a different email
        </button>
      </div>
    );
  }

  const failed = status !== "idle" && status !== "sending";
  const signInError = signIn !== "idle" && signIn !== "password" && signIn !== "passkey";
  const busy = status === "sending" || signIn === "password" || signIn === "passkey";
  return (
    <div className="grid gap-5">
      <form
        onSubmit={
          mode === "link"
            ? onSubmit
            : (e) => {
                e.preventDefault();
                finish(() => signInWithPassword(email.trim(), password), "password");
              }
        }
        className="waitlist"
      >
        {linkError !== null && !submitted && (
          <p role="alert" className="waitlist-error">
            {Object.hasOwn(linkErrors, linkError) ? linkErrors[linkError] : unknownLinkError}
          </p>
        )}
        <label htmlFor="login-email">Email</label>
        <div className="waitlist-row">
          <input
            ref={inputRef}
            id="login-email"
            name="email"
            type="email"
            required
            autoComplete={mode === "link" ? "email" : "username"}
            placeholder="you@example.com"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            aria-invalid={status === "invalid" || signIn === "invalid_credentials" || undefined}
            aria-describedby="login-note login-message"
          />
          {mode === "link" && (
            <button type="submit" disabled={busy}>
              {status === "sending" ? "Sending..." : "Email me a sign-in link"}
            </button>
          )}
        </div>
        {mode === "password" && (
          <>
            <label htmlFor="login-password">Password</label>
            <div className="waitlist-row">
              <input
                ref={passwordRef}
                id="login-password"
                name="password"
                type="password"
                required
                autoComplete="current-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                aria-invalid={signIn === "invalid_credentials" || undefined}
              />
              <button type="submit" disabled={busy}>
                {signIn === "password" ? "Signing in..." : "Sign in"}
              </button>
            </div>
          </>
        )}
        <p id="login-note" className="waitlist-note">
          {mode === "link" ? "No account yet? The same link creates one." : "No password yet? Sign in with an email link, then add one."}
        </p>
        <p id="login-message" role="status" aria-live="polite" className={failed ? "waitlist-error" : "waitlist-empty"}>
          {failed ? failures[status] : ""}
        </p>
      </form>
      {signInError && (
        // A cancelled prompt is the user's own choice, so it is announced politely, not as an alert.
        <p role={signIn === "cancelled" ? "status" : "alert"} className="waitlist-error">
          {signInFailed(signIn)}
        </p>
      )}
      <div className="flex flex-wrap gap-x-6 gap-y-2">
        <button type="button" className={linkButton} disabled={busy} onClick={() => switchTo(mode === "link" ? "password" : "link")}>
          {mode === "link" ? "Sign in with a password" : "Sign in with an email link"}
        </button>
        {passkeys && (
          <button
            type="button"
            className={linkButton}
            disabled={busy}
            onClick={() => finish(signInWithPasskey, "passkey")}
          >
            {signIn === "passkey" ? "Waiting for your passkey..." : "Sign in with a passkey"}
          </button>
        )}
      </div>
    </div>
  );
}
