import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { WsMessage } from 'discord-clone-shared';
import { WS_TYPES } from 'discord-clone-shared';
import { MAX_PARTICIPANTS } from 'discord-clone-shared';
import { clearAllVoiceState, getPeer, getAllPeers, joinVoiceChannel, setPeerTransport, setPeerProducer, setPeerVideoProducer, setPeerRtpCapabilities } from './voiceService.js';

// Mock mediasoupManager
const mockCreateWebRtcTransport = vi.fn();
const mockGetRouter = vi.fn();
const mockGetRouterRtpCapabilities = vi.fn().mockReturnValue({
  codecs: [{ kind: 'audio', mimeType: 'audio/opus', clockRate: 48000, channels: 2 }],
  headerExtensions: [],
});
let capturedWorkerDiedCallback: (() => void) | null = null;

vi.mock('./mediasoupManager.js', () => ({
  createWebRtcTransport: (...args: unknown[]) => mockCreateWebRtcTransport(...args),
  getRouter: () => mockGetRouter(),
  getRouterRtpCapabilities: () => mockGetRouterRtpCapabilities(),
  onWorkerDied: (cb: () => void) => { capturedWorkerDiedCallback = cb; },
}));

// Mock channelService
vi.mock('../channels/channelService.js', () => ({
  getChannelById: vi.fn((_db: unknown, channelId: string) => {
    if (channelId === 'voice-channel-1') return { id: 'voice-channel-1', name: 'Voice', type: 'voice' };
    if (channelId === 'text-channel-1') return { id: 'text-channel-1', name: 'Text', type: 'text' };
    return undefined;
  }),
}));

// Mock wsServer
const mockClients = new Map<string, { readyState: number; OPEN: number; send: ReturnType<typeof vi.fn> }>();
vi.mock('../../ws/wsServer.js', () => ({
  getClients: () => mockClients,
}));

// Mock wsRouter (only the registerHandler — we call handlers directly)
const registeredHandlers = new Map<string, (ws: unknown, message: WsMessage, userId: string) => void>();
vi.mock('../../ws/wsRouter.js', () => ({
  registerHandler: vi.fn((type: string, handler: (ws: unknown, msg: WsMessage, userId: string) => void) => {
    registeredHandlers.set(type, handler);
  }),
  respond: vi.fn((ws: { send: (data: string) => void }, requestId: string, payload: unknown) => {
    ws.send(JSON.stringify({ type: 'response', payload, id: requestId }));
  }),
  respondError: vi.fn((ws: { send: (data: string) => void }, requestId: string, error: string) => {
    ws.send(JSON.stringify({ type: 'error', payload: { error }, id: requestId }));
  }),
}));

import { registerVoiceHandlers, handleVoiceDisconnect } from './voiceWsHandler.js';

function createMockWs() {
  return {
    send: vi.fn(),
    readyState: 1,
    OPEN: 1,
  };
}

function createMockTransport(id = 'transport-1') {
  return {
    id,
    close: vi.fn(),
    connect: vi.fn().mockResolvedValue(undefined),
    produce: vi.fn().mockResolvedValue({
      id: 'producer-1',
      on: vi.fn(),
      close: vi.fn(),
      kind: 'audio',
    }),
    consume: vi.fn().mockResolvedValue({
      id: 'consumer-1',
      kind: 'audio',
      rtpParameters: { codecs: [] },
      on: vi.fn(),
      close: vi.fn(),
      resume: vi.fn().mockResolvedValue(undefined),
    }),
    on: vi.fn(),
    iceParameters: {},
    iceCandidates: [],
    dtlsParameters: {},
  };
}

const mockLogger = {
  info: vi.fn(),
  error: vi.fn(),
  warn: vi.fn(),
  debug: vi.fn(),
  fatal: vi.fn(),
  trace: vi.fn(),
  child: vi.fn(),
  silent: vi.fn(),
  level: 'info',
};

describe('voiceWsHandler', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    clearAllVoiceState();
    registeredHandlers.clear();
    mockClients.clear();
    // Register handlers
    registerVoiceHandlers({} as never, mockLogger as never);
  });

  afterEach(() => {
    clearAllVoiceState();
  });

  it('registers all voice handlers', () => {
    expect(registeredHandlers.has(WS_TYPES.VOICE_JOIN)).toBe(true);
    expect(registeredHandlers.has(WS_TYPES.VOICE_LEAVE)).toBe(true);
    expect(registeredHandlers.has(WS_TYPES.VOICE_CREATE_TRANSPORT)).toBe(true);
    expect(registeredHandlers.has(WS_TYPES.VOICE_CONNECT_TRANSPORT)).toBe(true);
    expect(registeredHandlers.has(WS_TYPES.VOICE_PRODUCE)).toBe(true);
    expect(registeredHandlers.has(WS_TYPES.VOICE_CONSUME)).toBe(true);
    expect(registeredHandlers.has(WS_TYPES.VOICE_CONSUMER_RESUME)).toBe(true);
    expect(registeredHandlers.has(WS_TYPES.VOICE_STATE)).toBe(true);
    expect(registeredHandlers.has(WS_TYPES.VOICE_PRESENCE_SYNC)).toBe(true);
    expect(registeredHandlers.has(WS_TYPES.VOICE_SET_RTP_CAPABILITIES)).toBe(true);
  });

  describe('voice:join', () => {
    it('responds with router capabilities and existing peers', async () => {
      const ws = createMockWs();
      const handler = registeredHandlers.get(WS_TYPES.VOICE_JOIN)!;
      await handler(ws, { type: WS_TYPES.VOICE_JOIN, payload: { channelId: 'voice-channel-1' }, id: 'req-1' }, 'user-1');

      expect(ws.send).toHaveBeenCalled();
      const sent = JSON.parse(ws.send.mock.calls[0][0]);
      expect(sent.type).toBe('response');
      expect(sent.id).toBe('req-1');
      expect(sent.payload.routerRtpCapabilities).toBeDefined();
      expect(sent.payload.existingPeers).toEqual([]);
    });

    it('returns existing peers when others already in channel', async () => {
      joinVoiceChannel('user-1', 'voice-channel-1');

      const ws = createMockWs();
      const handler = registeredHandlers.get(WS_TYPES.VOICE_JOIN)!;
      await handler(ws, { type: WS_TYPES.VOICE_JOIN, payload: { channelId: 'voice-channel-1' }, id: 'req-2' }, 'user-2');

      const sent = JSON.parse(ws.send.mock.calls[0][0]);
      expect(sent.payload.existingPeers).toEqual(['user-1']);
    });

    it('rejects joining a text channel', async () => {
      const ws = createMockWs();
      const handler = registeredHandlers.get(WS_TYPES.VOICE_JOIN)!;
      await handler(ws, { type: WS_TYPES.VOICE_JOIN, payload: { channelId: 'text-channel-1' }, id: 'req-3' }, 'user-1');

      const sent = JSON.parse(ws.send.mock.calls[0][0]);
      expect(sent.type).toBe('error');
      expect(sent.payload.error).toContain('text channel');
    });

    it('rejects non-existent channel', async () => {
      const ws = createMockWs();
      const handler = registeredHandlers.get(WS_TYPES.VOICE_JOIN)!;
      await handler(ws, { type: WS_TYPES.VOICE_JOIN, payload: { channelId: 'nonexistent' }, id: 'req-4' }, 'user-1');

      const sent = JSON.parse(ws.send.mock.calls[0][0]);
      expect(sent.type).toBe('error');
      expect(sent.payload.error).toContain('not found');
    });

    it('rejects when voice channel is full', async () => {
      // Fill channel to MAX_PARTICIPANTS
      for (let i = 0; i < MAX_PARTICIPANTS; i++) {
        joinVoiceChannel(`fill-user-${i}`, 'voice-channel-1');
      }

      const ws = createMockWs();
      const handler = registeredHandlers.get(WS_TYPES.VOICE_JOIN)!;
      await handler(ws, { type: WS_TYPES.VOICE_JOIN, payload: { channelId: 'voice-channel-1' }, id: 'req-full' }, 'overflow-user');

      const sent = JSON.parse(ws.send.mock.calls[0][0]);
      expect(sent.type).toBe('error');
      expect(sent.payload.error).toContain('full');
    });

    it('broadcasts peer-joined to other peers and non-voice-channel clients', async () => {
      joinVoiceChannel('user-1', 'voice-channel-1');
      const otherWs = createMockWs();
      mockClients.set('user-1', otherWs);

      // user-3 is NOT in any voice channel but is connected via WS
      const spectatorWs = createMockWs();
      mockClients.set('user-3', spectatorWs);

      const ws = createMockWs();
      const handler = registeredHandlers.get(WS_TYPES.VOICE_JOIN)!;
      await handler(ws, { type: WS_TYPES.VOICE_JOIN, payload: { channelId: 'voice-channel-1' }, id: 'req-5' }, 'user-2');

      // Other voice peer should receive peer-joined broadcast
      expect(otherWs.send).toHaveBeenCalled();
      const broadcast = JSON.parse(otherWs.send.mock.calls[0][0]);
      expect(broadcast.type).toBe(WS_TYPES.VOICE_PEER_JOINED);
      expect(broadcast.payload.userId).toBe('user-2');

      // Non-voice-channel client should also receive peer-joined broadcast
      expect(spectatorWs.send).toHaveBeenCalled();
      const spectatorBroadcast = JSON.parse(spectatorWs.send.mock.calls[0][0]);
      expect(spectatorBroadcast.type).toBe(WS_TYPES.VOICE_PEER_JOINED);
      expect(spectatorBroadcast.payload.userId).toBe('user-2');
      expect(spectatorBroadcast.payload.channelId).toBe('voice-channel-1');
    });

    it('sends VOICE_NEW_PRODUCER for existing audio and video producers to newly-joined peer', async () => {
      // user-1 is already in channel with producers
      joinVoiceChannel('user-1', 'voice-channel-1');
      const mockAudioProducer = { id: 'audio-prod-1', on: vi.fn(), close: vi.fn(), kind: 'audio' as const };
      const mockVideoProducer = { id: 'video-prod-1', on: vi.fn(), close: vi.fn(), kind: 'video' as const };
      setPeerProducer('user-1', mockAudioProducer as never);
      setPeerVideoProducer('user-1', mockVideoProducer as never);
      const user1Ws = createMockWs();
      mockClients.set('user-1', user1Ws);

      // user-2 joins
      const ws = createMockWs();
      const handler = registeredHandlers.get(WS_TYPES.VOICE_JOIN)!;
      await handler(ws, { type: WS_TYPES.VOICE_JOIN, payload: { channelId: 'voice-channel-1' }, id: 'req-producers' }, 'user-2');

      // user-2's ws should receive VOICE_NEW_PRODUCER for both audio and video
      const sendCalls = ws.send.mock.calls.map((call: unknown[]) => JSON.parse(call[0] as string));
      const newProducerMessages = sendCalls.filter((msg: { type: string }) => msg.type === WS_TYPES.VOICE_NEW_PRODUCER);

      expect(newProducerMessages).toHaveLength(2);

      const audioMsg = newProducerMessages.find((m: { payload: { kind: string } }) => m.payload.kind === 'audio');
      expect(audioMsg).toBeDefined();
      expect(audioMsg.payload.producerId).toBe('audio-prod-1');
      expect(audioMsg.payload.peerId).toBe('user-1');

      const videoMsg = newProducerMessages.find((m: { payload: { kind: string } }) => m.payload.kind === 'video');
      expect(videoMsg).toBeDefined();
      expect(videoMsg.payload.producerId).toBe('video-prod-1');
      expect(videoMsg.payload.peerId).toBe('user-1');
    });
  });

  describe('voice:create-transport', () => {
    it('responds with transport params and ICE servers', async () => {
      joinVoiceChannel('user-1', 'voice-channel-1');

      const mockTransport = createMockTransport();
      mockCreateWebRtcTransport.mockResolvedValue({
        transport: mockTransport,
        transportParams: { id: mockTransport.id, iceParameters: {}, iceCandidates: [], dtlsParameters: {} },
        iceServers: [{ urls: ['stun:127.0.0.1:3478'], username: 'u', credential: 'c' }],
      });

      const ws = createMockWs();
      const handler = registeredHandlers.get(WS_TYPES.VOICE_CREATE_TRANSPORT)!;
      handler(ws, { type: WS_TYPES.VOICE_CREATE_TRANSPORT, payload: { direction: 'send' }, id: 'req-6' }, 'user-1');

      // Wait for async handler
      await vi.waitFor(() => {
        expect(ws.send).toHaveBeenCalled();
      });

      const sent = JSON.parse(ws.send.mock.calls[0][0]);
      expect(sent.type).toBe('response');
      expect(sent.payload.transportParams).toBeDefined();
      expect(sent.payload.iceServers).toBeDefined();
    });

    it('rejects if not in a voice channel', () => {
      const ws = createMockWs();
      const handler = registeredHandlers.get(WS_TYPES.VOICE_CREATE_TRANSPORT)!;
      handler(ws, { type: WS_TYPES.VOICE_CREATE_TRANSPORT, payload: { direction: 'send' }, id: 'req-7' }, 'user-1');

      const sent = JSON.parse(ws.send.mock.calls[0][0]);
      expect(sent.type).toBe('error');
      expect(sent.payload.error).toContain('Not in a voice channel');
    });

    it('rejects duplicate transport for same direction', () => {
      joinVoiceChannel('user-1', 'voice-channel-1');
      const mockTransport = createMockTransport('existing-transport');
      setPeerTransport('user-1', 'send', mockTransport as never);

      const ws = createMockWs();
      const handler = registeredHandlers.get(WS_TYPES.VOICE_CREATE_TRANSPORT)!;
      handler(ws, { type: WS_TYPES.VOICE_CREATE_TRANSPORT, payload: { direction: 'send' }, id: 'req-dup' }, 'user-1');

      const sent = JSON.parse(ws.send.mock.calls[0][0]);
      expect(sent.type).toBe('error');
      expect(sent.payload.error).toContain('already exists');
    });

    it('rejects invalid direction', () => {
      joinVoiceChannel('user-1', 'voice-channel-1');
      const ws = createMockWs();
      const handler = registeredHandlers.get(WS_TYPES.VOICE_CREATE_TRANSPORT)!;
      handler(ws, { type: WS_TYPES.VOICE_CREATE_TRANSPORT, payload: { direction: 'invalid' }, id: 'req-8' }, 'user-1');

      const sent = JSON.parse(ws.send.mock.calls[0][0]);
      expect(sent.type).toBe('error');
    });
  });

  describe('voice:connect-transport', () => {
    it('connects a transport with dtlsParameters', async () => {
      joinVoiceChannel('user-1', 'voice-channel-1');
      const mockTransport = createMockTransport('transport-send');
      setPeerTransport('user-1', 'send', mockTransport as never);

      const ws = createMockWs();
      const handler = registeredHandlers.get(WS_TYPES.VOICE_CONNECT_TRANSPORT)!;
      handler(ws, {
        type: WS_TYPES.VOICE_CONNECT_TRANSPORT,
        payload: { transportId: 'transport-send', dtlsParameters: { fingerprints: [] } },
        id: 'req-9',
      }, 'user-1');

      await vi.waitFor(() => {
        expect(ws.send).toHaveBeenCalled();
      });

      expect(mockTransport.connect).toHaveBeenCalled();
      const sent = JSON.parse(ws.send.mock.calls[0][0]);
      expect(sent.type).toBe('response');
    });

    it('rejects unknown transport id', () => {
      joinVoiceChannel('user-1', 'voice-channel-1');
      const ws = createMockWs();
      const handler = registeredHandlers.get(WS_TYPES.VOICE_CONNECT_TRANSPORT)!;
      handler(ws, {
        type: WS_TYPES.VOICE_CONNECT_TRANSPORT,
        payload: { transportId: 'unknown', dtlsParameters: {} },
        id: 'req-10',
      }, 'user-1');

      const sent = JSON.parse(ws.send.mock.calls[0][0]);
      expect(sent.type).toBe('error');
      expect(sent.payload.error).toContain('Transport not found');
    });
  });

  describe('voice:produce', () => {
    it('responds with producerId and notifies peers', async () => {
      joinVoiceChannel('user-1', 'voice-channel-1');
      joinVoiceChannel('user-2', 'voice-channel-1');

      const mockTransport = createMockTransport('transport-send');
      setPeerTransport('user-1', 'send', mockTransport as never);

      const otherWs = createMockWs();
      mockClients.set('user-2', otherWs);

      const ws = createMockWs();
      const handler = registeredHandlers.get(WS_TYPES.VOICE_PRODUCE)!;
      handler(ws, {
        type: WS_TYPES.VOICE_PRODUCE,
        payload: { transportId: 'transport-send', kind: 'audio', rtpParameters: {} },
        id: 'req-11',
      }, 'user-1');

      await vi.waitFor(() => {
        expect(ws.send).toHaveBeenCalled();
      });

      const sent = JSON.parse(ws.send.mock.calls[0][0]);
      expect(sent.type).toBe('response');
      expect(sent.payload.producerId).toBe('producer-1');

      // Other peer notified
      expect(otherWs.send).toHaveBeenCalled();
      const broadcast = JSON.parse(otherWs.send.mock.calls[0][0]);
      expect(broadcast.type).toBe(WS_TYPES.VOICE_NEW_PRODUCER);
      expect(broadcast.payload.producerId).toBe('producer-1');
      expect(broadcast.payload.peerId).toBe('user-1');
    });

    it('includes kind field in voice:new-producer broadcast', async () => {
      joinVoiceChannel('user-1', 'voice-channel-1');
      joinVoiceChannel('user-2', 'voice-channel-1');

      const mockTransport = createMockTransport('transport-send');
      setPeerTransport('user-1', 'send', mockTransport as never);

      const otherWs = createMockWs();
      mockClients.set('user-2', otherWs);

      const ws = createMockWs();
      const handler = registeredHandlers.get(WS_TYPES.VOICE_PRODUCE)!;
      handler(ws, {
        type: WS_TYPES.VOICE_PRODUCE,
        payload: { transportId: 'transport-send', kind: 'audio', rtpParameters: {} },
        id: 'req-kind-audio',
      }, 'user-1');

      await vi.waitFor(() => {
        expect(otherWs.send).toHaveBeenCalled();
      });

      const broadcast = JSON.parse(otherWs.send.mock.calls[0][0]);
      expect(broadcast.payload.kind).toBe('audio');
    });

    it('produces video and stores via setPeerVideoProducer', async () => {
      joinVoiceChannel('user-1', 'voice-channel-1');

      const mockVideoProducer = {
        id: 'video-producer-1',
        on: vi.fn(),
        close: vi.fn(),
        kind: 'video' as const,
      };
      const mockTransport = createMockTransport('transport-send');
      mockTransport.produce.mockResolvedValue(mockVideoProducer);
      setPeerTransport('user-1', 'send', mockTransport as never);

      const ws = createMockWs();
      const handler = registeredHandlers.get(WS_TYPES.VOICE_PRODUCE)!;
      handler(ws, {
        type: WS_TYPES.VOICE_PRODUCE,
        payload: { transportId: 'transport-send', kind: 'video', rtpParameters: {} },
        id: 'req-video',
      }, 'user-1');

      await vi.waitFor(() => {
        expect(ws.send).toHaveBeenCalled();
      });

      const sent = JSON.parse(ws.send.mock.calls[0][0]);
      expect(sent.type).toBe('response');
      expect(sent.payload.producerId).toBe('video-producer-1');
      expect(getPeer('user-1')!.videoProducer).toBe(mockVideoProducer);
    });

    it('broadcasts voice:new-producer with kind video for video produce', async () => {
      joinVoiceChannel('user-1', 'voice-channel-1');
      joinVoiceChannel('user-2', 'voice-channel-1');

      const mockVideoProducer = {
        id: 'video-producer-1',
        on: vi.fn(),
        close: vi.fn(),
        kind: 'video' as const,
      };
      const mockTransport = createMockTransport('transport-send');
      mockTransport.produce.mockResolvedValue(mockVideoProducer);
      setPeerTransport('user-1', 'send', mockTransport as never);

      const otherWs = createMockWs();
      mockClients.set('user-2', otherWs);

      const ws = createMockWs();
      const handler = registeredHandlers.get(WS_TYPES.VOICE_PRODUCE)!;
      handler(ws, {
        type: WS_TYPES.VOICE_PRODUCE,
        payload: { transportId: 'transport-send', kind: 'video', rtpParameters: {} },
        id: 'req-video-broadcast',
      }, 'user-1');

      await vi.waitFor(() => {
        expect(otherWs.send).toHaveBeenCalled();
      });

      const broadcast = JSON.parse(otherWs.send.mock.calls[0][0]);
      expect(broadcast.type).toBe(WS_TYPES.VOICE_NEW_PRODUCER);
      expect(broadcast.payload.kind).toBe('video');
    });

    it('rejects duplicate audio producer', async () => {
      joinVoiceChannel('user-1', 'voice-channel-1');
      const mockTransport = createMockTransport('transport-send');
      setPeerTransport('user-1', 'send', mockTransport as never);

      // Produce audio first
      const ws = createMockWs();
      const handler = registeredHandlers.get(WS_TYPES.VOICE_PRODUCE)!;
      handler(ws, {
        type: WS_TYPES.VOICE_PRODUCE,
        payload: { transportId: 'transport-send', kind: 'audio', rtpParameters: {} },
        id: 'req-audio-1',
      }, 'user-1');

      await vi.waitFor(() => {
        expect(ws.send).toHaveBeenCalled();
      });

      // Try to produce audio again
      const ws2 = createMockWs();
      handler(ws2, {
        type: WS_TYPES.VOICE_PRODUCE,
        payload: { transportId: 'transport-send', kind: 'audio', rtpParameters: {} },
        id: 'req-dup-audio',
      }, 'user-1');

      const sent = JSON.parse(ws2.send.mock.calls[0][0]);
      expect(sent.type).toBe('error');
      expect(sent.payload.error).toContain('audio producer');
    });

    it('rejects duplicate video producer', async () => {
      joinVoiceChannel('user-1', 'voice-channel-1');
      const mockTransport = createMockTransport('transport-send');
      setPeerTransport('user-1', 'send', mockTransport as never);

      // Set existing video producer
      const existingVideoProducer = { id: 'existing-video', on: vi.fn(), close: vi.fn(), kind: 'video' as const };
      setPeerVideoProducer('user-1', existingVideoProducer as never);

      const ws = createMockWs();
      const handler = registeredHandlers.get(WS_TYPES.VOICE_PRODUCE)!;
      handler(ws, {
        type: WS_TYPES.VOICE_PRODUCE,
        payload: { transportId: 'transport-send', kind: 'video', rtpParameters: {} },
        id: 'req-dup-video',
      }, 'user-1');

      // Should respond with error synchronously (before produce is called)
      const sent = JSON.parse(ws.send.mock.calls[0][0]);
      expect(sent.type).toBe('error');
      expect(sent.payload.error).toContain('video producer');
    });
  });

  describe('voice:consume', () => {
    it('responds with consumer params', async () => {
      joinVoiceChannel('user-1', 'voice-channel-1');
      setPeerRtpCapabilities('user-1', { codecs: [] });
      const mockTransport = createMockTransport('transport-recv');
      setPeerTransport('user-1', 'recv', mockTransport as never);

      mockGetRouter.mockReturnValue({
        canConsume: vi.fn().mockReturnValue(true),
      });

      const ws = createMockWs();
      const handler = registeredHandlers.get(WS_TYPES.VOICE_CONSUME)!;
      handler(ws, {
        type: WS_TYPES.VOICE_CONSUME,
        payload: { producerId: 'producer-1' },
        id: 'req-12',
      }, 'user-1');

      await vi.waitFor(() => {
        expect(ws.send).toHaveBeenCalled();
      });

      const sent = JSON.parse(ws.send.mock.calls[0][0]);
      expect(sent.type).toBe('response');
      expect(sent.payload.consumerId).toBe('consumer-1');
      expect(sent.payload.producerId).toBe('producer-1');
      expect(sent.payload.kind).toBe('audio');
    });

    it('responds with error when canConsume throws', async () => {
      joinVoiceChannel('user-1', 'voice-channel-1');
      const mockTransport = createMockTransport('transport-recv');
      setPeerTransport('user-1', 'recv', mockTransport as never);

      mockGetRouter.mockReturnValue({
        canConsume: vi.fn(() => { throw new Error('Invalid capabilities'); }),
      });

      const ws = createMockWs();
      const handler = registeredHandlers.get(WS_TYPES.VOICE_CONSUME)!;
      handler(ws, {
        type: WS_TYPES.VOICE_CONSUME,
        payload: { producerId: 'producer-1' },
        id: 'req-canconsume-err',
      }, 'user-1');

      await vi.waitFor(() => {
        expect(ws.send).toHaveBeenCalled();
      });

      const sent = JSON.parse(ws.send.mock.calls[0][0]);
      expect(sent.type).toBe('error');
      expect(sent.id).toBe('req-canconsume-err');
      expect(sent.payload.error).toContain('Failed to consume');
    });
  });

  describe('voice:consumer-resume', () => {
    it('resumes a consumer', async () => {
      joinVoiceChannel('user-1', 'voice-channel-1');
      const mockConsumer = {
        id: 'consumer-1',
        close: vi.fn(),
        on: vi.fn(),
        resume: vi.fn().mockResolvedValue(undefined),
        kind: 'audio' as const,
        rtpParameters: {},
      };
      getPeer('user-1')!.consumers.set('consumer-1', mockConsumer as never);

      const ws = createMockWs();
      const handler = registeredHandlers.get(WS_TYPES.VOICE_CONSUMER_RESUME)!;
      handler(ws, {
        type: WS_TYPES.VOICE_CONSUMER_RESUME,
        payload: { consumerId: 'consumer-1' },
        id: 'req-13',
      }, 'user-1');

      await vi.waitFor(() => {
        expect(ws.send).toHaveBeenCalled();
      });

      expect(mockConsumer.resume).toHaveBeenCalled();
      const sent = JSON.parse(ws.send.mock.calls[0][0]);
      expect(sent.type).toBe('response');
    });
  });

  describe('voice:leave', () => {
    it('cleans up and notifies peers and non-voice-channel clients', () => {
      joinVoiceChannel('user-1', 'voice-channel-1');
      joinVoiceChannel('user-2', 'voice-channel-1');

      const otherWs = createMockWs();
      mockClients.set('user-2', otherWs);

      // user-3 is NOT in any voice channel but is connected via WS
      const spectatorWs = createMockWs();
      mockClients.set('user-3', spectatorWs);

      const ws = createMockWs();
      const handler = registeredHandlers.get(WS_TYPES.VOICE_LEAVE)!;
      handler(ws, { type: WS_TYPES.VOICE_LEAVE, payload: {}, id: 'req-14' }, 'user-1');

      const sent = JSON.parse(ws.send.mock.calls[0][0]);
      expect(sent.type).toBe('response');
      expect(getPeer('user-1')).toBeUndefined();

      // Other voice peer notified
      expect(otherWs.send).toHaveBeenCalled();
      const broadcast = JSON.parse(otherWs.send.mock.calls[0][0]);
      expect(broadcast.type).toBe(WS_TYPES.VOICE_PEER_LEFT);

      // Non-voice-channel client also receives VOICE_PEER_LEFT
      expect(spectatorWs.send).toHaveBeenCalled();
      const spectatorBroadcast = JSON.parse(spectatorWs.send.mock.calls[0][0]);
      expect(spectatorBroadcast.type).toBe(WS_TYPES.VOICE_PEER_LEFT);
      expect(spectatorBroadcast.payload.userId).toBe('user-1');
    });
  });

  describe('Worker death cleanup', () => {
    it('clears all voice state and broadcasts peer-left on Worker death', () => {
      joinVoiceChannel('user-1', 'voice-channel-1');
      joinVoiceChannel('user-2', 'voice-channel-1');

      const ws1 = createMockWs();
      const ws2 = createMockWs();
      mockClients.set('user-1', ws1);
      mockClients.set('user-2', ws2);

      // user-3 is NOT in any voice channel but is connected via WS
      const spectatorWs = createMockWs();
      mockClients.set('user-3', spectatorWs);

      // Trigger Worker death callback
      expect(capturedWorkerDiedCallback).not.toBeNull();
      capturedWorkerDiedCallback!();

      // All peers should be cleared
      expect(getPeer('user-1')).toBeUndefined();
      expect(getPeer('user-2')).toBeUndefined();
      expect(getAllPeers().size).toBe(0);

      // Both peers should have received peer-left broadcasts (each gets the other's departure)
      expect(ws2.send).toHaveBeenCalled();
      const broadcast2 = JSON.parse(ws2.send.mock.calls[0][0]);
      expect(broadcast2.type).toBe(WS_TYPES.VOICE_PEER_LEFT);
      expect(broadcast2.payload.userId).toBe('user-1');

      // Non-voice-channel client should also receive peer-left broadcasts
      expect(spectatorWs.send).toHaveBeenCalled();
      const spectatorMessages = spectatorWs.send.mock.calls.map(
        (call: unknown[]) => JSON.parse(call[0] as string),
      );
      const peerLeftMessages = spectatorMessages.filter(
        (msg: { type: string }) => msg.type === WS_TYPES.VOICE_PEER_LEFT,
      );
      expect(peerLeftMessages.length).toBeGreaterThanOrEqual(1);
    });
  });

  describe('handleVoiceDisconnect', () => {
    it('cleans up voice state on WS disconnect', () => {
      joinVoiceChannel('user-1', 'voice-channel-1');
      joinVoiceChannel('user-2', 'voice-channel-1');

      const otherWs = createMockWs();
      mockClients.set('user-2', otherWs);

      handleVoiceDisconnect('user-1');

      expect(getPeer('user-1')).toBeUndefined();
      // Other peer should get peer-left
      expect(otherWs.send).toHaveBeenCalled();
      const broadcast = JSON.parse(otherWs.send.mock.calls[0][0]);
      expect(broadcast.type).toBe(WS_TYPES.VOICE_PEER_LEFT);
    });

    it('does nothing for user not in voice', () => {
      // Should not throw
      handleVoiceDisconnect('nonexistent');
    });
  });

  describe('voice:presence-sync', () => {
    it('returns all active voice peers', () => {
      joinVoiceChannel('user-1', 'voice-channel-1');
      joinVoiceChannel('user-2', 'voice-channel-1');

      const ws = createMockWs();
      const handler = registeredHandlers.get(WS_TYPES.VOICE_PRESENCE_SYNC)!;
      handler(ws, { type: WS_TYPES.VOICE_PRESENCE_SYNC, payload: {}, id: 'req-sync-1' }, 'user-3');

      expect(ws.send).toHaveBeenCalled();
      const sent = JSON.parse(ws.send.mock.calls[0][0]);
      expect(sent.type).toBe('response');
      expect(sent.id).toBe('req-sync-1');
      expect(sent.payload.participants).toHaveLength(2);
      expect(sent.payload.participants).toEqual(
        expect.arrayContaining([
          { userId: 'user-1', channelId: 'voice-channel-1' },
          { userId: 'user-2', channelId: 'voice-channel-1' },
        ]),
      );
    });

    it('returns empty list when no peers', () => {
      const ws = createMockWs();
      const handler = registeredHandlers.get(WS_TYPES.VOICE_PRESENCE_SYNC)!;
      handler(ws, { type: WS_TYPES.VOICE_PRESENCE_SYNC, payload: {}, id: 'req-sync-2' }, 'user-1');

      expect(ws.send).toHaveBeenCalled();
      const sent = JSON.parse(ws.send.mock.calls[0][0]);
      expect(sent.type).toBe('response');
      expect(sent.payload.participants).toEqual([]);
    });
  });

  describe('voice:set-rtp-capabilities', () => {
    it('updates peer rtpCapabilities', () => {
      joinVoiceChannel('user-1', 'voice-channel-1');

      const ws = createMockWs();
      const handler = registeredHandlers.get(WS_TYPES.VOICE_SET_RTP_CAPABILITIES)!;
      handler(ws, {
        type: WS_TYPES.VOICE_SET_RTP_CAPABILITIES,
        payload: { rtpCapabilities: { codecs: [] } },
        id: 'req-rtp-1',
      }, 'user-1');

      expect(ws.send).toHaveBeenCalled();
      const sent = JSON.parse(ws.send.mock.calls[0][0]);
      expect(sent.type).toBe('response');
      expect(getPeer('user-1')!.rtpCapabilities).toEqual({ codecs: [] });
    });

    it('rejects if not in a voice channel', () => {
      const ws = createMockWs();
      const handler = registeredHandlers.get(WS_TYPES.VOICE_SET_RTP_CAPABILITIES)!;
      handler(ws, {
        type: WS_TYPES.VOICE_SET_RTP_CAPABILITIES,
        payload: { rtpCapabilities: { codecs: [] } },
        id: 'req-rtp-2',
      }, 'user-1');

      expect(ws.send).toHaveBeenCalled();
      const sent = JSON.parse(ws.send.mock.calls[0][0]);
      expect(sent.type).toBe('error');
      expect(sent.payload.error).toContain('Not in a voice channel');
    });

    it('rejects null rtpCapabilities', () => {
      joinVoiceChannel('user-1', 'voice-channel-1');

      const ws = createMockWs();
      const handler = registeredHandlers.get(WS_TYPES.VOICE_SET_RTP_CAPABILITIES)!;
      handler(ws, {
        type: WS_TYPES.VOICE_SET_RTP_CAPABILITIES,
        payload: { rtpCapabilities: null },
        id: 'req-rtp-null',
      }, 'user-1');

      expect(ws.send).toHaveBeenCalled();
      const sent = JSON.parse(ws.send.mock.calls[0][0]);
      expect(sent.type).toBe('error');
      expect(sent.payload.error).toContain('non-null object');
    });

    it('rejects primitive rtpCapabilities', () => {
      joinVoiceChannel('user-1', 'voice-channel-1');

      const ws = createMockWs();
      const handler = registeredHandlers.get(WS_TYPES.VOICE_SET_RTP_CAPABILITIES)!;
      handler(ws, {
        type: WS_TYPES.VOICE_SET_RTP_CAPABILITIES,
        payload: { rtpCapabilities: 'not-an-object' },
        id: 'req-rtp-string',
      }, 'user-1');

      expect(ws.send).toHaveBeenCalled();
      const sent = JSON.parse(ws.send.mock.calls[0][0]);
      expect(sent.type).toBe('error');
      expect(sent.payload.error).toContain('non-null object');
    });
  });

  describe('voice:state', () => {
    it('broadcasts to channel peers', () => {
      joinVoiceChannel('user-1', 'voice-channel-1');
      joinVoiceChannel('user-2', 'voice-channel-1');

      const otherWs = createMockWs();
      mockClients.set('user-2', otherWs);

      const ws = createMockWs();
      const handler = registeredHandlers.get(WS_TYPES.VOICE_STATE)!;
      handler(ws, {
        type: WS_TYPES.VOICE_STATE,
        payload: { userId: 'user-1', channelId: 'voice-channel-1', muted: true, deafened: false, speaking: false },
      }, 'user-1');

      expect(otherWs.send).toHaveBeenCalled();
      const broadcast = JSON.parse(otherWs.send.mock.calls[0][0]);
      expect(broadcast.type).toBe(WS_TYPES.VOICE_STATE);
      expect(broadcast.payload.userId).toBe('user-1');
      expect(broadcast.payload.muted).toBe(true);
    });

    it('validates userId matches authenticated user', () => {
      joinVoiceChannel('user-1', 'voice-channel-1');
      joinVoiceChannel('user-2', 'voice-channel-1');

      const otherWs = createMockWs();
      mockClients.set('user-2', otherWs);

      const ws = createMockWs();
      const handler = registeredHandlers.get(WS_TYPES.VOICE_STATE)!;
      // user-1 trying to send state as user-2
      handler(ws, {
        type: WS_TYPES.VOICE_STATE,
        payload: { userId: 'user-2', channelId: 'voice-channel-1', muted: true, deafened: false, speaking: false },
      }, 'user-1');

      // Should NOT broadcast (userId mismatch)
      expect(otherWs.send).not.toHaveBeenCalled();
    });

    it('excludes sender from broadcast', () => {
      joinVoiceChannel('user-1', 'voice-channel-1');
      joinVoiceChannel('user-2', 'voice-channel-1');

      const senderWs = createMockWs();
      const otherWs = createMockWs();
      mockClients.set('user-1', senderWs);
      mockClients.set('user-2', otherWs);

      const handler = registeredHandlers.get(WS_TYPES.VOICE_STATE)!;
      handler(senderWs, {
        type: WS_TYPES.VOICE_STATE,
        payload: { userId: 'user-1', channelId: 'voice-channel-1', muted: true, deafened: false, speaking: false },
      }, 'user-1');

      // Sender should NOT receive their own broadcast
      // senderWs.send is not called by broadcastToChannel (it excludes userId)
      expect(otherWs.send).toHaveBeenCalled();
      // Check senderWs was not called by the broadcast (it may be called by respond, but broadcastToChannel skips it)
      const senderCalls = senderWs.send.mock.calls.filter((call: unknown[]) => {
        const parsed = JSON.parse(call[0] as string);
        return parsed.type === WS_TYPES.VOICE_STATE;
      });
      expect(senderCalls).toHaveLength(0);
    });
  });
});
