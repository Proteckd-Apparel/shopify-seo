"use server";

import { revalidatePath } from "next/cache";
import { runSentimentReport } from "@/lib/sentiment-report";
import type { Provider } from "@/lib/llm-outreach-shared";

export type ActionResult = {
  ok: boolean;
  message: string;
};

export async function runSentimentNow(
  formData: FormData,
): Promise<ActionResult> {
  const provider = String(formData.get("provider") || "").trim() as
    | Provider
    | "";
  const report = await runSentimentReport(
    provider ? { providers: [provider] } : undefined,
  );
  revalidatePath("/tools/sentiment-report");
  const parts: string[] = [];
  if (report.succeeded > 0) parts.push(`${report.succeeded} succeeded`);
  if (report.failed > 0) parts.push(`${report.failed} failed`);
  if (report.skipped.length > 0)
    parts.push(
      `skipped: ${report.skipped.map((s) => `${s.provider} (${s.reason})`).join("; ")}`,
    );
  return {
    ok: report.failed === 0,
    message: parts.join(" · ") || "nothing to run",
  };
}
