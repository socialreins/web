"use client";

import { useState, type FormEvent } from "react";
import { joinWaitlist, type WaitlistResult } from "@/lib/waitlist";

const messages: Record<WaitlistResult, string> = {
  joined: "You're on the waitlist for the hosted version.",
  invalid: "That email address doesn't look right. Check it and try again.",
  rate_limited: "Too many attempts from this connection. Wait a minute, then try again.",
  error: "The waitlist couldn't be reached. Try again in a moment.",
};

export function WaitlistForm() {
  const [status, setStatus] = useState<WaitlistResult | "idle" | "sending">("idle");

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const email = String(new FormData(e.currentTarget).get("email") ?? "").trim();
    setStatus("sending");
    setStatus(await joinWaitlist(email));
  }

  if (status === "joined") {
    return (
      <p role="status" className="waitlist-done">
        {messages.joined}
      </p>
    );
  }

  const failed = status !== "idle" && status !== "sending";
  return (
    <form onSubmit={onSubmit} className="waitlist">
      <label htmlFor="waitlist-email">Email for the hosted version waitlist</label>
      <div className="waitlist-row">
        <input
          id="waitlist-email"
          name="email"
          type="email"
          required
          autoComplete="email"
          placeholder="you@example.com"
          aria-invalid={status === "invalid" || undefined}
          aria-describedby="waitlist-message"
        />
        <button type="submit" disabled={status === "sending"}>
          {status === "sending" ? "Joining..." : "Join the waitlist"}
        </button>
      </div>
      <p id="waitlist-message" role={failed ? "alert" : undefined} className={failed ? "waitlist-error" : "waitlist-note"}>
        {failed ? messages[status] : "The hosted version will be a paid subscription, coming later."}
      </p>
    </form>
  );
}
