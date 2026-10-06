import { Body, Controller, Get, INestApplication, Module, NotFoundException, Post, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { IsString } from 'class-validator';
import { LoggerModule } from 'nestjs-pino';
import request from 'supertest';
import { DomainError } from '../modules/tryon/domain/tryon-session.entity';
import { HttpExceptionFilter } from './http-exception.filter';
import { loggerParams } from './logging';

class Dto {
  @IsString() name!: string;
}

@Controller('t')
class ProbeController {
  @Get('not-found') notFound() { throw new NotFoundException('prenda no encontrada'); }
  @Get('domain') domain() { throw new DomainError('ya hay una generación en curso'); }
  @Get('boom') boom() { throw new Error('detalle interno con secreto'); }
  @Post('dto') dto(@Body() _: Dto) { return { ok: true }; }
}

@Module({ imports: [LoggerModule.forRoot(loggerParams('test'))], controllers: [ProbeController] })
class ProbeModule {}

describe('HttpExceptionFilter + requestId (e2e)', () => {
  let app: INestApplication;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [ProbeModule] }).compile();
    app = moduleRef.createNestApplication({ logger: false });
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true }));
    app.useGlobalFilters(new HttpExceptionFilter());
    await app.init();
  });
  afterAll(() => app.close());

  it('4xx con forma estándar y el mismo requestId en cuerpo y cabecera', async () => {
    const res = await request(app.getHttpServer()).get('/t/not-found').expect(404);
    expect(res.body).toEqual({ statusCode: 404, code: 'not-found', message: 'prenda no encontrada', requestId: expect.any(String) });
    expect(res.headers['x-request-id']).toBe(res.body.requestId);
  });

  it('reutiliza un X-Request-Id entrante válido (correlación con el front)', async () => {
    const res = await request(app.getHttpServer()).get('/t/not-found').set('X-Request-Id', 'front-1234abcd').expect(404);
    expect(res.body.requestId).toBe('front-1234abcd');
  });

  it('ignora un X-Request-Id con caracteres peligrosos', async () => {
    const res = await request(app.getHttpServer()).get('/t/not-found').set('X-Request-Id', '<script>alert(1)</script>').expect(404);
    expect(res.body.requestId).not.toContain('<');
  });

  it('las reglas de dominio violadas son 409', async () => {
    const res = await request(app.getHttpServer()).get('/t/domain').expect(409);
    expect(res.body).toMatchObject({ code: 'conflict', message: 'ya hay una generación en curso' });
  });

  it('los errores de validación se aplanan en un mensaje', async () => {
    const res = await request(app.getHttpServer()).post('/t/dto').send({ name: 1, extra: true }).expect(400);
    expect(res.body.code).toBe('bad-request');
    expect(res.body.message).toMatch(/extra/);
  });

  it('un error inesperado no filtra detalles internos', async () => {
    const res = await request(app.getHttpServer()).get('/t/boom').expect(500);
    expect(res.body).toMatchObject({ code: 'internal', message: 'Error interno del servidor' });
    expect(JSON.stringify(res.body)).not.toMatch(/secreto|stack/);
  });
});
