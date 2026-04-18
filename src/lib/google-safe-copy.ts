// Rewrite product titles + descriptions for Google Merchant Center.
//
// Strips the unambiguous personal-health claims that get products blocked
// (fertility, immune system, sperm count, blood pressure, cancer, sleep,
// gastrointestinal, etc.) while KEEPING the "EMF" keyword + the specific
// AuraShield / Faraday construction details that drive search traffic.
//
// Construction details are tag-routed:
//   - Tag "Aura Shield" → metal EMF-reducing blocks in pockets + chest
//   - Tag "Faraday"     → metal-woven throughout the fabric, reinforced pockets
//
// Tradeoff to know: keeping "EMF" in titles may still trip some Merchant
// Center flags. Google's policy is fuzzier around "EMF Reduction" (product
// function) than "EMF Protection" (health claim). If this copy still gets
// blocked, the next step is trimming more EMF language — accepting the
// keyword loss in Shopping while keeping it for organic Search.

import { getAnthropic, MODELS } from "./anthropic";

export type TechnologyTag = "aurashield" | "faraday" | "generic";

export type SafeCopyInput = {
  title: string;
  description: string;
  productType?: string | null;
  vendor?: string | null;
  tags?: string | null; // comma-separated Shopify tags
};

export type SafeCopyResult = {
  title: string;
  description: string;
};

// Detects which shielding tech a product uses. Match is case-sensitive on
// the Shopify tag value ("Aura Shield" vs "Faraday"), which is how the
// merchant has chosen to organize the catalog.
export function detectTechnology(
  tags: string | null | undefined,
): TechnologyTag {
  if (!tags) return "generic";
  const list = tags.split(",").map((t) => t.trim());
  if (list.includes("Aura Shield")) return "aurashield";
  if (list.includes("Faraday")) return "faraday";
  return "generic";
}

function techDescription(tech: TechnologyTag): string {
  switch (tech) {
    case "aurashield":
      return `AuraShield™ EMF Reduction Technology: metal EMF-reducing shielding blocks sewn into the front + back pockets and the chest logo panel. Pocket shielding blocks typical phone-carrying positions; chest panel adds coverage over the torso.`;
    case "faraday":
      return `Faraday construction: metal-woven shielding throughout the garment's primary fabric panels with reinforced shielding layers in the pocket areas. Provides broader coverage than pocket-only shielding.`;
    default:
      return `EMF-aware apparel construction.`;
  }
}

function SYSTEM_PROMPT(tech: TechnologyTag): string {
  return `You rewrite ecommerce product copy for Google Merchant Center's supplemental feed. The store sells EMF-aware apparel under the brand "Proteck'd Apparel". Your output is served ONLY to Google Shopping; the website keeps its original copy unchanged.

GOAL: strip unambiguous personal-health claims that violate Google's "Healthcare and medicine: misleading claims" policy, while keeping brand + category + material + EMF keyword so the listing still ranks for relevant searches.

ALWAYS STRIP (hard-delete, never rephrase):
- "Boosts fertility", "sperm count", "reproductive health"
- "Supports digestive health", "gastrointestinal"
- "Reduces hypertension", "blood pressure"
- "Strengthens immune system"
- "Cancer", "tumor", "radiation sickness"
- "Sleep", "stress reduction", "mental health", "mood"
- "Cures", "treats", "prevents disease", "heals"
- Any claim that the product affects a body part, body system, or health condition
- Any emoji + body-benefit combo (✅ Boosts X, ✅ Supports Y)

ALWAYS KEEP (do not sanitize these):
- Brand: "Proteck'd Apparel" (the store brand) — use this for g:brand equivalents
- Product line name (Aelix, PhaseX, Vibe, Zephyr, etc.) — this is the product family
- Category (jeans, hoodie, shirt, shorts, hat)
- EMF as a descriptor keyword ("EMF Reduction Technology", "EMF-aware denim")
- AuraShield™ / Faraday technology names and accurate construction
- Material (denim, cotton, stretch fabric, etc.)
- Sizes, colors, fit, gender/audience
- Care instructions, size charts

CONSTRUCTION TO USE (this product's technology):
${techDescription(tech)}

TITLES:
- Under 150 chars
- Format: "<Product Line> <Category> by Proteck'd Apparel — <Material/Descriptor>"
- Example GOOD: "Aelix Men's Low Rise Skinny Jeans by Proteck'd Apparel — EMF Reduction Denim with AuraShield Pocket Shielding"
- NEVER use "EMF Protection" verbatim (strong policy trigger). Use "EMF Reduction" or "EMF Shielding" or "EMF Technology" instead.

DESCRIPTIONS:
- Under 4500 chars
- Plain text only (strip incoming HTML)
- Lead with material + construction, THEN shielding details, THEN sizing/care
- Do NOT claim health outcomes. Describe product function ("reduces EMF from stored devices") instead of body outcomes ("boosts fertility")
- Keep the size chart if present

OUTPUT: STRICT JSON only, no prose, no code fences:
{
  "title": "...",
  "description": "..."
}`;
}

export async function rewriteForGoogleShopping(
  input: SafeCopyInput,
): Promise<SafeCopyResult> {
  const client = await getAnthropic();
  if (!client) throw new Error("Anthropic key not configured (Settings)");

  const tech = detectTechnology(input.tags);

  const cleanDesc = (input.description ?? "")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 8000);

  const userMsg = `Original title: ${input.title}
Product line / vendor: ${input.vendor ?? "unknown"}
Product type: ${input.productType ?? "unknown"}
Shopify tags: ${input.tags ?? ""}
Detected shielding tech: ${tech}

Original description:
${cleanDesc}

Rewrite for Google Merchant Center now. Return JSON.`;

  const res = await client.messages.create({
    model: MODELS.fast,
    max_tokens: 2500,
    system: [
      {
        type: "text",
        text: SYSTEM_PROMPT(tech),
        cache_control: { type: "ephemeral" },
      },
    ],
    messages: [{ role: "user", content: userMsg }],
  });

  let text = "";
  for (const block of res.content) {
    if (block.type === "text") text += block.text;
  }
  text = text.trim().replace(/^```(?:json)?/i, "").replace(/```$/i, "").trim();

  let parsed: { title?: string; description?: string } = {};
  try {
    parsed = JSON.parse(text);
  } catch {
    const start = text.indexOf("{");
    const end = text.lastIndexOf("}");
    if (start >= 0 && end > start) {
      try {
        parsed = JSON.parse(text.slice(start, end + 1));
      } catch {}
    }
  }

  const title = String(parsed.title ?? "").trim().slice(0, 150);
  const description = String(parsed.description ?? "").trim().slice(0, 4500);
  if (!title || !description) {
    throw new Error("AI returned empty title or description");
  }
  return { title, description };
}
