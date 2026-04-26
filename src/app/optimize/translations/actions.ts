"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import {
  listShopLocales,
  readTranslatableResource,
  registerTranslations,
  type ShopLocale,
  type TranslationInput,
} from "@/lib/shopify-locales";
import { getAnthropic, MODELS } from "@/lib/anthropic";
import { loadOptimizerConfig, saveOptimizerConfig } from "@/lib/optimizer-config";

// ---------- Read locales ----------

export type LocalesReport = {
  ok: boolean;
  message?: string;
  locales: ShopLocale[];
  primary?: string;
};

export async function getLocales(): Promise<LocalesReport> {
  try {
    const locales = await listShopLocales();
    const primary = locales.find((l) => l.primary)?.locale;
    return { ok: true, locales, primary };
  } catch (e) {
    return {
      ok: false,
      message: e instanceof Error ? e.message : "Failed",
      locales: [],
    };
  }
}

// ---------- Coverage scan ----------
//
// For each non-primary locale, check how many products in the local DB
// already have a translation (any field) vs how many are missing.

export type CoverageRow = {
  locale: string;
  name: string;
  published: boolean;
  totalResources: number;
  withTranslations: number;
  outdated: number;
  missing: number;
};

export async function scanTranslationCoverage(
  resourceType: "product" | "collection" | "article" | "page" = "product",
): Promise<{ ok: boolean; rows?: CoverageRow[]; message?: string }> {
  try {
    const locales = await listShopLocales();
    const non = locales.filter((l) => !l.primary);
    if (non.length === 0)
      return { ok: false, message: "Only primary locale is enabled" };

    // For performance: sample first 50 resources, extrapolate counts
    const totalResources = await prisma.resource.count({
      where: { type: resourceType },
    });
    if (totalResources === 0)
      return { ok: false, message: `No ${resourceType}s scanned yet` };
    const sample = await prisma.resource.findMany({
      where: { type: resourceType },
      take: 50,
      orderBy: { id: "asc" },
    });

    const rows: CoverageRow[] = [];
    for (const loc of non) {
      let withTrans = 0;
      let outdated = 0;
      for (const r of sample) {
        try {
          const tr = await readTranslatableResource(r.id, [loc.locale]);
          if (!tr) continue;
          if (tr.translations.length > 0) {
            withTrans++;
            if (tr.translations.some((t) => t.outdated)) outdated++;
          }
        } catch {}
      }
      const ratio = withTrans / sample.length;
      const projected = Math.round(ratio * totalResources);
      rows.push({
        locale: loc.locale,
        name: loc.name,
        published: loc.published,
        totalResources,
        withTranslations: projected,
        outdated: Math.round((outdated / sample.length) * totalResources),
        missing: totalResources - projected,
      });
    }
    return { ok: true, rows };
  } catch (e) {
    return { ok: false, message: e instanceof Error ? e.message : "Failed" };
  }
}

// ---------- Settings: which locales mine handles ----------

export async function saveTranslatorLocales(
  myLocales: string[],
): Promise<{ ok: boolean; message: string }> {
  try {
    const cfg = await loadOptimizerConfig();
    // Stash the locale list inside the existing optimizerRules JSON
    const next = { ...cfg, translatorLocales: myLocales };
    await saveOptimizerConfig(next as typeof cfg & { translatorLocales: string[] });
    revalidatePath("/optimize/translations");
    return { ok: true, message: "Saved" };
  } catch (e) {
    return { ok: false, message: e instanceof Error ? e.message : "Failed" };
  }
}

export async function getTranslatorLocales(): Promise<string[]> {
  const cfg = (await loadOptimizerConfig()) as Record<string, unknown>;
  const list = cfg.translatorLocales;
  return Array.isArray(list) ? (list as string[]) : [];
}

// ---------- Claude translator ----------

const LOCALE_NAMES: Record<string, string> = {
  en: "English",
  es: "Spanish",
  fr: "French",
  de: "German",
  pl: "Polish",
  it: "Italian",
  pt: "Portuguese",
  "pt-BR": "Brazilian Portuguese",
  nl: "Dutch",
  sv: "Swedish",
  no: "Norwegian",
  da: "Danish",
  fi: "Finnish",
  ja: "Japanese",
  ko: "Korean",
  "zh-CN": "Simplified Chinese",
  "zh-TW": "Traditional Chinese",
};

function localeName(code: string): string {
  return LOCALE_NAMES[code] ?? code;
}

async function translateBatch(
  values: Array<{ key: string; text: string }>,
  targetLocale: string,
  sourceLocale: string,
): Promise<Map<string, string>> {
  const client = await getAnthropic();
  if (!client) throw new Error("Anthropic key not configured");
  const cfg = await loadOptimizerConfig();
  const brand = cfg.notes ? `\n\nBrand voice / rules:\n${cfg.notes}` : "";

  const target = localeName(targetLocale);
  const source = localeName(sourceLocale);

  const system = `You translate ecommerce store copy from ${source} to ${target}. Output STRICT JSON only — no prose, no markdown, no code fences. The response must be a JSON object where each key matches the input key and the value is the translated text. Hard rules:
- Preserve all numbers, sizes, colors, prices, brand names, product codes verbatim
- Do not add or remove sentences
- Maintain the original tone and length when possible
- For HTML body fields, preserve all tags and structure exactly — translate only the text inside
- For meta titles/descriptions, respect the same character budget (titles ~60, descriptions ~160)${brand}`;

  const obj: Record<string, string> = {};
  for (const v of values) obj[v.key] = v.text;
  const user = `Translate every value in this JSON to ${target}. Keep keys identical.\n\n${JSON.stringify(obj, null, 2)}`;

  const res = await client.messages.create({
    model: MODELS.fast,
    max_tokens: 4000,
    system,
    messages: [{ role: "user", content: user }],
  });

  let text = "";
  for (const block of res.content) {
    if (block.type === "text") text += block.text;
  }
  text = text.trim().replace(/^```(?:json)?/i, "").replace(/```$/i, "").trim();
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start < 0 || end < 0) throw new Error("Translator returned non-JSON");
  const parsed = JSON.parse(text.slice(start, end + 1)) as Record<string, string>;

  const out = new Map<string, string>();
  for (const [k, v] of Object.entries(parsed)) {
    if (typeof v === "string") out.set(k, v);
  }
  return out;
}

// ---------- Translate one resource into all enabled locales ----------

export type TranslateOneResult = {
  ok: boolean;
  message: string;
  fields?: number;
  locales?: number;
};

export async function translateOneResource(
  resourceId: string,
): Promise<TranslateOneResult> {
  try {
    const myLocales = await getTranslatorLocales();
    if (myLocales.length === 0)
      return { ok: false, message: "No translator locales configured" };

    const localesData = await listShopLocales();
    const primary = localesData.find((l) => l.primary)?.locale ?? "en";
    const tr = await readTranslatableResource(resourceId, myLocales);
    if (!tr) return { ok: false, message: "Resource not translatable" };

    // Pick the fields worth translating: title, body_html, meta_* etc.
    const wanted = tr.content.filter(
      (c) =>
        c.locale === primary &&
        [
          "title",
          "body_html",
          "meta_title",
          "meta_description",
          "summary_html",
          "product_type",
        ].includes(c.key),
    );
    if (wanted.length === 0)
      return { ok: false, message: "No translatable fields" };

    let totalFields = 0;
    for (const target of myLocales) {
      const existing = tr.translations.filter((t) => t.locale === target);
      // Skip fields that already have a non-outdated translation
      const todo = wanted.filter((w) => {
        const ex = existing.find((t) => t.key === w.key);
        return !ex || ex.outdated;
      });
      if (todo.length === 0) continue;
      const translated = await translateBatch(
        todo.map((w) => ({ key: w.key, text: w.value })),
        target,
        primary,
      );
      const inputs: TranslationInput[] = [];
      for (const w of todo) {
        const v = translated.get(w.key);
        if (!v) continue;
        inputs.push({
          key: w.key,
          locale: target,
          value: v,
          translatableContentDigest: w.digest,
        });
      }
      if (inputs.length > 0) {
        await registerTranslations(resourceId, inputs);
        totalFields += inputs.length;
      }
    }

    revalidatePath("/optimize/translations");
    return {
      ok: true,
      message: `Translated ${totalFields} fields across ${myLocales.length} locales`,
      fields: totalFields,
      locales: myLocales.length,
    };
  } catch (e) {
    return { ok: false, message: e instanceof Error ? e.message : "Failed" };
  }
}

// ---------- Bulk translate ----------

export type BulkTranslateResult = {
  ok: boolean;
  message: string;
  processed: number;
  saved: number;
  failed: number;
};

export async function bulkTranslateResources(
  resourceType: "product" | "collection" | "article" | "page",
): Promise<BulkTranslateResult> {
  const myLocales = await getTranslatorLocales();
  if (myLocales.length === 0)
    return {
      ok: false,
      message: "No translator locales configured",
      processed: 0,
      saved: 0,
      failed: 0,
    };

  const resources = await prisma.resource.findMany({
    where: { type: resourceType },
    take: 200, // safety cap
  });

  let processed = 0;
  let saved = 0;
  let failed = 0;
  for (const r of resources) {
    processed++;
    try {
      const result = await translateOneResource(r.id);
      if (result.ok) saved++;
      else failed++;
    } catch {
      failed++;
    }
  }

  revalidatePath("/optimize/translations");
  return {
    ok: failed === 0,
    message: `Processed ${processed} (saved ${saved}, failed ${failed})${
      processed === 200 ? " — hit 200 cap, run again for more" : ""
    }`,
    processed,
    saved,
    failed,
  };
}

// Translates every resource type (products + collections + articles +
// pages) into all configured target locales. Each type internally
// caps at 200 per call so the worst-case total is 800 resources per
// click. translateOneResource skips fields that already have a
// non-outdated translation, so repeat clicks are cheap and progressive.
export async function bulkTranslateAllTypes(): Promise<
  BulkTranslateResult & {
    perType: Record<string, { processed: number; saved: number; failed: number }>;
  }
> {
  const myLocales = await getTranslatorLocales();
  if (myLocales.length === 0)
    return {
      ok: false,
      message: "No translator locales configured",
      processed: 0,
      saved: 0,
      failed: 0,
      perType: {},
    };

  const types = ["product", "collection", "article", "page"] as const;
  const perType: Record<
    string,
    { processed: number; saved: number; failed: number }
  > = {};
  let totalProcessed = 0;
  let totalSaved = 0;
  let totalFailed = 0;

  for (const type of types) {
    const r = await bulkTranslateResources(type);
    perType[type] = {
      processed: r.processed,
      saved: r.saved,
      failed: r.failed,
    };
    totalProcessed += r.processed;
    totalSaved += r.saved;
    totalFailed += r.failed;
  }

  revalidatePath("/optimize/translations");
  return {
    ok: totalFailed === 0,
    message:
      `Done. ${totalProcessed} processed, ${totalSaved} translated, ${totalFailed} failed across ` +
      types
        .map((t) => `${t}s: ${perType[t].saved}/${perType[t].processed}`)
        .join(", "),
    processed: totalProcessed,
    saved: totalSaved,
    failed: totalFailed,
    perType,
  };
}
