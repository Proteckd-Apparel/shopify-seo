-- Track which images have been compressed so the Optimize All compress
-- phase can skip already-done images (avoids generational quality loss +
-- the URL churn of re-uploading already-optimized files). Indexed for
-- the "where compressedAt is null" filter in the loop.
ALTER TABLE "Image" ADD COLUMN "compressedAt" TIMESTAMP(3);
CREATE INDEX "Image_compressedAt_idx" ON "Image"("compressedAt");
