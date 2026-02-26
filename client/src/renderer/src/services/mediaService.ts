import { Device, types } from 'mediasoup-client';
import { wsClient } from './wsClient';
import type {
  VoiceConnectTransportPayload,
  VoiceProducePayload,
  VoiceProduceResponse,
} from 'discord-clone-shared';

let device: Device | null = null;
let sendTransport: types.Transport | null = null;
let recvTransport: types.Transport | null = null;
let producer: types.Producer | null = null;
let localStream: MediaStream | null = null;
let videoProducer: types.Producer | null = null;
let localVideoStream: MediaStream | null = null;
const consumers = new Map<string, { consumer: types.Consumer; audio: HTMLAudioElement }>();
const videoConsumers = new Map<string, { consumer: types.Consumer; element: HTMLVideoElement; peerId: string; stream: MediaStream | null }>();

export function getDevice(): Device | null {
  return device;
}

export async function initDevice(routerRtpCapabilities: types.RtpCapabilities): Promise<Device> {
  device = new Device();
  await device.load({ routerRtpCapabilities });
  return device;
}

export function createSendTransport(
  transportParams: {
    id: string;
    iceParameters: types.IceParameters;
    iceCandidates: types.IceCandidate[];
    dtlsParameters: types.DtlsParameters;
  },
  iceServers: RTCIceServer[],
): types.Transport {
  if (!device) throw new Error('Device not initialized');

  sendTransport = device.createSendTransport({
    id: transportParams.id,
    iceParameters: transportParams.iceParameters,
    iceCandidates: transportParams.iceCandidates,
    dtlsParameters: transportParams.dtlsParameters,
    iceServers,
  });

  sendTransport.on(
    'connect',
    ({ dtlsParameters }: { dtlsParameters: types.DtlsParameters }, callback: () => void, errback: (error: Error) => void) => {
      wsClient
        .request<void>('voice:connect-transport', {
          transportId: sendTransport!.id,
          dtlsParameters,
        } satisfies VoiceConnectTransportPayload)
        .then(() => callback())
        .catch((err: Error) => errback(err));
    },
  );

  sendTransport.on(
    'produce',
    (
      { kind, rtpParameters }: { kind: types.MediaKind; rtpParameters: types.RtpParameters },
      callback: (arg: { id: string }) => void,
      errback: (error: Error) => void,
    ) => {
      wsClient
        .request<VoiceProduceResponse>('voice:produce', {
          transportId: sendTransport!.id,
          kind: kind as 'audio' | 'video',
          rtpParameters,
        } satisfies VoiceProducePayload)
        .then(({ producerId }) => callback({ id: producerId }))
        .catch((err: Error) => errback(err));
    },
  );

  return sendTransport;
}

export function createRecvTransport(
  transportParams: {
    id: string;
    iceParameters: types.IceParameters;
    iceCandidates: types.IceCandidate[];
    dtlsParameters: types.DtlsParameters;
  },
  iceServers: RTCIceServer[],
): types.Transport {
  if (!device) throw new Error('Device not initialized');

  recvTransport = device.createRecvTransport({
    id: transportParams.id,
    iceParameters: transportParams.iceParameters,
    iceCandidates: transportParams.iceCandidates,
    dtlsParameters: transportParams.dtlsParameters,
    iceServers,
  });

  recvTransport.on(
    'connect',
    ({ dtlsParameters }: { dtlsParameters: types.DtlsParameters }, callback: () => void, errback: (error: Error) => void) => {
      wsClient
        .request<void>('voice:connect-transport', {
          transportId: recvTransport!.id,
          dtlsParameters,
        } satisfies VoiceConnectTransportPayload)
        .then(() => callback())
        .catch((err: Error) => errback(err));
    },
  );

  return recvTransport;
}

export async function produceAudio(transport: types.Transport): Promise<{ producer: types.Producer; stream: MediaStream }> {
  const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
  const track = stream.getAudioTracks()[0];
  const newProducer = await transport.produce({ track });
  producer = newProducer;
  localStream = stream;
  return { producer: newProducer, stream };
}

export async function consumeAudio(
  transport: types.Transport,
  params: { consumerId: string; producerId: string; kind: 'audio'; rtpParameters: types.RtpParameters },
): Promise<types.Consumer> {
  const consumer = await transport.consume({
    id: params.consumerId,
    producerId: params.producerId,
    kind: params.kind,
    rtpParameters: params.rtpParameters,
  });

  const audio = new Audio();
  audio.srcObject = new MediaStream([consumer.track]);
  await audio.play();

  consumers.set(consumer.id, { consumer, audio });

  return consumer;
}

export function muteAudio(): void {
  if (producer && producer.track) {
    producer.track.enabled = false;
  }
}

export function unmuteAudio(): void {
  if (producer && producer.track) {
    producer.track.enabled = true;
  }
}

export function deafenAudio(): void {
  for (const [, entry] of consumers) {
    entry.audio.muted = true;
  }
  muteAudio();
}

export function undeafenAudio(restoreMuted: boolean): void {
  for (const [, entry] of consumers) {
    entry.audio.muted = false;
  }
  if (!restoreMuted) {
    unmuteAudio();
  }
}

export function getLocalStream(): MediaStream | null {
  return localStream;
}

export async function produceVideo(transport: types.Transport): Promise<void> {
  const stream = await navigator.mediaDevices.getUserMedia({
    video: { width: { ideal: 1280 }, height: { ideal: 720 }, frameRate: { ideal: 30 } },
  });
  const track = stream.getVideoTracks()[0];
  videoProducer = await transport.produce({ track });
  localVideoStream = stream;
}

export function stopVideo(): void {
  if (videoProducer) {
    videoProducer.close();
    videoProducer = null;
  }
  if (localVideoStream) {
    localVideoStream.getTracks().forEach((t) => t.stop());
    localVideoStream = null;
  }
}

export function getLocalVideoStream(): MediaStream | null {
  return localVideoStream;
}

export async function consumeVideo(
  transport: types.Transport,
  params: { consumerId: string; producerId: string; kind: 'video'; rtpParameters: types.RtpParameters },
  peerId: string,
): Promise<types.Consumer> {
  const consumer = await transport.consume({
    id: params.consumerId,
    producerId: params.producerId,
    kind: params.kind,
    rtpParameters: params.rtpParameters,
  });

  const video = document.createElement('video');
  video.srcObject = new MediaStream([consumer.track]);
  video.autoplay = true;
  video.playsInline = true;
  video.muted = true;

  videoConsumers.set(consumer.id, { consumer, element: video, peerId, stream: null });

  return consumer;
}

export function getVideoConsumers(): Map<string, { consumer: types.Consumer; element: HTMLVideoElement; peerId: string; stream: MediaStream | null }> {
  return videoConsumers;
}

export function getVideoStreamByPeerId(peerId: string): MediaStream | null {
  for (const entry of videoConsumers.values()) {
    if (entry.peerId === peerId) {
      if (!entry.stream) {
        entry.stream = new MediaStream([entry.consumer.track]);
      }
      return entry.stream;
    }
  }
  return null;
}

export function removeVideoConsumerByProducerId(producerId: string): void {
  for (const [consumerId, entry] of videoConsumers) {
    if (entry.consumer.producerId === producerId) {
      entry.consumer.close();
      entry.element.srcObject = null;
      entry.stream = null;
      videoConsumers.delete(consumerId);
      break;
    }
  }
}

export function getSendTransport(): types.Transport | null {
  return sendTransport;
}

export function getRecvTransport(): types.Transport | null {
  return recvTransport;
}

export function getConsumers(): Map<string, { consumer: types.Consumer; audio: HTMLAudioElement }> {
  return consumers;
}

export function removeConsumerByProducerId(producerId: string): void {
  for (const [consumerId, entry] of consumers) {
    if (entry.consumer.producerId === producerId) {
      entry.consumer.close();
      entry.audio.pause();
      entry.audio.srcObject = null;
      consumers.delete(consumerId);
      break;
    }
  }
}

export function cleanup(): void {
  // Close producer
  if (producer) {
    producer.close();
    producer = null;
  }

  // Close video producer
  if (videoProducer) {
    videoProducer.close();
    videoProducer = null;
  }

  // Stop local media tracks
  if (localStream) {
    for (const track of localStream.getTracks()) {
      track.stop();
    }
    localStream = null;
  }

  // Stop local video tracks
  if (localVideoStream) {
    for (const track of localVideoStream.getTracks()) {
      track.stop();
    }
    localVideoStream = null;
  }

  // Close all consumers and audio elements
  for (const [, entry] of consumers) {
    entry.consumer.close();
    entry.audio.pause();
    entry.audio.srcObject = null;
  }
  consumers.clear();

  // Close all video consumers
  for (const [, entry] of videoConsumers) {
    entry.consumer.close();
    entry.element.srcObject = null;
    entry.stream = null;
  }
  videoConsumers.clear();

  // Close transports
  if (sendTransport) {
    sendTransport.close();
    sendTransport = null;
  }
  if (recvTransport) {
    recvTransport.close();
    recvTransport = null;
  }

  // Destroy device
  device = null;
}
