-- Support the new cleanup queries: prune-by-startedAt, dashboard filters,
-- and JobRun tail-prune by finishedAt.

CREATE INDEX IF NOT EXISTS "ScanRun_startedAt_idx" ON "ScanRun"("startedAt");
CREATE INDEX IF NOT EXISTS "ScanRun_status_startedAt_idx" ON "ScanRun"("status", "startedAt");
CREATE INDEX IF NOT EXISTS "NotFound_resolved_lastSeen_idx" ON "NotFound"("resolved", "lastSeen");
CREATE INDEX IF NOT EXISTS "JobRun_status_finishedAt_idx" ON "JobRun"("status", "finishedAt");
