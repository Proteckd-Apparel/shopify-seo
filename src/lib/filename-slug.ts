// Slugify text into a SEO-friendly filename. Pure function — no I/O.

const SMALL_WORDS = new Set([
  "a", "an", "the", "and", "or", "but", "of", "in", "on", "at", "to",
  "for", "with", "by", "from", "as", "is", "it", "be",
]);

export function slugify(
  input: string,
  opts: {
    maxChars?: number;
    removeDuplicateWords?: boolean;
    removeSmallWords?: boolean;
  } = {},
): string {
  const max = opts.maxChars ?? 90;
  let s = input.toLowerCase();

  // Strip accents
  s = s.normalize("NFKD").replace(/[\u0300-\u036f]/g, "");

  // Replace any non-alphanumeric with a hyphen
  s = s.replace(/[^a-z0-9]+/g, "-");

  // Collapse repeated hyphens
  s = s.replace(/-+/g, "-");

  // Trim leading/trailing hyphens
  s = s.replace(/^-+|-+$/g, "");

  let words = s.split("-").filter(Boolean);

  if (opts.removeSmallWords) {
    words = words.filter((w) => !SMALL_WORDS.has(w));
  }

  if (opts.removeDuplicateWords) {
    const seen = new Set<string>();
    words = words.filter((w) => {
      if (seen.has(w)) return false;
      seen.add(w);
      return true;
    });
  }

  s = words.join("-");

  if (max > 0 && s.length > max) {
    // Cut at last hyphen before the max so we don't slice mid-word
    const sliced = s.slice(0, max);
    const lastHyphen = sliced.lastIndexOf("-");
    s = lastHyphen > 0 ? sliced.slice(0, lastHyphen) : sliced;
  }

  return s;
}

// Decompose a CDN URL into the bare filename without query string + extension.
export function filenameFromUrl(url: string): {
  base: string;
  ext: string;
} {
  try {
    const u = new URL(url, "https://example.com");
    const file = u.pathname.split("/").pop() ?? "";
    const dot = file.lastIndexOf(".");
    if (dot < 0) return { base: file, ext: "" };
    return {
      base: file.slice(0, dot),
      ext: file.slice(dot + 1).toLowerCase(),
    };
  } catch {
    return { base: url, ext: "" };
  }
}

export function isWebp(url: string): boolean {
  return filenameFromUrl(url).ext === "webp";
}
