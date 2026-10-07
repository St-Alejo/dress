import 'dotenv/config';
import { PrismaPg } from '@prisma/adapter-pg';
import { ConfigService } from '@nestjs/config';
import * as argon2 from 'argon2';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { PrismaClient } from '../src/generated/prisma/client';
import { S3ObjectStorage } from '../src/common/storage';
import { fitIntentFor } from '../src/modules/catalog/domain/garment-grading';
import type { GarmentArt } from '../src/modules/catalog/infrastructure/illustration/garment-art';
import { sizeRows } from '../src/modules/catalog/infrastructure/size-rows';
import { IllustrationPublisher } from '../src/modules/catalog/infrastructure/illustration/illustration-publisher';
import { BODIES, BRANDS, GARMENTS, type SeedGarment } from '../src/seed/seed-data';

const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL! }) });
const storage = new S3ObjectStorage(new ConfigService(process.env));
const publisher = new IllustrationPublisher(storage);

/** Fotos reales con licencia libre (créditos en seed/photos/*/credits.json). Si falta una, queda la ilustración. */
const PHOTOS_DIR = join(__dirname, '../../../seed/photos');

async function publishPhoto(kind: 'garments' | 'bodies', key: string): Promise<string | undefined> {
  const file = join(PHOTOS_DIR, kind, `${key}.jpg`);
  if (!existsSync(file)) return undefined;
  const objectKey = `catalog/${kind}/${key}/photo.jpg`;
  await storage.put(objectKey, readFileSync(file), 'image/jpeg');
  return objectKey;
}

const artOf = (g: SeedGarment): GarmentArt => ({ id: g.key, style: g.style, color: g.color, pattern: g.pattern });

async function main() {
  await storage.onModuleInit();

  // Idempotente: se limpia el catálogo (las sesiones dependen de prendas, se limpian también).
  await prisma.tryOnSession.deleteMany();
  await prisma.fitReview.deleteMany();
  await prisma.bodyModelPreview.deleteMany();
  await prisma.sizeChartEntry.deleteMany();
  await prisma.garment.deleteMany();
  await prisma.bodyModel.deleteMany();
  await prisma.brandCalibration.deleteMany();
  await prisma.brand.deleteMany();
  await prisma.metricEvent.deleteMany();

  const brandIds: Record<string, string> = {};
  for (const b of BRANDS) {
    const brand = await prisma.brand.create({ data: { name: b.name } });
    brandIds[b.key] = brand.id;
    for (const c of b.calibration ?? []) {
      await prisma.brandCalibration.create({ data: { brandId: brand.id, ...c } });
    }
  }

  const garmentIds: Record<string, string> = {};
  for (const g of GARMENTS) {
    const keys = await publisher.publishGarment(g.key, g.category, artOf(g));
    const created = await prisma.garment.create({
      data: {
        name: g.name,
        brandId: brandIds[g.brand],
        category: g.category,
        style: g.style,
        pattern: g.pattern,
        color: g.color,
        priceCents: g.priceCents,
        imageFrontKey: keys.front,
        imageFlatKey: keys.flat,
        imageOverlayKey: keys.overlay,
        photoKey: await publishPhoto('garments', g.key),
        fabricNotes: g.fabricNotes,
        stretch: g.stretch,
        knownLimitations: g.knownLimitations ?? [],
        fitIntent: fitIntentFor(g.style) ?? undefined,
        sizeChart: { create: sizeRows(g.style, g.sizeChart) },
      },
    });
    garmentIds[g.key] = created.id;
  }

  for (const [i, b] of BODIES.entries()) {
    const spec = { shape: b.shape, skinTone: b.skinTone, hair: b.hair, hairColor: b.hairColor };
    const body = await prisma.bodyModel.create({
      data: {
        bodyTypeTag: b.bodyTypeTag,
        typicalSize: b.typicalSize,
        heightMin: b.heightRange[0],
        heightMax: b.heightRange[1],
        skinTone: b.skinTone,
        shape: { ...b.shape, hair: b.hair, hairColor: b.hairColor },
        avatarKey: await publisher.publishAvatar(b.key, spec),
        photoKey: await publishPhoto('bodies', b.key),
        sortOrder: i,
      },
    });
    for (const g of GARMENTS) {
      const imageKey = await publisher.publishPreview(b.key, g.key, spec, g.category, artOf(g));
      await prisma.bodyModelPreview.create({ data: { bodyModelId: body.id, garmentId: garmentIds[g.key], imageKey } });
    }
  }

  const adminEmail = process.env.ADMIN_EMAIL ?? 'admin@vestirse.local';
  await prisma.user.upsert({
    where: { email: adminEmail },
    update: {},
    create: { email: adminEmail, passwordHash: await argon2.hash(process.env.ADMIN_PASSWORD ?? 'admin1234'), role: 'admin' },
  });

  console.log(`seed: ${BRANDS.length} marcas, ${GARMENTS.length} prendas, ${BODIES.length} cuerpos, admin ${adminEmail}`);
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
