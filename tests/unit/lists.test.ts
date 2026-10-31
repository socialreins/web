import { afterEach, describe, expect, it, vi } from "vitest";
import {
  addToList,
  createList,
  deleteList,
  fitsList,
  getList,
  listLists,
  moved,
  partLabel,
  removeFromList,
  renameList,
  reorderList,
} from "@/lib/lists";
import { apiUrl } from "@/lib/waitlist";

const reply = (status: number, body?: unknown) =>
  vi.fn(async () => (body === undefined ? new Response(null, { status }) : Response.json(body, { status })));
const call = (fetch: ReturnType<typeof vi.fn>) => fetch.mock.calls[0] as unknown as [string, RequestInit];

afterEach(() => vi.unstubAllGlobals());

describe("list requests", () => {
  it.each([
    ["listLists", () => listLists(), "/v1/lists", "GET"],
    ["getList", () => getList("l/1"), "/v1/lists/l%2F1", "GET"],
    ["deleteList", () => deleteList("l1"), "/v1/lists/l1", "DELETE"],
    ["removeFromList", () => removeFromList("l1", "p1"), "/v1/lists/l1/posts/p1", "DELETE"],
  ] as const)("%s calls brain without a body", async (_, run, path, method) => {
    const fetch = reply(200, {});
    vi.stubGlobal("fetch", fetch);
    await run();
    const [url, init] = call(fetch);
    expect(url).toBe(`${apiUrl}${path}`);
    expect(init).toMatchObject({ method, credentials: "include" });
    expect(init.body).toBeUndefined();
  });

  it.each([
    ["createList team-wide", () => createList("Series", null), "/v1/lists", "POST", { name: "Series", social_set_id: null }],
    ["createList in a set", () => createList("Series", "s1"), "/v1/lists", "POST", { name: "Series", social_set_id: "s1" }],
    ["renameList", () => renameList("l1", "Tips"), "/v1/lists/l1", "PATCH", { name: "Tips" }],
    ["addToList", () => addToList("l1", "p1"), "/v1/lists/l1/posts", "POST", { post_id: "p1" }],
    ["reorderList", () => reorderList("l1", ["p2", "p1"]), "/v1/lists/l1/order", "PUT", { post_ids: ["p2", "p1"] }],
  ] as const)("%s sends JSON", async (_, run, path, method, body) => {
    const fetch = reply(200, {});
    vi.stubGlobal("fetch", fetch);
    await run();
    const [url, init] = call(fetch);
    expect(url).toBe(`${apiUrl}${path}`);
    expect(init).toMatchObject({ method, credentials: "include" });
    expect(JSON.parse(init.body as string)).toEqual(body);
  });

  it("maps brain's list error codes", async () => {
    vi.stubGlobal("fetch", reply(422, { error: "invalid_order" }));
    expect(await reorderList("l1", [])).toBe("invalid_order");
    vi.stubGlobal("fetch", reply(422, { error: "invalid_post" }));
    expect(await addToList("l1", "p1")).toBe("invalid_post");
    vi.stubGlobal("fetch", reply(204));
    expect(await deleteList("l1")).toBe("ok");
  });
});

describe("list helpers", () => {
  it("moves a post up or down one place", () => {
    expect(moved(["a", "b", "c"], 1, -1)).toEqual(["b", "a", "c"]);
    expect(moved(["a", "b", "c"], 1, 1)).toEqual(["a", "c", "b"]);
  });

  it("leaves the order alone at either end", () => {
    const ids = ["a", "b"];
    expect(moved(ids, 0, -1)).toBe(ids);
    expect(moved(ids, 1, 1)).toBe(ids);
  });

  it("fits a post into a team-wide list or its own set's", () => {
    expect(fitsList({ social_set_id: null }, "s1")).toBe(true);
    expect(fitsList({ social_set_id: "s1" }, "s1")).toBe(true);
    expect(fitsList({ social_set_id: "s2" }, "s1")).toBe(false);
  });

  it("labels a post's place", () => {
    expect(partLabel({ name: "Series", position: 2 })).toBe("Part 2 · Series");
  });
});
