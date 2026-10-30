import type { Metadata } from "next";
import { Connections } from "@/components/connections";
import { PageHeader } from "@/components/ui";

export const metadata: Metadata = { title: "SocialReins accounts" };

export default function Page() {
  return (
    <div className="max-w-4xl">
      <PageHeader title="Accounts" />
      <div className="grid gap-10">
        <Connections />
      </div>
    </div>
  );
}
