import { ArgumentsHost, Catch, ExceptionFilter, HttpException, HttpStatus, Logger } from '@nestjs/common';
import type { Request, Response } from 'express';
import { DomainError } from '../modules/tryon/domain/tryon-session.entity';

/** Forma única de todos los errores HTTP de la API. */
export interface ApiErrorBody {
  statusCode: number;
  code: string;
  message: string;
  requestId?: string;
}

const CODE_BY_STATUS: Record<number, string> = {
  400: 'bad-request',
  401: 'unauthorized',
  403: 'forbidden',
  404: 'not-found',
  409: 'conflict',
  413: 'payload-too-large',
  422: 'unprocessable',
  429: 'too-many-requests',
  503: 'unavailable',
};

/**
 * Convierte cualquier excepción en `ApiErrorBody`. Los errores inesperados se
 * registran con su stack, pero al cliente solo le llega un mensaje genérico y el
 * requestId para poder rastrearlo en los logs.
 */
@Catch()
export class HttpExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger('HttpException');

  catch(exception: unknown, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const req = ctx.getRequest<Request & { id?: string | number }>();
    const res = ctx.getResponse<Response>();
    const body = this.toBody(exception, req.id === undefined ? undefined : String(req.id));
    if (body.statusCode >= 500) {
      this.logger.error(`${req.method} ${req.originalUrl ?? req.url} → ${body.statusCode} [${body.requestId}]`, (exception as Error)?.stack);
    }
    if (!res.headersSent) res.status(body.statusCode).json(body);
  }

  toBody(exception: unknown, requestId?: string): ApiErrorBody {
    if (exception instanceof HttpException) {
      const statusCode = exception.getStatus();
      const response = exception.getResponse();
      const raw = typeof response === 'string' ? response : (response as { message?: string | string[] }).message;
      const message = Array.isArray(raw) ? raw.join('; ') : (raw ?? exception.message);
      return { statusCode, code: CODE_BY_STATUS[statusCode] ?? (statusCode >= 500 ? 'internal' : 'error'), message, requestId };
    }
    if (exception instanceof DomainError) {
      return { statusCode: HttpStatus.CONFLICT, code: 'conflict', message: exception.message, requestId };
    }
    return { statusCode: HttpStatus.INTERNAL_SERVER_ERROR, code: 'internal', message: 'Error interno del servidor', requestId };
  }
}
