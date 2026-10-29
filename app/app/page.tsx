import type { Metadata } from "next";
import Link from "next/link";
import { Account } from "@/components/account";
import { TeamSwitcher } from "@/components/team-switcher";

export const metadata: Metadata = { title: "SocialReins app" };

// Placeholder: the logged-in app grows here, in the same codebase as the landing page.
export default function AppHome() {
  return (
    <main className="mx-auto grid min-h-dvh max-w-xl content-center gap-4 px-5">
      <Account />
      <Link href="/app/posts" className="justify-self-start font-bold underline decoration-signal decoration-2 underline-offset-4">
        Posts
      </Link>
      <Link href="/app/security" className="justify-self-start font-bold underline decoration-signal decoration-2 underline-offset-4">
        Passkeys
      </Link>
      <Link href="/app/connections" className="justify-self-start font-bold underline decoration-signal decoration-2 underline-offset-4">
        Connected accounts
      </Link>
      <Link href="/app/sets" className="justify-self-start font-bold underline decoration-signal decoration-2 underline-offset-4">
        Sets
      </Link>
      <TeamSwitcher />
      <h1 className="font-display text-4xl font-extrabold tracking-tight">The app is coming soon</h1>
      <p className="text-ink-soft">
        Until then, follow SocialReins on GitHub or join the waitlist for the hosted version.
      </p>
      <Link href="/" className="font-bold underline decoration-signal decoration-2 underline-offset-4">
        Back to the home page
      </Link>
    </main>
  );
}
