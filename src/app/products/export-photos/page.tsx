import { Image as ImageIcon } from "lucide-react";
import { prisma } from "@/lib/prisma";
import { PageHeader } from "@/components/page-header";

export const dynamic = "force-dynamic";

export default async function ExportPhotosPage() {
  const totalImages = await prisma.image.count();
  const totalProducts = await prisma.resource.count({
    where: { type: "product" },
  });

  return (
    <div>
      <PageHeader
        icon={ImageIcon}
        title="Export Photos"
        description="Download all your product images as a ZIP file."
      />

      <div className="bg-white border border-slate-200 rounded-lg p-5 max-w-2xl">
        <div className="text-sm text-slate-600 mb-4">
          <div>
            <strong>{totalProducts}</strong> products,{" "}
            <strong>{totalImages}</strong> images total
          </div>
          <div className="text-xs text-slate-500 mt-1">
            Files are downloaded straight from the Shopify CDN at full
            resolution and zipped server-side.
          </div>
        </div>
        <a
          href="/api/export-photos"
          className="inline-block px-4 py-2 rounded bg-indigo-600 text-white text-sm font-medium hover:bg-indigo-700"
        >
          Download ZIP
        </a>
        <div className="mt-3 text-xs text-amber-700">
          Large catalogs (1000+ images) may take several minutes and produce a
          ZIP that&apos;s hundreds of MB. Don&apos;t close the tab.
        </div>
      </div>
    </div>
  );
}
