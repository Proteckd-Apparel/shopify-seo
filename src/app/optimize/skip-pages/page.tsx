import { ImageOff } from "lucide-react";
import { prisma } from "@/lib/prisma";
import { PageHeader } from "@/components/page-header";
import { SkipManager } from "./skip-manager";

export const dynamic = "force-dynamic";

export default async function SkipPagesPage() {
  const skips = await prisma.skipPage.findMany({
    orderBy: { createdAt: "desc" },
  });

  // Hydrate the resource data for any skips that point at a real Resource.
  const resourceIds = skips
    .map((s) => s.resourceId)
    .filter((id): id is string => !!id);
  const resources = await prisma.resource.findMany({
    where: { id: { in: resourceIds } },
    select: { id: true, title: true, handle: true },
  });
  const byId = new Map(resources.map((r) => [r.id, r]));

  const rows = skips.map((s) => ({
    id: s.id,
    resourceId: s.resourceId,
    pattern: s.pattern,
    type: s.type,
    resource: s.resourceId ? (byId.get(s.resourceId) ?? null) : null,
  }));

  const countsByType: Record<string, number> = {};
  for (const r of rows) {
    if (!r.resourceId) continue;
    countsByType[r.type] = (countsByType[r.type] ?? 0) + 1;
  }

  return (
    <div>
      <PageHeader
        icon={ImageOff}
        title="Skip Pages"
        description="Items that the optimizer will ignore during bulk runs."
      />
      <SkipManager initial={rows} countsByType={countsByType} />
    </div>
  );
}
