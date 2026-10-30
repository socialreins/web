import { afterEach, describe, expect, it, vi } from "vitest";
import { listItems, mergeFresh, relativeTime, replyToItem, setItemState, type Item } from "@/lib/inbox";
import { apiUrl } from "@/lib/waitlist";

const call = (fetch: ReturnType<typeof vi.fn>) => fetch.mock.calls[0] as unknown as [string, RequestInit];

afterEach(() => vi.unstubAllGlobals());

describe("inbox requests", () => {
  it("pages items by state and cursor", async () => {
    const fetch = vi.fn(async () => Response.json({ items: [], next_cursor: null }));
    vi.stubGlobal("fetch", fetch);
    await listItems("i 1", "done", "c9");
    expect(call(fetch)[0]).toBe(`${apiUrl}/v1/inboxes/i%201/items?state=done&cursor=c9`);
  });

  it("patches the state", async () => {
    const fetch = vi.fn(async () => Response.json({ id: "p1", state: "done" }));
    vi.stubGlobal("fetch", fetch);
    expect(await setItemState("p1", "done")).toEqual({ id: "p1", state: "done" });
    expect(call(fetch)[1]).toMatchObject({ method: "PATCH", body: JSON.stringify({ state: "done" }) });
  });

  it("returns brain's code and message when a reply is not sent", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => Response.json({ error: "dm_not_allowed", message: "Not taken." }, { status: 422 })));
    expect(await replyToItem("p1", "hi")).toEqual({ code: "dm_not_allowed", message: "Not taken." });
    vi.stubGlobal("fetch", vi.fn(async () => Response.json({ error: "reply_in_progress" }, { status: 409 })));
    expect(await replyToItem("p1", "hi")).toBe("reply_in_progress");
    vi.stubGlobal("fetch", vi.fn(async () => Response.json({ error: "rate_limited" }, { status: 429 })));
    expect(await replyToItem("p1", "hi")).toBe("rate_limited");
    vi.stubGlobal("fetch", vi.fn(async () => Response.json({ error: "invalid_text" }, { status: 422 })));
    expect(await replyToItem("p1", "hi")).toBe("invalid_text");
  });
});

it("says how long ago", () => {
  const now = Date.parse("2026-10-30T12:00:00Z");
  expect(relativeTime("2026-10-30T11:59:40Z", now)).toBe("now");
  expect(relativeTime("2026-10-30T11:55:00Z", now)).toBe("5 minutes ago");
  expect(relativeTime("2026-10-29T12:00:00Z", now)).toBe("yesterday");
});

describe("mergeFresh", () => {
  const item = (id: string, at: string, text = id) => ({ id, received_at: at, text }) as unknown as Item;
  const page = (ids: [string, string][], next: string | null = null) => ({ items: ids.map(([id, at]) => item(id, at)), next });

  it("puts new items on top, updates known ones and keeps the next cursor", () => {
    const loaded = page([["b", "2026-01-02"], ["a", "2026-01-01"]], "a");
    const fresh = { items: [item("c", "2026-01-03"), item("b", "2026-01-02", "edited")], next_cursor: "b" };
    const got = mergeFresh(loaded, fresh);
    expect(got.items.map((i) => i.id)).toEqual(["c", "b", "a"]);
    expect(got.items[1]!.text).toBe("edited");
    expect(got.next).toBe("a");
  });

  it("drops items a complete fresh page no longer holds", () => {
    const got = mergeFresh(page([["b", "2026-01-02"], ["a", "2026-01-01"]]), { items: [item("a", "2026-01-01")], next_cursor: null });
    expect(got.items.map((i) => i.id)).toEqual(["a"]);
  });

  it("replaces the list when a full fresh page shares nothing with it", () => {
    const got = mergeFresh(page([["a", "2026-01-01"]]), { items: [item("z", "2026-01-09")], next_cursor: "z" });
    expect(got).toEqual({ items: [item("z", "2026-01-09")], next: "z" });
  });
});
