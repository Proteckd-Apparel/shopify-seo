"use server";

// Robots.txt customization. Shopify generates the file from a Liquid
// template (templates/robots.txt.liquid). We let users add custom rules in
// the UI, store them in Settings as JSON, render a Liquid template that
// preserves Shopify's defaults via {{- group.rules -}} and adds our rules
// inside each group, then write it via themeFilesUpsert.

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import {
  getMainTheme,
  readThemeFiles,
  writeThemeFile,
} from "@/lib/shopify-theme";

export type RuleType = "disallow" | "allow" | "sitemap" | "crawl-delay";

export type RobotsRule = {
  id: string;
  ua: string; // user agent: "*" or specific bot
  type: RuleType;
  value: string;
};

const TEMPLATE_PATH = "templates/robots.txt.liquid";

function newId(): string {
  return Math.random().toString(36).slice(2, 10);
}

async function loadRules(): Promise<RobotsRule[]> {
  const s = await prisma.settings.findUnique({ where: { id: 1 } });
  if (!s?.robotsRules) return [];
  try {
    const parsed = JSON.parse(s.robotsRules);
    if (Array.isArray(parsed)) return parsed as RobotsRule[];
  } catch {}
  return [];
}

export async function getRobotsState(): Promise<{
  rules: RobotsRule[];
  boostImages: boolean;
  liveContent: string | null;
  domain: string | null;
}> {
  const s = await prisma.settings.findUnique({ where: { id: 1 } });
  const rules = await loadRules();
  let liveContent: string | null = null;
  if (s?.shopDomain) {
    try {
      const r = await fetch(`https://${s.shopDomain}/robots.txt`, {
        cache: "no-store",
      });
      liveContent = await r.text();
    } catch {}
  }
  return {
    rules,
    boostImages: s?.robotsBoostImages ?? false,
    liveContent,
    domain: s?.shopDomain ?? null,
  };
}

async function saveRules(rules: RobotsRule[]) {
  await prisma.settings.upsert({
    where: { id: 1 },
    create: { id: 1, robotsRules: JSON.stringify(rules) },
    update: { robotsRules: JSON.stringify(rules) },
  });
}

export async function addRule(args: {
  ua: string;
  type: RuleType;
  value: string;
}): Promise<{ ok: boolean; message: string; rules?: RobotsRule[] }> {
  try {
    const rules = await loadRules();
    rules.push({
      id: newId(),
      ua: args.ua.trim() || "*",
      type: args.type,
      value: args.value.trim(),
    });
    await saveRules(rules);
    revalidatePath("/tools/robots-txt");
    return { ok: true, message: "Added", rules };
  } catch (e) {
    return { ok: false, message: e instanceof Error ? e.message : "Failed" };
  }
}

export async function deleteRule(
  id: string,
): Promise<{ ok: boolean; message: string; rules?: RobotsRule[] }> {
  try {
    const rules = (await loadRules()).filter((r) => r.id !== id);
    await saveRules(rules);
    revalidatePath("/tools/robots-txt");
    return { ok: true, message: "Deleted", rules };
  } catch (e) {
    return { ok: false, message: e instanceof Error ? e.message : "Failed" };
  }
}

export async function setBoostImages(
  enabled: boolean,
): Promise<{ ok: boolean; message: string }> {
  try {
    await prisma.settings.upsert({
      where: { id: 1 },
      create: { id: 1, robotsBoostImages: enabled },
      update: { robotsBoostImages: enabled },
    });
    revalidatePath("/tools/robots-txt");
    return { ok: true, message: enabled ? "Enabled" : "Disabled" };
  } catch (e) {
    return { ok: false, message: e instanceof Error ? e.message : "Failed" };
  }
}

// Build the robots.txt.liquid that Shopify will render. We preserve Shopify's
// default rules via the {%- for group in robots.default_groups -%} loop and
// inject our custom rules into each matching group.
function buildLiquid(
  rules: RobotsRule[],
  boostImages: boolean,
  storefrontDomain: string,
): string {
  // Group rules by user agent
  const byUa = new Map<string, RobotsRule[]>();
  for (const r of rules) {
    const list = byUa.get(r.ua) ?? [];
    list.push(r);
    byUa.set(r.ua, list);
  }

  const boostBlock = boostImages
    ? `
# Boost Google Images
User-agent: Googlebot-Image
Allow: /
Allow: /products/*.jpg$
Allow: /products/*.jpeg$
Allow: /products/*.png$
Allow: /products/*.webp$
Allow: /products/*.gif$
`
    : "";

  // Build a Liquid expression that injects custom rules into the right group.
  // For each group from Shopify defaults, we render its existing rules, then
  // append any custom rules whose ua is "*" or matches group.user_agent.value.
  const customRulesByUa = JSON.stringify(
    Object.fromEntries(byUa.entries()),
  );

  // Sitemap handling: we deliberately do NOT render {{- group.sitemap -}}
  // inside the per-group loop. That returns ALL sitemap registrations
  // (Shopify default + every installed app's app-sitemap registration) and
  // renders them once per group, which both duplicates them and resurrects
  // dead entries from uninstalled apps that Shopify hasn't garbage-collected.
  // We emit only Shopify's permanent /sitemap.xml + the user's custom
  // Sitemap rules, exactly once, after the loop.
  const customSitemaps = rules
    .filter((r) => r.type === "sitemap")
    .map((r) => `Sitemap: ${escapeLiquid(r.value)}`)
    .join("\n");

  // Suppress no-unused-vars on the helper variables we no longer reference.
  void customRulesByUa;

  return `# robots.txt generated by Shopify SEO
{%- for group in robots.default_groups -%}
  {{- group.user_agent -}}
  {%- for rule in group.rules -%}
    {{ rule }}
  {%- endfor -%}

  {%- assign ua = group.user_agent.value -%}
  {%- comment -%} Custom rules for this UA {%- endcomment -%}
${[...byUa.entries()]
  .map(
    ([ua, list]) => `  {%- if ua == ${JSON.stringify(ua)} or ${JSON.stringify(ua)} == '*' -%}
${list
  .filter((r) => r.type !== "sitemap")
  .map(
    (r) =>
      `    ${capitalize(r.type)}: ${escapeLiquid(r.value)}`,
  )
  .join("\n")}
  {%- endif -%}`,
  )
  .join("\n")}
{%- endfor -%}

Sitemap: https://${storefrontDomain}/sitemap.xml
${customSitemaps}
${boostBlock}`;
}

function capitalize(s: string): string {
  if (s === "crawl-delay") return "Crawl-delay";
  return s.charAt(0).toUpperCase() + s.slice(1);
}

function escapeLiquid(s: string): string {
  // Liquid doesn't interpret bare strings, but {{ }} or {% %} would. Strip them.
  return s.replace(/\{\{/g, "").replace(/\}\}/g, "").replace(/\{%/g, "").replace(/%\}/g, "");
}

export async function applyToTheme(): Promise<{
  ok: boolean;
  message: string;
}> {
  try {
    const theme = await getMainTheme();
    if (!theme) return { ok: false, message: "No main theme found" };
    const rules = await loadRules();
    const s = await prisma.settings.findUnique({ where: { id: 1 } });
    const domain = (s?.storefrontDomain || s?.shopDomain || "").trim();
    if (!domain) {
      return {
        ok: false,
        message: "Set storefrontDomain or shopDomain in Settings first",
      };
    }
    const liquid = buildLiquid(rules, s?.robotsBoostImages ?? false, domain);
    await writeThemeFile(theme.id, TEMPLATE_PATH, liquid);
    revalidatePath("/tools/robots-txt");
    return { ok: true, message: "robots.txt.liquid written to theme" };
  } catch (e) {
    return { ok: false, message: e instanceof Error ? e.message : "Failed" };
  }
}

export async function readThemeRobotsFile(): Promise<{
  ok: boolean;
  content: string | null;
  message?: string;
}> {
  try {
    const theme = await getMainTheme();
    if (!theme) return { ok: false, content: null, message: "No main theme" };
    const files = await readThemeFiles(theme.id, [TEMPLATE_PATH]);
    return { ok: true, content: files[0]?.content ?? null };
  } catch (e) {
    return {
      ok: false,
      content: null,
      message: e instanceof Error ? e.message : "Failed",
    };
  }
}

export async function restoreDefault(): Promise<{
  ok: boolean;
  message: string;
}> {
  try {
    const theme = await getMainTheme();
    if (!theme) return { ok: false, message: "No main theme" };
    const s = await prisma.settings.findUnique({ where: { id: 1 } });
    const domain = (s?.storefrontDomain || s?.shopDomain || "").trim();
    if (!domain) {
      return {
        ok: false,
        message: "Set storefrontDomain or shopDomain in Settings first",
      };
    }
    // Restore = Shopify defaults + Shopify's sitemap once.
    // We avoid {{- group.sitemap -}} so we don't resurrect stale
    // app-sitemap registrations from previously-installed apps.
    const liquid = `# robots.txt
{%- for group in robots.default_groups -%}
  {{- group.user_agent -}}
  {%- for rule in group.rules -%}
    {{ rule }}
  {%- endfor -%}
{%- endfor -%}

Sitemap: https://${domain}/sitemap.xml
`;
    await writeThemeFile(theme.id, TEMPLATE_PATH, liquid);
    await prisma.settings.upsert({
      where: { id: 1 },
      create: { id: 1, robotsRules: "[]", robotsBoostImages: false },
      update: { robotsRules: "[]", robotsBoostImages: false },
    });
    revalidatePath("/tools/robots-txt");
    return { ok: true, message: "Restored Shopify defaults" };
  } catch (e) {
    return { ok: false, message: e instanceof Error ? e.message : "Failed" };
  }
}

// Quick robots.txt URL test — fetch live robots.txt and check whether the
// given URL is allowed for the given user agent. Implements basic
// longest-match Allow/Disallow precedence.
export async function testUrl(args: {
  url: string;
  ua: string;
}): Promise<{ ok: boolean; allowed?: boolean; message: string }> {
  try {
    const s = await prisma.settings.findUnique({ where: { id: 1 } });
    if (!s?.shopDomain) return { ok: false, message: "Set shop domain first" };
    const res = await fetch(`https://${s.shopDomain}/robots.txt`, {
      cache: "no-store",
    });
    if (!res.ok) return { ok: false, message: `Fetch failed: ${res.status}` };
    const txt = await res.text();
    const path = (() => {
      try {
        return new URL(args.url).pathname;
      } catch {
        return args.url.startsWith("/") ? args.url : "/" + args.url;
      }
    })();

    // Walk the file, find the most relevant block.
    const lines = txt.split(/\r?\n/);
    type Block = { uas: string[]; rules: { type: "allow" | "disallow"; pattern: string }[] };
    const blocks: Block[] = [];
    let cur: Block | null = null;
    for (const raw of lines) {
      const line = raw.replace(/#.*$/, "").trim();
      if (!line) continue;
      const [k, ...rest] = line.split(":");
      const v = rest.join(":").trim();
      const key = k.toLowerCase().trim();
      if (key === "user-agent") {
        if (!cur || cur.rules.length > 0) {
          cur = { uas: [v.toLowerCase()], rules: [] };
          blocks.push(cur);
        } else {
          cur.uas.push(v.toLowerCase());
        }
      } else if (cur && (key === "allow" || key === "disallow")) {
        cur.rules.push({ type: key as "allow" | "disallow", pattern: v });
      }
    }

    const uaLower = args.ua.toLowerCase();
    // Pick the block with most specific UA match
    const matching = blocks.find((b) =>
      b.uas.some((u) => u !== "*" && uaLower.includes(u)),
    );
    const fallback = blocks.find((b) => b.uas.includes("*"));
    const block = matching ?? fallback;
    if (!block) return { ok: true, allowed: true, message: "No matching block — allowed by default" };

    // Longest pattern wins
    let best: { type: "allow" | "disallow"; len: number } | null = null;
    for (const r of block.rules) {
      if (!r.pattern) continue;
      if (matchPattern(path, r.pattern)) {
        if (!best || r.pattern.length > best.len) {
          best = { type: r.type, len: r.pattern.length };
        }
      }
    }
    const allowed = !best || best.type === "allow";
    return {
      ok: true,
      allowed,
      message: allowed
        ? `Allowed (matched ${best ? `${best.type}: pattern length ${best.len}` : "no rule"})`
        : `Disallowed by ${best!.type} rule (pattern length ${best!.len})`,
    };
  } catch (e) {
    return { ok: false, message: e instanceof Error ? e.message : "Failed" };
  }
}

function matchPattern(path: string, pattern: string): boolean {
  // Convert robots.txt glob to regex: * → .*, $ at end means end-of-string.
  const anchored = pattern.endsWith("$");
  const p = anchored ? pattern.slice(0, -1) : pattern;
  const re = new RegExp(
    "^" +
      p
        .replace(/[.+?^${}()|[\]\\]/g, "\\$&")
        .replace(/\*/g, ".*") +
      (anchored ? "$" : ""),
  );
  return re.test(path);
}
