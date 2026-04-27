import { ImageOff } from "lucide-react";
import { PageHeader } from "@/components/page-header";
import { RecoverImagesUI } from "./recover-ui";

export const dynamic = "force-dynamic";
export const maxDuration = 600;

export default function RecoverImagesPage() {
  return (
    <div>
      <PageHeader
        icon={ImageOff}
        title="Recover Broken Images"
        description="Find image URLs that 404 inside article / page / product body HTML and rewrite them to surviving Files-library URLs by filename prefix. Read-only scan first; writes only happen when you click Apply."
      />
      <RecoverImagesUI />
    </div>
  );
}
