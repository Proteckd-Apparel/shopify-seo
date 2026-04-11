import { FileSearch } from "lucide-react";
import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { PageHeader } from "@/components/page-header";

export const dynamic = "force-dynamic";

const PAGE_SIZE = 60;

export default async function LowResPage({
  searchParams,
}: {
  searchParams: Promise<{ page?: string; threshold?: string }>;
}) {
  const sp = await searchParams;
  const page = Math.max(1, parseInt(sp.page ?? "1", 10));
  const threshold = parseInt(sp.threshold ?? "800", 10);

  const images = await prisma.image.findMany({
    where: { width: { lt: threshold } },
    include: { resource: true },
    orderBy: { width: "asc" },
    take: PAGE_SIZE,
    skip: (page - 1) * PAGE_SIZE,
  });

  const total = await prisma.image.count({
    where: { width: { lt: threshold } },
  });

  return (
    <div>
      <PageHeader
        icon={FileSearch}
        title="Low Resolution Photos"
        description="Images smaller than the chosen width. Replace them in Shopify with higher-quality versions."
      />

      <div className="flex gap-2 mb-4 items-center text-sm">
        <span className="text-slate-600">Threshold:</span>
        {[600, 800, 1000, 1200].map((w) => (
          <Link
            key={w}
            href={`?threshold=${w}`}
            className={`px-3 py-1 rounded-full border ${
              threshold === w
                ? "bg-slate-900 text-white border-slate-900"
                : "bg-white border-slate-300"
            }`}
          >
            &lt;{w}px
          </Link>
        ))}
        <div className="ml-auto text-slate-500">{total} images</div>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-4">
        {images.map((img) => (
          <div
            key={img.id}
            className="bg-white border border-slate-200 rounded-lg overflow-hidden"
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={`${img.src}&width=300`}
              alt={img.altText ?? ""}
              className="w-full aspect-square object-cover"
              loading="lazy"
            />
            <div className="p-2 text-xs">
              <div className="font-medium text-slate-900 truncate">
                {img.resource?.title ?? "—"}
              </div>
              <div className="text-red-600">
                {img.width}×{img.height}
              </div>
              {img.resource?.url && (
                <a
                  href={img.resource.url}
                  target="_blank"
                  rel="noreferrer"
                  className="text-indigo-600 hover:underline"
                >
                  view on store
                </a>
              )}
            </div>
          </div>
        ))}
      </div>

      <div className="flex justify-between items-center mt-6 text-sm">
        <div className="text-slate-500">Page {page}</div>
        <div className="flex gap-2">
          {page > 1 && (
            <Link
              href={`?threshold=${threshold}&page=${page - 1}`}
              className="px-3 py-1 rounded border border-slate-300 hover:bg-slate-50"
            >
              Prev
            </Link>
          )}
          {images.length === PAGE_SIZE && (
            <Link
              href={`?threshold=${threshold}&page=${page + 1}`}
              className="px-3 py-1 rounded border border-slate-300 hover:bg-slate-50"
            >
              Next
            </Link>
          )}
        </div>
      </div>
    </div>
  );
}
