// Shared chat-completion senders for the 5 LLM providers we integrate
// with. Kept free of prisma imports so both the outreach and prompt
// tracking flows can reuse it without tripping the Next "use client"
// boundary rules (see feedback_next16_client_server_boundary).

import type { Provider } from "@/lib/llm-outreach-shared";

// Cheapest production-grade chat model per provider. Bump only when a
// provider deprecates one — the default cadence is weekly so scale isn't
// a concern.
export const MODELS: Record<Provider, string> = {
  openai: "gpt-4o-mini",
  anthropic: "claude-haiku-4-5",
  gemini: "gemini-2.5-flash",
  perplexity: "sonar",
  xai: "grok-3-mini",
};

async function sendOpenAI(
  key: string,
  message: string,
  maxTokens: number,
): Promise<string> {
  const r = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${key}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: MODELS.openai,
      messages: [{ role: "user", content: message }],
      max_tokens: maxTokens,
    }),
  });
  const data = (await r.json()) as {
    choices?: { message?: { content?: string } }[];
    error?: { message?: string };
  };
  if (!r.ok) throw new Error(data.error?.message || `HTTP ${r.status}`);
  return data.choices?.[0]?.message?.content ?? "";
}

async function sendAnthropic(
  key: string,
  message: string,
  maxTokens: number,
): Promise<string> {
  const r = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "x-api-key": key,
      "anthropic-version": "2023-06-01",
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: MODELS.anthropic,
      max_tokens: maxTokens,
      messages: [{ role: "user", content: message }],
    }),
  });
  const data = (await r.json()) as {
    content?: { text?: string }[];
    error?: { message?: string };
  };
  if (!r.ok) throw new Error(data.error?.message || `HTTP ${r.status}`);
  return data.content?.[0]?.text ?? "";
}

async function sendGemini(
  key: string,
  message: string,
  maxTokens: number,
): Promise<string> {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${MODELS.gemini}:generateContent?key=${encodeURIComponent(key)}`;
  const r = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      contents: [{ parts: [{ text: message }] }],
      generationConfig: { maxOutputTokens: maxTokens },
    }),
  });
  const data = (await r.json()) as {
    candidates?: { content?: { parts?: { text?: string }[] } }[];
    error?: { message?: string };
  };
  if (!r.ok) throw new Error(data.error?.message || `HTTP ${r.status}`);
  return data.candidates?.[0]?.content?.parts?.[0]?.text ?? "";
}

async function sendPerplexity(
  key: string,
  message: string,
  maxTokens: number,
): Promise<string> {
  const r = await fetch("https://api.perplexity.ai/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${key}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: MODELS.perplexity,
      messages: [{ role: "user", content: message }],
      max_tokens: maxTokens,
    }),
  });
  const data = (await r.json()) as {
    choices?: { message?: { content?: string } }[];
    error?: { message?: string };
  };
  if (!r.ok) throw new Error(data.error?.message || `HTTP ${r.status}`);
  return data.choices?.[0]?.message?.content ?? "";
}

async function sendXai(
  key: string,
  message: string,
  maxTokens: number,
): Promise<string> {
  const r = await fetch("https://api.x.ai/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${key}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: MODELS.xai,
      messages: [{ role: "user", content: message }],
      max_tokens: maxTokens,
    }),
  });
  const data = (await r.json()) as {
    choices?: { message?: { content?: string } }[];
    error?: { message?: string };
  };
  if (!r.ok) throw new Error(data.error?.message || `HTTP ${r.status}`);
  return data.choices?.[0]?.message?.content ?? "";
}

export async function sendChatMessage(
  provider: Provider,
  key: string,
  message: string,
  maxTokens = 120,
): Promise<string> {
  switch (provider) {
    case "openai":
      return sendOpenAI(key, message, maxTokens);
    case "anthropic":
      return sendAnthropic(key, message, maxTokens);
    case "gemini":
      return sendGemini(key, message, maxTokens);
    case "perplexity":
      return sendPerplexity(key, message, maxTokens);
    case "xai":
      return sendXai(key, message, maxTokens);
  }
}
