"use client";

import { useEffect, useRef, useState, type FormEvent, type ReactNode } from "react";
import { flushSync } from "react-dom";
import Link from "next/link";
import type { Failure } from "@/lib/auth";
import {
  addToList,
  createList,
  deleteList,
  fitsList,
  getList,
  listLists,
  moved,
  removeFromList,
  renameList,
  reorderList,
  type ListDetail,
  type PostList,
} from "@/lib/lists";
import { listPosts, type Post } from "@/lib/posts";
import { listSets, type SocialSet } from "@/lib/sets";
import { snippet, StatusBadge } from "@/components/posts";
import { isFailure, linkButton, problemText, Status, useAction } from "@/components/team-ui";
import { Icon } from "@/components/ui";

const heading = "font-display text-xl font-extrabold tracking-tight";
const when = (iso: string) => new Date(iso).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" });

export const listMessages: Partial<Record<Failure, ReactNode>> = {
  invalid_set: "That set no longer exists, or the post is in another set than the list.",
  invalid_post: "That post can't go in a list. Reload to see the latest.",
  invalid_order: "The list changed elsewhere, so it was reloaded. Try the move again.",
  not_found: "That list is no longer there. Reload the page to see the latest.",
};

const setLabel = (l: Pick<PostList, "social_set_id">, sets: SocialSet[]) =>
  l.social_set_id === null ? "All sets" : (sets.find((s) => s.id === l.social_set_id)?.name ?? "A deleted set");

function useSets() {
  const [sets, setSets] = useState<SocialSet[]>([]);
  useEffect(() => {
    listSets().then((r) => Array.isArray(r) && setSets(r));
  }, []);
  return sets;
}

export function Lists() {
  const [lists, setLists] = useState<PostList[] | Failure | null>(null);
  const sets = useSets();
  const [name, setName] = useState("");
  const [setId, setSetId] = useState("");
  const [open, setOpen] = useState<{ kind: "rename" | "delete"; id: string } | null>(null);
  const [newName, setNewName] = useState("");
  const { busy, problem, failedKey, done, run } = useAction();
  const openRef = useRef<HTMLInputElement | HTMLButtonElement | null>(null);
  const buttons = useRef(new Map<string, HTMLButtonElement>());
  const links = useRef(new Map<string, HTMLAnchorElement>());
  const nameRef = useRef<HTMLInputElement>(null);
  // Rename and delete are announced here rather than in Status, which would take focus.
  const [note, setNote] = useState("");

  useEffect(() => {
    listLists().then(setLists);
  }, []);

  function show(kind: "rename" | "delete", l: PostList) {
    flushSync(() => {
      setOpen({ kind, id: l.id });
      setNewName(l.name);
    });
    openRef.current?.focus();
  }

  function close(key: string) {
    flushSync(() => setOpen(null));
    buttons.current.get(key)?.focus();
  }

  const replace = (l: PostList) => setLists((ls) => (Array.isArray(ls) ? ls.map((x) => (x.id === l.id ? l : x)) : ls));

  function onCreate(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    run("create", () => createList(name, setId || null), (l) => {
      setLists((ls) => (Array.isArray(ls) ? [...ls, l] : [l]));
      setName("");
      return `Created ${l.name}.`;
    });
  }

  async function onRename(e: FormEvent<HTMLFormElement>, l: PostList) {
    e.preventDefault();
    const ok = await run("rename", () => renameList(l.id, newName), (r) => {
      flushSync(() => {
        replace(r);
        setOpen(null);
      });
      setNote(`Renamed to ${r.name}.`);
    });
    if (ok) buttons.current.get(`rename:${l.id}`)?.focus();
    else openRef.current?.focus();
  }

  async function onDelete(l: PostList) {
    const all = Array.isArray(lists) ? lists : [];
    const next = all[all.findIndex((x) => x.id === l.id) + 1];
    const ok = await run("delete", () => deleteList(l.id), () => {
      flushSync(() => {
        setLists((ls) => (Array.isArray(ls) ? ls.filter((x) => x.id !== l.id) : ls));
        setOpen(null);
      });
      setNote(`Deleted ${l.name}. Its posts stay.`);
    });
    if (ok) (next ? links.current.get(next.id) : nameRef.current)?.focus();
    else openRef.current?.focus();
  }

  const keep = (key: string) => (el: HTMLButtonElement | null) => {
    if (el) buttons.current.set(key, el);
    else buttons.current.delete(key);
  };
  const focusOpen = (el: HTMLInputElement | HTMLButtonElement | null) => {
    openRef.current = el;
  };

  return (
    <section aria-labelledby="lists-heading" className="grid gap-4">
      <h2 id="lists-heading" className="sr-only">
        Your lists
      </h2>
      <p className="text-ink-soft">A list puts posts in order, such as a series. Each post shows as Part 1, Part 2 and so on.</p>
      <form onSubmit={onCreate} className="card flex flex-wrap items-end gap-3 p-5">
        <label className="grid min-w-0 flex-1 basis-56 gap-1.5">
          <span className="label">New list name</span>
          <input
            ref={nameRef}
            className="field"
            required
            maxLength={60}
            value={name}
            onChange={(e) => setName(e.target.value)}
            aria-invalid={(failedKey === "create" && problem === "invalid_name") || undefined}
          />
        </label>
        <label className="grid gap-1.5">
          <span className="label">Set</span>
          <select className="field w-auto" value={setId} onChange={(e) => setSetId(e.target.value)}>
            <option value="">All sets</option>
            {sets.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
        </label>
        <button type="submit" className="btn btn-primary" disabled={busy !== null}>
          <Icon name="plus" className="size-4" />
          {busy === "create" ? "Creating..." : "Create list"}
        </button>
      </form>
      <Status problem={problem} done={done} overrides={listMessages} />
      <p role="status" className="sr-only">
        {note}
      </p>
      {lists === null ? (
        <div role="status" className="h-40 rounded-2xl bg-ink/5 motion-safe:animate-pulse">
          <span className="sr-only">Loading lists...</span>
        </div>
      ) : isFailure(lists) ? (
        <p role="alert" className="waitlist-error">
          Lists couldn&apos;t be loaded. {problemText(lists, listMessages)}
        </p>
      ) : lists.length === 0 ? (
        <p className="card p-5 text-ink-soft">No lists yet. Create one above, then add posts to it.</p>
      ) : (
        <ul className="grid gap-3">
          {lists.map((l) => (
            <li key={l.id} className="card flex flex-wrap items-start gap-4 p-5">
              <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-ink/5 text-ink-soft">
                <Icon name="lists" />
              </span>
              <div className="grid min-w-0 flex-1 basis-64 gap-2">
                <div>
                  <Link
                    ref={(el) => {
                      if (el) links.current.set(l.id, el);
                      else links.current.delete(l.id);
                    }}
                    href={`/app/lists/${l.id}`}
                    className="font-bold hover:underline">
                    {l.name}
                  </Link>
                  <p className="text-sm text-ink-soft">{setLabel(l, sets)}</p>
                </div>
                {open?.kind === "rename" && open.id === l.id ? (
                  <form className="flex flex-wrap items-end gap-3" onSubmit={(e) => onRename(e, l)}>
                    <label className="grid gap-1 text-sm font-bold">
                      New name for {l.name}
                      <input ref={focusOpen} required maxLength={60} value={newName} onChange={(e) => setNewName(e.target.value)} className="field font-normal" />
                    </label>
                    <button type="submit" className={linkButton} disabled={busy !== null}>
                      {busy === "rename" ? "Saving..." : "Save name"}
                    </button>
                    <button type="button" className={linkButton} disabled={busy !== null} onClick={() => close(`rename:${l.id}`)}>
                      Cancel
                    </button>
                  </form>
                ) : open?.kind === "delete" && open.id === l.id ? (
                  <div className="grid gap-2">
                    <p id={`delete-q-${l.id}`}>Delete {l.name}? Its posts stay, only the list goes.</p>
                    <div className="flex flex-wrap gap-x-4 gap-y-2">
                      <button ref={focusOpen} type="button" className={linkButton} aria-describedby={`delete-q-${l.id}`} disabled={busy !== null} onClick={() => onDelete(l)}>
                        {busy === "delete" ? "Deleting..." : "Yes, delete"}
                      </button>
                      <button type="button" className={linkButton} disabled={busy !== null} onClick={() => close(`delete:${l.id}`)}>
                        Cancel
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="flex flex-wrap gap-x-4 gap-y-2">
                    <button ref={keep(`rename:${l.id}`)} type="button" className={linkButton} disabled={busy !== null} aria-label={`Rename ${l.name}`} onClick={() => show("rename", l)}>
                      Rename
                    </button>
                    <button ref={keep(`delete:${l.id}`)} type="button" className={linkButton} disabled={busy !== null} aria-label={`Delete ${l.name}`} onClick={() => show("delete", l)}>
                      Delete
                    </button>
                  </div>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

export function ListView({ id }: { id: string }) {
  const [list, setList] = useState<ListDetail | Failure | null>(null);
  const [posts, setPosts] = useState<Post[]>([]);
  const [adding, setAdding] = useState("");
  // Moves and removals are announced here rather than in Status, which would take focus.
  const [note, setNote] = useState("");
  const sets = useSets();
  const { busy, problem, done, run } = useAction();
  const buttons = useRef(new Map<string, HTMLButtonElement>());
  const addRef = useRef<HTMLSelectElement>(null);
  const setId = list && !isFailure(list) ? list.social_set_id : undefined;

  useEffect(() => {
    getList(id).then(setList);
  }, [id]);

  useEffect(() => {
    if (setId === undefined) return;
    listPosts(setId ? { social_set_id: setId } : {}).then((r) => Array.isArray(r) && setPosts(r));
  }, [setId]);

  if (list === null) return <div role="status" className="h-64 rounded-2xl bg-ink/5 motion-safe:animate-pulse"><span className="sr-only">Loading the list...</span></div>;
  if (isFailure(list))
    return (
      <p role="alert" className="waitlist-error">
        This list couldn&apos;t be loaded. {problemText(list, listMessages)}
      </p>
    );

  const l = list;
  const ids = l.items.map((i) => i.post_id);
  const addable = posts.filter((p) => p.status !== "deleted" && fitsList(l, p.social_set_id) && !ids.includes(p.id));

  // Keeps focus on the moved post's button, or its other move button once it reaches an end.
  async function move(from: number, by: -1 | 1) {
    const postId = ids[from]!;
    const call = async () => {
      const r = await reorderList(l.id, moved(ids, from, by));
      if (r === "invalid_order") getList(l.id).then((x) => !isFailure(x) && setList(x));
      return r;
    };
    const ok = await run("move", call, (r) => {
      flushSync(() => setList(r));
      setNote(`Moved to Part ${r.items.findIndex((i) => i.post_id === postId) + 1}.`);
    });
    if (!ok) return;
    const same = buttons.current.get(`${by}:${postId}`);
    (same && !same.disabled ? same : buttons.current.get(`${-by}:${postId}`))?.focus();
  }

  // Focus goes to the next post's Remove, else the previous one's, else Add post.
  async function remove(at: number) {
    const postId = ids[at]!;
    const after = ids[at + 1] ?? ids[at - 1];
    const ok = await run("remove", () => removeFromList(l.id, postId), () => {
      flushSync(() => setList({ ...l, items: l.items.filter((i) => i.post_id !== postId).map((i, n) => ({ ...i, position: n + 1 })) }));
      setNote("Removed from the list. The post stays.");
    });
    if (ok) (after ? buttons.current.get(`remove:${after}`) : addRef.current)?.focus();
  }

  function onAdd(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!adding) return;
    run("add", () => addToList(l.id, adding), (r) => {
      setList(r);
      setAdding("");
      return `Added as Part ${r.items.length}.`;
    });
  }

  const keep = (key: string) => (el: HTMLButtonElement | null) => {
    if (el) buttons.current.set(key, el);
    else buttons.current.delete(key);
  };

  return (
    <div className="grid gap-6">
      <section aria-labelledby="list-heading" className="grid gap-4">
        <div>
          <h2 id="list-heading" className={heading}>
            {l.name}
          </h2>
          <p className="text-sm text-ink-soft">{setLabel(l, sets)}</p>
        </div>
        <Status problem={problem} done={done} overrides={listMessages} />
        <p role="status" className="sr-only">
          {note}
        </p>
        {l.items.length === 0 ? (
          <p className="card p-5 text-ink-soft">No posts in this list yet. Add one below.</p>
        ) : (
          <ol aria-label={`Posts in ${l.name}`} className="card divide-y divide-ink/10">
            {l.items.map((item, i) => {
              const p = item.post;
              const name = `Part ${item.position}`;
              return (
                <li key={item.post_id} className="flex flex-wrap items-center gap-3 p-4">
                  <strong className="w-16 shrink-0">{name}</strong>
                  <div className="grid min-w-0 flex-1 basis-48 gap-1">
                    <Link href={`/app/posts/${p.id}`} className="truncate hover:underline">
                      {snippet(p)}
                    </Link>
                    <p className="flex flex-wrap items-center gap-2 text-sm text-ink-soft">
                      <StatusBadge status={p.status} />
                      {p.scheduled_at ? when(p.scheduled_at) : "Not scheduled"}
                    </p>
                  </div>
                  <div className="flex items-center gap-1">
                    <button ref={keep(`-1:${p.id}`)} type="button" className="btn btn-quiet btn-sm" aria-label={`Move ${name} up`} disabled={busy !== null || i === 0} onClick={() => move(i, -1)}>
                      Move up
                    </button>
                    <button
                      ref={keep(`1:${p.id}`)}
                      type="button"
                      className="btn btn-quiet btn-sm"
                      aria-label={`Move ${name} down`}
                      disabled={busy !== null || i === l.items.length - 1}
                      onClick={() => move(i, 1)}
                    >
                      Move down
                    </button>
                    <button
                      ref={keep(`remove:${p.id}`)}
                      type="button"
                      className="btn btn-quiet btn-danger btn-sm"
                      aria-label={`Remove ${name} from the list`}
                      disabled={busy !== null}
                      onClick={() => remove(i)}
                    >
                      Remove
                    </button>
                  </div>
                </li>
              );
            })}
          </ol>
        )}
      </section>
      <form onSubmit={onAdd} className="card flex flex-wrap items-end gap-3 p-5">
        <label className="grid min-w-0 flex-1 basis-56 gap-1.5">
          <span className="label">Add post</span>
          <select ref={addRef} className="field" value={adding} onChange={(e) => setAdding(e.target.value)}>
            <option value="">{addable.length ? "Pick a post" : "No other posts to add"}</option>
            {addable.map((p) => (
              <option key={p.id} value={p.id}>
                {snippet(p)}
              </option>
            ))}
          </select>
        </label>
        <button type="submit" className="btn btn-primary" disabled={busy !== null || !adding}>
          <Icon name="plus" className="size-4" />
          {busy === "add" ? "Adding..." : "Add to list"}
        </button>
      </form>
    </div>
  );
}
