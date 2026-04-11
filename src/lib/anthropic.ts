import Anthropic from "@anthropic-ai/sdk";
import { prisma } from "./prisma";

export const MODELS = {
  fast: "claude-haiku-4-5",
  smart: "claude-sonnet-4-6",
} as const;

export async function getAnthropic(): Promise<Anthropic | null> {
  const settings = await prisma.settings.findUnique({ where: { id: 1 } });
  const key = settings?.anthropicKey || process.env.ANTHROPIC_API_KEY || "";
  if (!key) return null;
  return new Anthropic({ apiKey: key });
}
