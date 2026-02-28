import type { WebSocket } from 'ws';
import type { FastifyBaseLogger } from 'fastify';
import type { WsMessage } from 'discord-clone-shared';
import { WS_TYPES } from 'discord-clone-shared';
import type { AppDatabase } from '../../db/connection.js';
import { registerHandler, respond, respondError } from '../../ws/wsRouter.js';
import { getClients } from '../../ws/wsServer.js';
import {
  createWebRtcTransport,
  getRouter,
  getRouterRtpCapabilities,
  onWorkerDied,
} from './mediasoupManager.js';
import {
  joinVoiceChannel,
  leaveVoiceChannel,
  getChannelPeers,
  getPeer,
  getAllPeers,
  findProducerOwner,
  setPeerTransport,
  setPeerProducer,
  setPeerVideoProducer,
  addPeerConsumer,
  removePeer,
  clearAllVoiceState,
} from './voiceService.js';
import { getChannelById } from '../channels/channelService.js';

let db: AppDatabase;
let log: FastifyBaseLogger;

export function registerVoiceHandlers(appDb: AppDatabase, logger: FastifyBaseLogger): void {
  db = appDb;
  log = logger;

  // Clean up all voice state if mediasoup Worker dies
  onWorkerDied(() => {
    const peers = getAllPeers();
    for (const [userId, peer] of peers) {
      broadcastToChannel(peer.channelId, userId, WS_TYPES.VOICE_PEER_LEFT, { userId, channelId: peer.channelId });
    }
    clearAllVoiceState();
    log.warn('All voice sessions cleared due to mediasoup Worker death');
  });

  registerHandler(WS_TYPES.VOICE_JOIN, handleVoiceJoin);
  registerHandler(WS_TYPES.VOICE_LEAVE, handleVoiceLeave);
  registerHandler(WS_TYPES.VOICE_CREATE_TRANSPORT, handleCreateTransport);
  registerHandler(WS_TYPES.VOICE_CONNECT_TRANSPORT, handleConnectTransport);
  registerHandler(WS_TYPES.VOICE_PRODUCE, handleProduce);
  registerHandler(WS_TYPES.VOICE_CONSUME, handleConsume);
  registerHandler(WS_TYPES.VOICE_CONSUMER_RESUME, handleConsumerResume);
  registerHandler(WS_TYPES.VOICE_STATE, handleVoiceState);
}

async function handleVoiceJoin(ws: WebSocket, message: WsMessage, userId: string): Promise<void> {
  const { channelId, rtpCapabilities } = message.payload as { channelId: string; rtpCapabilities?: unknown };
  const requestId = message.id;

  if (!channelId) {
    if (requestId) respondError(ws, requestId, 'channelId is required');
    return;
  }

  // Validate channel exists and is type 'voice'
  let channel;
  try {
    channel = await getChannelById(db, channelId);
  } catch (err) {
    log.error({ err, channelId }, 'Failed to look up voice channel');
    ws.close(4500, 'Internal error');
    return;
  }
  if (!channel) {
    if (requestId) respondError(ws, requestId, 'Channel not found');
    return;
  }
  if (channel.type !== 'voice') {
    if (requestId) respondError(ws, requestId, 'Cannot join a text channel as voice');
    return;
  }

  const existingPeers = joinVoiceChannel(userId, channelId, rtpCapabilities);
  if (existingPeers === null) {
    if (requestId) respondError(ws, requestId, 'Voice channel is full');
    return;
  }
  const routerRtpCapabilities = getRouterRtpCapabilities();

  if (requestId) {
    respond(ws, requestId, { routerRtpCapabilities, existingPeers });
  }

  // Broadcast peer-joined to others in channel
  broadcastToChannel(channelId, userId, WS_TYPES.VOICE_PEER_JOINED, { userId, channelId });

  log.info({ userId, channelId }, 'User joined voice channel');
}

function handleVoiceLeave(ws: WebSocket, message: WsMessage, userId: string): void {
  const requestId = message.id;

  const channelId = leaveVoiceChannel(userId);

  if (requestId) {
    respond(ws, requestId, {});
  }

  if (channelId) {
    broadcastToChannel(channelId, userId, WS_TYPES.VOICE_PEER_LEFT, { userId, channelId });
    log.info({ userId, channelId }, 'User left voice channel');
  }
}

async function handleCreateTransport(ws: WebSocket, message: WsMessage, userId: string): Promise<void> {
  const { direction } = message.payload as { direction: 'send' | 'recv' };
  const requestId = message.id;

  if (!direction || (direction !== 'send' && direction !== 'recv')) {
    if (requestId) respondError(ws, requestId, 'direction must be "send" or "recv"');
    return;
  }

  const peer = getPeer(userId);
  if (!peer) {
    if (requestId) respondError(ws, requestId, 'Not in a voice channel — join first');
    return;
  }

  // Reject if transport already exists for this direction
  if ((direction === 'send' && peer.sendTransport) || (direction === 'recv' && peer.recvTransport)) {
    if (requestId) respondError(ws, requestId, `Transport for "${direction}" already exists`);
    return;
  }

  try {
    const { transport, transportParams, iceServers } = await createWebRtcTransport(userId);
    setPeerTransport(userId, direction, transport);

    transport.on('dtlsstatechange', (dtlsState: string) => {
      log.info({ userId, transportId: transport.id, dtlsState }, 'Transport DTLS state change');
    });
    transport.on('icestatechange', (iceState: string) => {
      log.info({ userId, transportId: transport.id, iceState }, 'Transport ICE state change');
    });

    if (requestId) {
      respond(ws, requestId, { transportParams, iceServers });
    }
  } catch (err) {
    log.error({ userId, err: (err as Error).message }, 'Failed to create WebRTC transport');
    if (requestId) respondError(ws, requestId, 'Failed to create transport');
  }
}

async function handleConnectTransport(ws: WebSocket, message: WsMessage, userId: string): Promise<void> {
  const { transportId, dtlsParameters } = message.payload as {
    transportId: string;
    dtlsParameters: unknown;
  };
  const requestId = message.id;

  const peer = getPeer(userId);
  if (!peer) {
    if (requestId) respondError(ws, requestId, 'Not in a voice channel');
    return;
  }

  // Find the transport by id
  const transport =
    peer.sendTransport?.id === transportId
      ? peer.sendTransport
      : peer.recvTransport?.id === transportId
        ? peer.recvTransport
        : null;

  if (!transport) {
    if (requestId) respondError(ws, requestId, 'Transport not found');
    return;
  }

  try {
    await transport.connect({ dtlsParameters: dtlsParameters as Parameters<typeof transport.connect>[0]['dtlsParameters'] });
    if (requestId) respond(ws, requestId, {});
  } catch (err) {
    log.error({ userId, transportId, err: (err as Error).message }, 'Failed to connect transport');
    if (requestId) respondError(ws, requestId, 'Failed to connect transport');
  }
}

async function handleProduce(ws: WebSocket, message: WsMessage, userId: string): Promise<void> {
  const { transportId, kind, rtpParameters } = message.payload as {
    transportId: string;
    kind: 'audio' | 'video';
    rtpParameters: unknown;
  };
  const requestId = message.id;

  const peer = getPeer(userId);
  if (!peer || !peer.sendTransport) {
    if (requestId) respondError(ws, requestId, 'Send transport not found');
    return;
  }

  if (peer.sendTransport.id !== transportId) {
    if (requestId) respondError(ws, requestId, 'Transport ID mismatch');
    return;
  }

  // Reject duplicate audio producer
  if (kind === 'audio' && peer.producer) {
    if (requestId) respondError(ws, requestId, 'Already has an active audio producer');
    return;
  }

  // Reject duplicate video producer
  if (kind === 'video' && peer.videoProducer) {
    if (requestId) respondError(ws, requestId, 'Already has an active video producer');
    return;
  }

  try {
    const producer = await peer.sendTransport.produce({
      kind,
      rtpParameters: rtpParameters as Parameters<typeof peer.sendTransport.produce>[0]['rtpParameters'],
    });

    if (kind === 'video') {
      setPeerVideoProducer(userId, producer);
    } else {
      setPeerProducer(userId, producer);
    }

    producer.on('transportclose', () => {
      log.info({ userId, producerId: producer.id }, 'Producer transport closed');
    });

    if (requestId) {
      respond(ws, requestId, { producerId: producer.id });
    }

    // Notify other peers in channel about new producer
    broadcastToChannel(peer.channelId, userId, WS_TYPES.VOICE_NEW_PRODUCER, {
      producerId: producer.id,
      peerId: userId,
      kind,
    });
  } catch (err) {
    log.error({ userId, err: (err as Error).message }, 'Failed to produce');
    if (requestId) respondError(ws, requestId, 'Failed to produce');
  }
}

async function handleConsume(ws: WebSocket, message: WsMessage, userId: string): Promise<void> {
  const { producerId } = message.payload as { producerId: string };
  const requestId = message.id;

  const peer = getPeer(userId);
  if (!peer || !peer.recvTransport) {
    if (requestId) respondError(ws, requestId, 'Recv transport not found');
    return;
  }

  const router = getRouter();
  if (!router.canConsume({ producerId, rtpCapabilities: peer.rtpCapabilities as Parameters<typeof router.canConsume>[0]['rtpCapabilities'] })) {
    if (requestId) respondError(ws, requestId, 'Cannot consume this producer');
    return;
  }

  try {
    const consumer = await peer.recvTransport.consume({
      producerId,
      rtpCapabilities: peer.rtpCapabilities as Parameters<typeof peer.recvTransport.consume>[0]['rtpCapabilities'],
      paused: true,
    });

    addPeerConsumer(userId, consumer);
    const producerPeerId = findProducerOwner(producerId);

    consumer.on('transportclose', () => {
      log.info({ userId, consumerId: consumer.id }, 'Consumer transport closed');
    });
    consumer.on('producerclose', () => {
      log.info({ userId, consumerId: consumer.id }, 'Consumer producer closed');
      peer.consumers.delete(consumer.id);

      // Notify the consuming client that this producer is gone
      const clientWs = getClients().get(userId);
      if (clientWs && clientWs.readyState === clientWs.OPEN) {
        try {
          clientWs.send(JSON.stringify({
            type: WS_TYPES.VOICE_PRODUCER_CLOSED,
            payload: { producerId, peerId: producerPeerId, kind: consumer.kind },
          }));
        } catch {
          log.debug({ userId }, 'Failed to send producer-closed notification');
        }
      }
    });

    if (requestId) {
      respond(ws, requestId, {
        consumerId: consumer.id,
        producerId,
        kind: consumer.kind,
        rtpParameters: consumer.rtpParameters,
      });
    }
  } catch (err) {
    log.error({ userId, producerId, err: (err as Error).message }, 'Failed to consume');
    if (requestId) respondError(ws, requestId, 'Failed to consume');
  }
}

async function handleConsumerResume(ws: WebSocket, message: WsMessage, userId: string): Promise<void> {
  const { consumerId } = message.payload as { consumerId: string };
  const requestId = message.id;

  const peer = getPeer(userId);
  if (!peer) {
    if (requestId) respondError(ws, requestId, 'Not in a voice channel');
    return;
  }

  const consumer = peer.consumers.get(consumerId);
  if (!consumer) {
    if (requestId) respondError(ws, requestId, 'Consumer not found');
    return;
  }

  try {
    await consumer.resume();
    if (requestId) respond(ws, requestId, {});
  } catch (err) {
    log.error({ userId, consumerId, err: (err as Error).message }, 'Failed to resume consumer');
    if (requestId) respondError(ws, requestId, 'Failed to resume consumer');
  }
}

function handleVoiceState(_ws: WebSocket, message: WsMessage, userId: string): void {
  const payload = message.payload as { userId: string; channelId: string; muted: boolean; deafened: boolean; speaking: boolean };

  // Validate userId matches authenticated user
  if (payload.userId !== userId) {
    return;
  }

  const peer = getPeer(userId);
  if (!peer) {
    return;
  }

  // Broadcast to all other peers in the same channel — fire-and-forget, no storage
  broadcastToChannel(peer.channelId, userId, WS_TYPES.VOICE_STATE, payload);
}

export function handleVoiceDisconnect(userId: string): void {
  const channelId = removePeer(userId);
  if (channelId) {
    broadcastToChannel(channelId, userId, WS_TYPES.VOICE_PEER_LEFT, { userId, channelId });
    log.info({ userId, channelId }, 'Voice cleanup on disconnect');
  }
}

function broadcastToChannel(channelId: string, excludeUserId: string, type: string, payload: unknown): void {
  const peers = getChannelPeers(channelId);
  const clients = getClients();

  for (const peerId of peers) {
    if (peerId === excludeUserId) continue;
    const ws = clients.get(peerId);
    if (ws && ws.readyState === ws.OPEN) {
      try {
        ws.send(JSON.stringify({ type, payload }));
      } catch {
        log.debug({ peerId, type }, 'Failed to broadcast to voice peer');
      }
    }
  }
}
