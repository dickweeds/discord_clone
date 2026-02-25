import * as mediasoup from 'mediasoup';
import type { Worker, Router, RouterRtpCodecCapability, RtpCapabilities, WebRtcTransport } from 'mediasoup/types';
import crypto from 'node:crypto';

// Environment config
const LISTEN_IP = process.env.MEDIASOUP_LISTEN_IP || '0.0.0.0';
const ANNOUNCED_IP = process.env.MEDIASOUP_ANNOUNCED_IP || '127.0.0.1';
const MIN_PORT = parseInt(process.env.MEDIASOUP_MIN_PORT || '40000', 10);
const MAX_PORT = parseInt(process.env.MEDIASOUP_MAX_PORT || '49999', 10);
const TURN_HOST = process.env.TURN_HOST || '127.0.0.1';
const TURN_PORT = process.env.TURN_PORT || '3478';

function getTurnSecret(): string {
  return process.env.TURN_SECRET || '';
}

const mediaCodecs: RouterRtpCodecCapability[] = [
  { kind: 'audio', mimeType: 'audio/opus', clockRate: 48000, channels: 2 },
  { kind: 'video', mimeType: 'video/VP8', clockRate: 90000 },
];

let worker: Worker | null = null;
let router: Router | null = null;
let log: { info: (...args: unknown[]) => void; error: (...args: unknown[]) => void; warn: (...args: unknown[]) => void } = console;
let workerDiedCallback: (() => void) | null = null;

export function setLogger(logger: typeof log): void {
  log = logger;
}

export function onWorkerDied(cb: () => void): void {
  workerDiedCallback = cb;
}

export async function initMediasoup(): Promise<void> {
  if (!getTurnSecret()) {
    log.warn('TURN_SECRET is not set — TURN credentials will be unavailable. Only STUN will be provided. Set TURN_SECRET for production.');
  }
  await createWorkerAndRouter();
}

async function createWorkerAndRouter(): Promise<void> {
  worker = await mediasoup.createWorker({
    logLevel: 'warn',
    logTags: ['ice', 'dtls', 'rtp', 'srtp', 'rtcp'],
  });

  worker.on('died', () => {
    log.error('mediasoup Worker died — attempting restart in 2s');
    worker = null;
    router = null;
    if (workerDiedCallback) workerDiedCallback();
    setTimeout(async () => {
      try {
        await createWorkerAndRouter();
        log.info('mediasoup Worker restarted successfully');
      } catch (err) {
        log.error({ err }, 'mediasoup Worker restart failed');
      }
    }, 2000);
  });

  router = await worker.createRouter({ mediaCodecs });
  log.info('mediasoup Worker created and Router initialized');
}

export function getRouter(): Router {
  if (!router) {
    throw new Error('mediasoup Router not initialized — call initMediasoup() first');
  }
  return router;
}

export function getRouterRtpCapabilities(): RtpCapabilities {
  return getRouter().rtpCapabilities;
}

export interface TransportResult {
  transport: WebRtcTransport;
  transportParams: {
    id: string;
    iceParameters: unknown;
    iceCandidates: unknown[];
    dtlsParameters: unknown;
  };
  iceServers: { urls: string | string[]; username?: string; credential?: string }[];
}

export async function createWebRtcTransport(userId: string): Promise<TransportResult> {
  const r = getRouter();

  const transport = await r.createWebRtcTransport({
    listenInfos: [
      { protocol: 'udp', ip: LISTEN_IP, announcedAddress: ANNOUNCED_IP, portRange: { min: MIN_PORT, max: MAX_PORT } },
      { protocol: 'tcp', ip: LISTEN_IP, announcedAddress: ANNOUNCED_IP, portRange: { min: MIN_PORT, max: MAX_PORT } },
    ],
    enableUdp: true,
    enableTcp: true,
    preferUdp: true,
    initialAvailableOutgoingBitrate: 3000000,
  });

  const iceServers = generateTurnCredentials(userId);

  const transportParams = {
    id: transport.id,
    iceParameters: transport.iceParameters,
    iceCandidates: transport.iceCandidates,
    dtlsParameters: transport.dtlsParameters,
  };

  return { transport, transportParams, iceServers: [iceServers] };
}

export function generateTurnCredentials(userId: string): {
  urls: string[];
  username?: string;
  credential?: string;
} {
  // STUN-only when no TURN secret is configured (local dev)
  const turnSecret = getTurnSecret();
  if (!turnSecret) {
    return { urls: [`stun:${TURN_HOST}:${TURN_PORT}`] };
  }

  const ttl = 24 * 3600;
  const unixTimestamp = Math.floor(Date.now() / 1000) + ttl;
  const username = `${unixTimestamp}:${userId}`;
  const credential = crypto.createHmac('sha1', turnSecret).update(username).digest('base64');
  return {
    username,
    credential,
    urls: [
      `stun:${TURN_HOST}:${TURN_PORT}`,
      `turn:${TURN_HOST}:${TURN_PORT}?transport=udp`,
      `turn:${TURN_HOST}:${TURN_PORT}?transport=tcp`,
    ],
  };
}

export async function closeMediasoup(): Promise<void> {
  if (worker) {
    worker.close();
    worker = null;
    router = null;
  }
}
