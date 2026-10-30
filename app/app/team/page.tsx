import type { Metadata } from "next";
import { TeamSettings } from "@/components/team";
import { PageHeader } from "@/components/ui";

export const metadata: Metadata = { title: "SocialReins team" };

export default function Page() {
  return (
    <div className="max-w-2xl">
      <PageHeader title="Team" />
      <div className="grid gap-10">
        <TeamSettings />
      </div>
    </div>
  );
}
