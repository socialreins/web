import type { Metadata } from "next";
import { Suspense } from "react";
import { AutomationDetail } from "@/components/automations";
import { PageHeader } from "@/components/ui";

export const metadata: Metadata = { title: "Automation on SocialReins" };

type Params = { params: Promise<{ id: string }> };

export default function AutomationPage({ params }: Params) {
  return (
    <div className="max-w-5xl">
      <PageHeader title="Automation" back={{ href: "/app/automations", label: "Automations" }} />
      <Suspense fallback={<p className="text-ink-soft">Loading the automation...</p>}>
        <Detail params={params} />
      </Suspense>
    </div>
  );
}

async function Detail({ params }: Params) {
  return <AutomationDetail id={(await params).id} />;
}
