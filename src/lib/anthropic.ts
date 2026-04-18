import Anthropic from "@anthropic-ai/sdk";
import { prisma } from "./prisma";

// Central model registry. When Anthropic retires a model, bump both the
// fallback here and optionally override via env (ANTHROPIC_MODEL_FAST /
// ANTHROPIC_MODEL_SMART) without a redeploy. Keep `name` stable across
// migrations — the DB's Optimization.model column references whatever ID
// was in use at write time, so a rename here won't break history.
//
// Migration procedure when a model is retired:
//   1. Update FALLBACK values below to the replacement model.
//   2. If Anthropic's successor has a different system-prompt contract
//      (e.g. tool-use shape changed), regression-test vision-ai.ts and
//      ai-generate.ts before deploying.
//   3. Old audit rows keep the old model string — that's desired history.

const FALLBACK_FAST = "claude-haiku-4-5";
const FALLBACK_SMART = "claude-sonnet-4-6";

export const MODELS = {
  fast: process.env.ANTHROPIC_MODEL_FAST?.trim() || FALLBACK_FAST,
  smart: process.env.ANTHROPIC_MODEL_SMART?.trim() || FALLBACK_SMART,
} as const;

export async function getAnthropic(): Promise<Anthropic | null> {
  const settings = await prisma.settings.findUnique({ where: { id: 1 } });
  const key = settings?.anthropicKey || process.env.ANTHROPIC_API_KEY || "";
  if (!key) return null;
  return new Anthropic({ apiKey: key });
}
