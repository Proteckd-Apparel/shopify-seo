"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { shopifyGraphQL } from "@/lib/shopify";
import { ensureJsonMetafieldDefinition, setMetafield } from "@/lib/shopify-metafields";
import { getAnthropic, MODELS } from "@/lib/anthropic";
import { loadOptimizerConfig } from "@/lib/optimizer-config";
import { startJob, setProgress, finishJob } from "@/lib/bulk-job";
import {
  buildBreadcrumbForResource,
  generateProductSchema,
  type FaqItem,
  type RealReviews,
} from "@/lib/json-ld-generators";
import { fetchReviewsForHandle } from "@/lib/proteckd-reviews";
import {
  buildProductTypeToCollectionMap,
  resolvePrimaryCollection,
} from "@/lib/primary-collection";
import { setJsonLd } from "@/lib/shopify-metafields";

// ---------- Read FAQs from a product's existing metafield ----------

const PRODUCT_METAFIELD_QUERY = /* GraphQL */ `
  query ProductFaqs($id: ID!) {
    product(id: $id) {
      id
      metafield(namespace: "custom", key: "faqs") {
        id
        value
        type
      }
    }
  }
`;

export async function loadFaqsForProduct(
  productId: string,
): Promise<FaqItem[]> {
  try {
    const data: {
      product: {
        metafield: { value: string } | null;
      } | null;
    } = await shopifyGraphQL(PRODUCT_METAFIELD_QUERY, { id: productId });
    const raw = data.product?.metafield?.value;
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter(
        (it): it is FaqItem =>
          it && typeof it.question === "string" && typeof it.answer === "string",
      )
      .map((it) => ({
        question: String(it.question),
        answer: String(it.answer),
      }));
  } catch {
    return [];
  }
}

// ---------- Save FAQs (writes both the data metafield AND the json-ld) ----------

export type FaqSaveResult = { ok: boolean; message: string };

export async function saveFaqsForProduct(
  productId: string,
  faqs: FaqItem[],
): Promise<FaqSaveResult> {
  try {
    // 1) Persist the FAQ data on its own metafield so the editor can re-load
    //    next time and so the theme could read it directly if desired.
    await ensureJsonMetafieldDefinition(
      "PRODUCT",
      "custom",
      "faqs",
      "Product FAQs",
    );
    await setMetafield({
      ownerId: productId,
      namespace: "custom",
      key: "faqs",
      type: "json",
      value: JSON.stringify(faqs),
    });

    // 2) Re-generate the product JSON-LD with the FAQs appended and write it
    //    to the same custom.json_ld metafield the rest of the schema lives in.
    const cfg = await loadOptimizerConfig();
    const r = await prisma.resource.findUnique({
      where: { id: productId },
      include: { images: true },
    });
    if (!r) return { ok: false, message: "Resource not found" };

    const settings = await prisma.settings.findUnique({ where: { id: 1 } });
    const shop = {
      domain: settings?.shopDomain ?? "",
      name: settings?.shopDomain ?? "",
    };

    let reviews: RealReviews | null = null;
    try {
      const agg = r.handle ? await fetchReviewsForHandle(r.handle) : null;
      if (agg) {
        reviews = {
          rating: agg.rating,
          count: agg.count,
          reviews: agg.reviews.map((rv) => ({
            rating: rv.rating,
            title: rv.title,
            body: rv.body,
            reviewer: rv.reviewer,
            date: rv.date,
          })),
        };
      }
    } catch {}

    const collectionMap = await buildProductTypeToCollectionMap();
    const primaryCollection = resolvePrimaryCollection(
      r.productType,
      collectionMap,
    );
    const schema = generateProductSchema(
      r,
      cfg.jsonLd.products,
      shop,
      reviews,
      cfg.jsonLd.other.breadcrumb,
      faqs,
      primaryCollection,
    );
    await setJsonLd(r.id, schema);

    revalidatePath("/products/json-ld-faq");
    return { ok: true, message: `Saved ${faqs.length} FAQs` };
  } catch (e) {
    return { ok: false, message: e instanceof Error ? e.message : "Failed" };
  }
}

// ---------- AI: generate FAQs from the product description ----------

export type GenerateFaqResult = {
  ok: boolean;
  faqs?: FaqItem[];
  message?: string;
};

export async function generateFaqsAI(
  productId: string,
  count = 5,
): Promise<GenerateFaqResult> {
  try {
    const r = await prisma.resource.findUnique({ where: { id: productId } });
    if (!r) return { ok: false, message: "Product not found" };

    const client = await getAnthropic();
    if (!client) return { ok: false, message: "Anthropic key not configured" };

    const body = (r.bodyHtml ?? "").replace(/<[^>]+>/g, " ").slice(0, 3000);

    const system = `You write product FAQs for an ecommerce store. Output ONLY a JSON array of exactly ${count} objects with the keys "question" and "answer". No prose, no markdown fences, no explanation. Keep questions short (under 80 chars) and answers under 250 chars. Do not invent facts not present in the product description.`;

    const user = `Product title: ${r.title}
Product type: ${r.productType ?? ""}
Vendor: ${r.vendor ?? ""}

Description:
${body}

Generate ${count} FAQs as a JSON array.`;

    const res = await client.messages.create({
      model: MODELS.fast,
      max_tokens: 1500,
      system,
      messages: [{ role: "user", content: user }],
    });

    let text = "";
    for (const block of res.content) {
      if (block.type === "text") text += block.text;
    }
    text = text.trim();
    // Strip code fences if Claude added them
    text = text.replace(/^```(?:json)?/i, "").replace(/```$/i, "").trim();

    let parsed: unknown;
    try {
      parsed = JSON.parse(text);
    } catch {
      // Sometimes Claude wraps the array in an object — try to find the first [
      const startIdx = text.indexOf("[");
      const endIdx = text.lastIndexOf("]");
      if (startIdx >= 0 && endIdx > startIdx) {
        parsed = JSON.parse(text.slice(startIdx, endIdx + 1));
      } else {
        return { ok: false, message: "AI returned invalid JSON" };
      }
    }
    if (!Array.isArray(parsed)) {
      return { ok: false, message: "AI did not return an array" };
    }
    const faqs: FaqItem[] = parsed
      .filter(
        (it): it is FaqItem =>
          it && typeof it.question === "string" && typeof it.answer === "string",
      )
      .map((it) => ({
        question: String(it.question).trim(),
        answer: String(it.answer).trim(),
      }));
    if (faqs.length === 0) {
      return { ok: false, message: "No valid FAQs in AI response" };
    }
    return { ok: true, faqs };
  } catch (e) {
    return { ok: false, message: e instanceof Error ? e.message : "Failed" };
  }
}

// ---------- Bulk: generate + save AI FAQs for every active product ----------

export type BulkFaqResult = {
  ok: boolean;
  message: string;
  processed: number;
  saved: number;
  skipped: number;
  failed: number;
};

// Approx token use per call at 5 FAQs: ~400 input + ~800 output = ~1200
// total. At Haiku 4.5 ($1/M in, $5/M out) that's ~$0.0044 per product.
// For a 250-product catalog: ~$1.10. Still — respect the user's rule of
// "test one first" by skipping any product that already has FAQs unless
// forced, so re-running the bulk is idempotent.
export async function bulkGenerateAndSaveFaqs(opts: {
  count?: number;
  overwriteExisting?: boolean;
}): Promise<BulkFaqResult> {
  const count = opts.count ?? 5;
  const overwrite = opts.overwriteExisting ?? false;

  const products = await prisma.resource.findMany({
    where: {
      type: "product",
      status: { in: ["active", "ACTIVE"] },
    },
    orderBy: { id: "asc" },
    select: { id: true, title: true, bodyHtml: true },
  });
  const job = await startJob("json_ld_products", products.length);
  let saved = 0;
  let skipped = 0;
  let failed = 0;
  try {
    for (let i = 0; i < products.length; i++) {
      const p = products[i];
      try {
        // Skip products with no description — can't generate grounded FAQs
        // without source text.
        const body = (p.bodyHtml ?? "").replace(/<[^>]+>/g, " ").trim();
        if (body.length < 50) {
          skipped++;
          await setProgress(job.id, i + 1);
          continue;
        }

        if (!overwrite) {
          const existing = await loadFaqsForProduct(p.id);
          if (existing.length > 0) {
            skipped++;
            await setProgress(job.id, i + 1);
            continue;
          }
        }

        const gen = await generateFaqsAI(p.id, count);
        if (!gen.ok || !gen.faqs) {
          failed++;
          await setProgress(job.id, i + 1);
          continue;
        }

        const save = await saveFaqsForProduct(p.id, gen.faqs);
        if (save.ok) saved++;
        else failed++;
      } catch {
        failed++;
      }
      await setProgress(job.id, i + 1);
    }
    await finishJob(job.id, { ok: failed === 0 });
    revalidatePath("/products/json-ld-faq");
    return {
      ok: failed === 0,
      message: `Saved ${saved}, skipped ${skipped}, failed ${failed}`,
      processed: products.length,
      saved,
      skipped,
      failed,
    };
  } catch (e) {
    await finishJob(job.id, {
      ok: false,
      error: e instanceof Error ? e.message : "Failed",
    });
    return {
      ok: false,
      message: e instanceof Error ? e.message : "Failed",
      processed: products.length,
      saved,
      skipped,
      failed,
    };
  }
}
