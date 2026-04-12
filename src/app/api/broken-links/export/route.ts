import { exportBrokenCsv, type Scope } from "@/app/tools/broken-links/actions";

export const dynamic = "force-dynamic";

const VALID: Scope[] = ["product", "collection", "article", "page"];

export async function GET(request: Request) {
  const u = new URL(request.url);
  const scope = (u.searchParams.get("scope") ?? "product") as Scope;
  if (!VALID.includes(scope)) {
    return new Response("bad scope", { status: 400 });
  }
  const csv = await exportBrokenCsv(scope);
  return new Response(csv, {
    status: 200,
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="broken-${scope}-${new Date().toISOString().slice(0, 10)}.csv"`,
    },
  });
}
