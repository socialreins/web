import type { Metadata } from "next";
import { ApiTokens } from "@/components/api-tokens";
import { PageHeader } from "@/components/ui";

export const metadata: Metadata = { title: "SocialReins API tokens" };

export default function Page() {
  return (
    <div className="max-w-3xl">
      <PageHeader title="API tokens" />
      <div className="grid gap-10">
        <ApiTokens />
      </div>
    </div>
  );
}
