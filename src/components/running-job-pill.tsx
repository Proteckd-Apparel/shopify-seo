"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { JOB_HREFS, JOB_LABELS, type JobKind } from "@/lib/bulk-job-shared";

type Snapshot = {
  id: string;
  kind: JobKind;
  status: string;
  progress: number;
  total: number;
};

// Topbar pill that surfaces whichever bulk job is currently running, on
// every page. Lets the user start an Optimize action and then navigate
// freely — the pill stays visible with live progress, and clicking it
// jumps back to the page that owns the job.
export function RunningJobPill() {
  const [snap, setSnap] = useState<Snapshot | null>(null);

  useEffect(() => {
    let cancelled = false;
    async function tick() {
      try {
        const res = await fetch("/api/bulk-job", { cache: "no-store" });
        if (!res.ok) return;
        const row = (await res.json()) as Snapshot | null;
        if (cancelled) return;
        setSnap(row);
      } catch {}
    }
    tick();
    const iv = setInterval(tick, 2000);
    return () => {
      cancelled = true;
      clearInterval(iv);
    };
  }, []);

  if (!snap || snap.status !== "running") return null;
  const pct = snap.total > 0 ? Math.round((snap.progress / snap.total) * 100) : 0;
  const label = JOB_LABELS[snap.kind] ?? snap.kind;
  const href = JOB_HREFS[snap.kind] ?? "/";

  return (
    <Link
      href={href}
      className="inline-flex items-center gap-2 px-3 py-1.5 rounded-md border border-indigo-200 bg-indigo-50 text-indigo-700 hover:bg-indigo-100 text-xs font-medium"
      title={`${label}: ${snap.progress}/${snap.total} — click to view`}
    >
      <span className="relative flex h-2 w-2">
        <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-indigo-400 opacity-75" />
        <span className="relative inline-flex h-2 w-2 rounded-full bg-indigo-500" />
      </span>
      <span>
        {label} · {snap.progress}/{snap.total} ({pct}%)
      </span>
    </Link>
  );
}
