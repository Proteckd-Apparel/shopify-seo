// Central helper for picking the right Settings field per provider.
// Kept separate from the senders so multiple features (outreach, prompt
// tracking) can share the same key-lookup without circular imports.

import type { Provider } from "@/lib/llm-outreach-shared";

type KeyBag = {
  openaiKey: string | null;
  anthropicKey: string | null;
  geminiKey: string | null;
  perplexityKey: string | null;
  xaiKey: string | null;
};

export function getProviderKey(
  provider: Provider,
  s: Partial<KeyBag> | null | undefined,
): string | null {
  if (!s) return null;
  switch (provider) {
    case "openai":
      return s.openaiKey ?? null;
    case "anthropic":
      return s.anthropicKey ?? null;
    case "gemini":
      return s.geminiKey ?? null;
    case "perplexity":
      return s.perplexityKey ?? null;
    case "xai":
      return s.xaiKey ?? null;
  }
}
