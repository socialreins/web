import { afterEach, describe, expect, it, vi } from "vitest";
import { listItems, relativeTime, replyToItem, setItemState } from "@/lib/inbox";
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
