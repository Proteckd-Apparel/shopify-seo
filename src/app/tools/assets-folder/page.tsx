import { Files } from "lucide-react";
import { PageHeader } from "@/components/page-header";
import { listFiles } from "@/lib/shopify-files";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

export default async function AssetsFolderPage() {
  let files: Array<{
    id: string;
    fileStatus: string;
    alt: string | null;
    preview: string | null;
    createdAt: string;
  }> = [];
  let error: string | null = null;
  try {
    files = await listFiles(100);
  } catch (e) {
    error = e instanceof Error ? e.message : "Failed";
  }

  return (
    <div>
      <PageHeader
        icon={Files}
        title="Assets Folder"
        description="Browse files uploaded to your Shopify Files section."
      />

      {error ? (
        <div className="text-sm text-red-600">{error}</div>
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-3">
          {files.map((f) => (
            <div
              key={f.id}
              className="bg-white border border-slate-200 rounded-lg overflow-hidden"
            >
              {f.preview ? (
                /* eslint-disable-next-line @next/next/no-img-element */
                <img
                  src={f.preview}
                  alt={f.alt ?? ""}
                  className="w-full aspect-square object-cover"
                  loading="lazy"
                />
              ) : (
                <div className="w-full aspect-square bg-slate-100 grid place-items-center text-slate-400 text-xs">
                  no preview
                </div>
              )}
              <div className="p-2 text-[10px] text-slate-500">
                {f.fileStatus}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
