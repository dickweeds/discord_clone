import type { WebSocket } from 'ws';
import { WS_TYPES } from 'discord-clone-shared';
import type { WsMessage, PresenceUpdatePayload, PresenceSyncPayload, MemberRemovedPayload } from 'discord-clone-shared';

interface PresenceEntry {
  status: 'online';
  connectedAt: Date;
}

const onlineUsers = new Map<string, PresenceEntry>();

export function addUser(userId: string): void {
  onlineUsers.set(userId, { status: 'online', connectedAt: new Date() });
}

export function removeUser(userId: string): void {
  onlineUsers.delete(userId);
}

export function getOnlineUsers(): PresenceUpdatePayload[] {
  return Array.from(onlineUsers.keys()).map((userId) => ({
    userId,
    status: 'online' as const,
  }));
}

export function isUserOnline(userId: string): boolean {
  return onlineUsers.has(userId);
}

export function broadcastPresenceUpdate(
  clients: Map<string, WebSocket>,
  userId: string,
  status: 'online' | 'offline',
): void {
  const message: WsMessage<PresenceUpdatePayload> = {
    type: WS_TYPES.PRESENCE_UPDATE,
    payload: { userId, status },
  };
  const data = JSON.stringify(message);

  for (const [clientUserId, ws] of clients) {
    if (clientUserId !== userId && ws.readyState === ws.OPEN) {
      try {
        ws.send(data);
      } catch {
        // Failed to send to this client — continue broadcasting to others
      }
    }
  }
}

export function sendPresenceSync(ws: WebSocket): void {
  const message: WsMessage<PresenceSyncPayload> = {
    type: WS_TYPES.PRESENCE_SYNC,
    payload: { users: getOnlineUsers() },
  };
  ws.send(JSON.stringify(message));
}

export function broadcastMemberRemoved(
  clients: Map<string, WebSocket>,
  userId: string,
): void {
  const message: WsMessage<MemberRemovedPayload> = {
    type: WS_TYPES.MEMBER_REMOVED,
    payload: { userId },
  };
  const data = JSON.stringify(message);

  for (const [clientUserId, ws] of clients) {
    if (clientUserId !== userId && ws.readyState === ws.OPEN) {
      try {
        ws.send(data);
      } catch {
        // Failed to send to this client — continue broadcasting to others
      }
    }
  }
}

export function clearAllPresence(): void {
  onlineUsers.clear();
}
