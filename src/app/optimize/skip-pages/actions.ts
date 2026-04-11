"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";

export type SkipResult = { ok: boolean; message: string };

export async function addSkipResource(
  resourceId: string,
): Promise<SkipResult> {
  try {
    const r = await prisma.resource.findUnique({ where: { id: resourceId } });
    if (!r) return { ok: false, message: "Resource not found" };
    await prisma.skipPage.upsert({
      where: { resourceId },
      create: { resourceId, type: r.type },
      update: { type: r.type },
    });
    revalidatePath("/optimize/skip-pages");
    return { ok: true, message: "Added" };
  } catch (e) {
    return { ok: false, message: e instanceof Error ? e.message : "Failed" };
  }
}

export async function removeSkip(id: string): Promise<SkipResult> {
  try {
    await prisma.skipPage.delete({ where: { id } });
    revalidatePath("/optimize/skip-pages");
    return { ok: true, message: "Removed" };
  } catch (e) {
    return { ok: false, message: e instanceof Error ? e.message : "Failed" };
  }
}

export async function searchResources(
  type: string,
  q: string,
): Promise<Array<{ id: string; title: string; handle: string }>> {
  if (q.length < 2) return [];
  const rows = await prisma.resource.findMany({
    where: {
      type,
      OR: [
        { title: { contains: q, mode: "insensitive" } },
        { handle: { contains: q, mode: "insensitive" } },
      ],
    },
    take: 15,
    orderBy: { title: "asc" },
  });
  return rows.map((r) => ({
    id: r.id,
    title: r.title ?? "",
    handle: r.handle ?? "",
  }));
}
