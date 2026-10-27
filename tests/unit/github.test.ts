import { afterEach, describe, expect, it, vi } from "vitest";
import { fetchStars, formatStars } from "@/lib/github";

afterEach(() => vi.unstubAllGlobals());

describe("fetchStars", () => {
  it("returns the repo's stargazers_count", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(Response.json({ stargazers_count: 42 })));
    expect(await fetchStars("web")).toBe(42);
  });

  it.each([
    ["a non-200 response", () => Promise.resolve(new Response(null, { status: 403 }))],
    ["a network failure", () => Promise.reject(new TypeError("offline"))],
    ["a missing count", () => Promise.resolve(Response.json({}))],
  ])("returns null on %s", async (_, impl) => {
    vi.stubGlobal("fetch", vi.fn().mockImplementation(impl));
    expect(await fetchStars("web")).toBeNull();
  });
});

it("formats large counts compactly", () => {
  expect(formatStars(7)).toBe("7");
  expect(formatStars(1234)).toBe("1.2K");
});
