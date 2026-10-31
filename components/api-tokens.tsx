"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import type { Failure } from "@/lib/auth";
import { useSession } from "@/components/app-shell";
import { createToken, listTokens, revokeToken, type ApiToken } from "@/lib/api-tokens";
import { listSets, type SocialSet } from "@/lib/sets";
import { manages } from "@/lib/teams";
import { apiUrl } from "@/lib/waitlist";
import { isFailure, linkButton, problemText, Status, useAction } from "@/components/team-ui";

const heading = "font-display text-xl font-extrabold tracking-tight";
const date = (d: string) => new Date(d).toLocaleDateString(undefined, { dateStyle: "medium" });
const expiries = [
  { value: "", label: "Never" },
  { value: "30", label: "30 days" },
  { value: "90", label: "90 days" },
  { value: "365", label: "365 days" },
];
const overrides = {
  invalid_set: "That set no longer exists. Reload the page and pick another.",
  invalid_expiry: "Pick one of the expiry options in the list.",
  too_many_tokens: "This team already has 20 tokens, the most allowed. Revoke one first.",
};

export function ApiTokens() {
  const { user } = useSession();
  if (!manages(user.current_team.role)) return <p className="text-ink-soft">Only team owners and admins can manage API tokens.</p>;
  return <TokensPage />;
}

function TokensPage() {
  const [tokens, setTokens] = useState<ApiToken[] | Failure | null>(null);
  const [sets, setSets] = useState<SocialSet[]>([]);
  const [name, setName] = useState("");
  const [setId, setSetId] = useState("");
  const [expiry, setExpiry] = useState("");
  // The secret lives only here: never in the URL or storage, and gone on reload.
  const [created, setCreated] = useState<{ name: string; secret: string } | null>(null);
  const [copied, setCopied] = useState(false);
  const [revoking, setRevoking] = useState<string | null>(null);
  const main = useAction();
  const secretRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    listTokens().then(setTokens);
    listSets().then((r) => Array.isArray(r) && setSets(r));
  }, []);
  useEffect(() => {
    if (created) secretRef.current?.select();
  }, [created]);

  function onCreate(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const body = { name, ...(setId && { social_set_id: setId }), ...(expiry && { expires_in_days: Number(expiry) }) };
    main.run("create", () => createToken(body), (r) => {
      setTokens((l) => [r.token, ...(Array.isArray(l) ? l : [])]);
      setCreated({ name: r.token.name, secret: r.secret });
      setCopied(false);
      setName("");
    });
  }

  async function copy() {
    if (!created) return;
    try {
      await navigator.clipboard.writeText(created.secret);
      setCopied(true);
    } catch {
      // Clipboard refused (no permission or insecure context): leave it selected to copy by hand.
      secretRef.current?.select();
    }
  }

  function onRevoke(t: ApiToken) {
    main.run(`revoke:${t.id}`, () => revokeToken(t.id), () => {
      setRevoking(null);
      setTokens((l) => (Array.isArray(l) ? l.filter((x) => x.id !== t.id) : l));
      return `Revoked ${t.name}. It stops working at once.`;
    });
  }

  const scopeName = (id: string | null) => (id ? (sets.find((s) => s.id === id)?.name ?? "One set") : "Whole team");

  return (
    <section aria-labelledby="tokens-heading" className="grid gap-3">
      <h2 id="tokens-heading" className={heading}>
        Tokens
      </h2>
      <p className="text-ink-soft">
        A token lets a server call the SocialReins API for this team. A set token sees only that set&apos;s accounts and posts.
      </p>
      <form onSubmit={onCreate} className="waitlist">
        <label htmlFor="token-name">Token name</label>
        <input
          id="token-name"
          required
          maxLength={60}
          autoComplete="off"
          value={name}
          onChange={(e) => setName(e.target.value)}
          aria-invalid={(main.failedKey === "create" && main.problem === "invalid_name") || undefined}
        />
        <label htmlFor="token-scope">Scope</label>
        <select id="token-scope" value={setId} onChange={(e) => setSetId(e.target.value)}>
          <option value="">Whole team</option>
          {sets.map((s) => (
            <option key={s.id} value={s.id}>
              {s.name}
            </option>
          ))}
        </select>
        <label htmlFor="token-expiry">Expires</label>
        <div className="waitlist-row">
          <select id="token-expiry" value={expiry} onChange={(e) => setExpiry(e.target.value)}>
            {expiries.map((x) => (
              <option key={x.value} value={x.value}>
                {x.label}
              </option>
            ))}
          </select>
          <button type="submit" disabled={main.busy !== null}>
            {main.busy === "create" ? "Creating..." : "Create token"}
          </button>
        </div>
        <p className="waitlist-note">Creating a token needs a sign-in from the last 10 minutes.</p>
      </form>
      <Status problem={main.problem} done={main.done} overrides={overrides} />
      {created && (
        <div role="region" aria-label="New token" className="card grid gap-2 p-4">
          <label htmlFor="token-secret" className="label">
            Secret for {created.name}
          </label>
          <div className="flex gap-2">
            <input ref={secretRef} id="token-secret" readOnly value={created.secret} className="field font-mono text-sm" onFocus={(e) => e.target.select()} />
            <button type="button" className="btn btn-secondary" onClick={copy}>
              {copied ? "Copied" : "Copy"}
            </button>
          </div>
          <p className="font-bold">Copy it now. It won&apos;t be shown again.</p>
          <p className="hint">Try it:</p>
          <pre className="overflow-x-auto rounded-xl bg-ink/5 p-3 text-sm">
            <code>{`curl -H "Authorization: Bearer <token>" ${apiUrl}/v1/me`}</code>
          </pre>
          <button type="button" className={`justify-self-start ${linkButton}`} onClick={() => setCreated(null)}>
            Done, hide the secret
          </button>
        </div>
      )}
      {tokens === null ? (
        <p className="text-ink-soft">Loading tokens...</p>
      ) : isFailure(tokens) ? (
        <p role="alert" className="waitlist-error">
          Tokens couldn&apos;t be loaded. {problemText(tokens)}
        </p>
      ) : tokens.length === 0 ? (
        <p>No API tokens yet.</p>
      ) : (
        <ul className="grid gap-2">
          {tokens.map((t) => (
            <li key={t.id} className="grid gap-1 border-l-4 border-ink bg-paper px-4 py-3">
              <p className="font-bold">{t.name}</p>
              <p className="text-sm text-ink-soft">
                {scopeName(t.social_set_id)}. <code>{t.prefix_hint}...</code>
              </p>
              <p className="text-sm text-ink-soft">
                Created {date(t.created_at)}. Last used {t.last_used_at ? date(t.last_used_at) : "never"}.{" "}
                {t.expires_at ? `Expires ${date(t.expires_at)}.` : "Never expires."}
              </p>
              {revoking === t.id ? (
                <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
                  <p id={`revoke-q-${t.id}`}>Revoke {t.name}? Anything using it stops working at once.</p>
                  <button
                    type="button"
                    autoFocus
                    className={linkButton}
                    aria-describedby={`revoke-q-${t.id}`}
                    disabled={main.busy !== null}
                    onClick={() => onRevoke(t)}
                  >
                    {main.busy === `revoke:${t.id}` ? "Revoking..." : "Yes, revoke"}
                  </button>
                  <button type="button" className={linkButton} disabled={main.busy !== null} onClick={() => setRevoking(null)}>
                    Cancel
                  </button>
                </div>
              ) : (
                <button
                  type="button"
                  className={`justify-self-start ${linkButton}`}
                  disabled={main.busy !== null}
                  aria-label={`Revoke ${t.name}`}
                  onClick={() => setRevoking(t.id)}
                >
                  Revoke
                </button>
              )}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
