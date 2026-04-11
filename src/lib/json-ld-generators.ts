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

// ---------- Product ----------

export function generateProductSchema(
  resource: ResourceWithImages,
  cfg: ProductsJsonLdConfig,
  shop: { domain: string; name: string },
): Record<string, unknown> {
  const url = resource.url ?? `https://${shop.domain}/products/${resource.handle}`;
  const description = pickDescription(resource, cfg.descriptionType);

  const schema: Record<string, unknown> = {
    "@context": "https://schema.org/",
    "@type": "Product",
    name: resource.title,
    description,
    url,
    sku: resource.id.replace("gid://shopify/Product/", ""),
    brand: {
      "@type": "Brand",
      name:
        cfg.brandSource === "vendor"
          ? (resource.vendor ?? shop.name)
          : shop.name,
    },
    image: resource.images.map((i) => i.src.split("?")[0]),
  };

  if (cfg.itemCondition) {
    const conditionMap: Record<string, string> = {
      new: "https://schema.org/NewCondition",
      refurbished: "https://schema.org/RefurbishedCondition",
      used: "https://schema.org/UsedCondition",
      damaged: "https://schema.org/DamagedCondition",
    };
    schema.itemCondition = conditionMap[cfg.itemCondition];
  }

  if (cfg.gender) schema.gender = cfg.gender;
  if (cfg.ageGroup) schema.audience = { "@type": "PeopleAudience", suggestedGender: cfg.gender || undefined, suggestedMinAge: cfg.ageGroup };

  // Offers
  schema.offers = {
    "@type": "Offer",
    url,
    availability: cfg.alwaysShowInStock
      ? "https://schema.org/InStock"
      : "https://schema.org/InStock", // TODO: real inventory
    priceCurrency: "USD",
    price: "0.00",
    itemCondition: schema.itemCondition,
    hasMerchantReturnPolicy:
      cfg.allowReturns !== "no_returns"
        ? {
            "@type": "MerchantReturnPolicy",
            applicableCountry: cfg.shippingRegion,
            returnPolicyCategory:
              cfg.allowReturns === "always"
                ? "https://schema.org/MerchantReturnUnlimitedWindow"
                : "https://schema.org/MerchantReturnFiniteReturnWindow",
            merchantReturnDays:
              cfg.allowReturns === "x_days" ? cfg.returnDaysLimit : undefined,
            returnMethod:
              cfg.returnMethod === "by_mail"
                ? "https://schema.org/ReturnByMail"
                : cfg.returnMethod === "in_store"
                  ? "https://schema.org/ReturnInStore"
                  : "https://schema.org/ReturnByMail",
            returnFees:
              cfg.returnFees === "free_shipping"
                ? "https://schema.org/FreeReturn"
                : "https://schema.org/RestockingFees",
          }
        : undefined,
    shippingDetails: cfg.freeShipping
      ? {
          "@type": "OfferShippingDetails",
          shippingRate: {
            "@type": "MonetaryAmount",
            value: "0.00",
            currency: "USD",
          },
          shippingDestination: {
            "@type": "DefinedRegion",
            addressCountry: cfg.freeShippingWorldwide
              ? "*"
              : cfg.shippingRegion,
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
        }
      : undefined,
  };

  // Aggregate rating
  if (cfg.showStarRating) {
    const ratingValue = cfg.alwaysShow5Stars
      ? 5
      : cfg.showRandomRating
        ? randomRating(resource.id)
        : 4.7;
    const reviewCount = cfg.showRandomRating
      ? randomReviewCount(resource.id, cfg.numberOfRatings)
      : 12;
    schema.aggregateRating = {
      "@type": "AggregateRating",
      ratingValue,
      reviewCount,
      bestRating: 5,
      worstRating: 1,
    };
  }

  return prune(schema);
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
  return 4 + n / 100;
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

function prune<T>(obj: T): T {
  if (Array.isArray(obj)) {
    return obj.filter((v) => v !== undefined && v !== null && v !== "").map((v) =>
      typeof v === "object" && v ? prune(v) : v,
    ) as unknown as T;
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
