import { Controller, Get, NotFoundException, Param, ParseUUIDPipe, Query, Res } from '@nestjs/common';
import { IsIn, IsOptional, IsString, IsUUID, MaxLength } from 'class-validator';
import type { GarmentCategory } from '@vestirse/shared-types';
import type { Response } from 'express';
import { CATALOG_PREFIX, ObjectStorage } from '../../../common/storage';
import { CatalogRepository } from '../application/catalog.repository';

const CATEGORIES: GarmentCategory[] = ['top', 'bottom', 'dress', 'outerwear', 'footwear', 'accessory'];

class GarmentQuery {
  @IsOptional() @IsIn(CATEGORIES) category?: GarmentCategory;
  @IsOptional() @IsUUID() brandId?: string;
  @IsOptional() @IsString() @MaxLength(80) q?: string;
}

class BodyModelQuery {
  @IsOptional() @IsUUID() garmentId?: string;
}

@Controller('catalog')
export class CatalogController {
  constructor(private readonly catalog: CatalogRepository) {}

  @Get('garments')
  list(@Query() query: GarmentQuery) {
    return this.catalog.listGarments(query);
  }

  @Get('garments/:id')
  async get(@Param('id', ParseUUIDPipe) id: string) {
    const garment = await this.catalog.findGarment(id);
    if (!garment) throw new NotFoundException();
    return garment;
  }

  @Get('brands')
  brands() {
    return this.catalog.listBrands();
  }

  /** Catálogo "cuerpo similar al mío": siempre completo, nunca filtrado por talla (regla 4). */
  @Get('body-models')
  bodyModels(@Query() query: BodyModelQuery) {
    return this.catalog.listBodyModels(query.garmentId);
  }
}

/** Sirve solo imágenes públicas del catálogo; las fotos privadas nunca pasan por aquí. */
@Controller('media')
export class MediaController {
  constructor(private readonly storage: ObjectStorage) {}

  @Get('catalog/*path')
  async catalogAsset(@Param('path') path: string | string[], @Res() res: Response) {
    const key = CATALOG_PREFIX + (Array.isArray(path) ? path.join('/') : path);
    if (key.includes('..')) throw new NotFoundException();
    const obj = await this.storage.get(key);
    if (!obj) throw new NotFoundException();
    res.setHeader('Content-Type', obj.contentType ?? 'application/octet-stream');
    res.setHeader('Cache-Control', 'public, max-age=3600');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    // Solo se sirven imágenes: nada de lo que hay aquí debe poder ejecutar scripts.
    res.setHeader('Content-Security-Policy', "default-src 'none'");
    obj.body.pipe(res);
  }
}
