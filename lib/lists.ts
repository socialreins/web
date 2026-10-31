import { api } from "@/lib/auth";
import type { Post } from "@/lib/posts";

export type PostList = {
  id: string;
  // null for a team-wide list.
  social_set_id: string | null;
  name: string;
  created_at: string;
  updated_at: string;
};
// position is 1-based: the post is "Part N" of the list.
export type ListItem = { post_id: string; position: number; post: Post };
export type ListDetail = PostList & { items: ListItem[] };

const enc = encodeURIComponent;

export const listLists = () => api<PostList[]>("/v1/lists");
export const getList = (id: string) => api<ListDetail>(`/v1/lists/${enc(id)}`);
export const createList = (name: string, socialSetId: string | null) =>
  api<ListDetail>("/v1/lists", "POST", { name, social_set_id: socialSetId });
export const renameList = (id: string, name: string) => api<ListDetail>(`/v1/lists/${enc(id)}`, "PATCH", { name });
export const deleteList = (id: string) => api(`/v1/lists/${enc(id)}`, "DELETE");
// Appends; a post already in the list moves to the end.
export const addToList = (id: string, postId: string) => api<ListDetail>(`/v1/lists/${enc(id)}/posts`, "POST", { post_id: postId });
export const removeFromList = (id: string, postId: string) => api(`/v1/lists/${enc(id)}/posts/${enc(postId)}`, "DELETE");
// Every post of the list, each once, in the new order.
export const reorderList = (id: string, postIds: string[]) => api<ListDetail>(`/v1/lists/${enc(id)}/order`, "PUT", { post_ids: postIds });

// The ids with the one at `from` swapped with its neighbour `by` (-1 up, 1 down); unchanged at an end.
export function moved(ids: string[], from: number, by: -1 | 1): string[] {
  const to = from + by;
  if (from < 0 || from >= ids.length || to < 0 || to >= ids.length) return ids;
  const next = [...ids];
  [next[from], next[to]] = [next[to]!, next[from]!];
  return next;
}

// A set-tied list holds only its set's posts; a team-wide one any set's.
export const fitsList = (list: Pick<PostList, "social_set_id">, setId: string) =>
  list.social_set_id === null || list.social_set_id === setId;

export const partLabel = (l: { name: string; position: number }) => `Part ${l.position} · ${l.name}`;
