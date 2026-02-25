import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const { mockWorkerOn, mockWorkerClose, mockRouterCreateWebRtcTransport, mockRouter, mockWorker } = vi.hoisted(() => {
  const mockWorkerOn = vi.fn();
  const mockWorkerClose = vi.fn();
  const mockRouterCreateWebRtcTransport = vi.fn();
  const mockRouter = {
    rtpCapabilities: {
      codecs: [
        { kind: 'audio', mimeType: 'audio/opus', clockRate: 48000, channels: 2 },
        { kind: 'video', mimeType: 'video/VP8', clockRate: 90000 },
      ],
      headerExtensions: [],
    },
    canConsume: vi.fn().mockReturnValue(true),
    createWebRtcTransport: mockRouterCreateWebRtcTransport,
  };
  const mockWorker = {
    on: mockWorkerOn,
    close: mockWorkerClose,
    createRouter: vi.fn().mockResolvedValue(mockRouter),
    pid: 1234,
  };
  return { mockWorkerOn, mockWorkerClose, mockRouterCreateWebRtcTransport, mockRouter, mockWorker };
});

vi.mock('mediasoup', () => ({
  createWorker: vi.fn().mockResolvedValue(mockWorker),
}));

import {
  initMediasoup,
  getRouter,
  getRouterRtpCapabilities,
  createWebRtcTransport,
  generateTurnCredentials,
  closeMediasoup,
  setLogger,
  onWorkerDied,
} from './mediasoupManager.js';

const mockLogger = {
  info: vi.fn(),
  error: vi.fn(),
  warn: vi.fn(),
};

describe('mediasoupManager', () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    setLogger(mockLogger);
    process.env.TURN_SECRET = 'test-secret';
    process.env.TURN_HOST = '127.0.0.1';
    process.env.TURN_PORT = '3478';
  });

  afterEach(async () => {
    await closeMediasoup();
  });

  describe('initMediasoup', () => {
    it('creates a Worker and Router', async () => {
      await initMediasoup();

      const mediasoup = await import('mediasoup');
      expect(mediasoup.createWorker).toHaveBeenCalledWith({
        logLevel: 'warn',
        logTags: ['ice', 'dtls', 'rtp', 'srtp', 'rtcp'],
      });
      expect(mockWorker.createRouter).toHaveBeenCalledWith({
        mediaCodecs: [
          { kind: 'audio', mimeType: 'audio/opus', clockRate: 48000, channels: 2 },
          { kind: 'video', mimeType: 'video/VP8', clockRate: 90000 },
        ],
      });
      expect(mockWorker.on).toHaveBeenCalledWith('died', expect.any(Function));
    });
  });

  describe('getRouter', () => {
    it('returns the router after init', async () => {
      await initMediasoup();
      const router = getRouter();
      expect(router).toBe(mockRouter);
    });

    it('throws if not initialized', async () => {
      expect(() => getRouter()).toThrow('mediasoup Router not initialized');
    });
  });

  describe('getRouterRtpCapabilities', () => {
    it('returns RTP capabilities with audio/opus codec', async () => {
      await initMediasoup();
      const caps = getRouterRtpCapabilities();
      expect(caps.codecs).toBeDefined();
      expect(caps.codecs![0].mimeType).toBe('audio/opus');
    });

    it('returns RTP capabilities with video/VP8 codec', async () => {
      await initMediasoup();
      const caps = getRouterRtpCapabilities();
      expect(caps.codecs).toBeDefined();
      const vp8Codec = caps.codecs!.find((c) => c.mimeType === 'video/VP8');
      expect(vp8Codec).toBeDefined();
      expect(vp8Codec!.kind).toBe('video');
      expect(vp8Codec!.clockRate).toBe(90000);
    });
  });

  describe('createWebRtcTransport', () => {
    it('creates a transport and returns params + ICE servers', async () => {
      const mockTransport = {
        id: 'transport-123',
        iceParameters: { usernameFragment: 'abc', password: 'def' },
        iceCandidates: [{ foundation: '1' }],
        dtlsParameters: { fingerprints: [] },
        on: vi.fn(),
        close: vi.fn(),
      };
      mockRouterCreateWebRtcTransport.mockResolvedValue(mockTransport);

      await initMediasoup();
      const result = await createWebRtcTransport('user-1');

      expect(result.transport).toBe(mockTransport);
      expect(result.transportParams.id).toBe('transport-123');
      expect(result.transportParams.iceParameters).toBeDefined();
      expect(result.transportParams.iceCandidates).toBeDefined();
      expect(result.transportParams.dtlsParameters).toBeDefined();
      expect(result.iceServers).toHaveLength(1);
      expect(result.iceServers[0].urls).toContain('stun:127.0.0.1:3478');
    });

    it('creates transport with initialAvailableOutgoingBitrate of 3000000 for video support', async () => {
      const mockTransport = {
        id: 'transport-456',
        iceParameters: { usernameFragment: 'abc', password: 'def' },
        iceCandidates: [{ foundation: '1' }],
        dtlsParameters: { fingerprints: [] },
        on: vi.fn(),
        close: vi.fn(),
      };
      mockRouterCreateWebRtcTransport.mockResolvedValue(mockTransport);

      await initMediasoup();
      await createWebRtcTransport('user-1');

      expect(mockRouterCreateWebRtcTransport).toHaveBeenCalledWith(
        expect.objectContaining({
          initialAvailableOutgoingBitrate: 3000000,
        }),
      );
    });
  });

  describe('generateTurnCredentials', () => {
    it('generates valid HMAC-SHA1 credentials', () => {
      const creds = generateTurnCredentials('user-1');
      expect(creds.username).toBeDefined();
      expect(creds.username!).toMatch(/^\d+:user-1$/);
      expect(creds.credential).toBeTruthy();
      expect(() => Buffer.from(creds.credential!, 'base64')).not.toThrow();
      expect(creds.urls).toHaveLength(3);
      expect(creds.urls[0]).toBe('stun:127.0.0.1:3478');
      expect(creds.urls[1]).toBe('turn:127.0.0.1:3478?transport=udp');
      expect(creds.urls[2]).toBe('turn:127.0.0.1:3478?transport=tcp');
    });

    it('returns STUN-only when TURN_SECRET is empty', () => {
      process.env.TURN_SECRET = '';
      const creds = generateTurnCredentials('user-1');
      expect(creds.urls).toHaveLength(1);
      expect(creds.urls[0]).toBe('stun:127.0.0.1:3478');
      expect(creds.username).toBeUndefined();
      expect(creds.credential).toBeUndefined();
    });

    it('generates credentials with correct TTL (24 hours)', () => {
      const creds = generateTurnCredentials('user-1');
      expect(creds.username).toBeDefined();
      const timestamp = parseInt(creds.username!.split(':')[0], 10);
      const now = Math.floor(Date.now() / 1000);
      const ttl = timestamp - now;
      expect(ttl).toBeGreaterThan(86395);
      expect(ttl).toBeLessThanOrEqual(86400);
    });
  });

  describe('Worker death recovery', () => {
    it('registers a died event handler on the Worker', async () => {
      await initMediasoup();
      expect(mockWorkerOn).toHaveBeenCalledWith('died', expect.any(Function));
    });

    it('invokes onWorkerDied callback when Worker dies', async () => {
      const diedCallback = vi.fn();
      onWorkerDied(diedCallback);

      await initMediasoup();

      // Get the 'died' handler and invoke it
      const diedHandler = mockWorkerOn.mock.calls.find((c: unknown[]) => c[0] === 'died')![1] as () => void;
      diedHandler();

      expect(diedCallback).toHaveBeenCalledOnce();
    });
  });

  describe('closeMediasoup', () => {
    it('closes the Worker', async () => {
      await initMediasoup();
      await closeMediasoup();
      expect(mockWorkerClose).toHaveBeenCalled();
    });

    it('is safe to call when not initialized', async () => {
      await expect(closeMediasoup()).resolves.not.toThrow();
    });
  });
});
