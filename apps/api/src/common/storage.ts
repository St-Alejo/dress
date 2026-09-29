import {
  CreateBucketCommand,
  DeleteObjectsCommand,
  GetObjectCommand,
  HeadBucketCommand,
  PutBucketLifecycleConfigurationCommand,
  PutObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3';
import { Global, Injectable, Logger, Module, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Readable } from 'node:stream';

/** Puerto de almacenamiento de objetos: el dominio no sabe si es S3, R2 o RustFS. */
export abstract class ObjectStorage {
  abstract put(key: string, body: Buffer, contentType: string): Promise<void>;
  abstract get(key: string): Promise<{ body: Readable; contentType?: string } | null>;
  abstract getBuffer(key: string): Promise<Buffer | null>;
  /** Borrado real (sección 8.5): elimina los objetos, no un flag en base de datos. */
  abstract deleteMany(keys: string[]): Promise<void>;
}

/** Prefijo de objetos sensibles (fotos y resultados) con expiración automática. */
export const PRIVATE_PREFIX = 'uploads/';
export const CATALOG_PREFIX = 'catalog/';

@Injectable()
export class S3ObjectStorage extends ObjectStorage implements OnModuleInit {
  private readonly logger = new Logger(S3ObjectStorage.name);
  private readonly client: S3Client;
  private readonly bucket: string;

  constructor(config: ConfigService) {
    super();
    this.bucket = config.getOrThrow('S3_BUCKET');
    this.client = new S3Client({
      endpoint: config.getOrThrow('S3_ENDPOINT'),
      region: config.get('S3_REGION', 'us-east-1'),
      forcePathStyle: true,
      credentials: {
        accessKeyId: config.getOrThrow('S3_ACCESS_KEY'),
        secretAccessKey: config.getOrThrow('S3_SECRET_KEY'),
      },
    });
  }

  async onModuleInit() {
    try {
      await this.client.send(new HeadBucketCommand({ Bucket: this.bucket }));
    } catch {
      await this.client.send(new CreateBucketCommand({ Bucket: this.bucket }));
      this.logger.log(`bucket ${this.bucket} creado`);
    }
    // Defensa en profundidad: además del cron de retención, el propio bucket expira uploads/.
    try {
      await this.client.send(
        new PutBucketLifecycleConfigurationCommand({
          Bucket: this.bucket,
          LifecycleConfiguration: {
            Rules: [{ ID: 'expire-uploads', Status: 'Enabled', Filter: { Prefix: PRIVATE_PREFIX }, Expiration: { Days: 1 } }],
          },
        }),
      );
    } catch (err) {
      this.logger.warn(`el almacenamiento no aceptó la regla de expiración; se confía en el cron de retención (${(err as Error).name})`);
    }
  }

  async put(key: string, body: Buffer, contentType: string) {
    await this.client.send(new PutObjectCommand({ Bucket: this.bucket, Key: key, Body: body, ContentType: contentType }));
  }

  async get(key: string) {
    try {
      const res = await this.client.send(new GetObjectCommand({ Bucket: this.bucket, Key: key }));
      return { body: res.Body as Readable, contentType: res.ContentType };
    } catch (err) {
      if ((err as Error).name === 'NoSuchKey') return null;
      throw err;
    }
  }

  async getBuffer(key: string) {
    const obj = await this.get(key);
    if (!obj) return null;
    const chunks: Buffer[] = [];
    for await (const chunk of obj.body) chunks.push(Buffer.from(chunk));
    return Buffer.concat(chunks);
  }

  async deleteMany(keys: string[]) {
    for (let i = 0; i < keys.length; i += 1000) {
      const batch = keys.slice(i, i + 1000);
      if (batch.length === 0) continue;
      await this.client.send(
        new DeleteObjectsCommand({ Bucket: this.bucket, Delete: { Objects: batch.map((Key) => ({ Key })), Quiet: true } }),
      );
    }
  }
}

@Global()
@Module({
  providers: [{ provide: ObjectStorage, useClass: S3ObjectStorage }],
  exports: [ObjectStorage],
})
export class StorageModule {}
