-- Track when an Image row was last touched so bulk regenerate-alt-text
-- jobs can orderBy: { updatedAt: asc } and progress across repeat clicks
-- (instead of reprocessing the same first 1000 every time the Railway
-- 10-min timeout cuts the run short).
ALTER TABLE "Image" ADD COLUMN "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;
CREATE INDEX "Image_updatedAt_idx" ON "Image"("updatedAt");
