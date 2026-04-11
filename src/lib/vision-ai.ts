// Vision AI helper using Claude Haiku 4.5 with image input. Single function
// that takes an image URL and returns either alt text, a filename, or both
// in one call (cheapest — saves a roundtrip).

import { getAnthropic, MODELS } from "./anthropic";
import { loadOptimizerConfig } from "./optimizer-config";

export type VisionResult = {
  altText?: string;
  filenameSlug?: string;
};

export async function describeImageWithVision(
  imageUrl: string,
  productContext: { title?: string | null; vendor?: string | null; productType?: string | null },
  want: { alt: boolean; filename: boolean },
): Promise<VisionResult> {
  const client = await getAnthropic();
  if (!client) throw new Error("Anthropic key not configured (Settings)");
  const cfg = await loadOptimizerConfig();

  const cleanUrl = imageUrl.split("?")[0];
  const res = await fetch(cleanUrl);
  if (!res.ok) throw new Error(`Could not fetch image: ${res.status}`);
  const arr = await res.arrayBuffer();
  const base64 = Buffer.from(arr).toString("base64");
  const mediaType =
    res.headers.get("content-type")?.split(";")[0] ?? "image/jpeg";

  const wantAlt = want.alt;
  const wantFile = want.filename;

  const responseShape = [
    wantAlt ? `"alt": "<8-14 words describing the image grounded in the product>"` : "",
    wantFile
      ? `"filename": "<5-8 words slugified for SEO, lowercase, hyphenated, no extension>"`
      : "",
  ]
    .filter(Boolean)
    .join(",\n  ");

  const system = `You analyze an ecommerce product photo and output STRICT JSON only — no prose, no markdown, no code fences. The JSON keys must match the schema below.

Hard rules:
- Ground the description in what is VISIBLY in the photo
- Use the product title for context, never invent specs not in the image
- alt text: 8-14 words, no quotes, no period at end
- filename: 5-8 words, hyphens between words, ascii only, no extension
${cfg.notes ? `\nBrand voice / rules:\n${cfg.notes}` : ""}

Output schema:
{
  ${responseShape}
}`;

  const meta = [
    productContext.title && `Product title: ${productContext.title}`,
    productContext.vendor && `Vendor: ${productContext.vendor}`,
    productContext.productType && `Type: ${productContext.productType}`,
  ]
    .filter(Boolean)
    .join("\n");

  const message = await client.messages.create({
    model: MODELS.fast,
    max_tokens: 300,
    system,
    messages: [
      {
        role: "user",
        content: [
          {
            type: "image",
            source: {
              type: "base64",
              media_type: mediaType as "image/jpeg" | "image/png" | "image/webp" | "image/gif",
              data: base64,
            },
          },
          {
            type: "text",
            text: `${meta}\n\nReturn the JSON now.`,
          },
        ],
      },
    ],
  });

  let text = "";
  for (const block of message.content) {
    if (block.type === "text") text += block.text;
  }
  text = text.trim().replace(/^```(?:json)?/i, "").replace(/```$/i, "").trim();

  let parsed: { alt?: string; filename?: string } = {};
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

  return {
    altText: parsed.alt?.trim(),
    filenameSlug: parsed.filename?.trim(),
  };
}
