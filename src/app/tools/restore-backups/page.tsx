import { Undo2 } from "lucide-react";
import { PageHeader } from "@/components/page-header";
import { RestoreBackupsUI } from "./restore-ui";

export const dynamic = "force-dynamic";
export const maxDuration = 600;

export default function RestoreBackupsPage() {
  return (
    <div>
      <PageHeader
        icon={Undo2}
        title="Restore Image Backups"
        description="Every compress / upscale / rename writes the original bytes to a backup table (90-day retention). Pick any backup to push the original bytes back to Shopify, replacing the current version."
      />
      <RestoreBackupsUI />
    </div>
  );
}
