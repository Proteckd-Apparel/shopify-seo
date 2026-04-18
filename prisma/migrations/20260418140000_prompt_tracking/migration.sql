ALTER TABLE "Settings" ADD COLUMN "promptTrackingEnabled" BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE "Settings" ADD COLUMN "promptTrackingProviders" TEXT;
ALTER TABLE "Settings" ADD COLUMN "promptBrandKeywords" TEXT;

CREATE TABLE "TrackedPrompt" (
  "id" TEXT NOT NULL,
  "text" TEXT NOT NULL,
  "enabled" BOOLEAN NOT NULL DEFAULT true,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "TrackedPrompt_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "TrackedPrompt_enabled_idx" ON "TrackedPrompt"("enabled");

CREATE TABLE "PromptResult" (
  "id" TEXT NOT NULL,
  "promptId" TEXT NOT NULL,
  "provider" TEXT NOT NULL,
  "status" TEXT NOT NULL,
  "response" TEXT,
  "brandMentioned" BOOLEAN NOT NULL DEFAULT false,
  "matchedKeyword" TEXT,
  "error" TEXT,
  "runAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "PromptResult_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "PromptResult_promptId_runAt_idx" ON "PromptResult"("promptId", "runAt");
CREATE INDEX "PromptResult_runAt_idx" ON "PromptResult"("runAt");

ALTER TABLE "PromptResult" ADD CONSTRAINT "PromptResult_promptId_fkey" FOREIGN KEY ("promptId") REFERENCES "TrackedPrompt"("id") ON DELETE CASCADE ON UPDATE CASCADE;
