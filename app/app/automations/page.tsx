import type { Metadata } from "next";
import { Automations, NewAutomationLink } from "@/components/automations";
import { PageHeader } from "@/components/ui";

export const metadata: Metadata = { title: "SocialReins automations" };

export default function AutomationsPage() {
  return (
    <div className="max-w-4xl">
      <PageHeader title="Automations">
        <NewAutomationLink />
      </PageHeader>
      <Automations />
    </div>
  );
}
