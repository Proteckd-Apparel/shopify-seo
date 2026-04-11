"use server";

import { revalidatePath } from "next/cache";
import {
  createRedirect,
  deleteRedirect,
  type ShopifyRedirect,
} from "@/lib/shopify-redirects";

export async function addRedirectAction(
  path: string,
  target: string,
): Promise<{ ok: boolean; message: string; redirect?: ShopifyRedirect }> {
  try {
    const r = await createRedirect(path, target);
    revalidatePath("/tools/redirects");
    return { ok: true, message: "Created", redirect: r };
  } catch (e) {
    return { ok: false, message: e instanceof Error ? e.message : "Failed" };
  }
}

export async function deleteRedirectAction(
  id: string,
): Promise<{ ok: boolean; message: string }> {
  try {
    await deleteRedirect(id);
    revalidatePath("/tools/redirects");
    return { ok: true, message: "Deleted" };
  } catch (e) {
    return { ok: false, message: e instanceof Error ? e.message : "Failed" };
  }
}
