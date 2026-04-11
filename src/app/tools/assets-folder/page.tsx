import { FileImage } from "lucide-react";
import { PageHeader } from "@/components/page-header";
import { listAssetImages } from "./actions";
import { AssetCompressUI } from "./compress-ui";

export const dynamic = "force-dynamic";
export const maxDuration = 600;

export default async function AssetsFolderPage() {
  const r = await listAssetImages();

  return (
    <div>
      <PageHeader
        icon={FileImage}
        title="Compress Asset Images"
        description="Re-compress jpg / png / webp / gif files in your theme's assets/ folder. Skips svgs, animated gifs, and tiny icons. Filenames are preserved so theme references don't break."
      />
      {!r.ok ? (
        <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-800">
          {r.message}
        </div>
      ) : (
        <AssetCompressUI initial={r.rows ?? []} themeName={r.themeName ?? ""} />
      )}
    </div>
  );
}
