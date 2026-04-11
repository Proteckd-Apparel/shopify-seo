CREATE TABLE "NotFound" (
    "id" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "referrer" TEXT,
    "userAgent" TEXT,
    "count" INTEGER NOT NULL DEFAULT 1,
    "firstSeen" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastSeen" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "resolved" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "NotFound_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "NotFound_url_key" ON "NotFound"("url");
CREATE INDEX "NotFound_lastSeen_idx" ON "NotFound"("lastSeen");
CREATE INDEX "NotFound_resolved_idx" ON "NotFound"("resolved");
