"use server";

import { prisma } from "@/lib/prisma";
import { analyzeRobots, fetchRobots } from "@/lib/robots-analyze";

export type AnalysisResult = {
  ok: boolean;
  fetchedFrom?: string;
  robotsText?: string;
  reports?: ReturnType<typeof analyzeRobots>["reports"];
  summary?: ReturnType<typeof analyzeRobots>["summary"];
  sitemaps?: string[];
  error?: string;
};

export async function runRobotsAnalysis(): Promise<AnalysisResult> {
  const s = await prisma.settings.findUnique({ where: { id: 1 } });
  const publicDomain =
    s?.storefrontDomain?.trim() || s?.shopDomain || null;
  if (!publicDomain) {
    return { ok: false, error: "Set a storefront or shop domain in Settings first." };
  }
  const origin = `https://${publicDomain.replace(/^https?:\/\//, "")}`;
  try {
    const robotsText = await fetchRobots(origin);
    const { reports, summary, sitemaps } = analyzeRobots(robotsText);
    return {
      ok: true,
      fetchedFrom: `${origin}/robots.txt`,
      robotsText,
      reports,
      summary,
      sitemaps,
    };
  } catch (e) {
    return {
      ok: false,
      error: e instanceof Error ? e.message : "fetch failed",
    };
  }
}
