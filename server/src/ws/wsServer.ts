import type { WebSocket } from 'ws';
import websocket from '@fastify/websocket';
import fp from 'fastify-plugin';
import { WS_TYPES } from 'discord-clone-shared';
import { verifyAccessToken } from '../plugins/auth/authService.js';
import { routeMessage, registerHandler } from './wsRouter.js';
import {
  addUser,
  removeUser,
  broadcastPresenceUpdate,
  sendPresenceSync,
} from '../plugins/presence/presenceService.js';
import { registerMessageHandlers } from '../plugins/messages/messageWsHandler.js';

const clients = new Map<string, WebSocket>();

export function getClients(): Map<string, WebSocket> {
  return clients;
}

export default fp(async function wsServer(fastify) {
  await fastify.register(websocket);

  // Register presence:sync handler — client requests full online user list
  registerHandler(WS_TYPES.PRESENCE_SYNC, (ws) => {
    sendPresenceSync(ws);
  });

  // Register message handlers
  registerMessageHandlers(clients, fastify.db, fastify.log);

  fastify.get('/ws', { websocket: true }, (socket, request) => {
    const url = new URL(request.url, 'http://localhost');
    const token = url.searchParams.get('token');

    if (!token) {
      fastify.log.warn('WebSocket connection rejected: no token provided');
      socket.close(4001, 'Authentication required');
      return;
    }

    let userId: string;
    try {
      const payload = verifyAccessToken(token);
      userId = payload.userId;
    } catch {
      fastify.log.warn('WebSocket connection rejected: invalid or expired token');
      socket.close(4001, 'Invalid or expired token');
      return;
    }

    // Close existing connection for this user if any
    const existingSocket = clients.get(userId);
    if (existingSocket && existingSocket.readyState === existingSocket.OPEN) {
      existingSocket.close(1000, 'New connection opened');
    }

    clients.set(userId, socket);
    addUser(userId);
    fastify.log.info({ userId }, 'WebSocket client connected');

    // Broadcast online status to other clients
    broadcastPresenceUpdate(clients, userId, 'online');

    // Send the connecting client the full online user list
    sendPresenceSync(socket);

    socket.on('message', (raw: WebSocket.RawData) => {
      const data = typeof raw === 'string' ? raw : raw.toString('utf-8');
      routeMessage(socket, data, userId, fastify.log);
    });

    socket.on('close', () => {
      clients.delete(userId);
      removeUser(userId);
      fastify.log.info({ userId }, 'WebSocket client disconnected');
      broadcastPresenceUpdate(clients, userId, 'offline');
    });

    socket.on('error', (error: Error) => {
      fastify.log.error({ userId, error: error.message }, 'WebSocket error');
    });
  });
});
