"use client";

import { useEffect, useRef, useState, useSyncExternalStore, type FormEvent } from "react";
import { flushSync } from "react-dom";
import { useRouter, useSearchParams } from "next/navigation";
import { getProviders, googleStartUrl, requestLink, safeNext, signInWithPasskey, type Failure, type LinkResult } from "@/lib/auth";

const failures: Record<Exclude<LinkResult, "sent">, string> = {
  invalid: "That email address doesn't look right. Check it and try again.",
  rate_limited: "Too many attempts from this connection. Wait a minute, then try again.",
  timeout: "Sign-in took too long to answer. Try again in a moment.",
  error: "Sign-in couldn't be reached. Try again in a moment.",
};

// Values brain puts in /login?error= when an emailed link or Google sign-in cannot be used.
const linkErrors: Record<string, string> = {
  invalid_link: "That sign-in link has expired or was already used. Ask for a new one below.",
  registration_disabled: "New accounts are closed on this server, so you can't create one here.",
  google_failed: "Google sign-in didn't finish. Try again, or use an email link instead.",
};
const unknownLinkError = "That sign-in didn't work. Try again, or ask for an email link below.";

const passkeyFailures: Partial<Record<Failure | "cancelled", string>> = {
  invalid_passkey: "That passkey didn't work. Try another, or sign in with an email link.",
  invalid_challenge: "That took too long. Try again.",
  cancelled: "Passkey sign-in was cancelled or no passkey was found on this device.",
  rate_limited: failures.rate_limited,
  timeout: failures.timeout,
};

const noSubscribe = () => () => {};
const hasWebAuthn = () => typeof window.PublicKeyCredential === "function";

const linkButton =
  "justify-self-start font-bold underline decoration-signal decoration-2 underline-offset-4 hover:text-signal-deep disabled:cursor-progress disabled:opacity-70";

// Google's own mark, in its four colors, as its sign-in button guidelines require.
function GoogleMark() {
  return (
    <svg viewBox="0 0 48 48" className="size-5 shrink-0" aria-hidden="true">
      <path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z" />
      <path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z" />
      <path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z" />
      <path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z" />
    </svg>
  );
}

// Reads ?error= on the client; the page shows <LoginForm linkError={null} /> as its server-rendered fallback.
export function LoginFormWithError() {
  const params = useSearchParams();
  return <LoginForm linkError={params.get("error")} next={params.get("next")} />;
}

// `next`: where to go after Google or passkey sign-in, if it is a path on this site.
export function LoginForm({ linkError, next = null }: { linkError: string | null; next?: string | null }) {
  const router = useRouter();
  const [google, setGoogle] = useState(false);
  const [passkey, setPasskey] = useState<"idle" | "pending" | Failure | "cancelled">("idle");
  // Only known after hydration, so the server HTML never shows a button the browser can't use.
  const passkeys = useSyncExternalStore(noSubscribe, hasWebAuthn, () => false);
  const [status, setStatus] = useState<LinkResult | "idle" | "sending">("idle");
  const [email, setEmail] = useState("");
  const [submitted, setSubmitted] = useState(false);
  const doneRef = useRef<HTMLHeadingElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    getProviders().then((p) => setGoogle(p.google));
  }, []);

  useEffect(() => {
    if (status === "sent") doneRef.current?.focus();
  }, [status]);

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const value = email.trim();
    setSubmitted(true);
    // Commit the empty message first so a repeated identical error is announced again.
    flushSync(() => {
      setStatus("sending");
      setPasskey("idle");
    });
    setStatus(await requestLink(value));
  }

  async function onPasskey() {
    setSubmitted(true);
    flushSync(() => {
      setPasskey("pending");
      setStatus("idle");
    });
    const r = await signInWithPasskey();
    if (r === "ok") return router.push(safeNext(next));
    setPasskey(r);
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
          className={linkButton}
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
  const passkeyFailed = passkey !== "idle" && passkey !== "pending";
  const busy = status === "sending" || passkey === "pending";
  return (
    <div className="grid gap-6">
      {linkError !== null && !submitted && (
        <p role="alert" className="waitlist-error">
          {Object.hasOwn(linkErrors, linkError) ? linkErrors[linkError] : unknownLinkError}
        </p>
      )}
      {google && (
        <>
          <a
            href={googleStartUrl(next)}
            className="flex h-11 w-full items-center justify-center gap-2.5 rounded-full border border-[#747775] bg-white px-3 text-[0.95rem] font-medium text-[#1f1f1f] [font-family:Roboto,Arial,sans-serif] hover:bg-[#f8f9fa]"
          >
            <GoogleMark />
            Continue with Google
          </a>
          <p className="flex items-center gap-3 text-sm text-ink-soft">
            <span aria-hidden="true" className="h-px flex-1 bg-ink/15" />
            or
            <span aria-hidden="true" className="h-px flex-1 bg-ink/15" />
          </p>
        </>
      )}
      <form onSubmit={onSubmit} className="waitlist max-w-none">
        <label htmlFor="login-email">Email</label>
        <input
          ref={inputRef}
          id="login-email"
          name="email"
          type="email"
          required
          autoComplete="email"
          placeholder="you@example.com"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          aria-invalid={status === "invalid" || undefined}
          aria-describedby="login-note login-message"
        />
        <button type="submit" disabled={busy}>
          {status === "sending" ? "Sending..." : "Email me a link"}
        </button>
        <p id="login-note" className="waitlist-note">
          New here? The link creates your account.
        </p>
        <p id="login-message" role="status" aria-live="polite" className={failed ? "waitlist-error" : "waitlist-empty"}>
          {failed ? failures[status] : ""}
        </p>
      </form>
      {passkeys && (
        <div className="grid gap-2 border-t border-ink/10 pt-5">
          <button type="button" className={linkButton} disabled={busy} onClick={onPasskey}>
            {passkey === "pending" ? "Waiting for your passkey..." : "Sign in with a passkey"}
          </button>
          {passkeyFailed && (
            // Cancelling is the person's own choice, so it is a quiet status, not an alert.
            <p role={passkey === "cancelled" ? "status" : "alert"} className="waitlist-error">
              {passkeyFailures[passkey] ?? failures.error}
            </p>
          )}
        </div>
      )}
    </div>
  );
}
