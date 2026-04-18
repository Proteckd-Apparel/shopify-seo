// Full primary feed for Google Merchant Center.
//
// This replaces Shopify's first-party "Shopify App API" push. We pull live
// from Shopify GraphQL on every Google fetch, so product data is current to
// the minute. Google refetches on its own schedule (~24h), so inventory may
// lag that long between fetches — an acceptable tradeoff for getting off the
// policy-flagged copy that Shopify's push was sending.
//
// One <item> per variant, matching the Shopify App API ID pattern
// `shopify_US_{product_num}_{variant_num}` so Merchant Center sees the same
// product universe when we cut over.
//
// Title/description override: products with the `custom.google_merchant_copy`
// metafield (health-claim-stripped copy) use that copy here. Everything else
// falls back to the product's title + descriptionHtml.
//
// To wire up in Merchant Center:
//   Data sources → Add product source → URL:
//     {SHOPIFY_APP_PROXY_URL}/feeds/google-shopping-primary.xml
//   Country: US, language: English. Once it imports cleanly, delete the
//   "Shopify App API" source.
//
// Required Google fields emitted: id, title, description, link, image_link,
// availability, price, brand, condition, mpn (from variant.sku), identifier_exists.
// Optional: sale_price, additional_image_link, product_type, item_group_id,
// color, size, gtin (variant.barcode).

import { prisma } from "@/lib/prisma";
import { shopifyGraphQL } from "@/lib/shopify";
import { xmlEscape, XML_HEADERS } from "@/lib/sitemap-xml";

export const dynamic = "force-dynamic";
export const revalidate = 3600;

const PAGE_SIZE = 50;
const COUNTRY =
  process.env.MERCHANT_SUPPLEMENTAL_COUNTRY?.trim().toUpperCase() || "US";
const CURRENCY =
  process.env.MERCHANT_FEED_CURRENCY?.trim().toUpperCase() || "USD";

// Shopify GraphQL query — one page of active products with everything we need
// to emit full Merchant Center items. Kept under 50 products/page because
// each product can have up to 100 variants (2500 nodes) and Shopify's query
// cost limit is 1000 points per call.
const QUERY = /* GraphQL */ `
  query MerchantPrimaryFeed($cursor: String) {
    products(first: ${PAGE_SIZE}, after: $cursor, query: "status:active") {
      pageInfo { hasNextPage endCursor }
      nodes {
        id
        handle
        title
        descriptionHtml
        vendor
        productType
        tags
        onlineStoreUrl
        featuredImage { url }
        images(first: 10) { nodes { url } }
        merchantCopy: metafield(namespace: "custom", key: "google_merchant_copy") { value }
        googleCategory: metafield(namespace: "mm-google-shopping", key: "google_product_category") { value }
        googleGender: metafield(namespace: "mm-google-shopping", key: "gender") { value }
        googleAgeGroup: metafield(namespace: "mm-google-shopping", key: "age_group") { value }
        googleCondition: metafield(namespace: "mm-google-shopping", key: "condition") { value }
        variants(first: 100) {
          nodes {
            id
            sku
            barcode
            price
            compareAtPrice
            availableForSale
            selectedOptions { name value }
            image { url }
          }
        }
      }
    }
  }
`;

type Variant = {
  id: string;
  sku: string | null;
  barcode: string | null;
  price: string;
  compareAtPrice: string | null;
  availableForSale: boolean;
  selectedOptions: { name: string; value: string }[];
  image: { url: string } | null;
};

type ProductNode = {
  id: string;
  handle: string;
  title: string;
  descriptionHtml: string | null;
  vendor: string | null;
  productType: string | null;
  tags: string[];
  onlineStoreUrl: string | null;
  featuredImage: { url: string } | null;
  images: { nodes: { url: string }[] };
  merchantCopy: { value: string } | null;
  googleCategory: { value: string } | null;
  googleGender: { value: string } | null;
  googleAgeGroup: { value: string } | null;
  googleCondition: { value: string } | null;
  variants: { nodes: Variant[] };
};

type StoredMerchantCopy = { title?: string; description?: string };

function numericId(gid: string): string {
  const idx = gid.lastIndexOf("/");
  return idx >= 0 ? gid.slice(idx + 1) : gid;
}

function stripHtml(s: string | null): string {
  return (s ?? "").replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
}

function buildTitle(product: ProductNode, override: StoredMerchantCopy | null, variant: Variant): string {
  const base = override?.title?.trim() || product.title || "";
  if (product.variants.nodes.length <= 1) return base.slice(0, 150);
  // Multi-variant: append variant options so Merchant can distinguish them.
  const opts = variant.selectedOptions
    .filter((o) => o.value && o.value.toLowerCase() !== "default title")
    .map((o) => o.value)
    .join(" / ");
  const suffix = opts ? ` — ${opts}` : "";
  return (base + suffix).slice(0, 150);
}

function buildDescription(product: ProductNode, override: StoredMerchantCopy | null): string {
  const raw = override?.description?.trim() || stripHtml(product.descriptionHtml);
  return raw.slice(0, 5000);
}

function parseMerchantCopy(raw: string | null | undefined): StoredMerchantCopy | null {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw);
    if (typeof parsed?.title === "string" && typeof parsed?.description === "string") {
      return { title: parsed.title, description: parsed.description };
    }
  } catch {
    // fall through
  }
  return null;
}

function variantLink(product: ProductNode, variant: Variant): string {
  // Caller has already ensured product.onlineStoreUrl is non-null — products
  // without an online-store URL are skipped in the main loop because their
  // landing pages don't exist on the public domain and would trigger
  // Merchant Center's "Mismatched domains" rejection.
  const base = product.onlineStoreUrl as string;
  const variantNum = numericId(variant.id);
  // Shopify's ?variant= query param selects the variant on the PDP so Google
  // lands the customer on the exact SKU they clicked.
  return product.variants.nodes.length > 1 ? `${base}?variant=${variantNum}` : base;
}

// Infer Google Merchant gender from Shopify product metadata. Falls back to
// "unisex" so every apparel item has a value set — Google soft-warns on
// missing gender and reduces visibility in Shopping without it.
function inferGender(product: ProductNode): string {
  if (product.googleGender?.value?.trim()) return product.googleGender.value.trim();
  const tags = product.tags.map((t) => t.toLowerCase());
  const type = (product.productType ?? "").toLowerCase();
  const hay = `${tags.join(" ")} ${type}`;
  if (/\b(men'?s|mens|male)\b/.test(hay)) return "male";
  if (/\b(women'?s|womens|female|ladies)\b/.test(hay)) return "female";
  return "unisex";
}

// age_group is required on apparel. Adult is the right default for an adult
// EMF apparel brand — we override only if a product is explicitly tagged
// for infant/toddler/kids.
function inferAgeGroup(product: ProductNode): string {
  if (product.googleAgeGroup?.value?.trim()) return product.googleAgeGroup.value.trim();
  const hay = product.tags.map((t) => t.toLowerCase()).join(" ");
  if (/\b(newborn)\b/.test(hay)) return "newborn";
  if (/\b(infant)\b/.test(hay)) return "infant";
  if (/\b(toddler)\b/.test(hay)) return "toddler";
  if (/\b(kids?|youth)\b/.test(hay)) return "kids";
  return "adult";
}

function findOption(variant: Variant, name: string): string | null {
  const hit = variant.selectedOptions.find((o) => o.name.toLowerCase() === name.toLowerCase());
  return hit?.value?.trim() || null;
}

function emitItem(product: ProductNode, variant: Variant): string {
  const override = parseMerchantCopy(product.merchantCopy?.value);
  const title = buildTitle(product, override, variant);
  const description = buildDescription(product, override);
  const link = variantLink(product, variant);

  const feedId = `shopify_${COUNTRY}_${numericId(product.id)}_${numericId(variant.id)}`;
  const imageUrl = variant.image?.url || product.featuredImage?.url || product.images.nodes[0]?.url || "";
  const additionalImages = product.images.nodes
    .map((i) => i.url)
    .filter((u) => u && u !== imageUrl)
    .slice(0, 10);

  // Shopify convention: compareAtPrice = "was" price, price = current.
  // Google wants regular price in g:price and discounted in g:sale_price.
  const price = Number(variant.price);
  const compareAt = variant.compareAtPrice ? Number(variant.compareAtPrice) : null;
  const onSale = compareAt !== null && compareAt > price;
  const regularPrice = onSale ? compareAt! : price;
  const salePrice = onSale ? price : null;

  const availability = variant.availableForSale ? "in_stock" : "out_of_stock";
  const condition = product.googleCondition?.value?.trim() || "new";

  const color = findOption(variant, "Color") || findOption(variant, "Colour");
  const size = findOption(variant, "Size");

  const parts: string[] = [
    `      <g:id>${xmlEscape(feedId)}</g:id>`,
    `      <g:title>${xmlEscape(title)}</g:title>`,
    `      <g:description>${xmlEscape(description)}</g:description>`,
    `      <g:link>${xmlEscape(link)}</g:link>`,
  ];
  if (imageUrl) parts.push(`      <g:image_link>${xmlEscape(imageUrl)}</g:image_link>`);
  for (const extra of additionalImages) {
    parts.push(`      <g:additional_image_link>${xmlEscape(extra)}</g:additional_image_link>`);
  }
  parts.push(`      <g:availability>${availability}</g:availability>`);
  parts.push(`      <g:price>${regularPrice.toFixed(2)} ${CURRENCY}</g:price>`);
  if (salePrice !== null) {
    parts.push(`      <g:sale_price>${salePrice.toFixed(2)} ${CURRENCY}</g:sale_price>`);
  }
  parts.push(`      <g:condition>${xmlEscape(condition)}</g:condition>`);
  if (product.vendor) parts.push(`      <g:brand>${xmlEscape(product.vendor)}</g:brand>`);
  if (product.productType) parts.push(`      <g:product_type>${xmlEscape(product.productType)}</g:product_type>`);
  if (product.googleCategory?.value) {
    parts.push(`      <g:google_product_category>${xmlEscape(product.googleCategory.value)}</g:google_product_category>`);
  }
  // gender + age_group: ALWAYS emit so Merchant Center doesn't flag soft
  // "missing attribute" warnings. Values prefer the product's mm-google-shopping
  // metafield, fall back to tag/type inference (see inferGender / inferAgeGroup).
  parts.push(`      <g:gender>${xmlEscape(inferGender(product))}</g:gender>`);
  parts.push(`      <g:age_group>${xmlEscape(inferAgeGroup(product))}</g:age_group>`);
  if (color) parts.push(`      <g:color>${xmlEscape(color)}</g:color>`);
  if (size) parts.push(`      <g:size>${xmlEscape(size)}</g:size>`);
  // Group variants of the same product so Google shows them as options.
  parts.push(`      <g:item_group_id>${xmlEscape(numericId(product.id))}</g:item_group_id>`);

  // Identifier fields: GTIN from barcode if set; MPN from SKU as a fallback.
  // If we have neither, explicitly flag identifier_exists=no so Google doesn't
  // reject the item for missing identifiers.
  const gtin = variant.barcode?.trim();
  const mpn = variant.sku?.trim();
  if (gtin) parts.push(`      <g:gtin>${xmlEscape(gtin)}</g:gtin>`);
  if (mpn) parts.push(`      <g:mpn>${xmlEscape(mpn)}</g:mpn>`);
  if (!gtin && !mpn) parts.push(`      <g:identifier_exists>no</g:identifier_exists>`);

  return `    <item>\n${parts.join("\n")}\n    </item>`;
}

export async function GET() {
  const settings = await prisma.settings.findUnique({ where: { id: 1 } });
  // Channel-level <link> uses the public customer-facing domain, not the
  // myshopify domain. If we emit myshopify.com here while item <g:link>s
  // point to www.proteckd.com, Merchant Center flags the mismatch.
  const publicDomain = "www.proteckd.com";

  const items: string[] = [];
  let cursor: string | null = null;
  let productCount = 0;
  let skippedUnpublished = 0;

  while (true) {
    const data: {
      products: {
        pageInfo: { hasNextPage: boolean; endCursor: string | null };
        nodes: ProductNode[];
      };
    } = await shopifyGraphQL(QUERY, { cursor });

    for (const product of data.products.nodes) {
      productCount++;
      // Skip products not published to the Online Store sales channel —
      // onlineStoreUrl is null for those, and emitting a myshopify.com fallback
      // URL triggers "Mismatched domains" in Merchant Center (Google verifies
      // against the custom domain www.proteckd.com, not the myshopify one).
      // Products that aren't live on the storefront shouldn't be in a Shopping
      // feed anyway — the landing page literally doesn't exist there.
      if (!product.onlineStoreUrl) {
        skippedUnpublished++;
        continue;
      }
      const variants = product.variants.nodes;
      if (variants.length === 0) continue;
      for (const variant of variants) {
        items.push(emitItem(product, variant));
      }
    }

    if (!data.products.pageInfo.hasNextPage) break;
    cursor = data.products.pageInfo.endCursor;
  }

  // Suppress the unused-var warning while keeping the value in scope for the
  // description tag below — it's useful diagnostic info when the feed shrinks
  // after a cutover.
  void settings;

  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:g="http://base.google.com/ns/1.0">
  <channel>
    <title>Proteck'd Apparel — Google Merchant Primary Feed</title>
    <link>https://${xmlEscape(publicDomain)}</link>
    <description>Full primary feed with health-claim-safe titles + descriptions for products that have merchant copy generated. ${productCount} products total, ${skippedUnpublished} skipped (not published to Online Store), ${items.length} variants emitted.</description>
${items.join("\n")}
  </channel>
</rss>`;

  return new Response(xml, { headers: XML_HEADERS });
}
