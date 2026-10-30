import type { Metadata } from "next";
import { PostEditor } from "@/components/post-editor";
import { PageHeader } from "@/components/ui";

export const metadata: Metadata = { title: "New post on SocialReins" };

export default function NewPostPage() {
  return (
    <>
      <PageHeader title="New post" back={{ href: "/app/posts", label: "Posts" }} />
      <PostEditor />
    </>
  );
}
