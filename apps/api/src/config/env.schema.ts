import 'reflect-metadata';
import { plainToInstance, Type } from 'class-transformer';
import { IsIn, IsInt, IsOptional, IsString, IsUrl, Max, Min, MinLength, validateSync } from 'class-validator';
import { AI_PROVIDERS, PHOTO_TTL_HOURS } from '@vestirse/shared-types';

const url = { require_tld: false, require_protocol: true };

/**
 * Variables de entorno de la API. Se validan al arrancar: si falta algo, el
 * proceso no levanta (fail fast) en vez de fallar a mitad de una petición.
 */
export class EnvironmentVariables {
  @IsOptional() @IsIn(['development', 'production', 'test']) NODE_ENV?: string;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(65535) PORT?: number;

  @IsString() @MinLength(1) DATABASE_URL!: string;
  @IsOptional() @IsString() REDIS_HOST?: string;
  @IsOptional() @Type(() => Number) @IsInt() REDIS_PORT?: number;
  @IsOptional() @IsString() REDIS_USERNAME?: string;
  @IsOptional() @IsString() REDIS_PASSWORD?: string;

  @IsUrl(url) S3_ENDPOINT!: string;
  @IsString() @MinLength(1) S3_BUCKET!: string;
  @IsString() @MinLength(1) S3_ACCESS_KEY!: string;
  @IsString() @MinLength(1) S3_SECRET_KEY!: string;

  @IsString() @MinLength(16) JWT_SECRET!: string;
  @IsString() @MinLength(16) APP_ENCRYPTION_KEY!: string;

  @IsUrl(url) AI_WORKER_URL!: string;
  @IsOptional() @IsString() WORKER_TOKEN?: string;
  @IsOptional() @IsIn(AI_PROVIDERS as string[]) AI_PROVIDER?: string;
  @IsOptional() @Type(() => Number) @IsInt() @Min(5) @Max(600) GENERATION_TIMEOUT_SECONDS?: number;
  @IsOptional() @Type(() => Number) @IsInt() @Min(60) GENERATION_STUCK_SECONDS?: number;

  /** La regla del bucket borra `uploads/` a 1 día: un TTL mayor sería una promesa falsa. */
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(PHOTO_TTL_HOURS) PHOTO_TTL_HOURS?: number;
  @IsOptional() @IsUrl(url) WEB_ORIGIN?: string;
}

/** Para `ConfigModule.forRoot({ validate })`. Devuelve la config original (strings) si es válida. */
export function validateEnv(config: Record<string, unknown>): Record<string, unknown> {
  const env = plainToInstance(EnvironmentVariables, config, { enableImplicitConversion: false });
  const errors = validateSync(env, { skipMissingProperties: false, whitelist: false });
  const problems = errors.map((e) => `${e.property}: ${Object.values(e.constraints ?? {}).join(', ')}`);
  if (config.NODE_ENV === 'production' && !config.WORKER_TOKEN) {
    problems.push('WORKER_TOKEN: es obligatorio en producción (autentica la API ante el ai-worker)');
  }
  if (problems.length) {
    throw new Error(`Configuración inválida en el entorno:\n  - ${problems.join('\n  - ')}`);
  }
  return config;
}
