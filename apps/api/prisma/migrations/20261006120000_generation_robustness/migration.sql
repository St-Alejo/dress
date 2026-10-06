-- AlterTable
ALTER TABLE "TryOnSession" ADD COLUMN     "failureReason" TEXT,
ADD COLUMN     "statusChangedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

-- CreateIndex
CREATE INDEX "TryOnSession_generationStatus_statusChangedAt_idx" ON "TryOnSession"("generationStatus", "statusChangedAt");
