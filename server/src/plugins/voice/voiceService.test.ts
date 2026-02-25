import { describe, it, expect, beforeEach, vi } from 'vitest';
import { MAX_PARTICIPANTS } from 'discord-clone-shared';
import {
  joinVoiceChannel,
  leaveVoiceChannel,
  getChannelPeers,
  getPeer,
  getAllPeers,
  findProducerOwner,
  setPeerTransport,
  setPeerProducer,
  addPeerConsumer,
  removePeer,
  clearAllVoiceState,
} from './voiceService.js';

// Mock mediasoup objects
function createMockTransport() {
  return {
    id: `transport-${Math.random()}`,
    close: vi.fn(),
    connect: vi.fn(),
    produce: vi.fn(),
    consume: vi.fn(),
    on: vi.fn(),
    iceParameters: {},
    iceCandidates: [],
    dtlsParameters: {},
  } as unknown as import('mediasoup/types').WebRtcTransport;
}

function createMockProducer() {
  return {
    id: `producer-${Math.random()}`,
    close: vi.fn(),
    on: vi.fn(),
    kind: 'audio' as const,
  } as unknown as import('mediasoup/types').Producer;
}

function createMockConsumer(id?: string) {
  return {
    id: id || `consumer-${Math.random()}`,
    close: vi.fn(),
    on: vi.fn(),
    resume: vi.fn(),
    kind: 'audio' as const,
    rtpParameters: {},
  } as unknown as import('mediasoup/types').Consumer;
}

describe('voiceService', () => {
  beforeEach(() => {
    clearAllVoiceState();
  });

  describe('joinVoiceChannel', () => {
    it('adds a peer and returns empty existing peers for first join', () => {
      const existingPeers = joinVoiceChannel('user-1', 'channel-1', null);
      expect(existingPeers).toEqual([]);
      expect(getPeer('user-1')).toBeDefined();
      expect(getPeer('user-1')!.channelId).toBe('channel-1');
    });

    it('returns existing peers when joining a channel with other users', () => {
      joinVoiceChannel('user-1', 'channel-1', null);
      const existingPeers = joinVoiceChannel('user-2', 'channel-1', null);
      expect(existingPeers).toEqual(['user-1']);
    });

    it('leaves previous channel when joining a new one (double-join)', () => {
      joinVoiceChannel('user-1', 'channel-1', null);
      joinVoiceChannel('user-1', 'channel-2', null);

      expect(getPeer('user-1')!.channelId).toBe('channel-2');
      expect(getChannelPeers('channel-1')).toEqual([]);
      expect(getChannelPeers('channel-2')).toContain('user-1');
    });

    it('returns null when channel is at MAX_PARTICIPANTS', () => {
      for (let i = 0; i < MAX_PARTICIPANTS; i++) {
        joinVoiceChannel(`user-${i}`, 'channel-1', null);
      }
      const result = joinVoiceChannel('user-overflow', 'channel-1', null);
      expect(result).toBeNull();
      expect(getPeer('user-overflow')).toBeUndefined();
    });

    it('stores rtpCapabilities on join', () => {
      const caps = { codecs: [] };
      joinVoiceChannel('user-1', 'channel-1', caps);
      expect(getPeer('user-1')!.rtpCapabilities).toBe(caps);
    });
  });

  describe('leaveVoiceChannel', () => {
    it('removes peer and returns channelId', () => {
      joinVoiceChannel('user-1', 'channel-1', null);
      const channelId = leaveVoiceChannel('user-1');
      expect(channelId).toBe('channel-1');
      expect(getPeer('user-1')).toBeUndefined();
    });

    it('closes transports/producers/consumers on leave', () => {
      joinVoiceChannel('user-1', 'channel-1', null);
      const transport = createMockTransport();
      const producer = createMockProducer();
      const consumer = createMockConsumer();

      setPeerTransport('user-1', 'send', transport);
      setPeerProducer('user-1', producer);
      addPeerConsumer('user-1', consumer);

      leaveVoiceChannel('user-1');

      expect(transport.close).toHaveBeenCalled();
      expect(producer.close).toHaveBeenCalled();
      expect(consumer.close).toHaveBeenCalled();
    });

    it('returns null for non-existent user', () => {
      const result = leaveVoiceChannel('nonexistent');
      expect(result).toBeNull();
    });
  });

  describe('getChannelPeers', () => {
    it('returns correct user list for a channel', () => {
      joinVoiceChannel('user-1', 'channel-1', null);
      joinVoiceChannel('user-2', 'channel-1', null);
      joinVoiceChannel('user-3', 'channel-2', null);

      const peers = getChannelPeers('channel-1');
      expect(peers).toHaveLength(2);
      expect(peers).toContain('user-1');
      expect(peers).toContain('user-2');
    });

    it('returns empty array for empty channel', () => {
      expect(getChannelPeers('empty-channel')).toEqual([]);
    });

    it('returns empty after all leave', () => {
      joinVoiceChannel('user-1', 'channel-1', null);
      leaveVoiceChannel('user-1');
      expect(getChannelPeers('channel-1')).toEqual([]);
    });
  });

  describe('setPeerTransport', () => {
    it('stores send transport', () => {
      joinVoiceChannel('user-1', 'channel-1', null);
      const transport = createMockTransport();
      setPeerTransport('user-1', 'send', transport);
      expect(getPeer('user-1')!.sendTransport).toBe(transport);
    });

    it('stores recv transport', () => {
      joinVoiceChannel('user-1', 'channel-1', null);
      const transport = createMockTransport();
      setPeerTransport('user-1', 'recv', transport);
      expect(getPeer('user-1')!.recvTransport).toBe(transport);
    });

    it('throws for non-existent user', () => {
      const transport = createMockTransport();
      expect(() => setPeerTransport('nonexistent', 'send', transport)).toThrow('Voice peer not found');
    });
  });

  describe('setPeerProducer', () => {
    it('stores producer', () => {
      joinVoiceChannel('user-1', 'channel-1', null);
      const producer = createMockProducer();
      setPeerProducer('user-1', producer);
      expect(getPeer('user-1')!.producer).toBe(producer);
    });

    it('throws for non-existent user', () => {
      const producer = createMockProducer();
      expect(() => setPeerProducer('nonexistent', producer)).toThrow('Voice peer not found');
    });
  });

  describe('addPeerConsumer', () => {
    it('adds consumer to peer', () => {
      joinVoiceChannel('user-1', 'channel-1', null);
      const consumer = createMockConsumer('consumer-1');
      addPeerConsumer('user-1', consumer);
      expect(getPeer('user-1')!.consumers.get('consumer-1')).toBe(consumer);
    });

    it('throws for non-existent user', () => {
      const consumer = createMockConsumer();
      expect(() => addPeerConsumer('nonexistent', consumer)).toThrow('Voice peer not found');
    });
  });

  describe('removePeer', () => {
    it('fully cleans up on disconnect', () => {
      joinVoiceChannel('user-1', 'channel-1', null);
      const transport = createMockTransport();
      setPeerTransport('user-1', 'send', transport);

      const channelId = removePeer('user-1');
      expect(channelId).toBe('channel-1');
      expect(getPeer('user-1')).toBeUndefined();
      expect(transport.close).toHaveBeenCalled();
    });
  });

  describe('getAllPeers', () => {
    it('returns the internal peers map', () => {
      joinVoiceChannel('user-1', 'channel-1', null);
      joinVoiceChannel('user-2', 'channel-1', null);
      const peers = getAllPeers();
      expect(peers.size).toBe(2);
      expect(peers.has('user-1')).toBe(true);
      expect(peers.has('user-2')).toBe(true);
    });
  });

  describe('findProducerOwner', () => {
    it('returns userId of the peer who owns the producer', () => {
      joinVoiceChannel('user-1', 'channel-1', null);
      const producer = createMockProducer();
      (producer as unknown as { id: string }).id = 'producer-abc';
      setPeerProducer('user-1', producer);
      expect(findProducerOwner('producer-abc')).toBe('user-1');
    });

    it('returns null for unknown producerId', () => {
      expect(findProducerOwner('nonexistent')).toBeNull();
    });
  });

  describe('clearAllVoiceState', () => {
    it('removes all peers and closes resources', () => {
      joinVoiceChannel('user-1', 'channel-1', null);
      joinVoiceChannel('user-2', 'channel-1', null);
      const transport = createMockTransport();
      setPeerTransport('user-1', 'send', transport);

      clearAllVoiceState();

      expect(getPeer('user-1')).toBeUndefined();
      expect(getPeer('user-2')).toBeUndefined();
      expect(getChannelPeers('channel-1')).toEqual([]);
      expect(transport.close).toHaveBeenCalled();
    });
  });
});
