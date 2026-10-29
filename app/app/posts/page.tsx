import type { Metadata } from "next";
import Link from "next/link";
import { Posts } from "@/components/posts";

export const metadata: Metadata = { title: "SocialReins posts" };

export default function PostsPage() {
  return (
    <main className="mx-auto grid min-h-dvh max-w-5xl content-start gap-8 px-5 py-12">
      <Link href="/app" className="justify-self-start font-bold underline decoration-signal decoration-2 underline-offset-4">
        Back to the app
      </Link>
      <h1 className="font-display text-4xl font-extrabold tracking-tight">Posts</h1>
      <Posts />
    </main>
  );
}
