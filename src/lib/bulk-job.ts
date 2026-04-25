// Progress tracking for long-running bulk actions.
//
// Pattern: the server action creates a JobRun row via startJob(), updates it
// as it works via setProgress(), and calls finishJob() at the end. A client
// component polls getLatestJob(kind) every second and renders a progress bar.

import { prisma } from "./prisma";

// Re-export shared types/constants so existing server-side imports
// (`import { JobKind } from "@/lib/bulk-job"`) keep working.
export {
  type JobKind,
  JOB_LABELS,
  JOB_HREFS,
} from "./bulk-job-shared";

import type { JobKind } from "./bulk-job-shared";

// Server actions cap at 10 min; anything in "running" past that died
// mid-flight (Railway redeploy, crash) and shouldn't block new jobs.
const STALE_AFTER_MS = 15 * 60 * 1000;

export async function startJob(kind: JobKind, total: number) {
  // Refuse to start if another non-stale job is already running. Two
  // concurrent AI bulk jobs share the same Anthropic + Shopify rate
  // limits and reliably throttle each other; one Shopify-write job at
  // a time also keeps the catalog from getting into half-written
  // states. The cleanup cron sweeps stale rows so they don't block
  // forever.
  const cutoff = new Date(Date.now() - STALE_AFTER_MS);
  const conflicting = await prisma.jobRun.findFirst({
    where: { status: "running", startedAt: { gte: cutoff } },
    orderBy: { startedAt: "desc" },
  });
  if (conflicting) {
    throw new Error(
      `Another job is already running: ${conflicting.kind} (${conflicting.progress}/${conflicting.total}). Wait for it to finish, or dismiss it from the topbar pill if it's stuck.`,
    );
  }
  return prisma.jobRun.create({
    data: {
      kind,
      status: "running",
      startedAt: new Date(),
      total,
      progress: 0,
    },
  });
}

export async function setProgress(id: string, progress: number) {
  await prisma.jobRun.update({
    where: { id },
    data: { progress },
  });
}

// Bump the total partway through a job. Used by scans where pages/articles
// counts aren't known up front — we start with just products + collections
// and inflate as we discover the rest.
export async function setTotal(id: string, total: number) {
  await prisma.jobRun.update({
    where: { id },
    data: { total },
  });
}

export async function finishJob(
  id: string,
  opts: { ok: boolean; error?: string },
) {
  await prisma.jobRun.update({
    where: { id },
    data: {
      status: opts.ok ? "done" : "failed",
      finishedAt: new Date(),
      error: opts.error ?? null,
    },
  });
}

// Client polls this to drive the progress bar. Returns the most recent job
// of the given kind, regardless of status — the client uses finishedAt to
// decide when to stop polling.
export async function getLatestJob(kind: JobKind) {
  const row = await prisma.jobRun.findFirst({
    where: { kind },
    orderBy: { createdAt: "desc" },
  });
  if (!row) return null;
  return {
    id: row.id,
    kind: row.kind,
    status: row.status,
    progress: row.progress,
    total: row.total,
    error: row.error,
    startedAt: row.startedAt?.toISOString() ?? null,
    finishedAt: row.finishedAt?.toISOString() ?? null,
  };
}
