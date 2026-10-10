-- La tienda deja de usar ilustraciones: cada prenda y cada modelo tiene foto real.
-- Las vistas previas ilustradas (SVG) se descartan; las nuevas son pruebas reales generadas por IA.
DELETE FROM "BodyModelPreview";

ALTER TABLE "Garment" DROP COLUMN "imageFrontKey",
DROP COLUMN "imageFlatKey",
DROP COLUMN "imageOverlayKey",
DROP COLUMN "pattern",
ADD COLUMN "photoType" TEXT NOT NULL DEFAULT 'flat-lay',
ADD COLUMN "cutoutKey" TEXT;

-- Falla a propósito si queda alguna fila sin foto: antes de migrar hay que cargarla o ejecutar el seed.
ALTER TABLE "Garment" ALTER COLUMN "photoKey" SET NOT NULL;

ALTER TABLE "BodyModel" DROP COLUMN "avatarKey";
ALTER TABLE "BodyModel" ALTER COLUMN "photoKey" SET NOT NULL;
