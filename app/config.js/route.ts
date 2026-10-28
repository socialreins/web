import { connection } from "next/server";
import { brainUrl } from "@/lib/brain-url";

// Hands brain's URL to the browser at request time; the root layout loads this before any app code.
export async function GET() {
  await connection();
  return new Response(`window.__BRAIN_URL = ${JSON.stringify(brainUrl())};\n`, {
    headers: { "Content-Type": "text/javascript; charset=utf-8", "Cache-Control": "no-store" },
  });
}
