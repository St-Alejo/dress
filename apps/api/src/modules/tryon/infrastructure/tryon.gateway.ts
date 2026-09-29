import { Logger } from '@nestjs/common';
import { ConnectedSocket, MessageBody, SubscribeMessage, WebSocketGateway, WebSocketServer } from '@nestjs/websockets';
import type { GenerationProgressEvent } from '@vestirse/shared-types';
import type { Server, Socket } from 'socket.io';
import { SID_COOKIE } from '../../../common/requester';
import { TryOnSessionRepository } from '../application/tryon-session.repository';

function readCookie(header: string | undefined, name: string): string | undefined {
  return header
    ?.split(';')
    .map((c) => c.trim().split('='))
    .find(([k]) => k === name)?.[1];
}

/** Progreso de Track B por WebSocket. Solo quien es dueño de la sesión puede suscribirse. */
@WebSocketGateway({ namespace: '/tryon', path: '/api/socket.io' })
export class TryOnGateway {
  private readonly logger = new Logger(TryOnGateway.name);
  @WebSocketServer() server: Server;

  constructor(private readonly sessions: TryOnSessionRepository) {}

  @SubscribeMessage('subscribe')
  async subscribe(@ConnectedSocket() socket: Socket, @MessageBody() body: { sessionId?: string }) {
    const sid = readCookie(socket.handshake.headers.cookie, SID_COOKIE);
    if (!sid || typeof body?.sessionId !== 'string') return { ok: false };
    const session = await this.sessions.findOwned(body.sessionId, { sid });
    if (!session) return { ok: false };
    await socket.join(`session:${session.id}`);
    return { ok: true, status: session.status };
  }

  emit(event: GenerationProgressEvent) {
    this.server?.to(`session:${event.sessionId}`).emit('progress', event);
  }
}
