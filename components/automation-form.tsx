"use client";

import { useState, type FormEvent, type ReactNode } from "react";
import type { Failure } from "@/lib/auth";
import {
  createAutomation,
  postLink,
  postUri,
  sample,
  templateLength,
  updateAutomation,
  type Automation,
  type AutomationInput,
} from "@/lib/automations";
import type { Connection } from "@/lib/connections";
import { MAX_DM, MAX_PUBLIC } from "@/lib/inbox";
import type { SocialSet } from "@/lib/sets";
import { accountName, Avatar } from "@/components/connections";
import { KeywordsField, ScopeField, scopeBody, scopeOf } from "@/components/scope-fields";
import { Status, useAction } from "@/components/team-ui";

export const automationMessages: Partial<Record<Failure, ReactNode>> = {
  invalid_conditions: "One of the accounts, the set or a post link is no longer valid, or a keyword is too long. Check them and try again.",
  invalid_actions: "Add a DM text.",
  invalid_text: "A text is too long. DMs take 1000 characters and public replies 300, with {name} counted as 64.",
  invalid_fallback: "The public reply is too long for a fallback: 300 characters, with {name} counted as 64.",
  invalid_trigger: "That trigger isn't supported.",
  too_many_automations: "This team already has 50 automations, the most allowed. Delete one first.",
  forbidden: "Only team owners and admins can change automations.",
  not_found: "This automation no longer exists.",
};

function Counter({ id, n, max }: { id: string; n: number; max: number }) {
  return (
    <span id={id} className={`hint ${n > max ? "font-bold text-signal-deep" : ""}`}>
      {n} of {max} characters
    </span>
  );
}

// The comment-to-DM form over brain's general automation shape: one send_dm action, plus a
// public reply that either always goes or only stands in for a DM that couldn't be delivered.
export function AutomationForm({
  automation: a,
  accounts,
  sets,
  onSaved,
  onCancel,
}: {
  automation?: Automation;
  accounts: Connection[];
  sets: SocialSet[];
  onSaved: (a: Automation) => void;
  onCancel?: () => void;
}) {
  const c = a?.conditions;
  const publicAction = a?.actions.find((x) => x.type === "reply_publicly");
  const [name, setName] = useState(a?.name ?? "");
  const [scope, setScope] = useState(scopeOf(c ?? { account_ids: [] }));
  const [keywords, setKeywords] = useState<string[]>(c?.keywords ?? []);
  const [specific, setSpecific] = useState(Boolean(c?.post_remote_ids.length));
  const [posts, setPosts] = useState((c?.post_remote_ids ?? []).map(postLink).join("\n"));
  const [dm, setDm] = useState(a?.actions.find((x) => x.type === "send_dm")?.text ?? "");
  // shortcut: an automation made over the API with both a public reply and a fallback shows the reply; saving here drops the fallback.
  const [publicText, setPublicText] = useState(publicAction?.text ?? a?.fallback_public_reply ?? "");
  const [fallback, setFallback] = useState(!publicAction && Boolean(a?.fallback_public_reply));
  const [first, setFirst] = useState(c?.first_per_author ?? false);
  const [active, setActive] = useState(a?.active ?? true);
  const [badLinks, setBadLinks] = useState<string[]>([]);
  const { busy, problem, done, run } = useAction();

  const lines = posts.split("\n").map((l) => l.trim()).filter(Boolean);
  const dmCount = templateLength(dm);
  const publicCount = templateLength(publicText);
  const account = accounts.find((x) => scope.mode !== "accounts" || scope.accountIds.includes(x.id));

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const uris = specific ? lines.map((l) => postUri(l, accounts)) : [];
    const bad = specific ? lines.filter((_, i) => !uris[i]) : [];
    setBadLinks(bad);
    if (bad.length || (specific && !lines.length)) {
      document.getElementById("automation-posts")?.focus();
      return;
    }
    const reply = publicText.trim();
    const input: AutomationInput = {
      name,
      trigger: "comment_received",
      conditions: { ...scopeBody(scope), post_remote_ids: uris as string[], keywords, first_per_author: first },
      actions: [{ type: "send_dm", text: dm }, ...(reply && !fallback ? [{ type: "reply_publicly" as const, text: reply }] : [])],
      active,
      fallback_public_reply: reply && fallback ? reply : null,
    };
    await run("save", () => (a ? updateAutomation(a.id, input) : createAutomation(input)), (saved) => {
      onSaved(saved);
      return a ? "Automation saved." : undefined;
    });
  }

  return (
    <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_18rem] lg:items-start">
      <form onSubmit={onSubmit} className="grid gap-6" aria-labelledby="automation-form-title">
        <h2 id="automation-form-title" className="sr-only">
          {a ? `Edit ${a.name}` : "New comment-to-DM automation"}
        </h2>
        <div className="grid gap-1.5">
          <label htmlFor="automation-name" className="label">
            Name
          </label>
          <input
            id="automation-name"
            required
            maxLength={60}
            className="field"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Price question to DM"
            aria-invalid={problem === "invalid_name" || undefined}
          />
        </div>

        <fieldset className="card grid gap-5 p-5">
          <legend className="px-1 font-display text-lg font-extrabold tracking-tight">When someone comments</legend>
          <ScopeField id="automation-scope" value={scope} onChange={setScope} accounts={accounts} sets={sets} />
          <KeywordsField
            id="automation-keywords"
            label="Comment contains"
            hint="Any of these words, in any case. Leave empty to act on every comment. Press Enter or a comma after each one."
            value={keywords}
            onChange={setKeywords}
          />
          <fieldset className="grid gap-2">
            <legend className="label mb-1">On</legend>
            <div className="flex flex-wrap gap-x-5 gap-y-1">
              <label className="flex items-center gap-2">
                <input type="radio" name="automation-posts-mode" checked={!specific} onChange={() => setSpecific(false)} />
                Any post
              </label>
              <label className="flex items-center gap-2">
                <input type="radio" name="automation-posts-mode" checked={specific} onChange={() => setSpecific(true)} />
                Specific posts
              </label>
            </div>
            {specific && (
              <div className="grid gap-1.5">
                <label htmlFor="automation-posts" className="label">
                  Post links
                </label>
                <textarea
                  id="automation-posts"
                  rows={3}
                  required
                  className="field resize-y font-normal"
                  value={posts}
                  onChange={(e) => setPosts(e.target.value)}
                  placeholder="https://bsky.app/profile/you.bsky.social/post/3l..."
                  aria-describedby="automation-posts-hint automation-posts-error"
                  aria-invalid={badLinks.length > 0 || undefined}
                />
                <p id="automation-posts-hint" className="hint">
                  One Bluesky post link per line, from a connected account.
                </p>
                {badLinks.length > 0 && (
                  <p id="automation-posts-error" role="alert" className="waitlist-error">
                    {badLinks.length === 1 ? "This link isn't" : "These links aren't"} a post of a connected Bluesky account: {badLinks.join(", ")}
                  </p>
                )}
              </div>
            )}
          </fieldset>
          <label className="flex items-center gap-2">
            <input type="checkbox" checked={first} onChange={(e) => setFirst(e.target.checked)} />
            First comment per person only
          </label>
        </fieldset>

        <fieldset className="card grid gap-5 p-5">
          <legend className="px-1 font-display text-lg font-extrabold tracking-tight">Then</legend>
          <div className="grid gap-1.5">
            <label htmlFor="automation-dm" className="label">
              DM text
            </label>
            <textarea
              id="automation-dm"
              required
              rows={4}
              className="field resize-y"
              value={dm}
              onChange={(e) => setDm(e.target.value)}
              placeholder="Hi {name}, here is the link you asked for: ..."
              aria-describedby="automation-dm-hint automation-dm-count"
              aria-invalid={dmCount > MAX_DM || undefined}
            />
            <p className="flex flex-wrap justify-between gap-2">
              <span id="automation-dm-hint" className="hint">
                Type {"{name}"} for the commenter&apos;s display name (or &quot;there&quot; when it has links or symbols). It counts as 64 characters.
              </span>
              <Counter id="automation-dm-count" n={dmCount} max={MAX_DM} />
            </p>
          </div>
          <div className="grid gap-1.5">
            <label htmlFor="automation-public" className="label">
              Public reply <span className="font-normal text-ink-soft">(optional)</span>
            </label>
            <textarea
              id="automation-public"
              rows={2}
              className="field resize-y"
              value={publicText}
              onChange={(e) => setPublicText(e.target.value)}
              placeholder="Sent you a DM, {name}!"
              aria-describedby="automation-public-count"
              aria-invalid={publicCount > MAX_PUBLIC || undefined}
            />
            <p className="flex justify-end">
              <Counter id="automation-public-count" n={publicCount} max={MAX_PUBLIC} />
            </p>
          </div>
          <div className="grid gap-1">
            <label className="flex items-center gap-2">
              <input
                type="checkbox"
                checked={fallback}
                disabled={!publicText.trim()}
                onChange={(e) => setFallback(e.target.checked)}
                aria-describedby="automation-fallback-hint"
              />
              If the DM can&apos;t be delivered, reply publicly instead
            </label>
            <p id="automation-fallback-hint" className="hint pl-6">
              {publicText.trim()
                ? fallback
                  ? "The public reply goes only when Bluesky refuses the DM. Many people accept DMs only from accounts they follow."
                  : "Unticked, the public reply goes with every DM."
                : "Write a public reply first."}
            </p>
          </div>
        </fieldset>

        <label className="flex items-center gap-2">
          <input type="checkbox" checked={active} onChange={(e) => setActive(e.target.checked)} />
          On: act on comments from now on
        </label>
        <Status problem={problem} done={done} overrides={automationMessages} />
        <div className="flex flex-wrap gap-2">
          <button type="submit" className="btn btn-primary" disabled={busy !== null}>
            {busy ? "Saving..." : a ? "Save automation" : "Create automation"}
          </button>
          {onCancel && (
            <button type="button" className="btn btn-quiet" disabled={busy !== null} onClick={onCancel}>
              Cancel
            </button>
          )}
        </div>
      </form>

      <section aria-labelledby="dm-preview-heading" className="grid gap-3 lg:sticky lg:top-10">
        <h2 id="dm-preview-heading" className="font-display text-lg font-extrabold tracking-tight">
          DM preview
        </h2>
        <div className="card grid gap-3 p-4">
          <p className="flex items-center gap-2 border-b border-ink/10 pb-3 text-sm">
            {account ? <Avatar connection={account} size="size-7" /> : <span aria-hidden="true" className="size-7 rounded-full bg-ink/10" />}
            <strong className="truncate">{account ? accountName(account) : "Your Bluesky account"}</strong>
            <span className="text-ink-soft">to Sam</span>
          </p>
          {dm.trim() ? (
            <p className="justify-self-end whitespace-pre-wrap break-words rounded-2xl rounded-br-md bg-[#1185FE] px-3.5 py-2.5 text-[0.95rem] leading-snug text-paper">
              {sample(dm)}
            </p>
          ) : (
            <p className="text-sm text-ink-soft">Your DM shows here as you write, for a commenter called Sam.</p>
          )}
          {publicText.trim() && (
            <p className="text-sm text-ink-soft">
              {fallback ? "If the DM can't go, replies under the comment:" : "Also replies under the comment:"}{" "}
              <span className="text-ink">{sample(publicText)}</span>
            </p>
          )}
        </div>
      </section>
    </div>
  );
}
