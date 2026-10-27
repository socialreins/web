"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import { flushSync } from "react-dom";
import { useSearchParams } from "next/navigation";
import { requestLink, type LinkResult } from "@/lib/auth";

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

export function LoginForm() {
  const linkError = useSearchParams().get("error");
  const [status, setStatus] = useState<LinkResult | "idle" | "sending">("idle");
  const [email, setEmail] = useState("");
  const [submitted, setSubmitted] = useState(false);
  const doneRef = useRef<HTMLHeadingElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (status === "sent") doneRef.current?.focus();
  }, [status]);

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
          className="justify-self-start font-bold underline decoration-brass decoration-2 underline-offset-4 hover:text-saddle"
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
  return (
    <form onSubmit={onSubmit} className="waitlist">
      {linkError !== null && !submitted && (
        <p role="alert" className="waitlist-error">
          {linkErrors[linkError] ?? unknownLinkError}
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
          autoComplete="email"
          placeholder="you@example.com"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          aria-invalid={status === "invalid" || undefined}
          aria-describedby="login-note login-message"
        />
        <button type="submit" disabled={status === "sending"}>
          {status === "sending" ? "Sending..." : "Email me a sign-in link"}
        </button>
      </div>
      <p id="login-note" className="waitlist-note">
        No account yet? The same link creates one.
      </p>
      <p id="login-message" role="status" aria-live="polite" className={failed ? "waitlist-error" : "waitlist-empty"}>
        {failed ? failures[status] : ""}
      </p>
    </form>
  );
}
