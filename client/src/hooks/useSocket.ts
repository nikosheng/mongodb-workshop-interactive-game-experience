import { useEffect, useRef } from 'react';
import { io, Socket } from 'socket.io-client';
import type { ServerToClientEvents, ClientToServerEvents } from '@query-quest/shared';

let globalSocket: Socket<ServerToClientEvents, ClientToServerEvents> | null = null;

export function getSocket(): Socket<ServerToClientEvents, ClientToServerEvents> {
  if (!globalSocket) {
    globalSocket = io('/', {
      withCredentials: true,
      autoConnect: false,
    });
  }
  return globalSocket;
}

export function connectSocket(): void {
  const socket = getSocket();
  if (!socket.connected) socket.connect();
}

export function disconnectSocket(): void {
  globalSocket?.disconnect();
  globalSocket = null;
}

export function useSocketEvent<K extends keyof ServerToClientEvents>(
  event: K,
  handler: ServerToClientEvents[K],
): void {
  // Store the latest handler in a ref, updated only inside an effect
  const handlerRef = useRef<ServerToClientEvents[K]>(handler);

  useEffect(() => {
    handlerRef.current = handler;
  });

  useEffect(() => {
    const socket = getSocket();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const cb = (...args: any[]) => (handlerRef.current as (...a: any[]) => void)(...args);
    socket.on(event as never, cb);
    return () => { socket.off(event as never, cb); };
  }, [event]);
}
