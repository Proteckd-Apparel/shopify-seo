ALTER TABLE "Settings" ADD COLUMN "replicateToken" TEXT;

CREATE TABLE "ImageBackup" (
    "id" TEXT NOT NULL,
    "resourceId" TEXT NOT NULL,
    "originalUrl" TEXT NOT NULL,
    "filename" TEXT NOT NULL,
    "contentType" TEXT NOT NULL,
    "bytes" BYTEA NOT NULL,
    "width" INTEGER,
    "height" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ImageBackup_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "ImageBackup_resourceId_idx" ON "ImageBackup"("resourceId");
CREATE INDEX "ImageBackup_createdAt_idx" ON "ImageBackup"("createdAt");
