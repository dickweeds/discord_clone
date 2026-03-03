import { describe, it, expect, vi, beforeEach, beforeAll, afterEach } from 'vitest';

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
    send: vi.fn(),
  },
}));

vi.mock('./vadService', () => ({
  startLocalVAD: vi.fn(),
  stopLocalVAD: vi.fn(),
  startRemoteVAD: vi.fn(),
  stopRemoteVAD: vi.fn(),
  stopAllVAD: vi.fn(),
}));

import {
  cleanup,
  getConsumers,
  consumeAudio,
  muteSoundboardConsumer,
  isSoundboardPlaying,
  stopSoundboardAudio,
} from './mediaService';

const originalAudio = globalThis.Audio;
const originalMediaStream = globalThis.MediaStream;
const originalAudioContext = globalThis.AudioContext;

beforeAll(() => {
  window.api = {
    secureStorage: {
      set: vi.fn().mockResolvedValue(undefined),
      get: vi.fn().mockResolvedValue(null),
      delete: vi.fn().mockResolvedValue(undefined),
    },
  } as unknown as typeof window.api;
});

beforeEach(() => {
  vi.clearAllMocks();
  cleanup();
});

afterEach(() => {
  globalThis.Audio = originalAudio;
  globalThis.MediaStream = originalMediaStream;
  globalThis.AudioContext = originalAudioContext;
});

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

describe('mediaService - soundboard functions', () => {
  describe('cleanup', () => {
    it('resets all state without errors when no active resources', () => {
      expect(() => cleanup()).not.toThrow();
    });
  });

  describe('muteSoundboardConsumer', () => {
    function setupAudioMocks() {
      const mockPlay = vi.fn().mockResolvedValue(undefined);
      globalThis.Audio = function MockAudio(this: Record<string, unknown>) {
        this.play = mockPlay;
        this.pause = vi.fn();
        this.srcObject = null;
        this.muted = false;
      } as unknown as typeof Audio;

      globalThis.MediaStream = function MockMediaStream() {
        return {};
      } as unknown as typeof MediaStream;
    }

    it('mutes entries with matching peerId and source soundboard', async () => {
      setupAudioMocks();

      const transport = {
        ...makeMockTransport('recv-1'),
        consume: vi.fn().mockResolvedValue({
          id: 'consumer-sb',
          producerId: 'p-sb',
          track: { kind: 'audio' },
          on: vi.fn(),
          close: vi.fn(),
          resume: vi.fn(),
        }),
      };

      await consumeAudio(
        transport as unknown as Parameters<typeof consumeAudio>[0],
        {
          consumerId: 'consumer-sb',
          producerId: 'p-sb',
          kind: 'audio',
          rtpParameters: {} as Parameters<typeof consumeAudio>[1]['rtpParameters'],
        },
        'peer-1',
        1,
        'soundboard',
      );

      muteSoundboardConsumer('peer-1', true);

      const consumers = getConsumers();
      for (const [, entry] of consumers) {
        if (entry.peerId === 'peer-1' && entry.source === 'soundboard') {
          expect(entry.audio.muted).toBe(true);
        }
      }
    });

    it('unmutes entries with matching peerId and source soundboard', async () => {
      setupAudioMocks();

      const transport = {
        ...makeMockTransport('recv-1'),
        consume: vi.fn().mockResolvedValue({
          id: 'consumer-sb2',
          producerId: 'p-sb2',
          track: { kind: 'audio' },
          on: vi.fn(),
          close: vi.fn(),
          resume: vi.fn(),
        }),
      };

      await consumeAudio(
        transport as unknown as Parameters<typeof consumeAudio>[0],
        {
          consumerId: 'consumer-sb2',
          producerId: 'p-sb2',
          kind: 'audio',
          rtpParameters: {} as Parameters<typeof consumeAudio>[1]['rtpParameters'],
        },
        'peer-2',
        1,
        'soundboard',
      );

      muteSoundboardConsumer('peer-2', true);
      muteSoundboardConsumer('peer-2', false);

      const consumers = getConsumers();
      for (const [, entry] of consumers) {
        if (entry.peerId === 'peer-2' && entry.source === 'soundboard') {
          expect(entry.audio.muted).toBe(false);
        }
      }
    });
  });

  describe('isSoundboardPlaying', () => {
    it('returns false initially', () => {
      expect(isSoundboardPlaying()).toBe(false);
    });
  });

  describe('stopSoundboardAudio', () => {
    it('does not throw when nothing is playing', () => {
      expect(() => stopSoundboardAudio()).not.toThrow();
    });
  });
});
