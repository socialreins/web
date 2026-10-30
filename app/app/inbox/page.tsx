import type { Metadata } from "next";
import { Suspense } from "react";
import { Inbox } from "@/components/inbox";
import { PageHeader } from "@/components/ui";

export const metadata: Metadata = { title: "SocialReins inbox" };

export default function InboxPage() {
  return (
    <>
      <PageHeader title="Inbox" />
      <Suspense fallback={<p className="text-ink-soft">Loading the inbox...</p>}>
        <Inbox />
      </Suspense>
    </>
  );
}
