"use server";

// Broken-link scanner. Walks every product/collection/article/page bodyHtml,
// pulls every <a href> and <img src>, and HEAD-checks each in parallel
// (capped concurrency). Anything that comes back non-2xx (or fails) is
// stored in BrokenLink with kind=link|image so the UI can group them.

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { createRedirect } from "@/lib/shopify-redirects";

export type Scope = "product" | "collection" | "article" | "page";

export type BrokenRow = {
  id: string;
  kind: "link" | "image";
  targetUrl: string;
  status: number;
  sourceTitle: string | null;
  sourceUrl: string;
  sourceResourceId: string | null;
  foundAt: Date;
};

export type ScopeCounts = Record<Scope, number>;

export async function getScopeCounts(): Promise<ScopeCounts> {
  const grouped = await prisma.brokenLink.groupBy({
    by: ["sourceType"],
    _count: { _all: true },
  });
  const out: ScopeCounts = { product: 0, collection: 0, article: 0, page: 0 };
  for (const g of grouped) {
    if (g.sourceType && g.sourceType in out) {
      out[g.sourceType as Scope] = g._count._all;
    }
  }
  return out;
}

export async function listBroken(scope: Scope): Promise<BrokenRow[]> {
  const rows = await prisma.brokenLink.findMany({
    where: { sourceType: scope },
    orderBy: { foundAt: "desc" },
    take: 1000,
  });
  return rows.map((r) => ({
    id: r.id,
    kind: (r.kind as "link" | "image") ?? "link",
    targetUrl: r.targetUrl,
    status: r.status,
    sourceTitle: r.sourceTitle,
    sourceUrl: r.sourceUrl,
    sourceResourceId: r.sourceResourceId,
    foundAt: r.foundAt,
  }));
}

const HREF_RE = /<a\b[^>]*\bhref=["']([^"']+)["'][^>]*>/gi;
const IMG_RE = /<img\b[^>]*\bsrc=["']([^"']+)["'][^>]*>/gi;

function extractRefs(html: string): { links: string[]; images: string[] } {
  const links = new Set<string>();
  const images = new Set<string>();
  for (const m of html.matchAll(HREF_RE)) {
    const h = m[1].trim();
    if (
      !h ||
      h.startsWith("#") ||
      h.startsWith("mailto:") ||
      h.startsWith("tel:") ||
      h.startsWith("javascript:")
    )
      continue;
    links.add(h);
  }
  for (const m of html.matchAll(IMG_RE)) {
    const s = m[1].trim();
    if (s && !s.startsWith("data:")) images.add(s);
  }
  return { links: [...links], images: [...images] };
}

function resolveUrl(href: string, shopDomain: string): string | null {
  try {
    if (href.startsWith("http://") || href.startsWith("https://")) return href;
    if (href.startsWith("//")) return "https:" + href;
    if (href.startsWith("/")) return `https://${shopDomain}${href}`;
    return null;
  } catch {
    return null;
  }
}

// Returns the HTTP status, or null if we couldn't reach the host at all
// (timeout, DNS, TLS). The caller distinguishes those from "true" 4xx/5xx
// responses — recording an unreachable URL as `status:0 broken` and
// recommending deletion / redirect creates real customer harm when the
// host was just slow.
async function checkUrl(url: string): Promise<number | null> {
  // Two HEAD attempts so a single transient timeout doesn't flag a real
  // URL as broken. If both throw, treat as unreachable (return null).
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const res = await fetch(url, {
        method: "HEAD",
        redirect: "follow",
        signal: AbortSignal.timeout(8000),
      });
      if (res.status === 403 || res.status === 405) {
        const r2 = await fetch(url, {
          method: "GET",
          redirect: "follow",
          signal: AbortSignal.timeout(8000),
        });
        return r2.status;
      }
      return res.status;
    } catch {
      if (attempt === 1) return null;
    }
  }
  return null;
}

// Run an array of async tasks with limited concurrency.
async function pLimit<T, R>(
  items: T[],
  limit: number,
  fn: (item: T) => Promise<R>,
): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let i = 0;
  async function worker() {
    while (i < items.length) {
      const idx = i++;
      results[idx] = await fn(items[idx]);
    }
  }
  await Promise.all(Array.from({ length: limit }, worker));
  return results;
}

export async function scanBroken(
  scope: Scope,
): Promise<{ ok: boolean; message: string; broken: number; checked: number }> {
  try {
    const settings = await prisma.settings.findUnique({ where: { id: 1 } });
    const shopDomain = settings?.shopDomain;
    if (!shopDomain) return { ok: false, message: "Set shop domain in Settings", broken: 0, checked: 0 };

    const resources = await prisma.resource.findMany({
      where: { type: scope, bodyHtml: { not: null } },
      select: {
        id: true,
        type: true,
        title: true,
        handle: true,
        url: true,
        bodyHtml: true,
      },
    });

    type Job = {
      url: string;
      kind: "link" | "image";
      sourceResourceId: string;
      sourceTitle: string;
      sourceUrl: string;
    };
    const jobs: Job[] = [];
    const sourcePathFor = (
      r: { type: string; handle: string | null; url: string | null },
    ) => {
      if (r.url) return r.url;
      if (!r.handle) return `https://${shopDomain}/`;
      const seg =
        r.type === "product"
          ? "products"
          : r.type === "collection"
            ? "collections"
            : r.type === "article"
              ? "blogs/news"
              : "pages";
      return `https://${shopDomain}/${seg}/${r.handle}`;
    };

    for (const r of resources) {
      if (!r.bodyHtml) continue;
      const { links, images } = extractRefs(r.bodyHtml);
      const srcUrl = sourcePathFor(r);
      for (const l of links) {
        const abs = resolveUrl(l, shopDomain);
        if (!abs) continue;
        jobs.push({
          url: abs,
          kind: "link",
          sourceResourceId: r.id,
          sourceTitle: r.title ?? r.handle ?? "—",
          sourceUrl: srcUrl,
        });
      }
      for (const img of images) {
        const abs = resolveUrl(img, shopDomain);
        if (!abs) continue;
        jobs.push({
          url: abs,
          kind: "image",
          sourceResourceId: r.id,
          sourceTitle: r.title ?? r.handle ?? "—",
          sourceUrl: srcUrl,
        });
      }
    }

    // Dedupe by (url, sourceResourceId, kind) so a single href that appears
    // twice in the same product is only checked once.
    const seen = new Set<string>();
    const dedup = jobs.filter((j) => {
      const k = `${j.kind}|${j.url}|${j.sourceResourceId}`;
      if (seen.has(k)) return false;
      seen.add(k);
      return true;
    });

    // Wipe previous results for this scope so the table reflects this run only.
    await prisma.brokenLink.deleteMany({ where: { sourceType: scope } });

    const statuses = await pLimit(dedup, 10, (j) => checkUrl(j.url));
    const broken: typeof dedup = [];
    const brokenStatuses: number[] = [];
    for (let idx = 0; idx < dedup.length; idx++) {
      const status = statuses[idx];
      // null = unreachable (timeout/DNS/TLS) — skip rather than record
      // as broken. The host might be temporarily down.
      if (status === null) continue;
      const ok = status >= 200 && status < 400;
      if (!ok) {
        broken.push(dedup[idx]);
        brokenStatuses.push(status);
      }
    }

    if (broken.length > 0) {
      await prisma.brokenLink.createMany({
        data: broken.map((b, i) => ({
          sourceUrl: b.sourceUrl,
          targetUrl: b.url,
          status: brokenStatuses[i],
          kind: b.kind,
          sourceType: scope,
          sourceResourceId: b.sourceResourceId,
          sourceTitle: b.sourceTitle,
        })),
      });
    }

    revalidatePath("/tools/broken-links");
    return {
      ok: true,
      message: `Checked ${dedup.length}, found ${broken.length} broken`,
      broken: broken.length,
      checked: dedup.length,
    };
  } catch (e) {
    return {
      ok: false,
      message: e instanceof Error ? e.message : "Failed",
      broken: 0,
      checked: 0,
    };
  }
}

export async function deleteBroken(id: string) {
  try {
    await prisma.brokenLink.delete({ where: { id } });
    revalidatePath("/tools/broken-links");
    return { ok: true, message: "Deleted" };
  } catch (e) {
    return { ok: false, message: e instanceof Error ? e.message : "Failed" };
  }
}

export async function clearBrokenScope(scope: Scope) {
  try {
    const r = await prisma.brokenLink.deleteMany({ where: { sourceType: scope } });
    revalidatePath("/tools/broken-links");
    return { ok: true, message: `Cleared ${r.count}` };
  } catch (e) {
    return { ok: false, message: e instanceof Error ? e.message : "Failed" };
  }
}

// Create a 301 redirect from a broken target path to a chosen destination,
// then drop the row from BrokenLink.
export async function createRedirectForBroken(args: {
  id: string;
  fromPath: string;
  toPath: string;
}) {
  try {
    let from = args.fromPath.trim();
    if (from.startsWith("http")) {
      try {
        const u = new URL(from);
        from = u.pathname + u.search;
      } catch {}
    }
    if (!from.startsWith("/")) from = "/" + from;
    let to = args.toPath.trim();
    if (!to.startsWith("/") && !to.startsWith("http")) to = "/" + to;

    await createRedirect(from, to);
    await prisma.brokenLink.delete({ where: { id: args.id } });
    await prisma.redirect
      .create({ data: { fromPath: from, toPath: to } })
      .catch(() => {});
    revalidatePath("/tools/broken-links");
    revalidatePath("/tools/redirects");
    return { ok: true, message: "Redirect created" };
  } catch (e) {
    return { ok: false, message: e instanceof Error ? e.message : "Failed" };
  }
}

export async function exportBrokenCsv(scope: Scope): Promise<string> {
  const rows = await prisma.brokenLink.findMany({
    where: { sourceType: scope },
    orderBy: { foundAt: "desc" },
  });
  const header = "kind,target_url,status,source_title,source_url,found_at\n";
  const body = rows
    .map((r) => {
      const esc = (s: string) => `"${s.replace(/"/g, '""')}"`;
      return [
        r.kind,
        esc(r.targetUrl),
        r.status,
        esc(r.sourceTitle ?? ""),
        esc(r.sourceUrl),
        r.foundAt.toISOString(),
      ].join(",");
    })
    .join("\n");
  return header + body;
}
