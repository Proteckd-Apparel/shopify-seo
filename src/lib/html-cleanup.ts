// Deterministic HTML cleanup applied to product/collection/article/page bodies.
// Pure function — no I/O. Tested in isolation.

import * as cheerio from "cheerio";

export type CleanupConfig = {
  addAltTextsIfMissing: boolean;
  overwriteExistingAlts: boolean;
  addLazyloadToImages: boolean;
  addTitlesToLinks: boolean;
  addAriaLabelsToLinks: boolean;
  removeAllExternalLinks: boolean;
  removeEmptyPTags: boolean;
};

export const DEFAULT_CLEANUP_CONFIG: CleanupConfig = {
  addAltTextsIfMissing: true,
  overwriteExistingAlts: false,
  addLazyloadToImages: true,
  addTitlesToLinks: false,
  addAriaLabelsToLinks: false,
  removeAllExternalLinks: false,
  removeEmptyPTags: true,
};

// Derive a reasonable alt from an image src by stripping the path / extension /
// query string and converting separators to spaces.
function altFromSrc(src: string): string {
  try {
    const u = new URL(src, "https://example.com");
    const file = u.pathname.split("/").pop() ?? "";
    const stem = file.replace(/\.[a-z0-9]+$/i, "");
    return stem
      .replace(/[-_]+/g, " ")
      .replace(/\s+/g, " ")
      .trim();
  } catch {
    return "";
  }
}

function isExternalHref(href: string, shopHost: string): boolean {
  if (!href) return false;
  if (href.startsWith("/") || href.startsWith("#") || href.startsWith("?"))
    return false;
  if (href.startsWith("mailto:") || href.startsWith("tel:")) return false;
  try {
    const u = new URL(href, `https://${shopHost}`);
    return u.host !== shopHost && !u.host.endsWith(`.${shopHost}`);
  } catch {
    return false;
  }
}

export type CleanupResult = {
  html: string;
  changes: {
    altsAdded: number;
    lazyloadAdded: number;
    linkTitlesAdded: number;
    linkAriaLabelsAdded: number;
    externalLinksStripped: number;
    emptyParagraphsRemoved: number;
  };
};

export function cleanupHtml(
  input: string,
  cfg: CleanupConfig,
  shopHost: string,
  resourceTitle = "",
): CleanupResult {
  if (!input) {
    return {
      html: input,
      changes: {
        altsAdded: 0,
        lazyloadAdded: 0,
        linkTitlesAdded: 0,
        linkAriaLabelsAdded: 0,
        externalLinksStripped: 0,
        emptyParagraphsRemoved: 0,
      },
    };
  }

  // Cheerio adds <html><head><body> wrappers when loading a fragment, so use
  // its `xmlMode: false` and serialize back without those wrappers.
  const $ = cheerio.load(input, null, false);

  let altsAdded = 0;
  let lazyloadAdded = 0;
  let linkTitlesAdded = 0;
  let linkAriaLabelsAdded = 0;
  let externalLinksStripped = 0;
  let emptyParagraphsRemoved = 0;

  // ----- Images -----
  $("img").each((_, el) => {
    const $img = $(el);

    // Alt text
    if (cfg.addAltTextsIfMissing) {
      const existing = ($img.attr("alt") ?? "").trim();
      if (!existing || cfg.overwriteExistingAlts) {
        const src = $img.attr("src") ?? "";
        const derived = altFromSrc(src) || resourceTitle;
        if (derived) {
          $img.attr("alt", derived);
          altsAdded++;
        }
      }
    }

    // Lazyload
    if (cfg.addLazyloadToImages) {
      if (!$img.attr("loading")) {
        $img.attr("loading", "lazy");
        lazyloadAdded++;
      }
    }
  });

  // ----- Links -----
  $("a").each((_, el) => {
    const $a = $(el);
    const href = $a.attr("href") ?? "";
    const text = $a.text().trim();

    if (cfg.removeAllExternalLinks && isExternalHref(href, shopHost)) {
      // Replace the <a> with its text content
      $a.replaceWith(text);
      externalLinksStripped++;
      return;
    }

    if (cfg.addTitlesToLinks && text && !$a.attr("title")) {
      $a.attr("title", text);
      linkTitlesAdded++;
    }

    if (cfg.addAriaLabelsToLinks && text && !$a.attr("aria-label")) {
      $a.attr("aria-label", text);
      linkAriaLabelsAdded++;
    }
  });

  // ----- Empty <p> tags -----
  if (cfg.removeEmptyPTags) {
    $("p").each((_, el) => {
      const $p = $(el);
      const text = $p.text().replace(/\u00a0/g, "").trim();
      const hasMedia = $p.find("img, video, iframe").length > 0;
      if (!text && !hasMedia) {
        $p.remove();
        emptyParagraphsRemoved++;
      }
    });
  }

  // Serialize back. cheerio's `.html()` returns the inner-doc string.
  const html = $.html();

  return {
    html,
    changes: {
      altsAdded,
      lazyloadAdded,
      linkTitlesAdded,
      linkAriaLabelsAdded,
      externalLinksStripped,
      emptyParagraphsRemoved,
    },
  };
}
