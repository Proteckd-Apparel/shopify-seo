"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { shopifyGraphQL } from "@/lib/shopify";
import {
  ensureJsonMetafieldDefinition,
  setMetafield,
  setMetafieldWithAudit,
} from "@/lib/shopify-metafields";
import {
  rewriteForGoogleShopping,
  type SafeCopyResult,
} from "@/lib/google-safe-copy";
import { startJob, setProgress, finishJob } from "@/lib/bulk-job";

// Metafield namespace + key the supplemental feed route reads from.
const MF_NAMESPACE = "custom";
const MF_KEY = "google_merchant_copy";

async function ensureDefinition(): Promise<void> {
  await ensureJsonMetafieldDefinition(
    "PRODUCT",
    MF_NAMESPACE,
    MF_KEY,
    "Google Merchant Copy",
  );
}

type StoredCopy = SafeCopyResult & { generatedAt: string };

const LOAD_QUERY = /* GraphQL */ `
  query ProductMerchantCopy($id: ID!) {
    product(id: $id) {
      id
      metafield(namespace: "${MF_NAMESPACE}", key: "${MF_KEY}") {
        value
      }
    }
  }
`;

export async function loadMerchantCopy(
  productId: string,
): Promise<StoredCopy | null> {
  try {
    const data: { product: { metafield: { value: string } | null } | null } =
      await shopifyGraphQL(LOAD_QUERY, { id: productId });
    const raw = data.product?.metafield?.value;
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (typeof parsed?.title !== "string" || typeof parsed?.description !== "string") {
      return null;
    }
    return {
      title: parsed.title,
      description: parsed.description,
      generatedAt: parsed.generatedAt ?? "",
    };
  } catch {
    return null;
  }
}

export async function saveMerchantCopy(
  productId: string,
  copy: SafeCopyResult,
): Promise<{ ok: boolean; message: string }> {
  try {
    await ensureDefinition();
    const stored: StoredCopy = {
      title: copy.title,
      description: copy.description,
      generatedAt: new Date().toISOString(),
    };
    await setMetafieldWithAudit({
      ownerId: productId,
      namespace: MF_NAMESPACE,
      key: MF_KEY,
      type: "json",
      value: JSON.stringify(stored),
    });
    revalidatePath("/products/merchant-copy");
    return { ok: true, message: "Saved" };
  } catch (e) {
    return { ok: false, message: e instanceof Error ? e.message : "Failed" };
  }
}

// ---------- Generate for a single product ----------

export type SingleResult = {
  ok: boolean;
  message: string;
  copy?: SafeCopyResult;
};

export async function generateAndSaveForProduct(
  productId: string,
): Promise<SingleResult> {
  try {
    const r = await prisma.resource.findUnique({ where: { id: productId } });
    if (!r) return { ok: false, message: "Product not found" };
    if (!r.title) return { ok: false, message: "Product has no title" };
    const body = (r.bodyHtml ?? "").trim();
    if (body.length < 50) {
      return { ok: false, message: "Product has no description — skipping" };
    }
    const copy = await rewriteForGoogleShopping({
      title: r.title,
      description: body,
      productType: r.productType,
      vendor: r.vendor,
      tags: r.tags,
    });
    const saved = await saveMerchantCopy(productId, copy);
    if (!saved.ok) return { ok: false, message: saved.message };
    return { ok: true, message: "Generated", copy };
  } catch (e) {
    return { ok: false, message: e instanceof Error ? e.message : "Failed" };
  }
}

// ---------- Bulk ----------

export type BulkResult = {
  ok: boolean;
  message: string;
  processed: number;
  saved: number;
  skipped: number;
  failed: number;
};

export async function bulkGenerateMerchantCopy(opts: {
  overwriteExisting?: boolean;
}): Promise<BulkResult> {
  const overwrite = opts.overwriteExisting ?? false;
  const products = await prisma.resource.findMany({
    where: {
      type: "product",
      status: { in: ["active", "ACTIVE"] },
    },
    orderBy: { id: "asc" },
    select: {
      id: true,
      title: true,
      bodyHtml: true,
      productType: true,
      vendor: true,
      tags: true,
    },
  });
  const job = await startJob("merchant_copy", products.length);
  let saved = 0;
  let skipped = 0;
  let failed = 0;
  try {
    await ensureDefinition();
    for (let i = 0; i < products.length; i++) {
      const p = products[i];
      try {
        const body = (p.bodyHtml ?? "").replace(/<[^>]+>/g, " ").trim();
        if (!p.title || body.length < 50) {
          skipped++;
          await setProgress(job.id, i + 1);
          continue;
        }
        if (!overwrite) {
          const existing = await loadMerchantCopy(p.id);
          if (existing) {
            skipped++;
            await setProgress(job.id, i + 1);
            continue;
          }
        }
        const copy = await rewriteForGoogleShopping({
          title: p.title,
          description: p.bodyHtml ?? "",
          productType: p.productType,
          vendor: p.vendor,
          tags: p.tags,
        });
        const s = await saveMerchantCopy(p.id, copy);
        if (s.ok) saved++;
        else failed++;
      } catch {
        failed++;
      }
      await setProgress(job.id, i + 1);
    }
    await finishJob(job.id, { ok: failed === 0 });
    revalidatePath("/products/merchant-copy");
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
