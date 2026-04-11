import { Image as ImageIcon } from "lucide-react";
import { prisma } from "@/lib/prisma";
import { PageHeader } from "@/components/page-header";
import { CompressUI } from "./compress-ui";

export const dynamic = "force-dynamic";

export default async function CompressPhotosPage() {
  const totalImages = await prisma.image.count();
  const totalProducts = await prisma.resource.count({
    where: { type: "product" },
  });

  return (
    <div>
      <PageHeader
        icon={ImageIcon}
        title="Compress Photos"
        description="Re-encode product images to WebP or AVIF, stripping EXIF and capping width. Tests on a single image first, then bulk-processes if you like the result."
      />

      <div className="bg-amber-50 border border-amber-200 rounded-lg p-4 text-xs text-amber-900 mb-6 max-w-3xl">
        <div className="font-semibold mb-1">How this works</div>
        Shopify doesn&apos;t let us &quot;edit&quot; existing image bytes in
        place. To compress, we download the original from the Shopify CDN,
        re-encode it locally with sharp, then upload as a new file and update
        the product to point at it. The old image stays in /files (you can
        delete later). <strong>Test on one image first</strong> before bulk —
        this writes to your store.
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6 max-w-3xl">
        <Stat label="Total products" value={totalProducts} />
        <Stat label="Total images" value={totalImages} />
      </div>

      <CompressUI />
    </div>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div className="bg-white rounded-lg border border-slate-200 p-4">
      <div className="text-xs uppercase tracking-wider text-slate-500">
        {label}
      </div>
      <div className="text-2xl font-semibold mt-1">{value}</div>
    </div>
  );
}
