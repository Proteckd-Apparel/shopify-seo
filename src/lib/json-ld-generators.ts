// Pure functions that turn (resource + config + shop info) into a valid
// schema.org JSON-LD object. No I/O — testable in isolation.

import type { Image, Resource } from "@/generated/prisma/client";
import type {
  CollectionsJsonLdConfig,
  JsonLdConfig,
  LocalBusinessJsonLdConfig,
  ProductsJsonLdConfig,
} from "./json-ld-config";

type ResourceWithImages = Resource & { images: Image[] };

// Variant shape we expect to find inside Resource.raw (mirrors ShopifyVariant).
type RawVariant = {
  id: string;
  title: string;
  sku: string | null;
  barcode: string | null;
  price: string;
  compareAtPrice: string | null;
  availableForSale: boolean;
  inventoryQuantity: number | null;
  selectedOptions: Array<{ name: string; value: string }>;
  image: { id: string; url: string; width: number | null; height: number | null; altText: string | null } | null;
};

type RawProduct = {
  variants?: RawVariant[];
  options?: Array<{ name: string; values: string[] }>;
  priceRangeV2?: {
    minVariantPrice?: { amount: string; currencyCode: string };
    maxVariantPrice?: { amount: string; currencyCode: string };
  };
};

function parseRaw(resource: ResourceWithImages): RawProduct {
  if (!resource.raw) return {};
  try {
    return JSON.parse(resource.raw) as RawProduct;
  } catch {
    return {};
  }
}

function findOption(
  v: RawVariant,
  names: string[],
): string | undefined {
  for (const opt of v.selectedOptions) {
    if (names.some((n) => opt.name.toLowerCase() === n.toLowerCase())) {
      return opt.value;
    }
  }
  return undefined;
}

function variesByForOptions(options: RawProduct["options"]): string[] {
  const map: Record<string, string> = {
    size: "https://schema.org/size",
    color: "https://schema.org/color",
    colour: "https://schema.org/color",
    material: "https://schema.org/material",
    pattern: "https://schema.org/pattern",
  };
  const out: string[] = [];
  for (const o of options ?? []) {
    const k = o.name.toLowerCase();
    if (map[k]) out.push(map[k]);
  }
  return out;
}

// ---------- Product (now an array of ProductGroup + supporting nodes) ----------

const RETURN_POLICY_ID = "#return_policy_psk";
const SHIPPING_RATE_ID = "#shipping_rate_settings_psk";
const SHIPPING_DETAILS_ID = "#shipping_details_1_psk";

export type RealReviews = {
  rating: number;
  count: number;
  reviews: Array<{
    rating: number;
    title: string | null;
    body: string;
    reviewer: string;
    date: string;
  }>;
};

// Returned shape is an array of objects (ProductGroup + return policy +
// shipping rate settings + shipping details), matching SEO King's pattern.
export function generateProductSchema(
  resource: ResourceWithImages,
  cfg: ProductsJsonLdConfig,
  shop: { domain: string; name: string },
  reviews?: RealReviews | null,
): Record<string, unknown> {
  return generateProductSchemaInternal(
    resource,
    cfg,
    shop,
    reviews,
  ) as unknown as Record<string, unknown>;
}

function generateProductSchemaInternal(
  resource: ResourceWithImages,
  cfg: ProductsJsonLdConfig,
  shop: { domain: string; name: string },
  reviews?: RealReviews | null,
): unknown {
  const raw = parseRaw(resource);
  const variants = raw.variants ?? [];
  const url =
    resource.url ??
    `https://${shop.domain}/products/${resource.handle}`;
  const description = pickDescription(resource, cfg.descriptionType);
  const productGroupId = resource.id.replace("gid://shopify/Product/", "");
  const currency = cfg.currency || "USD";

  const conditionMap: Record<string, string> = {
    new: "https://schema.org/NewCondition",
    refurbished: "https://schema.org/RefurbishedCondition",
    used: "https://schema.org/UsedCondition",
    damaged: "https://schema.org/DamagedCondition",
  };
  const itemCondition = conditionMap[cfg.itemCondition] ?? conditionMap.new;

  const seller = {
    "@type": "Organization",
    url: `https://${shop.domain}`,
    name: shop.name,
  };

  const brandName =
    cfg.brandSource === "vendor"
      ? (resource.vendor ?? shop.name)
      : shop.name;
  const brand = { "@type": "Brand", name: brandName };

  // ----- AggregateRating: use real Judge.me data if we have it
  const aggregateRating = cfg.showStarRating
    ? reviews && reviews.count > 0
      ? {
          "@type": "AggregateRating",
          bestRating: 5,
          worstRating: 1,
          ratingValue: reviews.rating,
          ratingCount: reviews.count,
        }
      : buildAggregateRating(productGroupId, cfg)
    : undefined;

  // ----- Real review array (Judge.me) — embedded in the ProductGroup
  const reviewArray =
    reviews && reviews.reviews.length > 0
      ? reviews.reviews.map((r) => ({
          "@type": "Review",
          author: { "@type": "Person", name: r.reviewer || "Verified Customer" },
          datePublished: r.date,
          reviewBody: r.body,
          reviewRating: {
            "@type": "Rating",
            ratingValue: r.rating,
            bestRating: 5,
            worstRating: 1,
          },
        }))
      : undefined;

  // ----- hasVariant array
  const hasVariant = variants.map((v) => {
    const size = findOption(v, ["Size"]);
    const color = findOption(v, ["Color", "Colour"]);
    const material = findOption(v, ["Material"]);
    // Variant image (raw JSON shape uses `url`); fall back to first product
    // image (Prisma shape uses `src`). Normalize both to a `url` field.
    const variantImage = v.image
      ? {
          url: v.image.url,
          width: v.image.width,
          height: v.image.height,
        }
      : resource.images[0]
        ? {
            url: resource.images[0].src,
            width: resource.images[0].width,
            height: resource.images[0].height,
          }
        : null;

    const compareAt = v.compareAtPrice ? Number(v.compareAtPrice) : null;
    const price = Number(v.price);

    const offer: Record<string, unknown> = {
      "@type": "Offer",
      url: `${url}?variant=${v.id.replace("gid://shopify/ProductVariant/", "")}`,
      priceCurrency: currency,
      price,
      priceValidUntil: priceValidUntil(),
      itemCondition,
      seller,
      availability: cfg.alwaysShowInStock || v.availableForSale
        ? "https://schema.org/InStock"
        : "https://schema.org/OutOfStock",
      areaServed: countryName(cfg.shippingRegion),
      shippingDetails: { "@id": SHIPPING_DETAILS_ID },
      hasMerchantReturnPolicy: { "@id": RETURN_POLICY_ID },
    };

    if (compareAt && compareAt > price) {
      offer.priceSpecification = {
        "@type": "UnitPriceSpecification",
        price: compareAt,
        priceCurrency: currency,
        priceType: "https://schema.org/ListPrice",
      };
    }

    const variantObj: Record<string, unknown> = {
      "@type": "Product",
      inProductGroupWithID: productGroupId,
      name: resource.title ?? "",
      description: v.title || `${size ?? ""} / ${color ?? ""}`.trim(),
      sku: v.sku ?? v.id,
      mpn: v.sku ?? v.id,
      size,
      color,
      material,
      image: variantImage
        ? [
            {
              "@type": "ImageObject",
              contentUrl: variantImage.url.split("?")[0],
              author: { "@type": "Organization", name: shop.name },
              width:
                variantImage.width != null
                  ? {
                      "@type": "QuantitativeValue",
                      value: variantImage.width,
                      unitCode: "PIX",
                    }
                  : undefined,
              height:
                variantImage.height != null
                  ? {
                      "@type": "QuantitativeValue",
                      value: variantImage.height,
                      unitCode: "PIX",
                    }
                  : undefined,
            },
          ]
        : undefined,
      offers: offer,
    };

    return prune(variantObj);
  });

  // ----- ProductGroup root
  const productGroup: Record<string, unknown> = {
    "@context": "https://schema.org/",
    "@type": "ProductGroup",
    productGroupID: productGroupId,
    mainEntityOfPage: url,
    name: resource.title ?? "",
    description,
    brand,
    audience: cfg.gender || cfg.ageGroup
      ? {
          "@type": "PeopleAudience",
          suggestedGender: cfg.gender || undefined,
          suggestedMinAge: cfg.ageGroup || undefined,
        }
      : { "@type": "PeopleAudience" },
    aggregateRating,
    review: reviewArray,
    variesBy: variesByForOptions(raw.options),
    hasVariant: hasVariant.length > 0 ? hasVariant : undefined,
  };

  // ----- MerchantReturnPolicy as a separate referenced node
  const countries = parseCountries(cfg.shippingCountries, cfg.shippingRegion);
  const returnPolicy = {
    "@context": "https://schema.org/",
    "@type": "MerchantReturnPolicy",
    "@id": RETURN_POLICY_ID,
    merchantReturnLink: cfg.returnPolicyUrl || undefined,
    url: cfg.returnPolicyUrl || undefined,
    returnPolicyCategory:
      cfg.allowReturns === "always"
        ? "https://schema.org/MerchantReturnUnlimitedWindow"
        : cfg.allowReturns === "no_returns"
          ? "https://schema.org/MerchantReturnNotPermitted"
          : "https://schema.org/MerchantReturnFiniteReturnWindow",
    applicableCountry: countries,
    merchantReturnDays:
      cfg.allowReturns === "x_days" ? cfg.returnDaysLimit : undefined,
    returnMethod:
      cfg.returnMethod === "in_store"
        ? "https://schema.org/ReturnInStore"
        : "https://schema.org/ReturnByMail",
    returnFees:
      cfg.returnFees === "free_shipping"
        ? "https://schema.org/FreeReturn"
        : cfg.returnFees === "restocking_fee"
          ? "https://schema.org/RestockingFees"
          : "https://schema.org/ReturnFeesCustomerResponsibility",
    refundType: "https://schema.org/FullRefund",
  };

  // ----- ShippingRateSettings
  const shippingRateSettings: Record<string, unknown> = {
    "@context": "https://schema.org/",
    "@type": "ShippingRateSettings",
    "@id": SHIPPING_RATE_ID,
  };
  if (cfg.freeShippingThreshold) {
    shippingRateSettings.freeShippingThreshold = {
      "@type": "MonetaryAmount",
      value: String(cfg.freeShippingThreshold),
      currency,
    };
  }

  // ----- OfferShippingDetails
  const shippingDetails = {
    "@id": SHIPPING_DETAILS_ID,
    "@context": "https://schema.org/",
    "@type": "OfferShippingDetails",
    shippingDestination: countries.map((c) => ({
      "@type": "DefinedRegion",
      addressCountry: c,
    })),
    shippingRate: {
      "@type": "MonetaryAmount",
      value: cfg.freeShipping ? "0.00" : "0.00",
      currency,
    },
    deliveryTime: {
      "@type": "ShippingDeliveryTime",
      handlingTime: {
        "@type": "QuantitativeValue",
        minValue: cfg.handlingTimeMinDays,
        maxValue: cfg.handlingTimeMaxDays,
        unitCode: "DAY",
      },
      ...(cfg.shippingTimeMinDays && cfg.shippingTimeMaxDays
        ? {
            transitTime: {
              "@type": "QuantitativeValue",
              minValue: cfg.shippingTimeMinDays,
              maxValue: cfg.shippingTimeMaxDays,
              unitCode: "DAY",
            },
          }
        : {}),
    },
    shippingSettingsLink: SHIPPING_RATE_ID,
  };

  return [
    prune(productGroup),
    prune(returnPolicy),
    prune(shippingRateSettings),
    prune(shippingDetails),
  ];
}

// ---------- Collection ----------

export function generateCollectionSchema(
  resource: ResourceWithImages,
  cfg: CollectionsJsonLdConfig,
  shop: { domain: string; name: string },
): Record<string, unknown> {
  const url = `https://${shop.domain}/collections/${resource.handle}`;
  const schema: Record<string, unknown> = {
    "@context": "https://schema.org/",
    "@type": "CollectionPage",
    name: resource.title,
    description: resource.seoDescription ?? undefined,
    url,
    image: resource.images.map((i) => i.src.split("?")[0]),
  };
  if (cfg.showStarRating) {
    schema.aggregateRating = {
      "@type": "AggregateRating",
      ratingValue: 4.7,
      reviewCount: 25,
      bestRating: 5,
      worstRating: 1,
    };
  }
  return prune(schema);
}

// ---------- LocalBusiness ----------

export function generateLocalBusinessSchema(
  cfg: LocalBusinessJsonLdConfig,
  shop: { domain: string; name: string },
): Record<string, unknown> {
  return prune({
    "@context": "https://schema.org/",
    "@type": "LocalBusiness",
    name: cfg.businessName || shop.name,
    address: {
      "@type": "PostalAddress",
      streetAddress: cfg.streetAddress,
      addressLocality: cfg.city,
      addressRegion: cfg.region,
      postalCode: cfg.postalCode,
      addressCountry: cfg.country,
    },
    telephone: cfg.phone,
    priceRange: cfg.priceRange,
    openingHours: cfg.openingHours,
    geo:
      cfg.latitude && cfg.longitude
        ? {
            "@type": "GeoCoordinates",
            latitude: cfg.latitude,
            longitude: cfg.longitude,
          }
        : undefined,
    url: `https://${shop.domain}`,
  });
}

// ---------- Site-wide schemas ----------

export function generateWebSiteSchema(shop: { domain: string; name: string }) {
  return {
    "@context": "https://schema.org/",
    "@type": "WebSite",
    name: shop.name,
    url: `https://${shop.domain}`,
    potentialAction: {
      "@type": "SearchAction",
      target: `https://${shop.domain}/search?q={search_term_string}`,
      "query-input": "required name=search_term_string",
    },
  };
}

export function generateOrganizationSchema(shop: {
  domain: string;
  name: string;
}) {
  return {
    "@context": "https://schema.org/",
    "@type": "Organization",
    name: shop.name,
    url: `https://${shop.domain}`,
    logo: `https://${shop.domain}/cdn/shop/files/logo.png`,
  };
}

export function generateBreadcrumbSchema(
  items: Array<{ name: string; url: string }>,
) {
  return {
    "@context": "https://schema.org/",
    "@type": "BreadcrumbList",
    itemListElement: items.map((it, i) => ({
      "@type": "ListItem",
      position: i + 1,
      name: it.name,
      item: it.url,
    })),
  };
}

export function generateArticleSchema(
  resource: ResourceWithImages,
  shop: { domain: string; name: string },
) {
  return prune({
    "@context": "https://schema.org/",
    "@type": "Article",
    headline: resource.title,
    description: resource.seoDescription ?? undefined,
    image: resource.images.map((i) => i.src.split("?")[0]),
    author: { "@type": "Organization", name: shop.name },
    publisher: { "@type": "Organization", name: shop.name },
    datePublished: resource.fetchedAt.toISOString(),
  });
}

export function generateBlogSchema(shop: { domain: string; name: string }) {
  return {
    "@context": "https://schema.org/",
    "@type": "Blog",
    name: `${shop.name} Blog`,
    url: `https://${shop.domain}/blogs/news`,
  };
}

// ---------- Helpers ----------

function buildAggregateRating(
  seed: string,
  cfg: ProductsJsonLdConfig,
): Record<string, unknown> {
  const ratingValue = cfg.alwaysShow5Stars
    ? 5
    : cfg.showRandomRating
      ? randomRating(seed)
      : 4.8;
  const reviewCount = cfg.showRandomRating
    ? randomReviewCount(seed, cfg.numberOfRatings)
    : 16;
  return {
    "@type": "AggregateRating",
    bestRating: 5,
    worstRating: 1,
    ratingValue,
    ratingCount: reviewCount,
  };
}

function pickDescription(
  r: Resource,
  type: ProductsJsonLdConfig["descriptionType"],
): string {
  if (type === "html_body") {
    return (r.bodyHtml ?? "").replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
  }
  if (type === "title") return r.title ?? "";
  return r.seoDescription ?? r.title ?? "";
}

function randomRating(seed: string): number {
  const n = hash(seed) % 100;
  return Math.round((4 + n / 100) * 100) / 100;
}

function randomReviewCount(seed: string, range: ProductsJsonLdConfig["numberOfRatings"]): number {
  const n = hash(seed);
  const max = range === "less_5" ? 5 : range === "less_20" ? 20 : range === "less_50" ? 50 : 100;
  return (n % (max - 1)) + 1;
}

function hash(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) {
    h = (h << 5) - h + s.charCodeAt(i);
    h |= 0;
  }
  return Math.abs(h);
}

function parseCountries(csv: string, fallback: string): string[] {
  const list = csv
    .split(",")
    .map((s) => s.trim().toUpperCase())
    .filter(Boolean);
  return list.length > 0 ? list : [fallback || "US"];
}

function countryName(iso: string): string {
  const map: Record<string, string> = {
    US: "United States",
    GB: "United Kingdom",
    CA: "Canada",
    AU: "Australia",
    DE: "Germany",
    FR: "France",
    JP: "Japan",
  };
  return map[iso?.toUpperCase()] ?? iso;
}

function priceValidUntil(): string {
  const d = new Date();
  d.setFullYear(d.getFullYear() + 1);
  return d.toISOString().slice(0, 10);
}

function prune<T>(obj: T): T {
  if (Array.isArray(obj)) {
    return obj
      .filter((v) => v !== undefined && v !== null && v !== "")
      .map((v) => (typeof v === "object" && v ? prune(v) : v)) as unknown as T;
  }
  if (obj && typeof obj === "object") {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(obj as Record<string, unknown>)) {
      if (v === undefined || v === null || v === "") continue;
      if (typeof v === "object") {
        const pruned = prune(v as Record<string, unknown>);
        if (Object.keys(pruned).length === 0) continue;
        out[k] = pruned;
      } else {
        out[k] = v;
      }
    }
    return out as T;
  }
  return obj;
}

// ---------- Top-level config loader from optimizer settings ----------

export function siteWideSchemas(
  cfg: JsonLdConfig,
  shop: { domain: string; name: string },
): Array<Record<string, unknown>> {
  const out: Array<Record<string, unknown>> = [];
  if (cfg.other.website) out.push(generateWebSiteSchema(shop));
  if (cfg.other.organization) out.push(generateOrganizationSchema(shop));
  if (cfg.other.blog) out.push(generateBlogSchema(shop));
  if (cfg.localBusiness.enabled)
    out.push(generateLocalBusinessSchema(cfg.localBusiness, shop));
  return out;
}
