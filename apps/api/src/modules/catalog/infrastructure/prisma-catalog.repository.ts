import { Injectable } from '@nestjs/common';
import type { Brand, FitIntent, GarmentDims, GarmentItem, LetterSize, SimilarBodyModel, SizeChartEntry } from '@vestirse/shared-types';
import { mediaUrl } from '../../../common/mappers';
import { PrismaService } from '../../../common/prisma.service';
import type { Prisma } from '../../../generated/prisma/client';
import { CatalogRepository, type GarmentFilter } from '../application/catalog.repository';
import { VIEW_H, VIEW_W } from './illustration/body-geometry';
import { overlayAnchors } from './illustration/renderer';

const garmentInclude = {
  brand: true,
  sizeChart: { orderBy: { sortOrder: 'asc' } },
} satisfies Prisma.GarmentInclude;
type GarmentRow = Prisma.GarmentGetPayload<{ include: typeof garmentInclude }>;

const range = (min: number | null, max: number | null): [number, number] | undefined =>
  min !== null && max !== null ? [min, max] : undefined;

export function toGarmentItem(row: GarmentRow): GarmentItem {
  return {
    id: row.id,
    name: row.name,
    brandId: row.brandId,
    brandName: row.brand.name,
    category: row.category,
    color: row.color,
    priceCents: row.priceCents,
    images: {
      front: mediaUrl(row.imageFrontKey),
      flat: mediaUrl(row.imageFlatKey),
      overlay: mediaUrl(row.imageOverlayKey),
      ...(row.photoKey ? { photo: mediaUrl(row.photoKey) } : {}),
    },
    fitIntent: (row.fitIntent as FitIntent | null) ?? undefined,
    overlayAnchors: overlayAnchors(),
    overlaySize: [VIEW_W, VIEW_H],
    fabricNotes: row.fabricNotes ?? undefined,
    stretch: row.stretch,
    knownLimitations: row.knownLimitations,
    sizeChart: row.sizeChart.map((e): SizeChartEntry => {
      const entry: SizeChartEntry = { size: e.size };
      const chest = range(e.chestMin, e.chestMax);
      const waist = range(e.waistMin, e.waistMax);
      const hip = range(e.hipMin, e.hipMax);
      const height = range(e.heightMin, e.heightMax);
      if (chest) entry.chestCm = chest;
      if (waist) entry.waistCm = waist;
      if (hip) entry.hipCm = hip;
      if (height) entry.heightCm = height;
      const garment: GarmentDims = {};
      if (e.gChest !== null) garment.chestCm = e.gChest;
      if (e.gWaist !== null) garment.waistCm = e.gWaist;
      if (e.gHip !== null) garment.hipCm = e.gHip;
      if (e.gLength !== null) garment.lengthCm = e.gLength;
      if (e.gSleeve !== null) garment.sleeveCm = e.gSleeve;
      if (e.gInseam !== null) garment.inseamCm = e.gInseam;
      if (Object.keys(garment).length) entry.garment = garment;
      return entry;
    }),
  };
}

@Injectable()
export class PrismaCatalogRepository extends CatalogRepository {
  constructor(private readonly prisma: PrismaService) {
    super();
  }

  async listGarments(filter: GarmentFilter) {
    const rows = await this.prisma.garment.findMany({
      where: {
        active: filter.includeInactive ? undefined : true,
        category: filter.category,
        brandId: filter.brandId,
        name: filter.q ? { contains: filter.q, mode: 'insensitive' } : undefined,
      },
      include: garmentInclude,
      orderBy: { createdAt: 'asc' },
    });
    return rows.map(toGarmentItem);
  }

  async findGarment(id: string) {
    const row = await this.prisma.garment.findUnique({ where: { id }, include: garmentInclude });
    return row ? toGarmentItem(row) : null;
  }

  async listBrands(): Promise<Brand[]> {
    return this.prisma.brand.findMany({ orderBy: { name: 'asc' }, select: { id: true, name: true } });
  }

  async listBodyModels(garmentId?: string): Promise<SimilarBodyModel[]> {
    const rows = await this.prisma.bodyModel.findMany({
      orderBy: { sortOrder: 'asc' },
      include: { previews: garmentId ? { where: { garmentId } } : true },
    });
    return rows.map((b) => ({
      id: b.id,
      heightRangeCm: [b.heightMin, b.heightMax],
      bodyTypeTag: b.bodyTypeTag,
      typicalSize: b.typicalSize as LetterSize,
      skinTone: b.skinTone,
      avatarUrl: mediaUrl(b.avatarKey),
      ...(b.photoKey ? { photoUrl: mediaUrl(b.photoKey) } : {}),
      previewImages: Object.fromEntries(b.previews.map((p) => [p.garmentId, mediaUrl(p.imageKey)])),
    }));
  }

  async garmentImageKeys(id: string) {
    const row = await this.prisma.garment.findUnique({ where: { id }, select: { imageFlatKey: true, imageFrontKey: true, photoKey: true } });
    return row ? { flat: row.imageFlatKey, front: row.imageFrontKey, photo: row.photoKey ?? undefined } : null;
  }
}
