import { Injectable, OnDestroy } from '@angular/core';
import type { GenerationProgressEvent } from '@vestirse/shared-types';
import { io, type Socket } from 'socket.io-client';

/** Canal de progreso de Track B. Se conecta solo cuando hay una generación en curso. */
@Injectable({ providedIn: 'root' })
export class GenerationSocketService implements OnDestroy {
  private socket?: Socket;

  watch(sessionId: string, onEvent: (e: GenerationProgressEvent) => void): () => void {
    this.socket ??= io('/tryon', { path: '/api/socket.io', withCredentials: true, transports: ['websocket', 'polling'] });
    const socket = this.socket;
    const handler = (e: GenerationProgressEvent) => {
      if (e.sessionId === sessionId) onEvent(e);
    };
    const subscribe = () => socket.emit('subscribe', { sessionId });
    socket.on('progress', handler);
    socket.on('connect', subscribe);
    if (socket.connected) subscribe();
    return () => {
      socket.off('progress', handler);
      socket.off('connect', subscribe);
    };
  }

  ngOnDestroy() {
    this.socket?.disconnect();
  }
}
