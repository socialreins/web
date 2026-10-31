"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import { flushSync } from "react-dom";
import type { Failure } from "@/lib/auth";
import { getWebhook, pingText, removeWebhook, setWebhook, testWebhook, type Webhook } from "@/lib/webhook";
import { isFailure, linkButton, problemText, Status, useAction } from "@/components/team-ui";

const heading = "font-display text-xl font-extrabold tracking-tight";
const overrides = {
  invalid_url: "Use a public https:// URL of at most 2000 characters, without a user name or password.",
  not_found: "This team has no webhook now. Reload the page to see the latest.",
};

// Rendered for owners and admins only (see ApiTokens).
export function WebhookSection() {
  // undefined: loading; null: none set.
  const [hook, setHook] = useState<Webhook | null | Failure | undefined>(undefined);
  const [url, setUrl] = useState("");
  // The secret lives only here: never in the URL or storage, and gone on reload.
  const [secret, setSecret] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [removing, setRemoving] = useState(false);
  const main = useAction();
  const secretRef = useRef<HTMLInputElement>(null);
  const urlRef = useRef<HTMLInputElement>(null);
  const removeRef = useRef<HTMLButtonElement>(null);
  // Closing a panel unmounts the focused button; these put focus somewhere sensible.
  const hideSecret = () => {
    flushSync(() => setSecret(null));
    urlRef.current?.focus();
  };
  const cancelRemove = () => {
    flushSync(() => setRemoving(false));
    removeRef.current?.focus();
  };

  useEffect(() => {
    getWebhook().then((r) => {
      setHook(r === "not_found" ? null : r);
      if (!isFailure(r)) setUrl(r.url);
    });
  }, []);
  useEffect(() => {
    // Focus selects it too (onFocus), and a screen reader reads the one-time secret.
    if (secret) secretRef.current?.focus();
  }, [secret]);

  function onSave(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    main.run("save", () => setWebhook(url), (r) => {
      if ("secret" in r) {
        setHook(r.webhook);
        setUrl(r.webhook.url);
        setSecret(r.secret);
        setCopied(false);
        return;
      }
      setHook(r);
      setUrl(r.url);
      return "Saved. Events now go to the new URL with the same secret.";
    });
  }

  async function copy() {
    if (!secret) return;
    try {
      await navigator.clipboard.writeText(secret);
      setCopied(true);
    } catch {
      // Clipboard refused (no permission or insecure context): leave it selected to copy by hand.
      secretRef.current?.select();
    }
  }

  function onRemove() {
    main.run("remove", removeWebhook, () => {
      setRemoving(false);
      setHook(null);
      setUrl("");
      setSecret(null);
      return "Removed the webhook. No more events will be sent.";
    });
  }

  const current = hook && !isFailure(hook) ? hook : null;

  return (
    <section aria-labelledby="webhook-heading" className="grid gap-3">
      <h2 id="webhook-heading" className={heading}>
        Webhook
      </h2>
      <p className="text-ink-soft">
        SocialReins sends a POST to this URL for <code>post.target.published</code>, <code>post.target.failed</code> and{" "}
        <code>post.target.deleted</code>, signed with HMAC-SHA256 in the <code>SocialReins-Signature</code> header.{" "}
        <a href="https://github.com/socialreins/brain#endpoints" className="underline decoration-2 underline-offset-4">
          How to verify it
        </a>
        .
      </p>
      {hook === undefined ? (
        <p className="text-ink-soft">Loading webhook...</p>
      ) : isFailure(hook) ? (
        <p role="alert" className="waitlist-error">
          The webhook couldn&apos;t be loaded. {problemText(hook)}
        </p>
      ) : (
        <>
          {current ? (
            <p>
              Sending to <code className="break-all">{current.url}</code>
            </p>
          ) : (
            <p>No webhook yet.</p>
          )}
          <form onSubmit={onSave} className="waitlist">
            <label htmlFor="webhook-url">Webhook URL</label>
            <div className="waitlist-row">
              <input
                ref={urlRef}
                id="webhook-url"
                type="url"
                required
                maxLength={2000}
                autoComplete="off"
                placeholder="https://example.com/socialreins"
                value={url}
                onChange={(e) => setUrl(e.target.value)}
                aria-invalid={(main.failedKey === "save" && main.problem === "invalid_url") || undefined}
              />
              <button type="submit" disabled={main.busy !== null}>
                {main.busy === "save" ? "Saving..." : "Save"}
              </button>
            </div>
            <p className="waitlist-note">Saving the webhook needs a sign-in from the last 10 minutes.</p>
          </form>
        </>
      )}
      <Status problem={main.problem} done={main.done} overrides={overrides} />
      {secret && (
        <div role="region" aria-label="New webhook" className="card grid gap-2 p-4">
          <label htmlFor="webhook-secret" className="label">
            Signing secret
          </label>
          <div className="flex gap-2">
            <input ref={secretRef} id="webhook-secret" readOnly value={secret} className="field font-mono text-sm" onFocus={(e) => e.target.select()} />
            <button type="button" className="btn btn-secondary" onClick={copy}>
              {copied ? "Copied" : "Copy"}
            </button>
          </div>
          <p className="font-bold">Copy it now. It won&apos;t be shown again.</p>
          <button type="button" className={`justify-self-start ${linkButton}`} onClick={hideSecret}>
            Done, hide the secret
          </button>
        </div>
      )}
      {current &&
        (removing ? (
          <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
            <p id="remove-webhook-q">Remove the webhook? Events stop at once, and a new one gets a new secret.</p>
            <button
              type="button"
              autoFocus
              className={linkButton}
              aria-describedby="remove-webhook-q"
              disabled={main.busy !== null}
              onClick={onRemove}
            >
              {main.busy === "remove" ? "Removing..." : "Yes, remove"}
            </button>
            <button type="button" className={linkButton} disabled={main.busy !== null} onClick={cancelRemove}>
              Cancel
            </button>
          </div>
        ) : (
          <div className="flex flex-wrap gap-x-4 gap-y-2">
            <button
              type="button"
              className={linkButton}
              disabled={main.busy !== null}
              onClick={() => main.run("test", testWebhook, pingText)}
            >
              {main.busy === "test" ? "Sending..." : "Send test"}
            </button>
            <button ref={removeRef} type="button" className={linkButton} disabled={main.busy !== null} onClick={() => setRemoving(true)}>
              Remove
            </button>
          </div>
        ))}
    </section>
  );
}
