import { Module } from '@nestjs/common';
import { CatalogRepository } from './application/catalog.repository';
import { PrismaCatalogRepository } from './infrastructure/prisma-catalog.repository';
import { CatalogController, MediaController } from './interface/catalog.controller';

@Module({
  controllers: [CatalogController, MediaController],
  providers: [{ provide: CatalogRepository, useClass: PrismaCatalogRepository }],
  exports: [CatalogRepository],
})
export class CatalogModule {}
