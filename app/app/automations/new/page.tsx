import type { Metadata } from "next";
import { NewAutomation } from "@/components/automations";
import { PageHeader } from "@/components/ui";

export const metadata: Metadata = { title: "New automation on SocialReins" };

export default function NewAutomationPage() {
  return (
    <>
      <PageHeader title="New comment-to-DM" back={{ href: "/app/automations", label: "Automations" }} />
      <NewAutomation />
    </>
  );
}
