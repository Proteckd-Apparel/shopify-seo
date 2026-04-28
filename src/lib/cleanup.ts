// Periodic cleanup jobs. Called from the /api/cron/cleanup route so Railway
// cron (or an external pinger) can drive them. Each helper is idempotent and
// safe to run as often as every hour.

import { prisma } from "./prisma";
import { pruneOldBackups } from "./image-backup";
import { pruneOldScanRuns } from "./scanner";

// NotFound rows are written per unique 404 URL and bumped on repeat hits. On
// a busy store with 404-spamming bots, this table can accumulate tens of
// thousands of stale entries with no user-facing value. Policy:
//   - Drop resolved rows older than 14 days (already fixed, keep a window).
//   - Drop unresolved rows older than 180 days AND count < 5 (likely noise).
// Override NOTFOUND_TTL_DAYS / NOTFOUND_RESOLVED_TTL_DAYS to tune.

const NOTFOUND_TTL_DAYS = Number(process.env.NOTFOUND_TTL_DAYS || 180);
const NOTFOUND_RESOLVED_TTL_DAYS = Number(
  process.env.NOTFOUND_RESOLVED_TTL_DAYS || 14,
);

export async function pruneOldNotFound(): Promise<{
  resolved: number;
  stale: number;
}> {
  const now = Date.now();
  const resolvedCutoff = new Date(
    now - NOTFOUND_RESOLVED_TTL_DAYS * 24 * 60 * 60 * 1000,
  );
  const staleCutoff = new Date(now - NOTFOUND_TTL_DAYS * 24 * 60 * 60 * 1000);

  const resolved = await prisma.notFound.deleteMany({
    where: { resolved: true, lastSeen: { lt: resolvedCutoff } },
  });
  const stale = await prisma.notFound.deleteMany({
    where: { resolved: false, lastSeen: { lt: staleCutoff }, count: { lt: 5 } },
  });

  return { resolved: resolved.count, stale: stale.count };
}

// BrokenLink rows are re-generated on every scan, so older-than-30-days rows
// are almost always stale captures from deleted products. Prune to keep the
// broken-links UI responsive.
const BROKEN_LINK_TTL_DAYS = Number(process.env.BROKEN_LINK_TTL_DAYS || 30);

export async function pruneOldBrokenLinks(): Promise<number> {
  const cutoff = new Date(
    Date.now() - BROKEN_LINK_TTL_DAYS * 24 * 60 * 60 * 1000,
  );
  const result = await prisma.brokenLink.deleteMany({
    where: { foundAt: { lt: cutoff } },
  });
  return result.count;
}

// JobRun is ephemeral progress tracking. Anything finished over 7 days ago
// is noise. Queued/running rows are never pruned.
const JOB_RUN_TTL_DAYS = Number(process.env.JOB_RUN_TTL_DAYS || 7);

export async function pruneOldJobRuns(): Promise<number> {
  const cutoff = new Date(
    Date.now() - JOB_RUN_TTL_DAYS * 24 * 60 * 60 * 1000,
  );
  const result = await prisma.jobRun.deleteMany({
    where: {
      status: { in: ["done", "failed"] },
      finishedAt: { lt: cutoff },
    },
  });
  return result.count;
}

// Server actions cap at 10 min. A row still in "running" state past
// this window died mid-execution (Railway redeploy, crash, timeout)
// and will never call finishJob — sweep them to "failed" so they don't
// haunt the topbar pill or appear as ghosts in job history.
const STALE_RUNNING_MS = 30 * 60 * 1000;

export async function failStaleRunningJobs(): Promise<number> {
  const cutoff = new Date(Date.now() - STALE_RUNNING_MS);
  const result = await prisma.jobRun.updateMany({
    where: { status: "running", startedAt: { lt: cutoff } },
    data: {
      status: "failed",
      finishedAt: new Date(),
      error: "Abandoned (no progress for >30 min)",
    },
  });
  return result.count;
}

export type CleanupReport = {
  imageBackups: number;
  scanRuns: number;
  notFoundResolved: number;
  notFoundStale: number;
  brokenLinks: number;
  jobRuns: number;
  staleJobsFailed: number;
  durationMs: number;
};

// Self-prune CleanupRun history so this table doesn't grow unbounded.
// 30 days is plenty to debug "did the cron stop firing 2 weeks ago?".
const CLEANUP_RUN_TTL_DAYS = Number(process.env.CLEANUP_RUN_TTL_DAYS || 30);

export async function runAllCleanups(): Promise<CleanupReport> {
  const start = Date.now();
  const [imageBackups, scanRuns, notFound, brokenLinks, jobRuns, staleJobsFailed] =
    await Promise.all([
      pruneOldBackups(),
      pruneOldScanRuns(),
      pruneOldNotFound(),
      pruneOldBrokenLinks(),
      pruneOldJobRuns(),
      failStaleRunningJobs(),
    ]);
  const report: CleanupReport = {
    imageBackups,
    scanRuns,
    notFoundResolved: notFound.resolved,
    notFoundStale: notFound.stale,
    brokenLinks,
    jobRuns,
    staleJobsFailed,
    durationMs: Date.now() - start,
  };

  const cleanupCutoff = new Date(
    Date.now() - CLEANUP_RUN_TTL_DAYS * 24 * 60 * 60 * 1000,
  );
  await Promise.all([
    prisma.cleanupRun.create({
      data: {
        durationMs: report.durationMs,
        imageBackups: report.imageBackups,
        scanRuns: report.scanRuns,
        notFoundResolved: report.notFoundResolved,
        notFoundStale: report.notFoundStale,
        brokenLinks: report.brokenLinks,
        jobRuns: report.jobRuns,
        staleJobsFailed: report.staleJobsFailed,
      },
    }),
    prisma.cleanupRun.deleteMany({ where: { ranAt: { lt: cleanupCutoff } } }),
  ]);

  return report;
}
