import { createParamDecorator, ExecutionContext, Injectable, NestMiddleware } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { randomUUID } from 'node:crypto';
import type { NextFunction, Request, Response } from 'express';

export const SID_COOKIE = 'sid';
export const AUTH_COOKIE = 'access_token';

/** Quién hace la petición: siempre un sid anónimo; opcionalmente una cuenta. */
export interface Requester {
  sid: string;
  userId?: string;
  role?: 'user' | 'admin';
}

export interface JwtPayload {
  sub: string;
  role: 'user' | 'admin';
}

declare module 'express' {
  interface Request {
    requester?: Requester;
  }
}

/**
 * Asigna un identificador anónimo por navegador (no se fuerza login, sección 9)
 * y decodifica la cuenta si hay token.
 */
@Injectable()
export class RequesterMiddleware implements NestMiddleware {
  constructor(private readonly jwt: JwtService) {}

  use(req: Request, res: Response, next: NextFunction) {
    let sid: string | undefined = req.cookies?.[SID_COOKIE];
    if (!sid || !/^[0-9a-f-]{36}$/.test(sid)) {
      sid = randomUUID();
      res.cookie(SID_COOKIE, sid, { httpOnly: true, sameSite: 'lax', maxAge: 1000 * 60 * 60 * 24 * 30 });
    }
    const requester: Requester = { sid };
    const token: string | undefined = req.cookies?.[AUTH_COOKIE];
    if (token) {
      try {
        const payload = this.jwt.verify<JwtPayload>(token);
        requester.userId = payload.sub;
        requester.role = payload.role;
      } catch {
        res.clearCookie(AUTH_COOKIE);
      }
    }
    req.requester = requester;
    next();
  }
}

export const CurrentRequester = createParamDecorator((_: unknown, ctx: ExecutionContext): Requester => {
  const req = ctx.switchToHttp().getRequest<Request>();
  return req.requester!;
});
