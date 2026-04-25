// AI generation for SEO fields. One module, one model, three operations.
// We use Claude Haiku for cost (cents per thousand). Sonnet only if we
// later add a "rewrite tone" feature.

import { getAnthropic, MODELS } from "./anthropic";
import { loadOptimizerConfig } from "./optimizer-config";
import { prisma } from "./prisma";

// ---------- shared ----------

async function callClaude(
  system: string,
  user: string,
  maxTokens = 256,
): Promise<string> {
  const client = await getAnthropic();
  if (!client) throw new Error("Anthropic API key not configured (Settings).");
  const res = await client.messages.create({
    model: MODELS.fast,
    max_tokens: maxTokens,
    system,
    messages: [{ role: "user", content: user }],
  });
  // Take the first text block.
  for (const block of res.content) {
    if (block.type === "text") return block.text.trim();
  }
  return "";
}

function stripQuotes(s: string): string {
  return s.replace(/^["'`]+|["'`]+$/g, "").trim();
}

// ---------- meta title ----------

export async function generateMetaTitle(args: {
  title: string;
  bodyHtml?: string | null;
  vendor?: string | null;
  productType?: string | null;
  tags?: string | null;
  type: string;
}): Promise<string> {
  const cfg = await loadOptimizerConfig();
  const body = (args.bodyHtml ?? "").replace(/<[^>]+>/g, " ").slice(0, 800);
  const meta = [
    args.vendor && `Brand: ${args.vendor}`,
    args.productType && `Type: ${args.productType}`,
    args.tags && `Tags: ${args.tags}`,
  ]
    .filter(Boolean)
    .join("\n");

  const system = `You write SEO meta titles for an ecommerce store. Output a single line plain text title only. Hard rules:
- 50–60 characters total
- Include the main keyword from the resource title
- No quotes, no markdown, no trailing punctuation
- Title case
- Do not invent facts or specs not in the source
${cfg.notes ? `\nBrand voice / rules:\n${cfg.notes}` : ""}`;

  const user = `Resource type: ${args.type}
Resource title: ${args.title}
${meta}

Body excerpt:
${body}

Write the SEO meta title now.`;

  return stripQuotes(await callClaude(system, user, 80));
}

// ---------- meta description ----------

export async function generateMetaDescription(args: {
  title: string;
  bodyHtml?: string | null;
  vendor?: string | null;
  productType?: string | null;
  tags?: string | null;
  type: string;
}): Promise<string> {
  const cfg = await loadOptimizerConfig();
  const body = (args.bodyHtml ?? "").replace(/<[^>]+>/g, " ").slice(0, 1500);
  const meta = [
    args.vendor && `Brand: ${args.vendor}`,
    args.productType && `Type: ${args.productType}`,
    args.tags && `Tags: ${args.tags}`,
  ]
    .filter(Boolean)
    .join("\n");

  const system = `You write SEO meta descriptions for an ecommerce store. Output a single sentence (or two short ones) of plain text. Hard rules:
- 140–160 characters total
- Lead with the main benefit / what the customer gets
- One soft call to action at the end
- No quotes, no markdown, no emoji
- Do not invent facts or specs not in the source
${cfg.notes ? `\nBrand voice / rules:\n${cfg.notes}` : ""}`;

  const user = `Resource type: ${args.type}
Resource title: ${args.title}
${meta}

Body excerpt:
${body}

Write the meta description now.`;

  return stripQuotes(await callClaude(system, user, 200));
}

// ---------- alt text ----------

export async function generateAltText(args: {
  productTitle: string;
  productType?: string | null;
  vendor?: string | null;
  position: number;
}): Promise<string> {
  const cfg = await loadOptimizerConfig();
  const system = `You write image alt text for ecommerce product photos. Output a single short phrase only. Hard rules:
- 8–14 words
- Describe what is visibly in the photo, grounded in the product title
- Mention brand if relevant
- No marketing copy, no quotes, no period at the end
- Do not invent colors, materials, or details not in the title
${cfg.notes ? `\nBrand voice / rules:\n${cfg.notes}` : ""}`;

  const meta = [
    args.vendor && `Brand: ${args.vendor}`,
    args.productType && `Type: ${args.productType}`,
  ]
    .filter(Boolean)
    .join("\n");

  const user = `Product title: ${args.productTitle}
${meta}
Image position in product gallery: ${args.position} (1 is the main photo)

Write the alt text.`;

  return stripQuotes(await callClaude(system, user, 80));
}

// ---------- helpers used by optimizer pages ----------

export async function generateForResource(
  resourceId: string,
  field: "seoTitle" | "seoDescription",
): Promise<string> {
  const r = await prisma.resource.findUnique({ where: { id: resourceId } });
  if (!r) throw new Error("Resource not found");
  const args = {
    title: r.title ?? r.handle ?? "",
    bodyHtml: r.bodyHtml,
    vendor: r.vendor,
    productType: r.productType,
    tags: r.tags,
    type: r.type,
  };
  if (field === "seoTitle") return generateMetaTitle(args);
  return generateMetaDescription(args);
}

export async function generateForImage(imageId: string): Promise<string> {
  const img = await prisma.image.findUnique({
    where: { id: imageId },
    include: { resource: true },
  });
  if (!img) throw new Error("Image not found");

  // Vision-based alt text: actually look at the photo and describe what's
  // in it, grounded in the resource title. Falls back to the title-only
  // generator if Vision throws (no image URL, fetch fails, etc.) so we
  // still write *something* rather than failing the whole run.
  if (img.src) {
    try {
      const { describeImageWithVision } = await import("./vision-ai");
      const v = await describeImageWithVision(
        img.src,
        {
          title: img.resource?.title,
          vendor: img.resource?.vendor,
          productType: img.resource?.productType,
        },
        { alt: true, filename: false },
      );
      if (v.altText) return v.altText;
    } catch {
      // fall through to title-only fallback
    }
  }

  // Position is roughly the index of this image in its resource — we don't
  // store an order column, so we just count.
  const siblings = await prisma.image.findMany({
    where: { resourceId: img.resourceId },
    orderBy: { id: "asc" },
    select: { id: true },
  });
  const position = siblings.findIndex((s) => s.id === img.id) + 1;
  return generateAltText({
    productTitle: img.resource?.title ?? "",
    productType: img.resource?.productType,
    vendor: img.resource?.vendor,
    position,
  });
}
