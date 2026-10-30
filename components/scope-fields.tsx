"use client";

import { useState, type KeyboardEvent } from "react";
import type { Connection } from "@/lib/connections";
import type { SocialSet } from "@/lib/sets";
import { accountName, Avatar } from "@/components/connections";
import { Icon } from "@/components/ui";

// Which accounts an inbox or automation covers: every account, one set, or picked accounts.
export type Scope = { mode: "all" | "set" | "accounts"; setId: string; accountIds: string[] };

export const scopeOf = (c: { social_set_id?: string | null; account_ids: string[] }): Scope => ({
  mode: c.social_set_id ? "set" : c.account_ids.length ? "accounts" : "all",
  setId: c.social_set_id ?? "",
  accountIds: c.account_ids,
});

// brain takes at most one of the two; picking no account means every account.
export const scopeBody = (s: Scope) => ({
  social_set_id: s.mode === "set" && s.setId ? s.setId : null,
  account_ids: s.mode === "accounts" ? s.accountIds : [],
});

export function scopeSummary(c: { social_set_id?: string | null; account_ids: string[] }, accounts: Connection[], sets: SocialSet[]) {
  if (c.social_set_id) return `Set: ${sets.find((s) => s.id === c.social_set_id)?.name ?? "a deleted set"}`;
  if (!c.account_ids.length) return "All accounts";
  return c.account_ids.map((id) => accounts.find((a) => a.id === id)).map((a) => (a ? accountName(a) : "a removed account")).join(", ");
}

export function ScopeField({
  id,
  value,
  onChange,
  accounts,
  sets,
}: {
  id: string;
  value: Scope;
  onChange: (s: Scope) => void;
  accounts: Connection[];
  sets: SocialSet[];
}) {
  const option = (mode: Scope["mode"], label: string) => (
    <label className="flex items-center gap-2">
      <input type="radio" name={`${id}-mode`} checked={value.mode === mode} onChange={() => onChange({ ...value, mode })} />
      {label}
    </label>
  );
  return (
    <fieldset className="grid gap-2">
      <legend className="label mb-1">Accounts</legend>
      <div className="flex flex-wrap gap-x-5 gap-y-1">
        {option("all", "All accounts")}
        {sets.length > 0 && option("set", "A set")}
        {accounts.length > 0 && option("accounts", "Pick accounts")}
      </div>
      {value.mode === "set" && (
        <label className="grid gap-1.5">
          <span className="sr-only">Set</span>
          <select required className="field" value={value.setId} onChange={(e) => onChange({ ...value, setId: e.target.value })}>
            <option value="">Pick a set</option>
            {sets.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
        </label>
      )}
      {value.mode === "accounts" && (
        <ul className="grid gap-1 sm:grid-cols-2" aria-label="Accounts to include">
          {accounts.map((a) => (
            <li key={a.id}>
              <label className="flex items-center gap-2 rounded-xl px-2 py-1.5 hover:bg-ink/5">
                <input
                  type="checkbox"
                  checked={value.accountIds.includes(a.id)}
                  onChange={(e) =>
                    onChange({
                      ...value,
                      accountIds: e.target.checked ? [...value.accountIds, a.id] : value.accountIds.filter((x) => x !== a.id),
                    })
                  }
                />
                <Avatar connection={a} size="size-6" />
                <span className="truncate">{accountName(a)}</span>
              </label>
            </li>
          ))}
        </ul>
      )}
    </fieldset>
  );
}

// Keywords as removable chips: Enter or a comma adds one, Backspace in an empty field removes the last.
export function KeywordsField({
  id,
  label,
  hint,
  value,
  onChange,
}: {
  id: string;
  label: string;
  hint: string;
  value: string[];
  onChange: (k: string[]) => void;
}) {
  const [draft, setDraft] = useState("");
  const add = () => {
    // A pasted "price, link" becomes two.
    const next = [...value];
    for (const raw of draft.split(",")) {
      const k = raw.trim().slice(0, 100);
      if (k && !next.some((v) => v.toLowerCase() === k.toLowerCase()) && next.length < 20) next.push(k);
    }
    if (next.length !== value.length) onChange(next);
    setDraft("");
  };
  function onKey(e: KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Enter" || e.key === ",") {
      e.preventDefault();
      add();
    } else if (e.key === "Backspace" && !draft && value.length) onChange(value.slice(0, -1));
  }
  return (
    <div className="grid gap-1.5">
      <label htmlFor={id} className="label">
        {label}
      </label>
      <div className="field flex flex-wrap items-center gap-1.5 focus-within:border-ink">
        {value.length > 0 && (
          <ul aria-label={label} className="contents">
            {value.map((k) => (
              <li key={k} className="badge tone gap-1 pr-1 text-ink">
                {k}
                <button
                  type="button"
                  aria-label={`Remove ${k}`}
                  className="grid size-5 place-items-center rounded-full hover:bg-ink/10"
                  onClick={() => onChange(value.filter((v) => v !== k))}
                >
                  <Icon name="close" className="size-3" />
                </button>
              </li>
            ))}
          </ul>
        )}
        <input
          id={id}
          value={draft}
                    onChange={(e) => setDraft(e.target.value)}
          onKeyDown={onKey}
          onBlur={add}
          aria-describedby={`${id}-hint`}
          className="min-w-32 flex-1 bg-transparent py-0.5 outline-none"
        />
      </div>
      <p id={`${id}-hint`} className="hint">
        {hint}
      </p>
    </div>
  );
}
