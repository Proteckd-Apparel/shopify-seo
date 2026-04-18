ALTER TABLE "Settings" ADD COLUMN "openaiKey" TEXT;
ALTER TABLE "Settings" ADD COLUMN "geminiKey" TEXT;
ALTER TABLE "Settings" ADD COLUMN "perplexityKey" TEXT;
ALTER TABLE "Settings" ADD COLUMN "xaiKey" TEXT;
ALTER TABLE "Settings" ADD COLUMN "llmOutreachEnabled" BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE "Settings" ADD COLUMN "llmOutreachProviders" TEXT;
ALTER TABLE "Settings" ADD COLUMN "llmOutreachWhatYouSell" TEXT;
ALTER TABLE "Settings" ADD COLUMN "llmOutreachDifferentiator" TEXT;

CREATE TABLE "LLMOutreachMessage" (
  "id" TEXT NOT NULL,
  "provider" TEXT NOT NULL,
  "status" TEXT NOT NULL,
  "message" TEXT NOT NULL,
  "response" TEXT,
  "error" TEXT,
  "sentAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "LLMOutreachMessage_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "LLMOutreachMessage_provider_sentAt_idx" ON "LLMOutreachMessage"("provider", "sentAt");
CREATE INDEX "LLMOutreachMessage_sentAt_idx" ON "LLMOutreachMessage"("sentAt");
