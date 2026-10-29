import type { Metadata } from "next";
import { PostEditor } from "@/components/post-editor";

export const metadata: Metadata = { title: "New post on SocialReins" };

export default function NewPostPage() {
  return (
    <main className="mx-auto grid min-h-dvh max-w-2xl content-start gap-8 px-5 py-12">
      <h1 className="font-display text-4xl font-extrabold tracking-tight">New post</h1>
      <PostEditor />
    </main>
  );
}
