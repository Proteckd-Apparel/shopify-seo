import { TrendingUp } from "lucide-react";
import { PageHeader } from "@/components/page-header";
import { UpscaleUI } from "./upscale-ui";

export const dynamic = "force-dynamic";
export const maxDuration = 600;

export default async function UpscalePhotosPage() {
  return (
    <div>
      <PageHeader
        icon={TrendingUp}
        title="Upscale Low Resolution Photos"
        description="AI-upscale small product photos using Real-ESRGAN. Original bytes backed up before swap. ~$0.005 per image via Replicate."
      />
      <UpscaleUI />
    </div>
  );
}
