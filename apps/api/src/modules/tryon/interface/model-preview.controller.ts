import { Body, Controller, HttpCode, Post } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { IsUUID } from 'class-validator';
import { ModelPreviewService } from '../application/model-preview.service';

class ModelPreviewDto {
  @IsUUID() bodyModelId: string;
  @IsUUID() garmentId: string;
}

@Controller('tryon/model-previews')
export class ModelPreviewController {
  constructor(private readonly previews: ModelPreviewService) {}

  /** Devuelve la prueba de la prenda sobre el modelo; si aún no existe, la genera (tarda y gasta cuota). */
  @Post()
  @HttpCode(200)
  @Throttle({ default: { limit: 6, ttl: 60_000 } })
  ensure(@Body() dto: ModelPreviewDto) {
    return this.previews.ensure(dto.bodyModelId, dto.garmentId);
  }
}
