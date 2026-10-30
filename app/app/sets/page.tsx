import type { Metadata } from "next";
import { Sets } from "@/components/sets";
import { PageHeader } from "@/components/ui";

export const metadata: Metadata = { title: "SocialReins sets" };

export default function Page() {
  return (
    <div className="max-w-3xl">
      <PageHeader title="Sets" />
      <div className="grid gap-10">
        <Sets />
      </div>
    </div>
  );
}
