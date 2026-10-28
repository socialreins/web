import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { InvitationView } from "@/components/invitation";
import { LogoMark } from "@/components/logo";

// The token is a secret: keep the page out of search results and its URL out of Referer headers.
export const metadata: Metadata = { title: "Team invitation on SocialReins", robots: { index: false }, referrer: "no-referrer" };

type Params = { params: Promise<{ token: string }> };

export default function InvitationPage({ params }: Params) {
  return (
    <main className="mx-auto grid min-h-dvh max-w-xl content-center gap-6 px-5 py-12">
      <Link href="/" className="flex items-center gap-2.5 font-display text-xl font-extrabold tracking-tight">
        <LogoMark className="size-9" />
        SocialReins
      </Link>
      <h1 className="font-display text-4xl font-extrabold tracking-tight">Team invitation</h1>
      <Suspense fallback={<p className="text-ink-soft">Loading the invitation...</p>}>
        <Token params={params} />
      </Suspense>
    </main>
  );
}

async function Token({ params }: Params) {
  return <InvitationView token={(await params).token} />;
}
