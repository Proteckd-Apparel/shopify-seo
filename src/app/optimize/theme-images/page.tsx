import { Palette } from "lucide-react";
import { PageHeader } from "@/components/page-header";
import { ThemeImagesUI } from "./theme-images-ui";

export const dynamic = "force-dynamic";
export const maxDuration = 600;

export default async function ThemeImagesPage() {
  return (
    <div>
      <PageHeader
        icon={Palette}
        title="Theme Images"
        description="Compress images uploaded into your theme's assets folder (banners, logos, hero backgrounds). Same filename keeps your Liquid references intact."
      />
      <ThemeImagesUI />
    </div>
  );
}
