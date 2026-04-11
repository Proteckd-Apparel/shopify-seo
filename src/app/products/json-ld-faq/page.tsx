import { MessageSquare, Code2 } from "lucide-react";
import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { PageHeader } from "@/components/page-header";

export const dynamic = "force-dynamic";

const PAGE_SIZE = 50;

export default async function JsonLdFaqPage({
  searchParams,
}: {
  searchParams: Promise<{ page?: string }>;
}) {
  const sp = await searchParams;
  const page = Math.max(1, parseInt(sp.page ?? "1", 10));

  const products = await prisma.resource.findMany({
    where: { type: "product" },
    orderBy: { title: "asc" },
    take: PAGE_SIZE,
    skip: (page - 1) * PAGE_SIZE,
  });

  return (
    <div>
      <PageHeader
        icon={MessageSquare}
        title="JSON-LD FAQ"
        description="Add FAQ structured data to your products. Generates a Shopify metafield that your theme can read to inject JSON-LD."
      />

      <div className="bg-amber-50 border border-amber-200 rounded-lg p-4 text-xs text-amber-900 mb-6 max-w-3xl">
        <div className="font-semibold mb-1">Theme integration required</div>
        FAQs are stored as a metafield on each product (
        <code className="font-mono bg-amber-100 px-1 rounded">
          custom.faqs
        </code>
        ). To make Google index them, your theme&apos;s product template must
        include a JSON-LD snippet that reads from this metafield. Snippet code
        comes in the next phase — for now you can edit the data.
      </div>

      <div className="bg-white border border-slate-200 rounded-lg overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-slate-600 text-xs uppercase">
            <tr>
              <th className="text-left px-4 py-2 w-1/2">Product</th>
              <th className="text-left px-4 py-2">Action</th>
            </tr>
          </thead>
          <tbody>
            {products.map((p) => (
              <tr key={p.id} className="border-t border-slate-100">
                <td className="px-4 py-3">
                  <div className="font-medium text-slate-900 truncate">
                    {p.title}
                  </div>
                  {p.url && (
                    <a
                      href={p.url}
                      target="_blank"
                      rel="noreferrer"
                      className="text-xs text-indigo-600 hover:underline"
                    >
                      view on store
                    </a>
                  )}
                </td>
                <td className="px-4 py-3">
                  <button
                    type="button"
                    disabled
                    title="Inline FAQ editor coming next"
                    className="inline-flex items-center gap-1 px-2 py-1 rounded text-xs bg-slate-100 text-slate-500 cursor-not-allowed"
                  >
                    <Code2 className="w-3 h-3" /> Edit FAQs
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="flex justify-between items-center mt-4 text-sm">
        <div className="text-slate-500">Page {page}</div>
        <div className="flex gap-2">
          {page > 1 && (
            <Link
              href={`?page=${page - 1}`}
              className="px-3 py-1 rounded border border-slate-300 hover:bg-slate-50"
            >
              Prev
            </Link>
          )}
          {products.length === PAGE_SIZE && (
            <Link
              href={`?page=${page + 1}`}
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
