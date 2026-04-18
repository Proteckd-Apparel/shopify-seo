import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

// Generates an llms.txt file for LLM crawlers. Follows the llmstxt.org
// proposal: H1 = store name, blockquote = description, then sections
// of markdown links.

type ArticleRaw = {
  blog?: { id?: string; handle?: string; title?: string } | null;
};

export async function GET() {
  const settings = await prisma.settings.findUnique({ where: { id: 1 } });
  const domain = settings?.shopDomain ?? "your-store.myshopify.com";
  const origin = `https://${domain.replace(/^https?:\/\//, "")}`;
  const storeName = settings?.storeName?.trim() || domain;
  const storeDescription = settings?.storeDescription?.trim() || "";

  const [collections, articles] = await Promise.all([
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
  ]);

  const lines: string[] = [];
  lines.push(`# ${storeName}`);
  lines.push("");
  if (storeDescription) {
    for (const para of storeDescription.split(/\n{2,}/)) {
      lines.push(`> ${para.replace(/\n/g, " ").trim()}`);
      lines.push("");
    }
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

  return new Response(lines.join("\n"), {
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      "Cache-Control": "public, max-age=3600",
    },
  });
}
