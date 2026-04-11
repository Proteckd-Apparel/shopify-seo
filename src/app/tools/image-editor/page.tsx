import { Image as ImageIcon } from "lucide-react";
import { PageHeader, PlaceholderCard } from "@/components/page-header";

export const dynamic = "force-dynamic";

export default async function ImageEditorPage() {
  return (
    <div>
      <PageHeader
        icon={ImageIcon}
        title="Image Editor (Files)"
        description="Apply the compress pipeline to images in your Shopify Files folder."
      />
      <PlaceholderCard text="Reuses the compress pipeline. Wires next once bulk Compress Photos is wired — same code path." />
    </div>
  );
}
