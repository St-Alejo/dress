import { Module } from '@nestjs/common';
import { CatalogRepository } from './application/catalog.repository';
import { PrismaCatalogRepository } from './infrastructure/prisma-catalog.repository';
import { CatalogController, MediaController } from './interface/catalog.controller';
import { FitPreviewController } from './interface/fit-preview.controller';

@Module({
  controllers: [CatalogController, MediaController, FitPreviewController],
  providers: [{ provide: CatalogRepository, useClass: PrismaCatalogRepository }],
  exports: [CatalogRepository],
})
export class CatalogModule {}
