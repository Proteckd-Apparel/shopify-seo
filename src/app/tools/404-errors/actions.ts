"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { createRedirect } from "@/lib/shopify-redirects";

export type NotFoundRow = {
  id: string;
  url: string;
  referrer: string | null;
  count: number;
  firstSeen: Date;
  lastSeen: Date;
  resolved: boolean;
};

export async function listNotFounds(
  showResolved = false,
): Promise<NotFoundRow[]> {
  const rows = await prisma.notFound.findMany({
    where: showResolved ? {} : { resolved: false },
    orderBy: [{ resolved: "asc" }, { lastSeen: "desc" }],
    take: 500,
  });
  return rows;
}

export async function deleteNotFound(
  id: string,
): Promise<{ ok: boolean; message: string }> {
  try {
    await prisma.notFound.delete({ where: { id } });
    revalidatePath("/tools/404-errors");
    return { ok: true, message: "Deleted" };
  } catch (e) {
    return { ok: false, message: e instanceof Error ? e.message : "Failed" };
  }
}

export async function clearAllResolved(): Promise<{
  ok: boolean;
  message: string;
}> {
  try {
    const r = await prisma.notFound.deleteMany({ where: { resolved: true } });
    revalidatePath("/tools/404-errors");
    return { ok: true, message: `Cleared ${r.count}` };
  } catch (e) {
    return { ok: false, message: e instanceof Error ? e.message : "Failed" };
  }
}

// Take a captured 404 path and create a Shopify URL redirect to the target.
// Marks the row resolved so it falls off the active list.
export async function createRedirectFor404(args: {
  id: string;
  fromPath: string;
  toPath: string;
}): Promise<{ ok: boolean; message: string }> {
  try {
    // Normalize: Shopify wants paths like "/old-thing", not full URLs.
    let from = args.fromPath.trim();
    if (from.startsWith("http")) {
      try {
        from = new URL(from).pathname + new URL(from).search;
      } catch {}
    }
    if (!from.startsWith("/")) from = "/" + from;

    let to = args.toPath.trim();
    if (!to.startsWith("/") && !to.startsWith("http")) to = "/" + to;

    await createRedirect(from, to);
    await prisma.notFound.update({
      where: { id: args.id },
      data: { resolved: true },
    });
    // Mirror locally so /tools/redirects shows it too
    await prisma.redirect
      .create({ data: { fromPath: from, toPath: to } })
      .catch(() => {}); // ignore unique constraint
    revalidatePath("/tools/404-errors");
    revalidatePath("/tools/redirects");
    return { ok: true, message: "Redirect created" };
  } catch (e) {
    return { ok: false, message: e instanceof Error ? e.message : "Failed" };
  }
}

// Suggest a likely destination by fuzzy-matching the 404 path's last segment
// against known resource handles.
export async function findSimilarResource(
  fromPath: string,
): Promise<{ ok: boolean; suggestions: { title: string; url: string }[] }> {
  try {
    const slug = fromPath.replace(/\/$/, "").split("/").pop() ?? "";
    if (!slug) return { ok: true, suggestions: [] };
    const tokens = slug.split(/[-_]/).filter((t) => t.length > 2);
    if (tokens.length === 0) return { ok: true, suggestions: [] };

    const matches = await prisma.resource.findMany({
      where: {
        OR: tokens.map((t) => ({ handle: { contains: t, mode: "insensitive" as const } })),
      },
      take: 10,
    });

    return {
      ok: true,
      suggestions: matches.map((m) => ({
        title: m.title ?? m.handle ?? m.id,
        url: m.handle
          ? `/${m.type === "product" ? "products" : m.type === "collection" ? "collections" : m.type === "article" ? "blogs" : "pages"}/${m.handle}`
          : "/",
      })),
    };
  } catch {
    return { ok: false, suggestions: [] };
  }
}

export async function exportCsv(): Promise<string> {
  const rows = await prisma.notFound.findMany({
    orderBy: { lastSeen: "desc" },
  });
  const header = "url,count,first_seen,last_seen,resolved,referrer\n";
  const body = rows
    .map((r) => {
      const esc = (s: string) => `"${s.replace(/"/g, '""')}"`;
      return [
        esc(r.url),
        r.count,
        r.firstSeen.toISOString(),
        r.lastSeen.toISOString(),
        r.resolved,
        esc(r.referrer ?? ""),
      ].join(",");
    })
    .join("\n");
  return header + body;
}
