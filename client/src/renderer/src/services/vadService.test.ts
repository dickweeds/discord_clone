import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { startLocalVAD, startRemoteVAD, stopLocalVAD, stopRemoteVAD, stopAllVAD } from './vadService';

// Track mock instances for assertions
let mockInstances: {
  source: { connect: ReturnType<typeof vi.fn>; disconnect: ReturnType<typeof vi.fn> };
  analyser: {
    fftSize: number;
    frequencyBinCount: number;
    getByteFrequencyData: ReturnType<typeof vi.fn>;
    connect: ReturnType<typeof vi.fn>;
    disconnect: ReturnType<typeof vi.fn>;
  };
  gainNode: { gain: { value: number }; connect: ReturnType<typeof vi.fn>; disconnect: ReturnType<typeof vi.fn> };
  close: ReturnType<typeof vi.fn>;
}[] = [];

// Store originals
const originalAudioContext = globalThis.AudioContext;
const originalMediaStream = globalThis.MediaStream;

beforeEach(() => {
  vi.useFakeTimers();
  mockInstances = [];

  // Mock AudioContext as a proper constructor function
  globalThis.AudioContext = function MockAudioContext(this: Record<string, unknown>) {
    const instance = {
      source: {
        connect: vi.fn(),
        disconnect: vi.fn(),
      },
      analyser: {
        fftSize: 0,
        frequencyBinCount: 128,
        getByteFrequencyData: vi.fn(),
        connect: vi.fn(),
        disconnect: vi.fn(),
      },
      gainNode: {
        gain: { value: 1 },
        connect: vi.fn(),
        disconnect: vi.fn(),
      },
      close: vi.fn().mockResolvedValue(undefined),
    };
    mockInstances.push(instance);

    this.createMediaStreamSource = vi.fn(() => instance.source);
    this.createAnalyser = vi.fn(() => instance.analyser);
    this.createGain = vi.fn(() => instance.gainNode);
    this.destination = {};
    this.close = instance.close;
  } as unknown as typeof AudioContext;

  globalThis.MediaStream = function MockMediaStream() {
    return {};
  } as unknown as typeof MediaStream;

  // Clean up any lingering VAD instances
  stopAllVAD();
  mockInstances = [];
});

afterEach(() => {
  stopAllVAD();
  vi.useRealTimers();
  globalThis.AudioContext = originalAudioContext;
  globalThis.MediaStream = originalMediaStream;
});

describe('vadService', () => {
  describe('startLocalVAD', () => {
    it('creates AudioContext, AnalyserNode, and starts polling', () => {
      const mockStream = {} as MediaStream;
      const callback = vi.fn();

      startLocalVAD(mockStream, callback);

      expect(mockInstances).toHaveLength(1);
      const inst = mockInstances[0];
      expect(inst.source.connect).toHaveBeenCalledWith(inst.analyser);
      expect(inst.analyser.connect).toHaveBeenCalledWith(inst.gainNode);
      expect(inst.gainNode.connect).toHaveBeenCalled();
      expect(inst.gainNode.gain.value).toBe(0);
    });

    it('fires callback(true) when energy exceeds threshold', () => {
      const mockStream = {} as MediaStream;
      const callback = vi.fn();

      startLocalVAD(mockStream, callback);

      const inst = mockInstances[0];
      inst.analyser.getByteFrequencyData.mockImplementation((arr: Uint8Array) => {
        for (let i = 0; i < arr.length; i++) {
          arr[i] = 100;
        }
      });

      vi.advanceTimersByTime(50);

      expect(callback).toHaveBeenCalledWith(true);
    });

    it('fires callback(false) after hold time when energy drops', () => {
      const mockStream = {} as MediaStream;
      const callback = vi.fn();

      startLocalVAD(mockStream, callback);

      const inst = mockInstances[0];
      // Start speaking
      inst.analyser.getByteFrequencyData.mockImplementation((arr: Uint8Array) => {
        for (let i = 0; i < arr.length; i++) arr[i] = 100;
      });
      vi.advanceTimersByTime(50);
      expect(callback).toHaveBeenCalledWith(true);
      callback.mockClear();

      // Go silent
      inst.analyser.getByteFrequencyData.mockImplementation((arr: Uint8Array) => {
        for (let i = 0; i < arr.length; i++) arr[i] = 0;
      });

      // Advance past hold time (250ms) + extra polling intervals
      vi.advanceTimersByTime(350);

      expect(callback).toHaveBeenCalledWith(false);
    });

    it('does not fire false during hold time', () => {
      const mockStream = {} as MediaStream;
      const callback = vi.fn();

      startLocalVAD(mockStream, callback);

      const inst = mockInstances[0];
      // Start speaking
      inst.analyser.getByteFrequencyData.mockImplementation((arr: Uint8Array) => {
        for (let i = 0; i < arr.length; i++) arr[i] = 100;
      });
      vi.advanceTimersByTime(50);
      expect(callback).toHaveBeenCalledWith(true);
      callback.mockClear();

      // Go silent
      inst.analyser.getByteFrequencyData.mockImplementation((arr: Uint8Array) => {
        for (let i = 0; i < arr.length; i++) arr[i] = 0;
      });

      // Only advance 100ms (within 250ms hold time)
      vi.advanceTimersByTime(100);

      expect(callback).not.toHaveBeenCalledWith(false);
    });
  });

  describe('stopLocalVAD', () => {
    it('cleans up all resources', () => {
      startLocalVAD({} as MediaStream, vi.fn());

      const inst = mockInstances[0];

      stopLocalVAD();

      expect(inst.source.disconnect).toHaveBeenCalled();
      expect(inst.analyser.disconnect).toHaveBeenCalled();
      expect(inst.gainNode.disconnect).toHaveBeenCalled();
      expect(inst.close).toHaveBeenCalled();
    });

    it('is safe to call when no local VAD exists', () => {
      expect(() => stopLocalVAD()).not.toThrow();
    });
  });

  describe('startRemoteVAD', () => {
    it('creates per-peer VAD instance', () => {
      const mockConsumer = { track: {} as MediaStreamTrack };
      const callback = vi.fn();

      startRemoteVAD(mockConsumer, 'peer-1', callback);

      expect(mockInstances).toHaveLength(1);
    });

    it('calls callback with peerId when speaking detected', () => {
      const mockConsumer = { track: {} as MediaStreamTrack };
      const callback = vi.fn();

      startRemoteVAD(mockConsumer, 'peer-1', callback);

      const inst = mockInstances[0];
      inst.analyser.getByteFrequencyData.mockImplementation((arr: Uint8Array) => {
        for (let i = 0; i < arr.length; i++) arr[i] = 100;
      });

      vi.advanceTimersByTime(50);

      expect(callback).toHaveBeenCalledWith('peer-1', true);
    });
  });

  describe('stopRemoteVAD', () => {
    it('cleans up specific peer VAD', () => {
      startRemoteVAD({ track: {} as MediaStreamTrack }, 'peer-1', vi.fn());

      const inst = mockInstances[0];

      stopRemoteVAD('peer-1');

      expect(inst.source.disconnect).toHaveBeenCalled();
      expect(inst.close).toHaveBeenCalled();
    });

    it('is safe to call for non-existent peer', () => {
      expect(() => stopRemoteVAD('non-existent')).not.toThrow();
    });
  });

  describe('stopAllVAD', () => {
    it('cleans up everything', () => {
      startLocalVAD({} as MediaStream, vi.fn());
      startRemoteVAD({ track: {} as MediaStreamTrack }, 'peer-1', vi.fn());
      startRemoteVAD({ track: {} as MediaStreamTrack }, 'peer-2', vi.fn());

      expect(mockInstances).toHaveLength(3);

      stopAllVAD();

      // All 3 AudioContexts should be closed
      for (const inst of mockInstances) {
        expect(inst.close).toHaveBeenCalled();
      }
    });
  });
});
