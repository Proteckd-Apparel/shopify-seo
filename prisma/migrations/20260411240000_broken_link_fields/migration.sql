ALTER TABLE "BrokenLink" ADD COLUMN "kind" TEXT NOT NULL DEFAULT 'link';
ALTER TABLE "BrokenLink" ADD COLUMN "sourceType" TEXT;
ALTER TABLE "BrokenLink" ADD COLUMN "sourceResourceId" TEXT;
ALTER TABLE "BrokenLink" ADD COLUMN "sourceTitle" TEXT;
CREATE INDEX "BrokenLink_sourceType_idx" ON "BrokenLink"("sourceType");
