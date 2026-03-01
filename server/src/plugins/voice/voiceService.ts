import type { WebRtcTransport, Producer, Consumer } from 'mediasoup/types';
import { MAX_PARTICIPANTS } from 'discord-clone-shared';

export interface VoicePeer {
  userId: string;
  channelId: string;
  rtpCapabilities: unknown;
  sendTransport: WebRtcTransport | null;
  recvTransport: WebRtcTransport | null;
  producer: Producer | null;
  videoProducer: Producer | null;
  consumers: Map<string, Consumer>;
}

const voicePeers = new Map<string, VoicePeer>();

export function joinVoiceChannel(
  userId: string,
  channelId: string,
  rtpCapabilities: unknown,
): string[] | null {
  // If already in a voice channel, leave it first
  if (voicePeers.has(userId)) {
    leaveVoiceChannel(userId);
  }

  // Enforce participant limit
  const currentPeers = getChannelPeers(channelId);
  if (currentPeers.length >= MAX_PARTICIPANTS) {
    return null;
  }

  const peer: VoicePeer = {
    userId,
    channelId,
    rtpCapabilities,
    sendTransport: null,
    recvTransport: null,
    producer: null,
    videoProducer: null,
    consumers: new Map(),
  };
  voicePeers.set(userId, peer);

  // Return existing peers in the channel (excluding the joining user)
  const existingPeers: string[] = [];
  for (const [id, p] of voicePeers) {
    if (p.channelId === channelId && id !== userId) {
      existingPeers.push(id);
    }
  }
  return existingPeers;
}

export function leaveVoiceChannel(userId: string): string | null {
  const peer = voicePeers.get(userId);
  if (!peer) return null;

  const channelId = peer.channelId;
  cleanupPeer(peer);
  voicePeers.delete(userId);
  return channelId;
}

export function getChannelPeers(channelId: string): string[] {
  const peers: string[] = [];
  for (const [, p] of voicePeers) {
    if (p.channelId === channelId) {
      peers.push(p.userId);
    }
  }
  return peers;
}

export function getPeer(userId: string): VoicePeer | undefined {
  return voicePeers.get(userId);
}

export function setPeerTransport(
  userId: string,
  direction: 'send' | 'recv',
  transport: WebRtcTransport,
): void {
  const peer = voicePeers.get(userId);
  if (!peer) throw new Error(`Voice peer not found: ${userId}`);

  if (direction === 'send') {
    peer.sendTransport = transport;
  } else {
    peer.recvTransport = transport;
  }
}

export function setPeerProducer(userId: string, producer: Producer): void {
  const peer = voicePeers.get(userId);
  if (!peer) throw new Error(`Voice peer not found: ${userId}`);
  peer.producer = producer;
}

export function setPeerVideoProducer(userId: string, producer: Producer): void {
  const peer = voicePeers.get(userId);
  if (!peer) throw new Error(`Voice peer not found: ${userId}`);
  peer.videoProducer = producer;
}

export function setPeerRtpCapabilities(userId: string, rtpCapabilities: unknown): void {
  const peer = voicePeers.get(userId);
  if (!peer) throw new Error(`Voice peer not found: ${userId}`);
  peer.rtpCapabilities = rtpCapabilities;
}

export function addPeerConsumer(userId: string, consumer: Consumer): void {
  const peer = voicePeers.get(userId);
  if (!peer) throw new Error(`Voice peer not found: ${userId}`);
  peer.consumers.set(consumer.id, consumer);
}

export function removePeer(userId: string): string | null {
  return leaveVoiceChannel(userId);
}

export function findProducerOwner(producerId: string): string | null {
  for (const [userId, peer] of voicePeers) {
    if (peer.producer?.id === producerId) return userId;
    if (peer.videoProducer?.id === producerId) return userId;
  }
  return null;
}

export function getAllPeers(): Map<string, VoicePeer> {
  return voicePeers;
}

export function clearAllVoiceState(): void {
  for (const [, peer] of voicePeers) {
    cleanupPeer(peer);
  }
  voicePeers.clear();
}

function cleanupPeer(peer: VoicePeer): void {
  // Close all consumers
  for (const [, consumer] of peer.consumers) {
    try { consumer.close(); } catch { /* already closed */ }
  }
  peer.consumers.clear();

  // Close producer
  if (peer.producer) {
    try { peer.producer.close(); } catch { /* already closed */ }
    peer.producer = null;
  }

  // Close video producer
  if (peer.videoProducer) {
    try { peer.videoProducer.close(); } catch { /* already closed */ }
    peer.videoProducer = null;
  }

  // Close transports
  if (peer.sendTransport) {
    try { peer.sendTransport.close(); } catch { /* already closed */ }
    peer.sendTransport = null;
  }
  if (peer.recvTransport) {
    try { peer.recvTransport.close(); } catch { /* already closed */ }
    peer.recvTransport = null;
  }
}
