"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { shopifyGraphQL } from "@/lib/shopify";

const TAGS_UPDATE = /* GraphQL */ `
  mutation TagsAdd($id: ID!, $tags: [String!]!) {
    productUpdate(input: { id: $id, tags: $tags }) {
      product { id tags }
      userErrors { field message }
    }
  }
`;

export async function saveTags(
  productId: string,
  tags: string[],
): Promise<{ ok: boolean; message: string }> {
  try {
    // Snapshot the existing tags before the destructive overwrite, otherwise
    // a wrong save with no oldValue means the previous tag list is gone.
    const existing = await prisma.resource.findUnique({
      where: { id: productId },
      select: { tags: true },
    });
    const oldTags = existing?.tags ?? null;

    const data = await shopifyGraphQL<{
      productUpdate: {
        product: { id: string; tags: string[] };
        userErrors: Array<{ field: string[] | null; message: string }>;
      };
    }>(TAGS_UPDATE, { id: productId, tags });
    if (data.productUpdate.userErrors?.length) {
      return {
        ok: false,
        message: data.productUpdate.userErrors.map((e) => e.message).join("; "),
      };
    }
    await prisma.resource.update({
      where: { id: productId },
      data: { tags: tags.join(",") },
    });
    await prisma.optimization.create({
      data: {
        resourceId: productId,
        field: "tags",
        oldValue: oldTags,
        newValue: tags.join(","),
        source: "manual",
      },
    });
    revalidatePath("/products/tags");
    return { ok: true, message: "Saved" };
  } catch (e) {
    return { ok: false, message: e instanceof Error ? e.message : "Failed" };
  }
}
