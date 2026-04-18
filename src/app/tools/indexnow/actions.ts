"use server";

import { revalidatePath } from "next/cache";
import { randomUUID } from "crypto";
import { prisma } from "@/lib/prisma";
import {
  collectStoreUrls,
  getOrCreateIndexNowKey,
  submitUrlsToIndexNow,
} from "@/lib/indexnow";

export type ActionResult = {
  ok: boolean;
  message: string;
};

export async function toggleIndexNow(formData: FormData): Promise<ActionResult> {
  const enabled = formData.get("enabled") === "true";
  await prisma.settings.upsert({
    where: { id: 1 },
    update: { indexNowEnabled: enabled },
    create: { id: 1, indexNowEnabled: enabled },
  });
  revalidatePath("/tools/indexnow");
  return { ok: true, message: enabled ? "Enabled." : "Disabled." };
}

export async function regenerateKey(): Promise<ActionResult> {
  const key = randomUUID().replace(/-/g, "");
  await prisma.settings.upsert({
    where: { id: 1 },
    update: { indexNowKey: key },
    create: { id: 1, indexNowKey: key },
  });
  revalidatePath("/tools/indexnow");
  return { ok: true, message: "New key generated." };
}

export async function submitNow(): Promise<ActionResult> {
  await getOrCreateIndexNowKey();
  const s = await prisma.settings.findUnique({ where: { id: 1 } });
  const publicDomain =
    s?.storefrontDomain?.trim() || s?.shopDomain || null;
  if (!publicDomain) {
    return { ok: false, message: "Set a storefront domain in Settings first." };
  }
  const origin = `https://${publicDomain.replace(/^https?:\/\//, "")}`;
  const urls = await collectStoreUrls(origin);
  const result = await submitUrlsToIndexNow(urls);
  revalidatePath("/tools/indexnow");
  if (!result.ok) return { ok: false, message: result.error ?? "Failed." };
  return {
    ok: true,
    message: `Submitted ${result.submitted} URLs in ${result.batches} batch(es).`,
  };
}
