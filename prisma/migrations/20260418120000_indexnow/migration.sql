ALTER TABLE "Settings" ADD COLUMN "indexNowKey" TEXT;
ALTER TABLE "Settings" ADD COLUMN "indexNowEnabled" BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE "Settings" ADD COLUMN "indexNowLastSubmittedAt" TIMESTAMP(3);
ALTER TABLE "Settings" ADD COLUMN "indexNowLastSubmittedCount" INTEGER;
ALTER TABLE "Settings" ADD COLUMN "indexNowLastError" TEXT;
