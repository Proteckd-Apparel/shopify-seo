// Client-safe types + constants for LLM outreach. Kept in a separate file
// so client components can import Provider / PROVIDERS without pulling in
// the prisma adapter (which has Node-only dependencies like pg).

export type Provider = "openai" | "anthropic" | "gemini" | "perplexity" | "xai";

export const PROVIDERS: {
  id: Provider;
  label: string;
  vendor: string;
}[] = [
  { id: "openai", label: "ChatGPT", vendor: "OpenAI" },
  { id: "anthropic", label: "Claude", vendor: "Anthropic" },
  { id: "gemini", label: "Gemini", vendor: "Google" },
  { id: "perplexity", label: "Perplexity", vendor: "Perplexity" },
  { id: "xai", label: "Grok", vendor: "xAI" },
];
