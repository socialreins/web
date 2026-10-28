import type { Metadata } from "next";
import Link from "next/link";
import { Security } from "@/components/security";

export const metadata: Metadata = { title: "SocialReins password and passkeys" };

export default function SecurityPage() {
  return (
    <main className="mx-auto grid min-h-dvh max-w-xl content-center gap-8 px-5 py-12">
      <Link href="/app" className="justify-self-start font-bold underline decoration-signal decoration-2 underline-offset-4">
        Back to the app
      </Link>
      <h1 className="font-display text-4xl font-extrabold tracking-tight">Password and passkeys</h1>
      <Security />
    </main>
  );
}
