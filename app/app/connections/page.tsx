import type { Metadata } from "next";
import Link from "next/link";
import { Connections } from "@/components/connections";

export const metadata: Metadata = { title: "SocialReins connected accounts" };

export default function ConnectionsPage() {
  return (
    <main className="mx-auto grid min-h-dvh max-w-2xl content-center gap-8 px-5 py-12">
      <Link href="/app" className="justify-self-start font-bold underline decoration-signal decoration-2 underline-offset-4">
        Back to the app
      </Link>
      <h1 className="font-display text-4xl font-extrabold tracking-tight">Connected accounts</h1>
      <Connections />
    </main>
  );
}
