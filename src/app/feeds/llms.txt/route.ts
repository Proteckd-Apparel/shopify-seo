import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

// Generates an llms.txt-style summary of the store: title, description,
// and an indexed list of products and pages. Helps LLM crawlers understand
// what the store sells.

export async function GET() {
  const settings = await prisma.settings.findUnique({ where: { id: 1 } });
  const domain = settings?.shopDomain ?? "your-store.myshopify.com";

  const [products, collections, pages] = await Promise.all([
    prisma.resource.findMany({
      where: { type: "product", status: "active" },
      take: 1000,
      orderBy: { title: "asc" },
    }),
    prisma.resource.findMany({
      where: { type: "collection" },
      take: 200,
      orderBy: { title: "asc" },
    }),
    prisma.resource.findMany({
      where: { type: "page" },
      take: 100,
      orderBy: { title: "asc" },
    }),
  ]);

  const lines: string[] = [];
  lines.push(`# ${domain}`);
  lines.push("");
  lines.push("> Auto-generated llms.txt");
  lines.push("");

  if (collections.length > 0) {
    lines.push("## Collections");
    lines.push("");
    for (const c of collections) {
      lines.push(`- [${c.title ?? c.handle}](https://${domain}/collections/${c.handle})`);
    }
    lines.push("");
  }

  if (products.length > 0) {
    lines.push("## Products");
    lines.push("");
    for (const p of products) {
      const desc = (p.seoDescription ?? "")
        .replace(/\s+/g, " ")
        .trim()
        .slice(0, 120);
      const url = p.url ?? `https://${domain}/products/${p.handle}`;
      lines.push(`- [${p.title ?? p.handle}](${url})${desc ? ` — ${desc}` : ""}`);
    }
    lines.push("");
  }

  if (pages.length > 0) {
    lines.push("## Pages");
    lines.push("");
    for (const pg of pages) {
      lines.push(`- [${pg.title ?? pg.handle}](https://${domain}/pages/${pg.handle})`);
    }
  }

  return new Response(lines.join("\n"), {
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      "Cache-Control": "public, max-age=3600",
    },
  });
}
