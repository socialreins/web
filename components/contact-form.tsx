"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import { flushSync } from "react-dom";
import { captchaMessages, useTurnstile } from "@/components/turnstile";
import { getProviders } from "@/lib/auth";
import { sendContact, type ContactResult } from "@/lib/contact";

const messages: Record<ContactResult, string> = {
  ...captchaMessages,
  sent: "Thanks, we'll get back to you by email.",
  invalid_name: "Add your name, up to 100 characters.",
  invalid_email: "That email address doesn't look right. Check it and try again.",
  invalid_message: "Write a message, up to 5000 characters.",
  contact_unavailable: "Messages can't be sent right now. Try again later.",
  rate_limited: "Too many messages from this connection. Wait a minute, then try again.",
  timeout: "Sending took too long. Try again in a moment.",
  error: "Your message couldn't be sent. Try again in a moment.",
};

const fieldOf: Partial<Record<ContactResult, string>> = {
  invalid_name: "name",
  invalid_email: "email",
  invalid_message: "message",
};

export function ContactForm() {
  const [status, setStatus] = useState<ContactResult | "idle" | "sending">("idle");
  const [siteKey, setSiteKey] = useState<string | null>();
  const turnstile = useTurnstile(siteKey, "contact");
  const messageRef = useRef<HTMLParagraphElement>(null);

  useEffect(() => {
    getProviders().then((p) => setSiteKey(p.turnstileSiteKey));
  }, []);

  useEffect(() => {
    if (status === "sent") messageRef.current?.focus();
  }, [status]);

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const data = new FormData(e.currentTarget);
    const get = (k: string) => String(data.get(k) ?? "").trim();
    // Commit the empty message first so a repeated identical error is announced again.
    flushSync(() => setStatus("sending"));
    const result = await sendContact({ name: get("name"), email: get("email"), message: get("message") }, turnstile.token);
    turnstile.reset();
    setStatus(result);
  }

  const sent = status === "sent";
  const failed = status !== "idle" && status !== "sending" && !sent;
  const invalid = (field: string) => (failed && fieldOf[status] === field) || undefined;
  return (
    <form onSubmit={onSubmit} className="waitlist contact max-w-none">
      {!sent && (
        <>
          <label htmlFor="contact-name">Name</label>
          <input id="contact-name" name="name" required maxLength={100} autoComplete="name" aria-invalid={invalid("name")} />
          <label htmlFor="contact-email">Email</label>
          <input
            id="contact-email"
            name="email"
            type="email"
            required
            maxLength={254}
            autoComplete="email"
            placeholder="you@example.com"
            aria-invalid={invalid("email")}
          />
          <label htmlFor="contact-message">Message</label>
          <textarea
            id="contact-message"
            name="message"
            required
            maxLength={5000}
            rows={6}
            aria-invalid={invalid("message")}
            aria-describedby="contact-status"
          />
          {turnstile.widget}
          <button type="submit" className="justify-self-start" disabled={status === "sending" || turnstile.missing}>
            {status === "sending" ? "Sending..." : "Send"}
          </button>
        </>
      )}
      <p
        id="contact-status"
        ref={messageRef}
        role="status"
        aria-live="polite"
        tabIndex={-1}
        className={sent ? "waitlist-done" : failed ? "waitlist-error" : "waitlist-empty"}
      >
        {sent || failed ? messages[status] : ""}
      </p>
    </form>
  );
}
