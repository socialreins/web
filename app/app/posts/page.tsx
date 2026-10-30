import type { Metadata } from "next";
import Link from "next/link";
import { Posts } from "@/components/posts";
import { Icon, PageHeader } from "@/components/ui";

export const metadata: Metadata = { title: "SocialReins posts" };

export default function PostsPage() {
  return (
    <>
      <PageHeader title="Posts">
        <Link href="/app/posts/new" className="btn btn-primary">
          <Icon name="plus" className="size-4" />
          New post
        </Link>
      </PageHeader>
      <Posts />
    </>
  );
}
