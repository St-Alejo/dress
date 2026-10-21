-- Cámara v2: anclas medidas por prenda, miniatura para listados y pose de cada modelo del catálogo.
ALTER TABLE "Garment" ADD COLUMN "thumbKey" TEXT;
ALTER TABLE "Garment" ADD COLUMN "overlayAnchors" JSONB;
ALTER TABLE "BodyModel" ADD COLUMN "pose" JSONB;
