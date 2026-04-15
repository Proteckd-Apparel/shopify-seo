import { Files as FilesIcon } from "lucide-react";
import { PageHeader } from "@/components/page-header";
import { listFilesForUI } from "./actions";
import { FilesLibraryUI } from "./compress-ui";

export const dynamic = "force-dynamic";
export const maxDuration = 600;

export default async function FilesLibraryPage() {
  const r = await listFilesForUI();

  return (
    <div>
      <PageHeader
        icon={FilesIcon}
        title="Compress Files Library"
        description="Re-compress images uploaded to Shopify Content → Files. Re-encodes in the same format so any references keep working. If an image is referenced by a product/page/metafield, the old copy is kept instead of being deleted."
      />
      {!r.ok ? (
        <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-800">
          {r.message}
        </div>
      ) : (
        <FilesLibraryUI initial={r.rows ?? []} />
      )}
    </div>
  );
}
