// Aggregate stats computed on-demand from the scanned data in SQLite.
// This is what powers the dashboard cards. All counts are pure SQL/Prisma —
// no Shopify calls — so it's fast and works offline after a scan.

import { prisma } from "./prisma";

export type StatGroup = {
  scope: string; // products | collections | articles | pages | assets | theme
  cards: StatCard[];
};

export type StatCard = {
  label: string;
  value: number | string;
  group?: string; // sub-tag like "Photos" / "Meta" / "Html"
  tone?: "good" | "bad" | "neutral";
  hint?: string;
  // Drill-in destination. When set, the dashboard renders the card as a link
  // so clicking takes you to the inline list / fixer for that issue.
  href?: string;
  // One-line "how to fix" shown on the card. Pairs with href.
  fixHint?: string;
};

const META_TITLE_MIN = 25;
const META_TITLE_MAX = 60;
const META_DESC_MIN = 70;
const META_DESC_MAX = 160;

export async function computeStats(): Promise<StatGroup[]> {
  const types = ["product", "collection", "article", "page"] as const;
  const groups: StatGroup[] = [];

  for (const type of types) {
    const resources = await prisma.resource.findMany({
      where: { type },
      include: { images: true },
    });

    const total = resources.length;
    if (total === 0) {
      groups.push({
        scope: pluralize(type),
        cards: [{ label: "Total", value: 0, tone: "neutral" }],
      });
      continue;
    }

    const drafts = resources.filter((r) => r.status === "draft").length;

    // Titles
    const titleLens = resources
      .map((r) => (r.title ?? "").length)
      .filter((n) => n > 0);
    const avgTitleLen = avg(titleLens);

    // Meta titles
    const metaTitlePresent = resources.filter((r) =>
      (r.seoTitle ?? "").trim(),
    ).length;
    const metaTitleMissing = total - metaTitlePresent;
    const metaTitleLens = resources
      .map((r) => (r.seoTitle ?? "").length)
      .filter((n) => n > 0);
    const avgMetaTitleLen = avg(metaTitleLens);
    const metaTitleOptimal = resources.filter((r) => {
      const l = (r.seoTitle ?? "").length;
      return l >= META_TITLE_MIN && l <= META_TITLE_MAX;
    }).length;

    // Meta descriptions
    const metaDescPresent = resources.filter((r) =>
      (r.seoDescription ?? "").trim(),
    ).length;
    const metaDescMissing = total - metaDescPresent;
    const metaDescLens = resources
      .map((r) => (r.seoDescription ?? "").length)
      .filter((n) => n > 0);
    const avgMetaDescLen = avg(metaDescLens);
    const metaDescOptimal = resources.filter((r) => {
      const l = (r.seoDescription ?? "").length;
      return l >= META_DESC_MIN && l <= META_DESC_MAX;
    }).length;

    // URLs (handle length is the proxy)
    const urlLens = resources
      .map((r) => (r.handle ?? "").length)
      .filter((n) => n > 0);
    const avgUrlLen = avg(urlLens);
    const urlsWithEmoji = resources.filter((r) =>
      hasEmoji(r.handle ?? ""),
    ).length;

    // Photos
    const allImages = resources.flatMap((r) => r.images);
    const totalPhotos = allImages.length;
    const photosWithAlt = allImages.filter((i) =>
      (i.altText ?? "").trim(),
    ).length;
    const photosMissingAlt = totalPhotos - photosWithAlt;
    const lowResPhotos = allImages.filter(
      (i) => (i.width ?? Number.POSITIVE_INFINITY) < 800,
    ).length;
    const altLens = allImages
      .map((i) => (i.altText ?? "").length)
      .filter((n) => n > 0);
    const avgAltLen = avg(altLens);

    // Body / HTML
    const bodyLens = resources.map((r) =>
      (r.bodyHtml ?? "").replace(/<[^>]+>/g, " ").trim().length,
    );
    const avgBodyLen = avg(bodyLens);
    const thinBody = bodyLens.filter((l) => l > 0 && l < 120).length;
    const emptyBody = bodyLens.filter((l) => l === 0).length;

    // Drill-in URLs. type is singular ("product"/"page"/etc.) — matches
    // the `type` query param accepted by the optimize/meta-* inline routes.
    const metaTitlesAll = `/optimize/meta-titles?mode=inline&type=${type}&filter=all`;
    const metaTitlesMissing = `/optimize/meta-titles?mode=inline&type=${type}&filter=missing`;
    const metaDescAll = `/optimize/meta-descriptions?mode=inline&type=${type}&filter=all`;
    const metaDescMissingUrl = `/optimize/meta-descriptions?mode=inline&type=${type}&filter=missing`;

    const cards: StatCard[] = [
      { label: "Total", value: total, tone: "neutral" },
      {
        label: "Drafts",
        value: drafts,
        tone: drafts > 0 ? "bad" : "good",
        fixHint: drafts > 0 ? "Publish in Shopify admin" : undefined,
      },

      // Photos
      {
        label: "Total Photos",
        value: totalPhotos,
        group: "Photos",
        href: totalPhotos > 0 ? "/optimize/alt-texts?mode=inline&filter=all" : undefined,
      },
      {
        label: "Photos Missing Alt",
        value: photosMissingAlt,
        group: "Photos",
        tone: photosMissingAlt === 0 ? "good" : "bad",
        href: photosMissingAlt > 0 ? "/optimize/alt-texts?mode=inline&filter=missing" : undefined,
        fixHint: photosMissingAlt > 0 ? "Generate alt text" : undefined,
      },
      {
        label: "Photos With Alt",
        value: photosWithAlt,
        group: "Photos",
        tone: "good",
        href: photosWithAlt > 0 ? "/optimize/alt-texts?mode=inline&filter=set" : undefined,
      },
      {
        label: "Avg Alt Text Length",
        value: avgAltLen,
        group: "Photos",
        href: photosWithAlt > 0 ? "/optimize/alt-texts?mode=inline&filter=set" : undefined,
      },
      {
        label: "Low Resolution Photos",
        value: lowResPhotos,
        group: "Photos",
        tone: lowResPhotos === 0 ? "good" : "bad",
        hint: "Width < 800px",
        href: lowResPhotos > 0 ? "/optimize/upscale-photos" : undefined,
        fixHint: lowResPhotos > 0 ? "Upscale via AI" : undefined,
      },

      // Meta
      {
        label: "Meta Titles Set",
        value: metaTitlePresent,
        group: "Meta",
        tone: metaTitleMissing === 0 ? "good" : "neutral",
        href: metaTitlePresent > 0 ? metaTitlesAll : undefined,
      },
      {
        label: "Meta Titles Missing",
        value: metaTitleMissing,
        group: "Meta",
        tone: metaTitleMissing === 0 ? "good" : "bad",
        href: metaTitleMissing > 0 ? metaTitlesMissing : undefined,
        fixHint: metaTitleMissing > 0 ? "Generate or edit" : undefined,
      },
      {
        label: "Meta Title Optimal Length",
        value: metaTitleOptimal,
        group: "Meta",
        hint: `${META_TITLE_MIN}-${META_TITLE_MAX} chars`,
        href: metaTitlesAll,
      },
      {
        label: "Avg Meta Title Length",
        value: avgMetaTitleLen,
        group: "Meta",
        href: metaTitlesAll,
      },
      {
        label: "Meta Descriptions Set",
        value: metaDescPresent,
        group: "Meta",
        href: metaDescPresent > 0 ? metaDescAll : undefined,
      },
      {
        label: "Meta Descriptions Missing",
        value: metaDescMissing,
        group: "Meta",
        tone: metaDescMissing === 0 ? "good" : "bad",
        href: metaDescMissing > 0 ? metaDescMissingUrl : undefined,
        fixHint: metaDescMissing > 0 ? "Generate or edit" : undefined,
      },
      {
        label: "Meta Desc Optimal Length",
        value: metaDescOptimal,
        group: "Meta",
        hint: `${META_DESC_MIN}-${META_DESC_MAX} chars`,
        href: metaDescAll,
      },
      {
        label: "Avg Meta Desc Length",
        value: avgMetaDescLen,
        group: "Meta",
        href: metaDescAll,
      },

      // Titles
      {
        label: "Avg Title Length",
        value: avgTitleLen,
        group: "Titles",
        href: "/optimize/titles",
        fixHint: "Edit title template",
      },

      // URLs
      {
        label: "Avg URL Length",
        value: avgUrlLen,
        group: "URLs",
        href: "/optimize/urls",
        fixHint: "Edit URL template",
      },
      {
        label: "URLs Containing Emoji",
        value: urlsWithEmoji,
        group: "URLs",
        tone: urlsWithEmoji === 0 ? "good" : "bad",
        href: urlsWithEmoji > 0 ? "/optimize/urls" : undefined,
        fixHint: urlsWithEmoji > 0 ? "Rewrite handles" : undefined,
      },

      // Body
      {
        label: "Avg Body Length",
        value: avgBodyLen,
        group: "Content",
        href: "/optimize/main-html-text",
      },
      {
        label: "Thin Content",
        value: thinBody,
        group: "Content",
        tone: thinBody === 0 ? "good" : "bad",
        hint: "Body < 120 chars",
        href: thinBody > 0 ? "/optimize/main-html-text" : undefined,
        fixHint: thinBody > 0 ? "Expand body copy" : undefined,
      },
      {
        label: "Empty Body",
        value: emptyBody,
        group: "Content",
        tone: emptyBody === 0 ? "good" : "bad",
        href: emptyBody > 0 ? "/optimize/main-html-text" : undefined,
        fixHint: emptyBody > 0 ? "Add body copy" : undefined,
      },
    ];

    groups.push({ scope: pluralize(type), cards });
  }

  return groups;
}

function avg(nums: number[]): number {
  if (nums.length === 0) return 0;
  return Math.round(nums.reduce((s, n) => s + n, 0) / nums.length);
}

function hasEmoji(s: string): boolean {
  // Quick range check that catches most emoji.
  return /[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]/u.test(s);
}

function pluralize(type: string): string {
  return type === "category" ? "categories" : `${type}s`;
}
