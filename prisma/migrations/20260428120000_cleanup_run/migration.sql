-- CreateTable
CREATE TABLE "CleanupRun" (
    "id" TEXT NOT NULL,
    "ranAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "durationMs" INTEGER NOT NULL,
    "imageBackups" INTEGER NOT NULL,
    "scanRuns" INTEGER NOT NULL,
    "notFoundResolved" INTEGER NOT NULL,
    "notFoundStale" INTEGER NOT NULL,
    "brokenLinks" INTEGER NOT NULL,
    "jobRuns" INTEGER NOT NULL,
    "staleJobsFailed" INTEGER NOT NULL,

    CONSTRAINT "CleanupRun_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "CleanupRun_ranAt_idx" ON "CleanupRun"("ranAt");
