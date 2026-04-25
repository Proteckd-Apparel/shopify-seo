// Client-safe constants for bulk-job. Splitting these out so client
// components (e.g. <RunningJobPill />) can import labels/hrefs without
// pulling in the Prisma server runtime via lib/bulk-job.

export type JobKind =
  | "json_ld_products"
  | "json_ld_collections"
  | "json_ld_articles"
  | "json_ld_sitewide"
  | "merchant_copy"
  | "scan"
  | "meta_titles"
  | "meta_descriptions"
  | "alt_text";

// Human-readable labels for the global running-job indicator.
export const JOB_LABELS: Record<JobKind, string> = {
  json_ld_products: "JSON-LD products",
  json_ld_collections: "JSON-LD collections",
  json_ld_articles: "JSON-LD articles",
  json_ld_sitewide: "JSON-LD site-wide",
  merchant_copy: "Merchant copy",
  scan: "Catalog scan",
  meta_titles: "Meta titles",
  meta_descriptions: "Meta descriptions",
  alt_text: "Alt text",
};

// Where to deep-link from the topbar pill to the page that owns the job.
export const JOB_HREFS: Record<JobKind, string> = {
  json_ld_products: "/optimize/json-ld",
  json_ld_collections: "/optimize/json-ld",
  json_ld_articles: "/optimize/json-ld",
  json_ld_sitewide: "/optimize/json-ld",
  merchant_copy: "/products/merchant-copy",
  scan: "/scan",
  meta_titles: "/optimize/meta-titles?mode=inline",
  meta_descriptions: "/optimize/meta-descriptions?mode=inline",
  alt_text: "/optimize/alt-texts?mode=inline",
};
