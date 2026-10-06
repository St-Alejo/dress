import { BullModule } from '@nestjs/bullmq';
import { Module } from '@nestjs/common';
import { CatalogModule } from '../catalog/catalog.module';
import { GarmentTransferPort } from './application/garment-transfer.port';
import { GENERATION_QUEUE, TryOnService } from './application/tryon.service';
import { AiWorkerAdapter } from './infrastructure/ai-worker.adapter';
import { GenerationReaper } from './infrastructure/generation-reaper';
import { GenerationProcessor } from './infrastructure/generation.processor';
import { TryOnGateway } from './infrastructure/tryon.gateway';
import { TryOnController } from './interface/tryon.controller';
import { TryOnSessionsPersistenceModule } from './tryon-persistence.module';

@Module({
  imports: [CatalogModule, TryOnSessionsPersistenceModule, BullModule.registerQueue({ name: GENERATION_QUEUE })],
  controllers: [TryOnController],
  providers: [TryOnService, TryOnGateway, GenerationProcessor, GenerationReaper, { provide: GarmentTransferPort, useClass: AiWorkerAdapter }],
})
export class TryOnModule {}
