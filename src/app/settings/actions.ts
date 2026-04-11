"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { shopInfo } from "@/lib/shopify";

export type SaveResult = {
  ok: boolean;
  message: string;
  shopName?: string;
};

export async function saveSettings(formData: FormData): Promise<SaveResult> {
  const shopDomain =
    String(formData.get("shopDomain") || "")
      .trim()
      .replace(/^https?:\/\//, "")
      .replace(/\/.*$/, "") || null;
  const shopifyToken =
    String(formData.get("shopifyToken") || "").trim() || null;
  const anthropicKey =
    String(formData.get("anthropicKey") || "").trim() || null;
  const optimizerRules =
    String(formData.get("optimizerRules") || "").trim() || null;

  await prisma.settings.upsert({
    where: { id: 1 },
    update: { shopDomain, shopifyToken, anthropicKey, optimizerRules },
    create: {
      id: 1,
      shopDomain,
      shopifyToken,
      anthropicKey,
      optimizerRules,
    },
  });

  revalidatePath("/settings");
  revalidatePath("/");

  // Validate by pinging the Shopify API.
  if (shopDomain && shopifyToken) {
    try {
      const data = await shopInfo({ domain: shopDomain, token: shopifyToken });
      return {
        ok: true,
        message: "Saved and connected.",
        shopName: data.shop?.name,
      };
    } catch (e) {
      const msg = e instanceof Error ? e.message : "unknown error";
      return {
        ok: false,
        message: `Saved, but Shopify ping failed: ${msg}`,
      };
    }
  }

  return { ok: true, message: "Saved." };
}
