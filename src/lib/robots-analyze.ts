// Minimal robots.txt parser + AI-crawler access checker. Follows the
// standard spec: groups of User-agent lines + Allow/Disallow rules, with
// longest-match wins (Allow beats Disallow at equal length).

export type Rule = {
  type: "allow" | "disallow";
  pattern: string;
};

export type Group = {
  userAgents: string[]; // lowercased
  rules: Rule[];
};

export type Access = {
  allowed: boolean;
  matchedRule: Rule | null;
  matchedGroupAgent: string | null; // which UA label in the group matched
};

export function parseRobots(text: string): Group[] {
  const groups: Group[] = [];
  let current: Group | null = null;
  let lastWasUserAgent = false;

  for (const raw of text.split(/\r?\n/)) {
    const line = raw.replace(/#.*$/, "").trim();
    if (!line) continue;
    const match = line.match(/^([A-Za-z-]+)\s*:\s*(.*)$/);
    if (!match) continue;
    const key = match[1].toLowerCase();
    const value = match[2].trim();

    if (key === "user-agent") {
      if (!current || !lastWasUserAgent) {
        current = { userAgents: [], rules: [] };
        groups.push(current);
      }
      current.userAgents.push(value.toLowerCase());
      lastWasUserAgent = true;
    } else if (key === "allow" || key === "disallow") {
      lastWasUserAgent = false;
      if (!current) continue;
      if (value === "" && key === "disallow") continue; // empty disallow = allow all, no-op
      current.rules.push({ type: key, pattern: value });
    } else {
      // crawl-delay, sitemap, etc. break the user-agent run-on
      lastWasUserAgent = false;
    }
  }
  return groups;
}

// Match a robots.txt pattern against a URL path. Supports `*` (any chars)
// and `$` end-of-string anchor, per the Google robots.txt spec.
function patternMatches(pattern: string, path: string): boolean {
  if (pattern === "") return false;
  const anchored = pattern.endsWith("$");
  const core = anchored ? pattern.slice(0, -1) : pattern;
  const regex = new RegExp(
    "^" +
      core
        .split("*")
        .map((p) => p.replace(/[.+?^${}()|[\]\\]/g, "\\$&"))
        .join(".*") +
      (anchored ? "$" : ""),
  );
  return regex.test(path);
}

function groupForUserAgent(groups: Group[], userAgent: string): Group | null {
  const uaLower = userAgent.toLowerCase();
  // Prefer an exact/substring match over the wildcard `*` group, per spec.
  let specific: Group | null = null;
  let wildcard: Group | null = null;
  for (const g of groups) {
    for (const ua of g.userAgents) {
      if (ua === "*") {
        wildcard = g;
      } else if (uaLower === ua || uaLower.includes(ua)) {
        specific = g;
      }
    }
  }
  return specific ?? wildcard;
}

export function checkAccess(
  groups: Group[],
  userAgent: string,
  path: string,
): Access {
  const group = groupForUserAgent(groups, userAgent);
  if (!group) return { allowed: true, matchedRule: null, matchedGroupAgent: null };

  let best: Rule | null = null;
  for (const rule of group.rules) {
    if (!patternMatches(rule.pattern, path)) continue;
    if (!best || rule.pattern.length > best.pattern.length) {
      best = rule;
    } else if (rule.pattern.length === best.pattern.length) {
      // Allow wins ties.
      if (best.type === "disallow" && rule.type === "allow") best = rule;
    }
  }

  // Prefer the non-wildcard UA label if this group only matched via "*";
  // otherwise report the specific UA string so the UI surfaces why this
  // crawler matched (e.g. "matched ClaudeBot" vs "matched *").
  const uaLower = userAgent.toLowerCase();
  const specificAgent = group.userAgents.find(
    (ua) => ua !== "*" && uaLower.includes(ua),
  );
  const matchedAgent =
    specificAgent ?? (group.userAgents.includes("*") ? "*" : null);

  if (!best) {
    return { allowed: true, matchedRule: null, matchedGroupAgent: matchedAgent ?? null };
  }
  return {
    allowed: best.type === "allow",
    matchedRule: best,
    matchedGroupAgent: matchedAgent ?? null,
  };
}

// -------- AI crawler registry --------

export type AiCrawler = {
  userAgent: string;
  vendor: string;
  purpose: string; // short label, e.g. "Training" / "Live search"
};

export const AI_CRAWLERS: AiCrawler[] = [
  { userAgent: "GPTBot", vendor: "OpenAI", purpose: "Training" },
  { userAgent: "ChatGPT-User", vendor: "OpenAI", purpose: "ChatGPT plugin fetch" },
  { userAgent: "OAI-SearchBot", vendor: "OpenAI", purpose: "ChatGPT Search" },
  { userAgent: "ClaudeBot", vendor: "Anthropic", purpose: "Training / retrieval" },
  { userAgent: "anthropic-ai", vendor: "Anthropic", purpose: "Live fetch" },
  { userAgent: "Claude-Web", vendor: "Anthropic", purpose: "Live fetch" },
  { userAgent: "Google-Extended", vendor: "Google", purpose: "Gemini / Vertex training" },
  { userAgent: "PerplexityBot", vendor: "Perplexity", purpose: "Indexing" },
  { userAgent: "Perplexity-User", vendor: "Perplexity", purpose: "Live fetch" },
  { userAgent: "Applebot-Extended", vendor: "Apple", purpose: "Apple Intelligence training" },
  { userAgent: "Meta-ExternalAgent", vendor: "Meta", purpose: "Llama training" },
  { userAgent: "Amazonbot", vendor: "Amazon", purpose: "Alexa / training" },
  { userAgent: "Bytespider", vendor: "ByteDance", purpose: "Doubao / TikTok training" },
  { userAgent: "CCBot", vendor: "Common Crawl", purpose: "Open dataset (feeds many LLMs)" },
];

// Representative paths a crawler might fetch. Results are aggregated across
// these so a bot is "allowed" only if it can reach at least the homepage and
// a product/collection/article URL.
export const PROBE_PATHS = [
  "/",
  "/products/example",
  "/collections/example",
  "/pages/about",
  "/blogs/news/example-article",
];

export type CrawlerReport = {
  userAgent: string;
  vendor: string;
  purpose: string;
  overall: "allowed" | "blocked" | "mixed";
  paths: {
    path: string;
    allowed: boolean;
    matchedRule: Rule | null;
  }[];
};

export async function fetchRobots(origin: string): Promise<string> {
  const url = `${origin.replace(/\/$/, "")}/robots.txt`;
  const r = await fetch(url, { cache: "no-store" });
  if (!r.ok) throw new Error(`HTTP ${r.status} fetching ${url}`);
  return r.text();
}

export function analyzeRobots(text: string): {
  reports: CrawlerReport[];
  summary: { allowed: number; blocked: number; mixed: number };
  sitemaps: string[];
} {
  const groups = parseRobots(text);
  const reports: CrawlerReport[] = [];
  let allowed = 0;
  let blocked = 0;
  let mixed = 0;
  for (const crawler of AI_CRAWLERS) {
    const paths = PROBE_PATHS.map((p) => {
      const res = checkAccess(groups, crawler.userAgent, p);
      return { path: p, allowed: res.allowed, matchedRule: res.matchedRule };
    });
    const allOk = paths.every((p) => p.allowed);
    const allBlocked = paths.every((p) => !p.allowed);
    const overall: CrawlerReport["overall"] = allOk
      ? "allowed"
      : allBlocked
        ? "blocked"
        : "mixed";
    if (overall === "allowed") allowed++;
    else if (overall === "blocked") blocked++;
    else mixed++;
    reports.push({
      userAgent: crawler.userAgent,
      vendor: crawler.vendor,
      purpose: crawler.purpose,
      overall,
      paths,
    });
  }

  const sitemaps: string[] = [];
  for (const raw of text.split(/\r?\n/)) {
    const m = raw.replace(/#.*$/, "").trim().match(/^sitemap\s*:\s*(.*)$/i);
    if (m && m[1]) sitemaps.push(m[1].trim());
  }

  return { reports, summary: { allowed, blocked, mixed }, sitemaps };
}
