import type { Metadata } from "next";
import { Security } from "@/components/security";
import { PageHeader } from "@/components/ui";

export const metadata: Metadata = { title: "SocialReins security" };

export default function Page() {
  return (
    <div className="max-w-2xl">
      <PageHeader title="Security" />
      <div className="grid gap-10">
        <Security />
      </div>
    </div>
  );
}
