"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { PROVIDERS, type Provider } from "@/lib/llm-outreach-shared";
import { runPromptTracking } from "@/lib/prompt-tracking";

export type ActionResult = {
  ok: boolean;
  message: string;
};

export async function savePromptTrackingConfig(
  formData: FormData,
): Promise<ActionResult> {
  const brandKeywords =
    String(formData.get("brandKeywords") || "").trim() || null;

  const providerIds = PROVIDERS.map((p) => p.id) as Provider[];
  const enabled: Provider[] = [];
  for (const p of providerIds) {
    if (formData.get(`provider_${p}`) === "on") enabled.push(p);
  }

  await prisma.settings.upsert({
    where: { id: 1 },
    update: {
      promptBrandKeywords: brandKeywords,
      promptTrackingProviders: JSON.stringify(enabled),
    },
    create: {
      id: 1,
      promptBrandKeywords: brandKeywords,
      promptTrackingProviders: JSON.stringify(enabled),
    },
  });
  revalidatePath("/tools/prompt-tracking");
  return { ok: true, message: "Saved." };
}

export async function toggleTracking(
  formData: FormData,
): Promise<ActionResult> {
  const enabled = formData.get("enabled") === "true";
  await prisma.settings.upsert({
    where: { id: 1 },
    update: { promptTrackingEnabled: enabled },
    create: { id: 1, promptTrackingEnabled: enabled },
  });
  revalidatePath("/tools/prompt-tracking");
  return { ok: true, message: enabled ? "Enabled." : "Disabled." };
}

export async function addPrompt(formData: FormData): Promise<ActionResult> {
  const text = String(formData.get("text") || "").trim();
  if (!text) return { ok: false, message: "Prompt cannot be empty." };
  if (text.length > 500)
    return { ok: false, message: "Prompt must be under 500 characters." };
  await prisma.trackedPrompt.create({ data: { text } });
  revalidatePath("/tools/prompt-tracking");
  return { ok: true, message: "Prompt added." };
}

export async function deletePrompt(
  formData: FormData,
): Promise<ActionResult> {
  const id = String(formData.get("id") || "").trim();
  if (!id) return { ok: false, message: "Missing prompt id." };
  await prisma.trackedPrompt.delete({ where: { id } });
  revalidatePath("/tools/prompt-tracking");
  return { ok: true, message: "Deleted." };
}

export async function togglePromptEnabled(
  formData: FormData,
): Promise<ActionResult> {
  const id = String(formData.get("id") || "").trim();
  const enabled = formData.get("enabled") === "true";
  if (!id) return { ok: false, message: "Missing prompt id." };
  await prisma.trackedPrompt.update({ where: { id }, data: { enabled } });
  revalidatePath("/tools/prompt-tracking");
  return { ok: true, message: enabled ? "Enabled." : "Disabled." };
}

export async function runPromptNow(
  formData: FormData,
): Promise<ActionResult> {
  const id = String(formData.get("id") || "").trim();
  const report = await runPromptTracking(
    id ? { promptIds: [id], skipEnabledCheck: true } : { skipEnabledCheck: true },
  );
  revalidatePath("/tools/prompt-tracking");
  if (report.skipped.length > 0 && report.totalCalls === 0) {
    return { ok: false, message: report.skipped.map((s) => s.reason).join("; ") };
  }
  const mentionPct =
    report.totalCalls > 0
      ? Math.round((report.mentions / report.totalCalls) * 100)
      : 0;
  return {
    ok: report.errors === 0,
    message: `Ran ${report.promptsRun} prompt(s) across ${report.totalCalls} call(s). Mentioned in ${report.mentions} (${mentionPct}%). Errors: ${report.errors}.`,
  };
}
