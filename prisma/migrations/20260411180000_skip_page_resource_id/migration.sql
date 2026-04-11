-- Drop old unique on pattern, allow null, add resourceId + type columns

ALTER TABLE "SkipPage" ALTER COLUMN "pattern" DROP NOT NULL;
ALTER TABLE "SkipPage" ADD COLUMN "resourceId" TEXT;
ALTER TABLE "SkipPage" ADD COLUMN "type" TEXT NOT NULL DEFAULT '*';
CREATE UNIQUE INDEX "SkipPage_resourceId_key" ON "SkipPage"("resourceId");
