"use server";

import { getLatestJob, type JobKind } from "@/lib/bulk-job";

export async function pollJob(kind: JobKind) {
  return getLatestJob(kind);
}
