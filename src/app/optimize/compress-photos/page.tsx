import { Image as ImageIcon } from "lucide-react";
import { PageHeader } from "@/components/page-header";
import { CompressUI } from "./compress-ui";

export const dynamic = "force-dynamic";
export const maxDuration = 600;

export default async function CompressPhotosPage() {
  return (
    <div>
      <PageHeader
        icon={ImageIcon}
        title="Compress Photos"
        description="Bulk compress + optionally rename product images via Vision AI. Original bytes backed up for restore."
      />
      <CompressUI />
    </div>
  );
}
