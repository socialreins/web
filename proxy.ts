import { NextResponse } from "next/server";
import { brainUrl } from "@/lib/brain-url";

const dev = process.env.NODE_ENV === "development";

// The CSP is set here, not in next.config headers (fixed at build), because connect-src names brain's origin from BRAIN_URL at run time.
// shortcut: 'unsafe-inline' scripts because the pages are static (no per-request nonce); move to nonces if pages go dynamic.
const csp = (api: string) =>
  [
    "default-src 'self'",
    `script-src 'self' 'unsafe-inline'${dev ? " 'unsafe-eval'" : ""}`,
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data:",
    "font-src 'self'",
    `connect-src 'self' ${api}${dev ? " ws:" : ""}`,
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "frame-ancestors 'none'",
  ].join("; ");

export function proxy() {
  const res = NextResponse.next();
  res.headers.set("Content-Security-Policy", csp(new URL(brainUrl()).origin));
  return res;
}

export const config = { matcher: "/((?!_next/static|_next/image).*)" };
