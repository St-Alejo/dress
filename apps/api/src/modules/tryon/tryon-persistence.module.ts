import { Module } from '@nestjs/common';
import { TryOnSessionRepository } from './application/tryon-session.repository';
import { PrismaTryOnSessionRepository } from './infrastructure/prisma-tryon-session.repository';

@Module({
  providers: [{ provide: TryOnSessionRepository, useClass: PrismaTryOnSessionRepository }],
  exports: [TryOnSessionRepository],
})
export class TryOnSessionsPersistenceModule {}
