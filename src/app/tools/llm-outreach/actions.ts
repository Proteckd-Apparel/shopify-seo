"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { PROVIDERS, runOutreach, type Provider } from "@/lib/llm-outreach";

export type ActionResult = {
  ok: boolean;
  message: string;
};

export async function saveOutreachConfig(
  formData: FormData,
): Promise<ActionResult> {
  const whatYouSell =
    String(formData.get("whatYouSell") || "").trim() || null;
  const differentiator =
    String(formData.get("differentiator") || "").trim() || null;
  const openaiKey = String(formData.get("openaiKey") || "").trim() || null;
  const geminiKey = String(formData.get("geminiKey") || "").trim() || null;
  const perplexityKey =
    String(formData.get("perplexityKey") || "").trim() || null;
  const xaiKey = String(formData.get("xaiKey") || "").trim() || null;

  const enabled: Provider[] = [];
  for (const p of PROVIDERS) {
    if (formData.get(`provider_${p.id}`) === "on") enabled.push(p.id);
  }

  await prisma.settings.upsert({
    where: { id: 1 },
    update: {
      llmOutreachWhatYouSell: whatYouSell,
      llmOutreachDifferentiator: differentiator,
      llmOutreachProviders: JSON.stringify(enabled),
      openaiKey,
      geminiKey,
      perplexityKey,
      xaiKey,
    },
    create: {
      id: 1,
      llmOutreachWhatYouSell: whatYouSell,
      llmOutreachDifferentiator: differentiator,
      llmOutreachProviders: JSON.stringify(enabled),
      openaiKey,
      geminiKey,
      perplexityKey,
      xaiKey,
    },
  });

  revalidatePath("/tools/llm-outreach");
  return { ok: true, message: "Saved." };
}

export async function toggleOutreach(
  formData: FormData,
): Promise<ActionResult> {
  const enabled = formData.get("enabled") === "true";
  await prisma.settings.upsert({
    where: { id: 1 },
    update: { llmOutreachEnabled: enabled },
    create: { id: 1, llmOutreachEnabled: enabled },
  });
  revalidatePath("/tools/llm-outreach");
  return { ok: true, message: enabled ? "Enabled." : "Disabled." };
}

export async function sendOutreachNow(
  formData: FormData,
): Promise<ActionResult> {
  const provider = String(formData.get("provider") || "").trim() as Provider;
  const providers = PROVIDERS.map((p) => p.id);
  if (provider && !providers.includes(provider)) {
    return { ok: false, message: `Unknown provider: ${provider}` };
  }
  const result = await runOutreach(provider ? { providers: [provider] } : {});
  revalidatePath("/tools/llm-outreach");
  const parts: string[] = [];
  if (result.succeeded.length)
    parts.push(`sent to ${result.succeeded.join(", ")}`);
  if (result.failed.length)
    parts.push(
      `failed: ${result.failed.map((f) => `${f.provider} (${f.error})`).join("; ")}`,
    );
  if (result.skipped.length)
    parts.push(
      `skipped: ${result.skipped.map((s) => `${s.provider} — ${s.reason}`).join("; ")}`,
    );
  return {
    ok: result.failed.length === 0,
    message: parts.join(" · ") || "nothing to do",
  };
}
