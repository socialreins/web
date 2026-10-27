import type { Metadata } from "next";
import Link from "next/link";
import { Account } from "@/components/account";

export const metadata: Metadata = { title: "SocialReins app" };

// Placeholder: the logged-in app grows here, in the same codebase as the landing page.
export default function AppHome() {
  return (
    <main className="mx-auto grid min-h-dvh max-w-xl content-center gap-4 px-5">
      <Account />
      <h1 className="font-display text-4xl font-extrabold tracking-tight">The app is coming soon</h1>
      <p className="text-pine-soft">
        Until then, follow SocialReins on GitHub or join the waitlist for the hosted version.
      </p>
      <Link href="/" className="font-bold underline decoration-brass decoration-2 underline-offset-4">
        Back to the home page
      </Link>
    </main>
  );
}
