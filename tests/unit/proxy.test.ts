import { describe, expect, it } from "vitest";
import { proxy } from "@/proxy";

describe("proxy CSP", () => {
  it("allows Cloudflare Turnstile's script and frame, and brain in connect-src", () => {
    const csp = proxy().headers.get("Content-Security-Policy")!;
    expect(csp).toMatch(/script-src [^;]*https:\/\/challenges\.cloudflare\.com/);
    expect(csp).toMatch(/frame-src https:\/\/challenges\.cloudflare\.com/);
    expect(csp).toMatch(/connect-src 'self' https?:\/\//);
  });
});
