import type { Metadata } from "next";
import { Suspense } from "react";
import { ListView } from "@/components/lists";
import { PageHeader } from "@/components/ui";

export const metadata: Metadata = { title: "List on SocialReins" };

type Params = { params: Promise<{ id: string }> };

export default function ListPage({ params }: Params) {
  return (
    <div className="max-w-4xl">
      <PageHeader title="List" back={{ href: "/app/lists", label: "Lists" }} />
      <Suspense fallback={<p className="text-ink-soft">Loading the list...</p>}>
        <View params={params} />
      </Suspense>
    </div>
  );
}

async function View({ params }: Params) {
  return <ListView id={(await params).id} />;
}
