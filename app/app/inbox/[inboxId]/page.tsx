import type { Metadata } from "next";
import { Suspense } from "react";
import { Inbox } from "@/components/inbox";
import { PageHeader } from "@/components/ui";

export const metadata: Metadata = { title: "SocialReins inbox" };

type Params = { params: Promise<{ inboxId: string }> };

export default function InboxPage({ params }: Params) {
  return (
    <>
      <PageHeader title="Inbox" />
      <Suspense fallback={<p className="text-ink-soft">Loading the inbox...</p>}>
        <WithId params={params} />
      </Suspense>
    </>
  );
}

async function WithId({ params }: Params) {
  return <Inbox inboxId={(await params).inboxId} />;
}
