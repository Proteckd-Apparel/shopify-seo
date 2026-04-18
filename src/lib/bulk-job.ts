// Progress tracking for long-running bulk actions.
//
// Pattern: the server action creates a JobRun row via startJob(), updates it
// as it works via setProgress(), and calls finishJob() at the end. A client
// component polls getLatestJob(kind) every second and renders a progress bar.

import { prisma } from "./prisma";

export type JobKind =
  | "json_ld_products"
  | "json_ld_collections"
  | "json_ld_articles"
  | "json_ld_sitewide"
  | "merchant_copy"
  | "scan";

export async function startJob(kind: JobKind, total: number) {
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
