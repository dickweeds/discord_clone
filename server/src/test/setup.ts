import { vi } from 'vitest';

// Prevent real mediasoup C++ worker from spawning in non-voice tests.
// Voice tests override this with their own vi.mock('mediasoup', ...).
vi.mock('mediasoup', () => ({
  createWorker: vi.fn().mockResolvedValue({
    on: vi.fn(),
    close: vi.fn(),
    createRouter: vi.fn().mockResolvedValue({
      rtpCapabilities: { codecs: [], headerExtensions: [] },
      createWebRtcTransport: vi.fn(),
      close: vi.fn(),
    }),
  }),
}));
