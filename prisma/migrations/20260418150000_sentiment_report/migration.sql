CREATE TABLE "SentimentReport" (
  "id" TEXT NOT NULL,
  "provider" TEXT NOT NULL,
  "status" TEXT NOT NULL,
  "sentiment" TEXT,
  "confidence" DOUBLE PRECISION,
  "summary" TEXT,
  "strengths" TEXT,
  "concerns" TEXT,
  "rawResponse" TEXT,
  "error" TEXT,
  "runAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "SentimentReport_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "SentimentReport_provider_runAt_idx" ON "SentimentReport"("provider", "runAt");
CREATE INDEX "SentimentReport_runAt_idx" ON "SentimentReport"("runAt");
