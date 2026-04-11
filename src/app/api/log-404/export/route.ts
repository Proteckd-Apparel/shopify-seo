import { exportCsv } from "@/app/tools/404-errors/actions";

export const dynamic = "force-dynamic";

export async function GET() {
  const csv = await exportCsv();
  return new Response(csv, {
    status: 200,
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="404-errors-${new Date().toISOString().slice(0, 10)}.csv"`,
    },
  });
}
