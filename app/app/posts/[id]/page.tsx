import type { Metadata } from "next";
import { Suspense } from "react";
import { PostEditor } from "@/components/post-editor";
import { PageHeader } from "@/components/ui";

export const metadata: Metadata = { title: "Post on SocialReins" };

type Params = { params: Promise<{ id: string }> };

export default function PostPage({ params }: Params) {
  return (
    <>
      <PageHeader title="Post" back={{ href: "/app/posts", label: "Posts" }} />
      <Suspense fallback={<p className="text-ink-soft">Loading the post...</p>}>
        <Editor params={params} />
      </Suspense>
    </>
  );
}

async function Editor({ params }: Params) {
  return <PostEditor id={(await params).id} />;
}
