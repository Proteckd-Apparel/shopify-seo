import { Replace } from "lucide-react";
import { PageHeader } from "@/components/page-header";
import { SnRForm } from "./snr-form";

export const dynamic = "force-dynamic";
export const maxDuration = 600;

export default async function SearchReplacePage() {
  return (
    <div>
      <PageHeader
        icon={Replace}
        title="Search and Replace"
        description="Find and replace text across product descriptions, titles, and SEO fields."
      />
      <SnRForm />
    </div>
  );
}
