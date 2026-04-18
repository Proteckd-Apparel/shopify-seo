// Sentiment Report — asks each keyed LLM a structured question about how
// it perceives the brand and parses the JSON response. Useful as a rough
// "is the vibe positive?" check per model, not as a rigorous survey.

import { prisma } from "@/lib/prisma";
import { PROVIDERS, type Provider } from "@/lib/llm-outreach-shared";
import { sendChatMessage } from "@/lib/llm-chat";
import { getProviderKey } from "@/lib/llm-keys";

export type SentimentResult = {
  sentiment: "positive" | "neutral" | "negative" | "unknown";
  confidence: number | null;
  summary: string;
  strengths: string[];
  concerns: string[];
};

function buildPrompt(brand: string, url: string): string {
  return [
    `You are evaluating how you, as an AI assistant, perceive the brand "${brand}" (website: ${url}) based strictly on what you already know — do not browse the web.`,
    `Respond with ONLY a JSON object, no markdown, no prose. Shape:`,
    `{`,
    `  "sentiment": "positive" | "neutral" | "negative" | "unknown",`,
    `  "confidence": <number 0..1>,`,
    `  "summary": "<1-2 sentence overall perception>",`,
    `  "strengths": ["<short phrase>", ...],`,
    `  "concerns": ["<short phrase>", ...]`,
    `}`,
    `Use "unknown" if you have no meaningful knowledge of the brand. Keep strengths/concerns to 0-5 items each. No trailing commentary.`,
  ].join("\n");
}

// Best-effort parser: grabs the first {...} block and JSON.parses it.
// LLMs occasionally wrap the JSON in ```json fences or trailing prose.
export function parseSentimentResponse(raw: string): SentimentResult {
  const fallback: SentimentResult = {
    sentiment: "unknown",
    confidence: null,
    summary: "",
    strengths: [],
    concerns: [],
  };
  if (!raw) return fallback;
  const match = raw.match(/\{[\s\S]*\}/);
  if (!match) return { ...fallback, summary: raw.slice(0, 400) };
  try {
    const parsed = JSON.parse(match[0]) as Partial<SentimentResult>;
    const sentiment = (
      ["positive", "neutral", "negative", "unknown"].includes(
        parsed.sentiment as string,
      )
        ? (parsed.sentiment as SentimentResult["sentiment"])
        : "unknown"
    );
    const confidence =
      typeof parsed.confidence === "number" &&
      parsed.confidence >= 0 &&
      parsed.confidence <= 1
        ? parsed.confidence
        : null;
    return {
      sentiment,
      confidence,
      summary:
        typeof parsed.summary === "string" ? parsed.summary.slice(0, 500) : "",
      strengths: Array.isArray(parsed.strengths)
        ? parsed.strengths.filter((x) => typeof x === "string").slice(0, 10)
        : [],
      concerns: Array.isArray(parsed.concerns)
        ? parsed.concerns.filter((x) => typeof x === "string").slice(0, 10)
        : [],
    };
  } catch {
    return { ...fallback, summary: raw.slice(0, 400) };
  }
}

export type SentimentRunResult = {
  runs: number;
  succeeded: number;
  failed: number;
  skipped: { provider: string; reason: string }[];
};

export async function runSentimentReport(options?: {
  providers?: Provider[];
}): Promise<SentimentRunResult> {
  const result: SentimentRunResult = {
    runs: 0,
    succeeded: 0,
    failed: 0,
    skipped: [],
  };

  const s = await prisma.settings.findUnique({ where: { id: 1 } });
  const brand = s?.storeName?.trim() || s?.shopDomain || "";
  if (!brand) {
    result.skipped.push({ provider: "*", reason: "no storeName set" });
    return result;
  }
  const publicDomain =
    s?.storefrontDomain?.trim() || s?.shopDomain || "";
  const url = publicDomain
    ? `https://${publicDomain.replace(/^https?:\/\//, "")}`
    : "";
  const prompt = buildPrompt(brand, url);

  const targets: Provider[] = options?.providers ?? PROVIDERS.map((p) => p.id);
  for (const provider of targets) {
    const key = getProviderKey(provider, s);
    if (!key) {
      result.skipped.push({ provider, reason: "no API key" });
      continue;
    }
    result.runs++;
    try {
      const response = await sendChatMessage(provider, key, prompt, 500);
      const parsed = parseSentimentResponse(response);
      await prisma.sentimentReport.create({
        data: {
          provider,
          status: "success",
          sentiment: parsed.sentiment,
          confidence: parsed.confidence,
          summary: parsed.summary,
          strengths: JSON.stringify(parsed.strengths),
          concerns: JSON.stringify(parsed.concerns),
          rawResponse: response.slice(0, 4000),
        },
      });
      result.succeeded++;
    } catch (e) {
      const err = e instanceof Error ? e.message : String(e);
      await prisma.sentimentReport.create({
        data: {
          provider,
          status: "error",
          error: err.slice(0, 1000),
        },
      });
      result.failed++;
    }
  }

  return result;
}
