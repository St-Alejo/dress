-- CreateEnum
CREATE TYPE "Role" AS ENUM ('user', 'admin');

-- CreateEnum
CREATE TYPE "GarmentCategory" AS ENUM ('top', 'bottom', 'dress', 'outerwear', 'footwear', 'accessory');

-- CreateEnum
CREATE TYPE "Stretch" AS ENUM ('none', 'low', 'medium', 'high');

-- CreateEnum
CREATE TYPE "TryOnMode" AS ENUM ('similar_model', 'live_overlay', 'photorealistic');

-- CreateEnum
CREATE TYPE "GenerationStatus" AS ENUM ('idle', 'queued', 'processing', 'done', 'failed', 'fallback');

-- CreateEnum
CREATE TYPE "FitFeeling" AS ENUM ('runs_small', 'true_to_size', 'runs_large');

-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "role" "Role" NOT NULL DEFAULT 'user',
    "retrainingConsent" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Brand" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,

    CONSTRAINT "Brand_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Garment" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "brandId" TEXT NOT NULL,
    "category" "GarmentCategory" NOT NULL,
    "style" TEXT NOT NULL,
    "pattern" TEXT NOT NULL DEFAULT 'solid',
    "color" TEXT NOT NULL,
    "priceCents" INTEGER NOT NULL,
    "imageFrontKey" TEXT NOT NULL,
    "imageFlatKey" TEXT NOT NULL,
    "imageOverlayKey" TEXT NOT NULL,
    "fabricNotes" TEXT,
    "stretch" "Stretch" NOT NULL DEFAULT 'low',
    "knownLimitations" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Garment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SizeChartEntry" (
    "id" TEXT NOT NULL,
    "garmentId" TEXT NOT NULL,
    "size" TEXT NOT NULL,
    "sortOrder" INTEGER NOT NULL,
    "chestMin" DOUBLE PRECISION,
    "chestMax" DOUBLE PRECISION,
    "waistMin" DOUBLE PRECISION,
    "waistMax" DOUBLE PRECISION,
    "hipMin" DOUBLE PRECISION,
    "hipMax" DOUBLE PRECISION,
    "heightMin" DOUBLE PRECISION,
    "heightMax" DOUBLE PRECISION,

    CONSTRAINT "SizeChartEntry_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BodyModel" (
    "id" TEXT NOT NULL,
    "bodyTypeTag" TEXT NOT NULL,
    "typicalSize" TEXT NOT NULL,
    "heightMin" INTEGER NOT NULL,
    "heightMax" INTEGER NOT NULL,
    "skinTone" TEXT NOT NULL,
    "shape" JSONB NOT NULL,
    "avatarKey" TEXT NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "BodyModel_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BodyModelPreview" (
    "bodyModelId" TEXT NOT NULL,
    "garmentId" TEXT NOT NULL,
    "imageKey" TEXT NOT NULL,

    CONSTRAINT "BodyModelPreview_pkey" PRIMARY KEY ("bodyModelId","garmentId")
);

-- CreateTable
CREATE TABLE "TryOnSession" (
    "id" TEXT NOT NULL,
    "userId" TEXT,
    "ownerSid" TEXT NOT NULL,
    "garmentId" TEXT NOT NULL,
    "mode" "TryOnMode" NOT NULL,
    "bodyModelId" TEXT,
    "photoKey" TEXT,
    "photoExpiresAt" TIMESTAMP(3),
    "resultKey" TEXT,
    "resultSaved" BOOLEAN NOT NULL DEFAULT false,
    "generationStatus" "GenerationStatus" NOT NULL DEFAULT 'idle',
    "fitRecommendation" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TryOnSession_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FitReview" (
    "id" TEXT NOT NULL,
    "garmentId" TEXT NOT NULL,
    "userId" TEXT,
    "sizeBought" TEXT NOT NULL,
    "feeling" "FitFeeling" NOT NULL,
    "zones" TEXT[],
    "comment" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "FitReview_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BrandCalibration" (
    "brandId" TEXT NOT NULL,
    "category" "GarmentCategory" NOT NULL,
    "sampleSize" INTEGER NOT NULL DEFAULT 0,
    "shiftSum" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "BrandCalibration_pkey" PRIMARY KEY ("brandId","category")
);

-- CreateTable
CREATE TABLE "MetricEvent" (
    "id" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "payload" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MetricEvent_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE UNIQUE INDEX "Brand_name_key" ON "Brand"("name");

-- CreateIndex
CREATE UNIQUE INDEX "SizeChartEntry_garmentId_size_key" ON "SizeChartEntry"("garmentId", "size");

-- CreateIndex
CREATE INDEX "TryOnSession_ownerSid_idx" ON "TryOnSession"("ownerSid");

-- CreateIndex
CREATE INDEX "TryOnSession_photoExpiresAt_idx" ON "TryOnSession"("photoExpiresAt");

-- CreateIndex
CREATE INDEX "FitReview_garmentId_idx" ON "FitReview"("garmentId");

-- CreateIndex
CREATE INDEX "MetricEvent_type_createdAt_idx" ON "MetricEvent"("type", "createdAt");

-- AddForeignKey
ALTER TABLE "Garment" ADD CONSTRAINT "Garment_brandId_fkey" FOREIGN KEY ("brandId") REFERENCES "Brand"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SizeChartEntry" ADD CONSTRAINT "SizeChartEntry_garmentId_fkey" FOREIGN KEY ("garmentId") REFERENCES "Garment"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BodyModelPreview" ADD CONSTRAINT "BodyModelPreview_bodyModelId_fkey" FOREIGN KEY ("bodyModelId") REFERENCES "BodyModel"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BodyModelPreview" ADD CONSTRAINT "BodyModelPreview_garmentId_fkey" FOREIGN KEY ("garmentId") REFERENCES "Garment"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TryOnSession" ADD CONSTRAINT "TryOnSession_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TryOnSession" ADD CONSTRAINT "TryOnSession_garmentId_fkey" FOREIGN KEY ("garmentId") REFERENCES "Garment"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FitReview" ADD CONSTRAINT "FitReview_garmentId_fkey" FOREIGN KEY ("garmentId") REFERENCES "Garment"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FitReview" ADD CONSTRAINT "FitReview_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BrandCalibration" ADD CONSTRAINT "BrandCalibration_brandId_fkey" FOREIGN KEY ("brandId") REFERENCES "Brand"("id") ON DELETE CASCADE ON UPDATE CASCADE;
