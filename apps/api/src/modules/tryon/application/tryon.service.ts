import { InjectQueue } from '@nestjs/bullmq';
import { BadRequestException, ConflictException, Injectable, NotFoundException, UnprocessableEntityException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Queue } from 'bullmq';
import { randomUUID } from 'node:crypto';
import sharp from 'sharp';
import { PHOTO_TTL_HOURS, type TryOnMode } from '@vestirse/shared-types';
import type { Requester } from '../../../common/requester';
import { ObjectStorage } from '../../../common/storage';
import { CatalogRepository } from '../../catalog/application/catalog.repository';
import { MetricsService } from '../../metrics/metrics.module';
import { DomainError, TryOnSession } from '../domain/tryon-session.entity';
import { TryOnSessionRepository } from './tryon-session.repository';

export const GENERATION_QUEUE = 'tryon-generation';
export interface GenerationJob {
  sessionId: string;
}

const ACCEPTED_MIME = ['image/jpeg', 'image/png', 'image/webp'];
export const MAX_PHOTO_BYTES = 10 * 1024 * 1024;

@Injectable()
export class TryOnService {
  private readonly ttlHours: number;

  constructor(
    private readonly sessions: TryOnSessionRepository,
    private readonly catalog: CatalogRepository,
    private readonly storage: ObjectStorage,
    private readonly metrics: MetricsService,
    @InjectQueue(GENERATION_QUEUE) private readonly queue: Queue<GenerationJob>,
    config: ConfigService,
  ) {
    this.ttlHours = Number(config.get('PHOTO_TTL_HOURS', PHOTO_TTL_HOURS));
  }

  async start(args: { garmentId: string; mode: TryOnMode; bodyModelId?: string }, requester: Requester) {
    if (!(await this.catalog.findGarment(args.garmentId))) throw new NotFoundException('prenda no encontrada');
    const session = TryOnSession.start({ id: randomUUID(), ...args, requester, now: new Date() });
    await this.sessions.create(session);
    await this.metrics.record('mode-used', { mode: args.mode, garmentId: args.garmentId });
    return session.toDto();
  }

  async get(id: string, requester: Requester) {
    return (await this.owned(id, requester)).toDto();
  }

  async list(requester: Requester) {
    return (await this.sessions.listOwned(requester, 30)).map((s) => s.toDto());
  }

  async changeMode(id: string, mode: TryOnMode, requester: Requester) {
    const session = await this.owned(id, requester);
    session.changeMode(mode);
    await this.sessions.save(session);
    await this.metrics.record('mode-used', { mode, garmentId: session.garmentId });
    return session.toDto();
  }

  /**
   * Sube la foto (Track B). Se re-codifica en el servidor: se aplica la orientación
   * y se descartan TODOS los metadatos (EXIF/GPS), y se limita la resolución.
   */
  async uploadPhoto(id: string, file: { buffer: Buffer; mimetype: string; size: number } | undefined, requester: Requester) {
    if (!file) throw new BadRequestException('falta la imagen');
    if (!ACCEPTED_MIME.includes(file.mimetype)) throw new UnprocessableEntityException('formato no admitido');
    if (file.size > MAX_PHOTO_BYTES) throw new UnprocessableEntityException('imagen demasiado grande');
    const session = await this.owned(id, requester);

    let clean: Buffer;
    try {
      clean = await sharp(file.buffer, { limitInputPixels: 40_000_000 })
        .rotate()
        .resize(1024, 1024, { fit: 'inside', withoutEnlargement: true })
        .jpeg({ quality: 88 })
        .toBuffer();
    } catch {
      throw new UnprocessableEntityException('la imagen no se pudo leer');
    }

    const stale = session.purgePhoto();
    if (stale.length) await this.storage.deleteMany(stale);
    this.domain(() => session.attachPhoto(new Date(), this.ttlHours));
    await this.storage.put(session.photoKey!, clean, 'image/jpeg');
    await this.sessions.save(session);
    return session.toDto();
  }

  async requestGeneration(id: string, requester: Requester) {
    const session = await this.owned(id, requester);
    this.domain(() => session.requestGeneration());
    await this.sessions.save(session);
    await this.queue.add('generate', { sessionId: session.id }, { attempts: 1, removeOnComplete: true, removeOnFail: 100 });
    return session.toDto();
  }

  /** La persona puede borrar su foto en cualquier momento, sin esperar al TTL. */
  async deletePhoto(id: string, requester: Requester) {
    const session = await this.owned(id, requester);
    const keys = session.purgePhoto();
    await this.storage.deleteMany(keys);
    await this.sessions.save(session);
    return session.toDto();
  }

  /** Guardar el resultado en la cuenta: único caso en que sobrevive al TTL. */
  async saveResult(id: string, requester: Requester) {
    if (!requester.userId) throw new BadRequestException('necesitas una cuenta para guardar');
    const session = await this.owned(id, requester);
    const currentKey = session.resultKey;
    if (!currentKey) throw new ConflictException('no hay resultado');
    const image = await this.storage.getBuffer(currentKey);
    if (!image) throw new ConflictException('el resultado ya expiró');
    this.domain(() => session.saveResult(requester.userId!));
    if (session.resultKey !== currentKey) {
      await this.storage.put(session.resultKey!, image, 'image/png');
      await this.storage.deleteMany([currentKey]);
    }
    await this.sessions.save(session);
    return session.toDto();
  }

  async privateImage(id: string, kind: 'photo' | 'result', requester: Requester) {
    const session = await this.owned(id, requester);
    const key = kind === 'photo' ? session.photoKey : session.resultKey;
    const obj = key ? await this.storage.get(key) : null;
    if (!obj) throw new NotFoundException();
    return obj;
  }

  private async owned(id: string, requester: Requester) {
    const session = await this.sessions.findOwned(id, requester);
    if (!session) throw new NotFoundException('sesión no encontrada');
    return session;
  }

  private domain(fn: () => void) {
    try {
      fn();
    } catch (err) {
      if (err instanceof DomainError) throw new ConflictException(err.message);
      throw err;
    }
  }
}
