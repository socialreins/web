import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { LogoMark } from "@/components/logo";
import { Welcome } from "@/components/welcome";

export const metadata: Metadata = { title: "Welcome to SocialReins" };

export default function WelcomePage() {
  return (
    <main className="mx-auto grid min-h-dvh w-full max-w-md content-center gap-8 px-5 py-12">
      <Link href="/" className="flex items-center gap-2.5 justify-self-start font-display text-xl font-extrabold tracking-tight">
        <LogoMark className="size-9" />
        SocialReins
      </Link>
      {/* ?next= is only known in the browser. */}
      <Suspense fallback={<p className="text-ink-soft">Checking your sign-in...</p>}>
        <Welcome />
      </Suspense>
    </main>
  );
}
