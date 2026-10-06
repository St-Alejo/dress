import type { IncomingMessage, ServerResponse } from 'node:http';
import { randomUUID } from 'node:crypto';
import type { Params } from 'nestjs-pino';

const REQUEST_ID = /^[\w-]{8,64}$/;

/** Reutiliza el X-Request-Id entrante si es seguro; si no, genera uno. Siempre lo devuelve en la respuesta. */
export function requestId(req: IncomingMessage, res: ServerResponse): string {
  const incoming = req.headers['x-request-id'];
  const id = typeof incoming === 'string' && REQUEST_ID.test(incoming) ? incoming : randomUUID();
  res.setHeader('X-Request-Id', id);
  return id;
}

/**
 * Logs estructurados (JSON) con requestId. Nunca se registran cookies, el token
 * de sesión ni la clave del proveedor de IA. En desarrollo se imprimen legibles.
 */
export function loggerParams(env: string | undefined): Params {
  return {
    pinoHttp: {
      level: env === 'test' ? 'silent' : env === 'production' ? 'info' : 'debug',
      genReqId: requestId,
      redact: {
        paths: ['req.headers.cookie', 'req.headers.authorization', 'req.headers["x-ai-key"]', 'req.headers["x-worker-token"]', 'res.headers["set-cookie"]'],
        censor: '[redactado]',
      },
      autoLogging: { ignore: (req) => req.url === '/api/health' },
      // Una línea por petición con lo necesario para depurar; sin cabeceras ni cuerpos.
      serializers: {
        req: (req: { id: string; method: string; url: string }) => ({ id: req.id, method: req.method, url: req.url }),
        res: (res: { statusCode: number }) => ({ statusCode: res.statusCode }),
      },
      transport: env === 'production' || env === 'test' ? undefined : { target: 'pino-pretty', options: { singleLine: true } },
    },
  };
}
