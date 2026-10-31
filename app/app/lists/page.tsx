import type { Metadata } from "next";
import { Lists } from "@/components/lists";
import { PageHeader } from "@/components/ui";

export const metadata: Metadata = { title: "SocialReins lists" };

export default function ListsPage() {
  return (
    <div className="max-w-4xl">
      <PageHeader title="Lists" />
      <Lists />
    </div>
  );
}
