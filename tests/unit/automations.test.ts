import { afterEach, describe, expect, it, vi } from "vitest";
import { postLink, postUri, reason, sample, switchAutomation, templateLength, triggerSummary } from "@/lib/automations";
import { apiUrl } from "@/lib/waitlist";

const accounts = [{ provider: "bluesky", handle: "alice.bsky.social", external_id: "did:plc:alice" }];

afterEach(() => vi.unstubAllGlobals());

describe("post links", () => {
  it("turns Bluesky post links of connected accounts into at:// URIs", () => {
    expect(postUri("https://bsky.app/profile/alice.bsky.social/post/3abc", accounts)).toBe("at://did:plc:alice/app.bsky.feed.post/3abc");
    expect(postUri(" https://bsky.app/profile/Alice.bsky.social/post/3abc/?ref=x ", accounts)).toBe("at://did:plc:alice/app.bsky.feed.post/3abc");
    expect(postUri("https://bsky.app/profile/did:plc:bob/post/3abc", accounts)).toBe("at://did:plc:bob/app.bsky.feed.post/3abc");
    expect(postUri("at://did:plc:bob/app.bsky.feed.post/3abc", accounts)).toBe("at://did:plc:bob/app.bsky.feed.post/3abc");
  });

  it("refuses anything else", () => {
    expect(postUri("https://bsky.app/profile/stranger.bsky.social/post/3abc", accounts)).toBeNull();
    expect(postUri("https://bsky.app/profile/alice.bsky.social", accounts)).toBeNull();
    expect(postUri("http://bsky.app/profile/did:plc:bob/post/3abc", accounts)).toBeNull();
    expect(postUri("https://evil.com/profile/did:plc:bob/post/3abc", accounts)).toBeNull();
    expect(postUri("at://bob.bsky.social/app.bsky.feed.post/3abc", accounts)).toBeNull();
    expect(postUri("at://did:plc:bob/app.bsky.feed.like/3abc", accounts)).toBeNull();
  });

  it("links an at:// URI back to bsky.app", () => {
    expect(postLink("at://did:plc:bob/app.bsky.feed.post/3abc")).toBe("https://bsky.app/profile/did:plc:bob/post/3abc");
  });
});

describe("texts", () => {
  it("counts {name} at its longest and previews it", () => {
    expect(templateLength("Hi {name}")).toBe(3 + 64);
    expect(sample("Hi {name}, {name}")).toBe("Hi Sam, Sam");
  });

  it("summarizes the trigger and reasons", () => {
    const c = { account_ids: [], post_remote_ids: [], keywords: ["price", "link"], first_per_author: false };
    expect(triggerSummary(c)).toBe("Comment contains: price, link");
    expect(triggerSummary({ ...c, keywords: [], post_remote_ids: ["a", "b"], first_per_author: true })).toBe("Any comment on 2 posts, first per person");
    expect(reason("dm_not_allowed")).toBe("They only accept DMs from people they follow");
    expect(reason("something_new")).toBe("something new");
    expect(reason(null)).toBeNull();
  });
});

it("switches with enable and disable", async () => {
  const fetch = vi.fn(async () => Response.json({ id: "a1", active: false }));
  vi.stubGlobal("fetch", fetch);
  await switchAutomation("a1", false);
  expect((fetch.mock.calls[0] as unknown as [string, RequestInit])[0]).toBe(`${apiUrl}/v1/automations/a1/disable`);
  expect((fetch.mock.calls[0] as unknown as [string, RequestInit])[1]).toMatchObject({ method: "POST", credentials: "include" });
});
