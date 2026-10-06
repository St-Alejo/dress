-- AlterTable
ALTER TABLE "Garment" ADD COLUMN     "fitIntent" JSONB,
ADD COLUMN     "photoKey" TEXT;

-- AlterTable
ALTER TABLE "SizeChartEntry" ADD COLUMN     "gChest" DOUBLE PRECISION,
ADD COLUMN     "gHip" DOUBLE PRECISION,
ADD COLUMN     "gInseam" DOUBLE PRECISION,
ADD COLUMN     "gLength" DOUBLE PRECISION,
ADD COLUMN     "gSleeve" DOUBLE PRECISION,
ADD COLUMN     "gWaist" DOUBLE PRECISION;

-- AlterTable
ALTER TABLE "TryOnSession" ADD COLUMN     "outfit" JSONB;

-- CreateTable
CREATE TABLE "AiSettings" (
    "id" TEXT NOT NULL DEFAULT 'default',
    "provider" TEXT NOT NULL DEFAULT 'mock',
    "model" TEXT,
    "encryptedKey" TEXT,
    "keyLast4" TEXT,
    "lastTestOk" BOOLEAN,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AiSettings_pkey" PRIMARY KEY ("id")
);
