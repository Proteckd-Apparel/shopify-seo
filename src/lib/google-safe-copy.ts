// Rewrite product titles + descriptions to satisfy Google Merchant Center's
// "Healthcare and medicine: misleading claims" policy without touching the
// storefront copy. The output is stored in product metafields and served
// only via a supplemental feed to Merchant Center — the live site keeps
// the original, brand-voice copy.
//
// What this strips:
//   - Claims of preventing, treating, curing, or diagnosing disease
//   - Claims of "protecting" or "shielding" from radiation / EMF / 5G / WiFi
//   - Implied health benefits ("for your health," "reduce exposure")
//
// What this keeps:
//   - Brand names (Proteck'd, AuraShield, PhaseX, etc.)
//   - Product category (hoodie, shirt, pants)
//   - Technical materials ("silver-lined," "conductive mesh," "Faraday")
//     — Faraday is a legitimate physics/electrical engineering term, not a
//     health claim
//   - Size, color, fit, target audience (men's / women's / kids)
//   - Style descriptors (crewneck, long sleeve, preppy, athletic)

import { getAnthropic, MODELS } from "./anthropic";

export type SafeCopyInput = {
  title: string;
  description: string;
  productType?: string | null;
  vendor?: string | null;
};

export type SafeCopyResult = {
  title: string;
  description: string;
};

const SYSTEM_PROMPT = `You rewrite ecommerce product copy to comply with Google Merchant Center's "Healthcare and medicine: misleading claims" policy. Your output is used ONLY in a supplemental feed sent to Google Shopping; the store's actual website copy is not being changed.

STRICT RULES:

1. Remove ALL language that implies health benefits, protection from harm, or prevention/treatment/cure of any condition. Specific triggers to strip:
   - "Protect", "protection", "protects you", "protective"
   - "Shield", "shielding from", "shields your body"
   - "Block", "blocks radiation", "blocks EMF"
   - "Prevent", "reduce exposure", "minimize"
   - "Safe from", "stay safe", "keep you safe"
   - "Health", "healthy", "for your health", "wellness"
   - "Radiation-free", "EMF-free", "5G-safe"
   - Any reference to cancer, tumors, fertility, sleep, stress, immune system

2. KEEP legitimate product information:
   - Brand names (Proteck'd, AuraShield, PhaseX, Nova, Zephyr, etc.)
   - Product category (hoodie, shirt, pants, hat)
   - Technical materials ("silver-lined", "conductive fabric", "copper-woven", "Faraday")
     — "Faraday" is a physics term, NOT a health claim — KEEP it
   - Size, color, fit, target (men's, women's, kids, unisex)
   - Style (long sleeve, crewneck, fitted, relaxed, preppy)
   - Thread count, fabric weight, weave type

3. Titles:
   - MAX 150 characters
   - Lead with brand + product type + key descriptor
   - Example transform:
     BAD:  "PhaseX AuraShield EMF Protection Running Shorts — Blocks Radiation"
     GOOD: "PhaseX AuraShield Running Shorts — Silver-Lined Athletic Wear"

4. Descriptions:
   - MAX 4500 characters
   - Plain text only (strip any HTML tags that come in)
   - Focus on materials, construction, fit, styling, care instructions
   - Do NOT invent facts

5. Output STRICT JSON only. No prose, no code fences, no explanation. Schema:
{
  "title": "...",
  "description": "..."
}`;

export async function rewriteForGoogleShopping(
  input: SafeCopyInput,
): Promise<SafeCopyResult> {
  const client = await getAnthropic();
  if (!client) throw new Error("Anthropic key not configured (Settings)");

  const cleanDesc = (input.description ?? "")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 8000);

  const userMsg = `Original title: ${input.title}
Product type: ${input.productType ?? "unknown"}
Vendor: ${input.vendor ?? "unknown"}

Original description:
${cleanDesc}

Rewrite title + description for Google Merchant Center. Return JSON now.`;

  const res = await client.messages.create({
    model: MODELS.fast,
    max_tokens: 2500,
    system: [
      {
        type: "text",
        text: SYSTEM_PROMPT,
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
