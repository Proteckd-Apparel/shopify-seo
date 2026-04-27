// Prompt Tracking — periodically asks each keyed LLM provider a list of
// tracked prompts ("best EMF clothing", "faraday hat recommendations",
// etc.) and records whether our brand name showed up in the response.
// Data flows into PromptResult so we can tell whether optimization work
// is shifting the needle in LLM answers.

import { prisma } from "@/lib/prisma";
import { PROVIDERS, type Provider } from "@/lib/llm-outreach-shared";
import { sendChatMessage } from "@/lib/llm-chat";
import { getProviderKey } from "@/lib/llm-keys";

export type TrackingRunResult = {
  promptsRun: number;
  totalCalls: number;
  mentions: number;
  errors: number;
  skipped: { reason: string }[];
};

export function computeBrandKeywords(s: {
  promptBrandKeywords: string | null;
  storeName: string | null;
  shopDomain: string | null;
}): string[] {
  const explicit = (s.promptBrandKeywords ?? "")
    .split(",")
    .map((k) => k.trim())
    .filter(Boolean);
  if (explicit.length > 0) return explicit;
  const fallback: string[] = [];
  if (s.storeName?.trim()) fallback.push(s.storeName.trim());
  if (s.shopDomain) {
    const host = s.shopDomain.replace(/^https?:\/\//, "").split(".")[0];
    if (host) fallback.push(host);
  }
  return fallback;
}

// Returns the first keyword that appears in the response text, or null.
// Word-boundary match — naive substring containment matched things like
// "snapple" for "Apple" or "demand" for "EMF", flooding the dashboards
// with false-positive brand mentions.
export function detectMention(
  response: string,
  keywords: string[],
): string | null {
  const hay = response.toLowerCase();
  for (const k of keywords) {
    if (!k) continue;
    const needle = k.toLowerCase().trim();
    if (!needle) continue;
    // Escape regex specials so a keyword like "C++" still works.
    const escaped = needle.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const re = new RegExp(`(^|[^a-z0-9])${escaped}([^a-z0-9]|$)`, "i");
    if (re.test(hay)) return k;
  }
  return null;
}

function enabledProviders(json: string | null | undefined): Provider[] {
  if (!json) return PROVIDERS.map((p) => p.id);
  try {
    return JSON.parse(json) as Provider[];
  } catch {
    return PROVIDERS.map((p) => p.id);
  }
}

export async function runPromptTracking(options?: {
  promptIds?: string[];
  skipEnabledCheck?: boolean;
}): Promise<TrackingRunResult> {
  const result: TrackingRunResult = {
    promptsRun: 0,
    totalCalls: 0,
    mentions: 0,
    errors: 0,
    skipped: [],
  };

  const s = await prisma.settings.findUnique({ where: { id: 1 } });
  if (!s?.promptTrackingEnabled && !options?.skipEnabledCheck) {
    result.skipped.push({ reason: "prompt tracking disabled" });
    return result;
  }

  const providers = enabledProviders(s?.promptTrackingProviders ?? null);
  const keywords = computeBrandKeywords({
    promptBrandKeywords: s?.promptBrandKeywords ?? null,
    storeName: s?.storeName ?? null,
    shopDomain: s?.shopDomain ?? null,
  });
  if (keywords.length === 0) {
    result.skipped.push({ reason: "no brand keywords + no store name set" });
    return result;
  }

  const prompts = await prisma.trackedPrompt.findMany({
    where: options?.promptIds
      ? { id: { in: options.promptIds } }
      : { enabled: true },
    orderBy: { createdAt: "asc" },
  });

  for (const p of prompts) {
    result.promptsRun++;
    for (const provider of providers) {
      const key = getProviderKey(provider, s);
      if (!key) continue;
      result.totalCalls++;
      try {
        const response = await sendChatMessage(provider, key, p.text, 400);
        const matched = detectMention(response, keywords);
        if (matched) result.mentions++;
        await prisma.promptResult.create({
          data: {
            promptId: p.id,
            provider,
            status: "success",
            response: response.slice(0, 4000),
            brandMentioned: Boolean(matched),
            matchedKeyword: matched,
          },
        });
      } catch (e) {
        result.errors++;
        const err = e instanceof Error ? e.message : String(e);
        await prisma.promptResult.create({
          data: {
            promptId: p.id,
            provider,
            status: "error",
            error: err.slice(0, 1000),
          },
        });
      }
    }
  }

  return result;
}
