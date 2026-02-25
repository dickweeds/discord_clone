import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const mockLoad = vi.fn();
const mockCreateSendTransport = vi.fn();
const mockCreateRecvTransport = vi.fn();

vi.mock('mediasoup-client', () => {
  const MockDevice = vi.fn(function (this: Record<string, unknown>) {
    this.load = mockLoad;
    this.rtpCapabilities = { codecs: [] };
    this.createSendTransport = mockCreateSendTransport;
    this.createRecvTransport = mockCreateRecvTransport;
  });
  return { Device: MockDevice };
});

vi.mock('./wsClient', () => ({
  wsClient: {
    request: vi.fn().mockResolvedValue({ producerId: 'producer-1' }),
  },
}));

import {
  initDevice,
  getDevice,
  createSendTransport,
  createRecvTransport,
  produceAudio,
  consumeAudio,
  getRecvTransport,
  getConsumers,
  removeConsumerByProducerId,
  cleanup,
  muteAudio,
  unmuteAudio,
  deafenAudio,
  undeafenAudio,
  getLocalStream,
} from './mediaService';

// Store originals for cleanup
const originalNavigator = globalThis.navigator;
const originalAudio = globalThis.Audio;
const originalMediaStream = globalThis.MediaStream;

function makeMockTransport(id: string) {
  return {
    id,
    on: vi.fn(),
    produce: vi.fn().mockResolvedValue({
      id: 'producer-id',
      track: null,
      on: vi.fn(),
      close: vi.fn(),
    }),
    consume: vi.fn().mockResolvedValue({
      id: 'consumer-id',
      producerId: 'producer-1',
      track: { kind: 'audio' },
      on: vi.fn(),
      close: vi.fn(),
      resume: vi.fn(),
    }),
    connect: vi.fn(),
    close: vi.fn(),
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  cleanup();
});

afterEach(() => {
  // Restore global mocks to prevent leaking into other test files
  Object.defineProperty(globalThis, 'navigator', {
    value: originalNavigator,
    writable: true,
    configurable: true,
  });
  globalThis.Audio = originalAudio;
  globalThis.MediaStream = originalMediaStream;
});

describe('mediaService', () => {
  describe('initDevice', () => {
    it('creates a new Device and loads routerRtpCapabilities', async () => {
      const caps = { codecs: [{ mimeType: 'audio/opus' }] };
      await initDevice(caps as Parameters<typeof initDevice>[0]);
      expect(mockLoad).toHaveBeenCalledWith({ routerRtpCapabilities: caps });
    });

    it('returns the device', async () => {
      const device = await initDevice({ codecs: [] } as Parameters<typeof initDevice>[0]);
      expect(device).toBeDefined();
      expect(getDevice()).toBe(device);
    });
  });

  describe('createSendTransport', () => {
    it('creates send transport with correct params', async () => {
      const transport = makeMockTransport('send-1');
      mockCreateSendTransport.mockReturnValue(transport);

      await initDevice({ codecs: [] } as Parameters<typeof initDevice>[0]);

      const params = {
        id: 'send-1',
        iceParameters: {},
        iceCandidates: [],
        dtlsParameters: {},
      } as unknown as Parameters<typeof createSendTransport>[0];

      const result = createSendTransport(params, []);

      expect(mockCreateSendTransport).toHaveBeenCalledWith({
        id: 'send-1',
        iceParameters: {},
        iceCandidates: [],
        dtlsParameters: {},
        iceServers: [],
      });
      expect(result).toBe(transport);
    });

    it('throws if device not initialized', () => {
      expect(() =>
        createSendTransport(
          { id: 'x', iceParameters: {}, iceCandidates: [], dtlsParameters: {} } as unknown as Parameters<typeof createSendTransport>[0],
          [],
        ),
      ).toThrow('Device not initialized');
    });

    it('wires connect and produce event handlers', async () => {
      const transport = makeMockTransport('send-1');
      mockCreateSendTransport.mockReturnValue(transport);
      await initDevice({ codecs: [] } as Parameters<typeof initDevice>[0]);

      createSendTransport(
        { id: 'send-1', iceParameters: {}, iceCandidates: [], dtlsParameters: {} } as unknown as Parameters<typeof createSendTransport>[0],
        [],
      );

      expect(transport.on).toHaveBeenCalledWith('connect', expect.any(Function));
      expect(transport.on).toHaveBeenCalledWith('produce', expect.any(Function));
    });
  });

  describe('createRecvTransport', () => {
    it('creates recv transport with correct params', async () => {
      const transport = makeMockTransport('recv-1');
      mockCreateRecvTransport.mockReturnValue(transport);

      await initDevice({ codecs: [] } as Parameters<typeof initDevice>[0]);

      const params = {
        id: 'recv-1',
        iceParameters: {},
        iceCandidates: [],
        dtlsParameters: {},
      } as unknown as Parameters<typeof createRecvTransport>[0];

      const result = createRecvTransport(params, []);

      expect(mockCreateRecvTransport).toHaveBeenCalledWith({
        id: 'recv-1',
        iceParameters: {},
        iceCandidates: [],
        dtlsParameters: {},
        iceServers: [],
      });
      expect(result).toBe(transport);
    });

    it('throws if device not initialized', () => {
      expect(() =>
        createRecvTransport(
          { id: 'x', iceParameters: {}, iceCandidates: [], dtlsParameters: {} } as unknown as Parameters<typeof createRecvTransport>[0],
          [],
        ),
      ).toThrow('Device not initialized');
    });

    it('wires connect event handler', async () => {
      const transport = makeMockTransport('recv-1');
      mockCreateRecvTransport.mockReturnValue(transport);
      await initDevice({ codecs: [] } as Parameters<typeof initDevice>[0]);

      createRecvTransport(
        { id: 'recv-1', iceParameters: {}, iceCandidates: [], dtlsParameters: {} } as unknown as Parameters<typeof createRecvTransport>[0],
        [],
      );

      expect(transport.on).toHaveBeenCalledWith('connect', expect.any(Function));
    });
  });

  describe('produceAudio', () => {
    it('calls getUserMedia and produces on transport', async () => {
      const mockTrack = { kind: 'audio', stop: vi.fn() };
      const mockStream = { getAudioTracks: () => [mockTrack], getTracks: () => [mockTrack] };
      Object.defineProperty(globalThis, 'navigator', {
        value: {
          mediaDevices: {
            getUserMedia: vi.fn().mockResolvedValue(mockStream),
          },
        },
        writable: true,
        configurable: true,
      });

      const transport = makeMockTransport('send-1');
      mockCreateSendTransport.mockReturnValue(transport);
      await initDevice({ codecs: [] } as Parameters<typeof initDevice>[0]);
      createSendTransport(
        { id: 'send-1', iceParameters: {}, iceCandidates: [], dtlsParameters: {} } as unknown as Parameters<typeof createSendTransport>[0],
        [],
      );

      const result = await produceAudio(transport as unknown as Parameters<typeof produceAudio>[0]);

      expect(navigator.mediaDevices.getUserMedia).toHaveBeenCalledWith({ audio: true });
      expect(transport.produce).toHaveBeenCalledWith({ track: mockTrack });
      expect(result.producer).toBeDefined();
      expect(result.stream).toBe(mockStream);
    });
  });

  describe('consumeAudio', () => {
    it('creates consumer and plays audio', async () => {
      const mockPlay = vi.fn().mockResolvedValue(undefined);
      globalThis.Audio = function MockAudio(this: Record<string, unknown>) {
        this.play = mockPlay;
        this.pause = vi.fn();
        this.srcObject = null;
      } as unknown as typeof Audio;

      globalThis.MediaStream = function MockMediaStream() {
        return {};
      } as unknown as typeof MediaStream;

      const transport = makeMockTransport('recv-1');

      const consumer = await consumeAudio(
        transport as unknown as Parameters<typeof consumeAudio>[0],
        {
          consumerId: 'c-1',
          producerId: 'p-1',
          kind: 'audio',
          rtpParameters: {} as Parameters<typeof consumeAudio>[1]['rtpParameters'],
        },
      );

      expect(transport.consume).toHaveBeenCalledWith({
        id: 'c-1',
        producerId: 'p-1',
        kind: 'audio',
        rtpParameters: {},
      });
      expect(mockPlay).toHaveBeenCalled();
      expect(consumer).toBeDefined();
    });
  });

  describe('getRecvTransport', () => {
    it('returns null when no recv transport exists', () => {
      expect(getRecvTransport()).toBeNull();
    });

    it('returns the recv transport after creation', async () => {
      const transport = makeMockTransport('recv-1');
      mockCreateRecvTransport.mockReturnValue(transport);
      await initDevice({ codecs: [] } as Parameters<typeof initDevice>[0]);

      const result = createRecvTransport(
        { id: 'recv-1', iceParameters: {}, iceCandidates: [], dtlsParameters: {} } as unknown as Parameters<typeof createRecvTransport>[0],
        [],
      );

      expect(getRecvTransport()).toBe(result);
    });
  });

  describe('getConsumers', () => {
    it('returns empty map initially', () => {
      expect(getConsumers().size).toBe(0);
    });
  });

  describe('removeConsumerByProducerId', () => {
    function setupAudioMocks() {
      const mockPlay = vi.fn().mockResolvedValue(undefined);
      globalThis.Audio = function MockAudio(this: Record<string, unknown>) {
        this.play = mockPlay;
        this.pause = vi.fn();
        this.srcObject = null;
      } as unknown as typeof Audio;

      globalThis.MediaStream = function MockMediaStream() {
        return {};
      } as unknown as typeof MediaStream;
    }

    it('removes consumer matching the producerId', async () => {
      setupAudioMocks();

      // Create a transport mock whose consume returns the target producerId
      const transport = {
        ...makeMockTransport('recv-1'),
        consume: vi.fn().mockResolvedValue({
          id: 'consumer-id',
          producerId: 'target-producer',
          track: { kind: 'audio' },
          on: vi.fn(),
          close: vi.fn(),
          resume: vi.fn(),
        }),
      };

      await consumeAudio(
        transport as unknown as Parameters<typeof consumeAudio>[0],
        {
          consumerId: 'c-1',
          producerId: 'target-producer',
          kind: 'audio',
          rtpParameters: {} as Parameters<typeof consumeAudio>[1]['rtpParameters'],
        },
      );

      expect(getConsumers().size).toBe(1);

      removeConsumerByProducerId('target-producer');

      expect(getConsumers().size).toBe(0);
    });

    it('is a no-op when producerId does not match', async () => {
      setupAudioMocks();

      const transport = makeMockTransport('recv-1');

      await consumeAudio(
        transport as unknown as Parameters<typeof consumeAudio>[0],
        {
          consumerId: 'c-1',
          producerId: 'some-producer',
          kind: 'audio',
          rtpParameters: {} as Parameters<typeof consumeAudio>[1]['rtpParameters'],
        },
      );

      expect(getConsumers().size).toBe(1);

      removeConsumerByProducerId('non-existent-producer');

      expect(getConsumers().size).toBe(1);
    });
  });

  describe('muteAudio', () => {
    it('sets producer.track.enabled = false', async () => {
      const mockTrack = { kind: 'audio', stop: vi.fn(), enabled: true };
      const mockStream = { getAudioTracks: () => [mockTrack], getTracks: () => [mockTrack] };
      Object.defineProperty(globalThis, 'navigator', {
        value: { mediaDevices: { getUserMedia: vi.fn().mockResolvedValue(mockStream) } },
        writable: true,
        configurable: true,
      });

      const transport = makeMockTransport('send-1');
      transport.produce = vi.fn().mockResolvedValue({
        id: 'producer-id',
        track: mockTrack,
        on: vi.fn(),
        close: vi.fn(),
      });
      mockCreateSendTransport.mockReturnValue(transport);
      await initDevice({ codecs: [] } as Parameters<typeof initDevice>[0]);
      createSendTransport(
        { id: 'send-1', iceParameters: {}, iceCandidates: [], dtlsParameters: {} } as unknown as Parameters<typeof createSendTransport>[0],
        [],
      );
      await produceAudio(transport as unknown as Parameters<typeof produceAudio>[0]);

      muteAudio();

      expect(mockTrack.enabled).toBe(false);
    });
  });

  describe('unmuteAudio', () => {
    it('sets producer.track.enabled = true', async () => {
      const mockTrack = { kind: 'audio', stop: vi.fn(), enabled: false };
      const mockStream = { getAudioTracks: () => [mockTrack], getTracks: () => [mockTrack] };
      Object.defineProperty(globalThis, 'navigator', {
        value: { mediaDevices: { getUserMedia: vi.fn().mockResolvedValue(mockStream) } },
        writable: true,
        configurable: true,
      });

      const transport = makeMockTransport('send-1');
      transport.produce = vi.fn().mockResolvedValue({
        id: 'producer-id',
        track: mockTrack,
        on: vi.fn(),
        close: vi.fn(),
      });
      mockCreateSendTransport.mockReturnValue(transport);
      await initDevice({ codecs: [] } as Parameters<typeof initDevice>[0]);
      createSendTransport(
        { id: 'send-1', iceParameters: {}, iceCandidates: [], dtlsParameters: {} } as unknown as Parameters<typeof createSendTransport>[0],
        [],
      );
      await produceAudio(transport as unknown as Parameters<typeof produceAudio>[0]);

      unmuteAudio();

      expect(mockTrack.enabled).toBe(true);
    });
  });

  describe('deafenAudio', () => {
    it('mutes all consumer audio elements and mutes producer', async () => {
      // Setup consumer with audio element
      const mockPlay = vi.fn().mockResolvedValue(undefined);
      const mockAudioEl = { play: mockPlay, pause: vi.fn(), srcObject: null, muted: false };
      globalThis.Audio = function MockAudio(this: Record<string, unknown>) {
        Object.assign(this, mockAudioEl);
      } as unknown as typeof Audio;
      globalThis.MediaStream = function MockMediaStream() {
        return {};
      } as unknown as typeof MediaStream;

      const transport = makeMockTransport('recv-1');
      await consumeAudio(
        transport as unknown as Parameters<typeof consumeAudio>[0],
        {
          consumerId: 'c-1',
          producerId: 'p-1',
          kind: 'audio',
          rtpParameters: {} as Parameters<typeof consumeAudio>[1]['rtpParameters'],
        },
      );

      deafenAudio();

      // Verify consumer audio was muted
      const consumers = getConsumers();
      for (const [, entry] of consumers) {
        expect(entry.audio.muted).toBe(true);
      }
    });
  });

  describe('undeafenAudio', () => {
    it('unmutes all consumer audio elements', async () => {
      const mockPlay = vi.fn().mockResolvedValue(undefined);
      const mockAudioEl = { play: mockPlay, pause: vi.fn(), srcObject: null, muted: true };
      globalThis.Audio = function MockAudio(this: Record<string, unknown>) {
        Object.assign(this, mockAudioEl);
      } as unknown as typeof Audio;
      globalThis.MediaStream = function MockMediaStream() {
        return {};
      } as unknown as typeof MediaStream;

      const transport = makeMockTransport('recv-1');
      await consumeAudio(
        transport as unknown as Parameters<typeof consumeAudio>[0],
        {
          consumerId: 'c-1',
          producerId: 'p-1',
          kind: 'audio',
          rtpParameters: {} as Parameters<typeof consumeAudio>[1]['rtpParameters'],
        },
      );

      undeafenAudio(false);

      const consumers = getConsumers();
      for (const [, entry] of consumers) {
        expect(entry.audio.muted).toBe(false);
      }
    });
  });

  describe('getLocalStream', () => {
    it('returns null when no stream exists', () => {
      expect(getLocalStream()).toBeNull();
    });

    it('returns the stream after producing audio', async () => {
      const mockTrack = { kind: 'audio', stop: vi.fn(), enabled: true };
      const mockStream = { getAudioTracks: () => [mockTrack], getTracks: () => [mockTrack] };
      Object.defineProperty(globalThis, 'navigator', {
        value: { mediaDevices: { getUserMedia: vi.fn().mockResolvedValue(mockStream) } },
        writable: true,
        configurable: true,
      });

      const transport = makeMockTransport('send-1');
      mockCreateSendTransport.mockReturnValue(transport);
      await initDevice({ codecs: [] } as Parameters<typeof initDevice>[0]);
      createSendTransport(
        { id: 'send-1', iceParameters: {}, iceCandidates: [], dtlsParameters: {} } as unknown as Parameters<typeof createSendTransport>[0],
        [],
      );
      await produceAudio(transport as unknown as Parameters<typeof produceAudio>[0]);

      expect(getLocalStream()).toBe(mockStream);
    });
  });

  describe('cleanup', () => {
    it('resets device to null', async () => {
      await initDevice({ codecs: [] } as Parameters<typeof initDevice>[0]);
      expect(getDevice()).not.toBeNull();
      cleanup();
      expect(getDevice()).toBeNull();
    });
  });
});
