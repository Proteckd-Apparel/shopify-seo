import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";
export const revalidate = 3600; // cache 1 hour

function escape(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

export async function GET() {
  const settings = await prisma.settings.findUnique({ where: { id: 1 } });
  const shopDomain = settings?.shopDomain ?? "your-store.myshopify.com";
  const baseUrl = `https://${shopDomain}`;

  const products = await prisma.resource.findMany({
    where: { type: "product", status: "active" },
    include: { images: { take: 1 } },
    take: 5000,
  });

  const items = products
    .map((p) => {
      const link = p.url ?? `${baseUrl}/products/${p.handle}`;
      const image = p.images[0]?.src ?? "";
      const desc = (p.bodyHtml ?? "")
        .replace(/<[^>]+>/g, " ")
        .replace(/\s+/g, " ")
        .trim()
        .slice(0, 5000);
      const title = p.seoTitle || p.title || p.handle || "";
      const description = p.seoDescription || desc;

      return `    <item>
      <g:id>${escape(p.id)}</g:id>
      <g:title>${escape(title)}</g:title>
      <g:description>${escape(description)}</g:description>
      <g:link>${escape(link)}</g:link>
      <g:image_link>${escape(image)}</g:image_link>
      <g:availability>in stock</g:availability>
      <g:condition>new</g:condition>
      ${p.vendor ? `<g:brand>${escape(p.vendor)}</g:brand>` : ""}
      ${p.productType ? `<g:product_type>${escape(p.productType)}</g:product_type>` : ""}
    </item>`;
    })
    .join("\n");

  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:g="http://base.google.com/ns/1.0">
  <channel>
    <title>${escape(shopDomain)}</title>
    <link>${escape(baseUrl)}</link>
    <description>Product feed</description>
${items}
  </channel>
</rss>`;

  return new Response(xml, {
    headers: {
      "Content-Type": "application/xml; charset=utf-8",
      "Cache-Control": "public, max-age=3600",
    },
  });
}
