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
      return `AuraShield™ EMF Protection Technology: metal EMF-shielding blocks sewn into the front + back pockets and the chest logo panel. Pocket shielding covers typical phone-carrying positions; chest panel adds torso coverage.`;
    case "faraday":
      return `Faraday full-garment EMF Protection: silver-infused fabric blend (approx. 42% silver / 53% cotton / 5% polyester) providing 99% EMF blocking across the whole garment — 3G, 4G, 5G, Wi-Fi, and Bluetooth. Also UPF 50 UV protection and antimicrobial / anti-odor treatment.`;
    default:
      return `EMF-aware apparel construction.`;
  }
}

function SYSTEM_PROMPT(tech: TechnologyTag): string {
  return `You rewrite ecommerce product copy for Google Merchant Center's supplemental feed. The store sells EMF-aware apparel under the brand "Proteck'd Apparel". Your output is served ONLY to Google Shopping; the website keeps its original copy unchanged.

GOAL: strip unambiguous personal-health claims (digestion, fertility, immune, blood pressure, etc.) while keeping the "EMF Protection" keyword + the specific AuraShield / Faraday construction details that drive search traffic.

ALWAYS STRIP (hard-delete, never rephrase):
- "Boosts fertility", "sperm count", "reproductive health"
- "Supports digestive health", "gastrointestinal", "digestive function"
- "Reduces hypertension", "blood pressure", "circulation", "blood flow", "heart health", "cardiac"
- "Strengthens immune system", "immune defense"
- "Cancer", "tumor", "radiation sickness"
- "Sleep", "stress reduction", "mental health", "mood"
- "Cures", "treats", "prevents disease", "heals"
- Any claim that the product affects a body part, body system, or health condition
- Emoji + body-benefit bullets (e.g. ✅ Boosts X, ✅ Supports Y)
- "Recommended for: individuals seeking to support [body system]" — strip the body-system part

ALWAYS KEEP (do not sanitize these):
- Brand: "Proteck'd Apparel" (the store brand)
- Product line name (Aelix, PhaseX, Vibe, Zephyr, etc.)
- Category (jeans, hoodie, shirt, shorts, hat)
- "EMF Protection" and related keywords — "EMF-Blocking Technology", "EMF Shielding", "99% EMF Protection", "blocks 3G / 4G / 5G / Wi-Fi / Bluetooth". These are valuable keywords; DO NOT strip them.
- AuraShield™ / Faraday technology names + accurate construction
- Fabric composition (percentages, silver content, cotton/polyester blend)
- Sizes, colors, fit, gender/audience
- UPF ratings, antimicrobial, breathability, washing instructions
- Size charts

CONSTRUCTION TO USE (this product's technology):
${techDescription(tech)}

STYLE (match this tone from a reference Faraday product):
- Title example: "Faraday Short Sleeve T-Shirt – Comfort and EMF Protection"
- Description opens with 1-2 sentence hook
- Short bulleted benefit lines, each pairing a feature with its function
  (e.g. "EMF-Blocking Technology: Reduces exposure to electromagnetic radiation")
- Product function, fabric, fit, sizing — in that order
- End with a brief "Stay protected and stylish" style call-out
- No emojis, no ✅ marks (they read as scammy in Shopping feeds)

TITLES:
- Under 150 chars
- Format examples:
  * "Aelix Men's Low Rise Skinny Jeans by Proteck'd Apparel – AuraShield EMF Protection"
  * "Zephyr Faraday EMF Protection T-Shirt by Proteck'd Apparel – Silver-Infused Fabric"

DESCRIPTIONS:
- Under 4500 chars
- Plain text only (strip incoming HTML)
- Use the bullet format above
- Describe product FUNCTION ("blocks 99% of EMF radiation") not body OUTCOME ("boosts fertility")
- Keep fabric composition and size chart if present

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
    // max_tokens bumped to 4000 — the source descriptions include full size
    // charts that balloon the output JSON past 2500 tokens, truncating mid-
    // string and breaking the parse.
    model: MODELS.fast,
    max_tokens: 4000,
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
  let parseError: string | null = null;
  try {
    parsed = JSON.parse(text);
  } catch (e) {
    parseError = e instanceof Error ? e.message : "unknown";
    const start = text.indexOf("{");
    const end = text.lastIndexOf("}");
    if (start >= 0 && end > start) {
      try {
        parsed = JSON.parse(text.slice(start, end + 1));
        parseError = null;
      } catch (e2) {
        parseError = e2 instanceof Error ? e2.message : "unknown (extraction)";
      }
    }
  }

  const title = String(parsed.title ?? "").trim().slice(0, 150);
  const description = String(parsed.description ?? "").trim().slice(0, 4500);
  if (!title || !description) {
    // Surface what actually came back so bulk failures are debuggable
    // instead of silent. Truncate to 400 chars to keep the error message
    // from ballooning DB rows.
    const stopReason = res.stop_reason ?? "unknown";
    const preview = text.slice(0, 400).replace(/\s+/g, " ");
    throw new Error(
      `AI returned empty title or description (stop_reason=${stopReason}, parseErr=${parseError ?? "none"}, titleLen=${title.length}, descLen=${description.length}, preview=${preview})`,
    );
  }
  return { title, description };
}
