import type { Metadata } from "next";
import { Suspense } from "react";
import { PostEditor } from "@/components/post-editor";

export const metadata: Metadata = { title: "Post on SocialReins" };

type Params = { params: Promise<{ id: string }> };

export default function PostPage({ params }: Params) {
  return (
    <main className="mx-auto grid min-h-dvh max-w-2xl content-start gap-8 px-5 py-12">
      <h1 className="font-display text-4xl font-extrabold tracking-tight">Post</h1>
      <Suspense fallback={<p className="text-ink-soft">Loading the post...</p>}>
        <Editor params={params} />
      </Suspense>
    </main>
  );
}

async function Editor({ params }: Params) {
  return <PostEditor id={(await params).id} />;
}
