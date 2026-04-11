// Template engine shared by Alt Texts, Meta Titles, and Meta Descriptions.
// Lets users build a string like "{title} | {vendor} | {product_type}" with
// optional separators, then renders it against any Resource (and optionally
// an Image for image-specific contexts).

import type { Image, Resource } from "@/generated/prisma/client";

// ---------- Variable definitions ----------

export type VariableKey =
  | "title"
  | "handle"
  | "vendor"
  | "product_type"
  | "tags"
  | "shop_name"
  | "variant_title" // image-only, falls back to ""
  | "collection_title" // products: first collection (we don't store yet → empty)
  | "image_position";

export const VARIABLE_LABELS: Record<VariableKey, string> = {
  title: "Title",
  handle: "Handle",
  vendor: "Vendor",
  product_type: "Product Type",
  tags: "Tags",
  shop_name: "Shop Name",
  variant_title: "Variant Title",
  collection_title: "Collection Title",
  image_position: "Image #",
};

export const COMMON_SEPARATORS = [" | ", " - ", " · ", ", ", " "] as const;

// A template token is either a variable reference or a literal string.
export type TemplateToken =
  | { kind: "var"; key: VariableKey }
  | { kind: "lit"; value: string };

export type TemplateConfig = {
  tokens: TemplateToken[];
  maxChars: number;
  capitalization: "none" | "title" | "upper" | "lower" | "sentence";
  removeDuplicateWords: boolean;
};

// ---------- Serialization (string ↔ tokens) ----------

// We persist a template as a single string with {variable} placeholders.
// Example: "{title} | {vendor} | {product_type}"
export function tokensToString(tokens: TemplateToken[]): string {
  return tokens
    .map((t) => (t.kind === "var" ? `{${t.key}}` : t.value))
    .join("");
}

export function stringToTokens(str: string): TemplateToken[] {
  const out: TemplateToken[] = [];
  const re = /\{([a-z_]+)\}/g;
  let last = 0;
  for (const m of str.matchAll(re)) {
    const start = m.index ?? 0;
    if (start > last) {
      out.push({ kind: "lit", value: str.slice(last, start) });
    }
    out.push({ kind: "var", key: m[1] as VariableKey });
    last = start + m[0].length;
  }
  if (last < str.length) {
    out.push({ kind: "lit", value: str.slice(last) });
  }
  return out;
}

// ---------- Rendering ----------

export type RenderContext = {
  resource: Pick<
    Resource,
    | "title"
    | "handle"
    | "vendor"
    | "productType"
    | "tags"
    | "type"
  >;
  image?: Pick<Image, "altText"> | null;
  imagePosition?: number;
  shopName?: string;
};

function lookup(key: VariableKey, ctx: RenderContext): string {
  switch (key) {
    case "title":
      return ctx.resource.title ?? "";
    case "handle":
      return ctx.resource.handle ?? "";
    case "vendor":
      return ctx.resource.vendor ?? "";
    case "product_type":
      return ctx.resource.productType ?? "";
    case "tags":
      return ctx.resource.tags ?? "";
    case "shop_name":
      return ctx.shopName ?? "";
    case "variant_title":
      return ""; // not modeled yet
    case "collection_title":
      return ""; // not modeled yet
    case "image_position":
      return ctx.imagePosition ? String(ctx.imagePosition) : "";
    default:
      return "";
  }
}

export function renderTemplate(
  cfg: TemplateConfig,
  ctx: RenderContext,
): string {
  // Render every token, then collapse adjacent empties so separators don't
  // dangle when a variable is missing.
  let parts: string[] = [];
  for (const t of cfg.tokens) {
    if (t.kind === "var") {
      const v = lookup(t.key, ctx).trim();
      parts.push(v);
    } else {
      parts.push(t.value);
    }
  }

  // Strip separators that are sandwiched between empty variable values.
  // Walk through and join, dropping leading/trailing literal-only runs.
  let out = "";
  for (let i = 0; i < parts.length; i++) {
    const cur = parts[i];
    const isVar = cfg.tokens[i].kind === "var";
    if (isVar) {
      out += cur;
    } else {
      // Only include literal if there's a non-empty var on at least one side
      const prev = i > 0 ? parts[i - 1] : "";
      const next = i + 1 < parts.length ? parts[i + 1] : "";
      if (prev && next) out += cur;
    }
  }

  // Collapse repeated whitespace
  out = out.replace(/\s+/g, " ").trim();

  if (cfg.removeDuplicateWords) {
    const seen = new Set<string>();
    out = out
      .split(/\s+/)
      .filter((w) => {
        const k = w.toLowerCase();
        if (seen.has(k)) return false;
        seen.add(k);
        return true;
      })
      .join(" ");
  }

  out = applyCapitalization(out, cfg.capitalization);

  if (cfg.maxChars > 0 && out.length > cfg.maxChars) {
    out = out.slice(0, cfg.maxChars).trimEnd();
  }
  return out;
}

function applyCapitalization(
  s: string,
  mode: TemplateConfig["capitalization"],
): string {
  switch (mode) {
    case "upper":
      return s.toUpperCase();
    case "lower":
      return s.toLowerCase();
    case "title":
      return s.replace(/\b([a-z])(\w*)/g, (_, a, b) => a.toUpperCase() + b);
    case "sentence":
      return s.charAt(0).toUpperCase() + s.slice(1).toLowerCase();
    default:
      return s;
  }
}

// ---------- Settings persistence ----------
//
// Saved on Settings.optimizerRules (existing JSON column) under a `templates`
// sub-key keyed by purpose, e.g. templates.altText.product

export const DEFAULT_TEMPLATE: TemplateConfig = {
  tokens: stringToTokens("{title}"),
  maxChars: 60,
  capitalization: "none",
  removeDuplicateWords: true,
};
