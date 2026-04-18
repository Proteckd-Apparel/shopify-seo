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

// Defensive response reader: upstream providers sometimes return HTML
// (e.g. Cloudflare 502), plain text (rate-limit hints), or an error object
// that doesn't look like their happy-path schema. Checking r.ok first and
// handling non-JSON keeps us from surfacing "Unexpected token <" to the UI
// instead of the real HTTP status.
async function readJsonOrThrow<T>(r: Response): Promise<T> {
  const text = await r.text();
  if (!r.ok) {
    let msg = "";
    try {
      const parsed = JSON.parse(text) as {
        error?: { message?: string } | string;
      };
      if (typeof parsed?.error === "string") msg = parsed.error;
      else if (parsed?.error?.message) msg = parsed.error.message;
    } catch {
      msg = text.slice(0, 200);
    }
    throw new Error(`HTTP ${r.status}${msg ? `: ${msg}` : ""}`);
  }
  try {
    return JSON.parse(text) as T;
  } catch {
    throw new Error(`Non-JSON response: ${text.slice(0, 200)}`);
  }
}

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
  const data = await readJsonOrThrow<{
    choices?: { message?: { content?: string } }[];
  }>(r);
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
  const data = await readJsonOrThrow<{
    content?: { text?: string }[];
  }>(r);
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
  const data = await readJsonOrThrow<{
    candidates?: { content?: { parts?: { text?: string }[] } }[];
  }>(r);
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
  const data = await readJsonOrThrow<{
    choices?: { message?: { content?: string } }[];
  }>(r);
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
  const data = await readJsonOrThrow<{
    choices?: { message?: { content?: string } }[];
  }>(r);
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
