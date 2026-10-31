"use client";

import { useEffect, useRef, useState } from "react";
import type { Captcha } from "@/lib/waitlist";

type RenderOptions = {
  sitekey: string;
  action: string;
  callback: (token: string) => void;
  "expired-callback": () => void;
  "error-callback": () => void;
};

declare global {
  interface Window {
    turnstile?: { render(el: HTMLElement, opts: RenderOptions): string; reset(id: string): void; remove(id: string): void };
  }
}

export const captchaMessages: Record<Captcha, string> = {
  captcha_failed: "The check didn't pass. Try again.",
  captcha_unavailable: "We couldn't check that right now. Try again in a minute.",
};

const src = "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit";
let loading: Promise<void> | undefined;

// Loads Cloudflare's script once per page, however many widgets ask for it.
function load(): Promise<void> {
  if (window.turnstile) return Promise.resolve();
  return (loading ??= new Promise((resolve, reject) => {
    const script = document.createElement("script");
    script.src = src;
    script.async = true;
    script.onload = () => resolve();
    script.onerror = () => {
      loading = undefined;
      script.remove();
      reject(new Error("turnstile script failed"));
    };
    document.head.append(script);
  }));
}

// A Cloudflare Turnstile widget for one form. `siteKey` comes from brain's /auth/providers; null or
// undefined (Turnstile off, or not known yet) renders nothing and `missing` stays false.
// Tokens are single-use, so call `reset` after every submit.
export function useTurnstile(siteKey: string | null | undefined, action: string) {
  const ref = useRef<HTMLDivElement>(null);
  const id = useRef<string | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    if (!siteKey) return;
    let gone = false;
    load().then(
      () => {
        if (gone || !ref.current || !window.turnstile) return;
        id.current = window.turnstile.render(ref.current, {
          sitekey: siteKey,
          action,
          callback: (t) => {
            setFailed(false);
            setToken(t);
          },
          "expired-callback": () => setToken(null),
          "error-callback": () => {
            setToken(null);
            setFailed(true);
          },
        });
      },
      () => !gone && setFailed(true),
    );
    return () => {
      gone = true;
      if (id.current) window.turnstile?.remove(id.current);
      id.current = null;
      setToken(null);
    };
  }, [siteKey, action]);

  function reset() {
    setToken(null);
    if (id.current) window.turnstile?.reset(id.current);
  }

  const widget = siteKey ? (
    <div className="grid gap-2">
      <div ref={ref} />
      {failed && (
        <p role="alert" className="waitlist-error">
          {captchaMessages.captcha_unavailable}
        </p>
      )}
    </div>
  ) : null;
  return { token, reset, widget, missing: !!siteKey && !token };
}
