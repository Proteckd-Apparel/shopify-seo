import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

// Generates an llms.txt file for LLM crawlers. Follows the llmstxt.org
// proposal: H1 = store name, blockquote = one-line summary, optional
// plain paragraphs, then sections of markdown links.

type ArticleRaw = {
  blog?: { id?: string; handle?: string; title?: string } | null;
};

export async function GET() {
  const settings = await prisma.settings.findUnique({ where: { id: 1 } });
  const publicDomain =
    settings?.storefrontDomain?.trim() ||
    settings?.shopDomain ||
    "your-store.myshopify.com";
  const origin = `https://${publicDomain.replace(/^https?:\/\//, "")}`;
  const storeName = settings?.storeName?.trim() || publicDomain;
  const storeDescription = settings?.storeDescription?.trim() || "";

  const [collections, articles, pages, productCount, collectionCount] =
    await Promise.all([
      prisma.resource.findMany({
        where: { type: "collection" },
        take: 500,
        orderBy: { title: "asc" },
      }),
      prisma.resource.findMany({
        where: { type: "article", status: "published" },
        take: 2000,
        orderBy: { title: "asc" },
      }),
      prisma.resource.findMany({
        where: { type: "page", status: "published" },
        take: 200,
        orderBy: { title: "asc" },
      }),
      prisma.resource.count({
        where: { type: "product", status: "active" },
      }),
      prisma.resource.count({
        where: { type: "collection" },
      }),
    ]);

  const lines: string[] = [];
  lines.push(`# ${storeName}`);
  lines.push("");

  // First paragraph → blockquote summary; additional paragraphs → plain text
  // so the llmstxt.org-recommended summary stays a single quoted line.
  if (storeDescription) {
    const paragraphs = storeDescription
      .split(/\n{2,}/)
      .map((p) => p.replace(/\n/g, " ").trim())
      .filter(Boolean);
    if (paragraphs.length > 0) {
      lines.push(`> ${paragraphs[0]}`);
      lines.push("");
      for (const p of paragraphs.slice(1)) {
        lines.push(p);
        lines.push("");
      }
    }
  }

  if (productCount > 0 || collectionCount > 0) {
    const parts: string[] = [];
    if (productCount > 0)
      parts.push(`${productCount.toLocaleString()} product${productCount === 1 ? "" : "s"}`);
    if (collectionCount > 0)
      parts.push(`${collectionCount.toLocaleString()} collection${collectionCount === 1 ? "" : "s"}`);
    lines.push(`Catalog size: ${parts.join(" across ")}.`);
    lines.push("");
  }

  if (collections.length > 0) {
    lines.push("## Collections");
    for (const c of collections) {
      if (!c.handle) continue;
      lines.push(
        `- [${c.title ?? c.handle}](${origin}/collections/${c.handle})`,
      );
    }
    lines.push("");
  }

  // Group articles by parent blog, parsed from the raw JSON snapshot.
  const blogs = new Map<
    string,
    {
      handle: string;
      title: string;
      articles: { title: string; handle: string }[];
    }
  >();
  for (const a of articles) {
    if (!a.handle) continue;
    let raw: ArticleRaw = {};
    try {
      raw = a.raw ? (JSON.parse(a.raw) as ArticleRaw) : {};
    } catch {
      raw = {};
    }
    const blog = raw.blog;
    if (!blog?.handle) continue;
    const key = blog.handle;
    if (!blogs.has(key)) {
      blogs.set(key, {
        handle: blog.handle,
        title: blog.title ?? blog.handle,
        articles: [],
      });
    }
    blogs.get(key)!.articles.push({
      title: a.title ?? a.handle,
      handle: a.handle,
    });
  }

  if (blogs.size > 0) {
    lines.push("## Blogs");
    const sorted = [...blogs.values()].sort((a, b) =>
      a.title.localeCompare(b.title),
    );
    for (const b of sorted) {
      lines.push(
        `- [${b.title}](${origin}/blogs/${b.handle}): Latest articles and updates`,
      );
      for (const art of b.articles) {
        lines.push(
          `  - [${art.title}](${origin}/blogs/${b.handle}/${art.handle})`,
        );
      }
    }
    lines.push("");
  }

  if (pages.length > 0) {
    lines.push("## Pages");
    for (const pg of pages) {
      if (!pg.handle) continue;
      lines.push(`- [${pg.title ?? pg.handle}](${origin}/pages/${pg.handle})`);
    }
    lines.push("");
  }

  lines.push("---");
  lines.push(`Canonical: ${origin}/llms.txt`);

  return new Response(lines.join("\n"), {
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      "Cache-Control": "public, max-age=3600",
    },
  });
}
