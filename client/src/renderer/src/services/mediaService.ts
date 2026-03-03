import { Device, types } from 'mediasoup-client';
import { wsClient } from './wsClient';
import * as vadService from './vadService';
import type {
  VoiceConnectTransportPayload,
  VoiceProducePayload,
  VoiceProduceResponse,
  AudioProducerSource,
} from 'discord-clone-shared';

let device: Device | null = null;
let sendTransport: types.Transport | null = null;
let recvTransport: types.Transport | null = null;
let producer: types.Producer | null = null;
let localStream: MediaStream | null = null;
let videoProducer: types.Producer | null = null;
let localVideoStream: MediaStream | null = null;
let currentOutputDeviceId = '';

// Soundboard
let soundboardProducer: types.Producer | null = null;
let soundboardAudioContext: AudioContext | null = null;
let soundboardSource: AudioBufferSourceNode | null = null;
let soundboardDestination: MediaStreamAudioDestinationNode | null = null;
export interface AudioConsumerEntry {
  consumer: types.Consumer;
  audio: HTMLAudioElement;
  peerId: string;
  source: AudioProducerSource;
  gainNode?: GainNode;
  audioContext?: AudioContext;
}

const consumers = new Map<string, AudioConsumerEntry>();
const videoConsumers = new Map<string, { consumer: types.Consumer; element: HTMLVideoElement; peerId: string; stream: MediaStream | null }>();

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

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
      { kind, rtpParameters, appData }: { kind: types.MediaKind; rtpParameters: types.RtpParameters; appData: Record<string, unknown> },
      callback: (arg: { id: string }) => void,
      errback: (error: Error) => void,
    ) => {
      const source = (appData?.source as AudioProducerSource) || undefined;
      wsClient
        .request<VoiceProduceResponse>('voice:produce', {
          transportId: sendTransport!.id,
          kind: kind as 'audio' | 'video',
          rtpParameters,
          source,
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

export async function produceAudio(
  transport: types.Transport,
  deviceId?: string | null,
): Promise<{ producer: types.Producer; stream: MediaStream }> {
  const constraints: MediaStreamConstraints = {
    audio: deviceId ? { deviceId: { exact: deviceId } } : true,
  };
  const stream = await navigator.mediaDevices.getUserMedia(constraints);
  const track = stream.getAudioTracks()[0];
  const newProducer = await transport.produce({ track });
  producer = newProducer;
  localStream = stream;
  return { producer: newProducer, stream };
}

export async function consumeAudio(
  transport: types.Transport,
  params: { consumerId: string; producerId: string; kind: 'audio'; rtpParameters: types.RtpParameters },
  peerId: string,
  initialVolumeScalar = 1,
  source: AudioProducerSource = 'microphone',
): Promise<types.Consumer> {
  const consumer = await transport.consume({
    id: params.consumerId,
    producerId: params.producerId,
    kind: params.kind,
    rtpParameters: params.rtpParameters,
  });

  const audio = new Audio();
  const clampedScalar = clamp(initialVolumeScalar, 0, 2);

  let gainNode: GainNode | undefined;
  let audioContext: AudioContext | undefined;

  if (typeof AudioContext !== 'undefined') {
    try {
      audioContext = new AudioContext();
      const sourceStream = new MediaStream([consumer.track]);
      const source = audioContext.createMediaStreamSource(sourceStream);
      gainNode = audioContext.createGain();
      gainNode.gain.value = clampedScalar;
      const destination = audioContext.createMediaStreamDestination();
      source.connect(gainNode);
      gainNode.connect(destination);
      audio.srcObject = destination.stream;
      await audioContext.resume().catch(() => Promise.resolve());
    } catch {
      // Fallback to direct audio element path if Web Audio setup fails
      audioContext?.close().catch(() => Promise.resolve());
      audioContext = undefined;
      gainNode = undefined;
      audio.srcObject = new MediaStream([consumer.track]);
      audio.volume = clamp(clampedScalar, 0, 1);
    }
  } else {
    audio.srcObject = new MediaStream([consumer.track]);
    audio.volume = clamp(clampedScalar, 0, 1);
  }

  if (currentOutputDeviceId) {
    try {
      await (audio as unknown as { setSinkId: (id: string) => Promise<void> }).setSinkId(currentOutputDeviceId);
    } catch {
      // setSinkId may not be supported or device unavailable — use default
    }
  }
  await audio.play();

  consumers.set(consumer.id, { consumer, audio, peerId, source, gainNode, audioContext });

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

export async function switchAudioInput(
  deviceId: string | null,
  onVadSpeakingChange?: (speaking: boolean) => void,
): Promise<void> {
  if (!producer) return;

  try {
    const constraints: MediaStreamConstraints = {
      audio: deviceId ? { deviceId: { exact: deviceId } } : true,
    };
    const newStream = await navigator.mediaDevices.getUserMedia(constraints);
    const newTrack = newStream.getAudioTracks()[0];

    // Preserve muted state
    if (producer.track) {
      newTrack.enabled = producer.track.enabled;
    }

    // Hot-swap the track — no disconnect, no renegotiation
    await producer.replaceTrack({ track: newTrack });

    // Cleanup old stream
    if (localStream) {
      localStream.getTracks().forEach((t) => t.stop());
    }
    localStream = newStream;

    // Restart local VAD with new stream
    vadService.stopLocalVAD();
    if (newTrack.enabled && onVadSpeakingChange) {
      vadService.startLocalVAD(newStream, onVadSpeakingChange);
    }
  } catch (err) {
    console.warn('[mediaService] Failed to switch audio input:', err);
    // Keep old stream active
  }
}

export async function switchAudioOutput(deviceId: string | null): Promise<void> {
  currentOutputDeviceId = deviceId || '';

  for (const [, entry] of consumers) {
    try {
      await (entry.audio as unknown as { setSinkId: (id: string) => Promise<void> }).setSinkId(currentOutputDeviceId);
    } catch (err) {
      console.warn('[mediaService] Failed to set audio output device:', err);
    }
  }
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

export function getConsumers(): Map<string, AudioConsumerEntry> {
  return consumers;
}

export function setPeerVolume(peerId: string, volumeScalar: number): void {
  const clampedScalar = clamp(volumeScalar, 0, 2);
  for (const [, entry] of consumers) {
    if (entry.peerId !== peerId) continue;
    if (entry.gainNode) {
      entry.gainNode.gain.value = clampedScalar;
    } else {
      entry.audio.volume = clamp(clampedScalar, 0, 1);
    }
  }
}

// --- Soundboard ---

export async function produceSoundboardAudio(transport: types.Transport): Promise<types.Producer> {
  soundboardAudioContext = new AudioContext();
  soundboardDestination = soundboardAudioContext.createMediaStreamDestination();

  // Play a brief silent buffer to initialize the stream with a valid track
  const silentBuffer = soundboardAudioContext.createBuffer(1, soundboardAudioContext.sampleRate * 0.1, soundboardAudioContext.sampleRate);
  const silentSource = soundboardAudioContext.createBufferSource();
  silentSource.buffer = silentBuffer;
  silentSource.connect(soundboardDestination);
  silentSource.start();

  const track = soundboardDestination.stream.getAudioTracks()[0];
  const newProducer = await transport.produce({
    track,
    appData: { source: 'soundboard' as AudioProducerSource },
  });
  soundboardProducer = newProducer;
  return newProducer;
}

export function playSoundboardAudio(audioBuffer: AudioBuffer, onEnded?: () => void): void {
  if (!soundboardAudioContext || !soundboardDestination) return;

  // Stop any currently playing source
  if (soundboardSource) {
    try { soundboardSource.stop(); } catch { /* already stopped */ }
  }

  soundboardSource = soundboardAudioContext.createBufferSource();
  soundboardSource.buffer = audioBuffer;
  soundboardSource.connect(soundboardDestination);

  if (onEnded) {
    soundboardSource.onended = () => {
      soundboardSource = null;
      onEnded();
    };
  }

  soundboardSource.start();
}

export function stopSoundboardAudio(): void {
  if (soundboardSource) {
    try { soundboardSource.stop(); } catch { /* already stopped */ }
    soundboardSource = null;
  }
}

export function getSoundboardAudioContext(): AudioContext | null {
  return soundboardAudioContext;
}

export function isSoundboardPlaying(): boolean {
  return soundboardSource !== null;
}

export function muteSoundboardConsumer(peerId: string, muted: boolean): void {
  for (const [, entry] of consumers) {
    if (entry.peerId === peerId && entry.source === 'soundboard') {
      entry.audio.muted = muted;
    }
  }
}

export function removeConsumerByProducerId(producerId: string): void {
  for (const [consumerId, entry] of consumers) {
    if (entry.consumer.producerId === producerId) {
      entry.consumer.close();
      entry.audio.pause();
      entry.audio.srcObject = null;
      if (entry.audioContext) {
        entry.audioContext.close().catch(() => Promise.resolve());
      }
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

  // Close soundboard producer and audio context
  if (soundboardSource) {
    try { soundboardSource.stop(); } catch { /* already stopped */ }
    soundboardSource = null;
  }
  if (soundboardProducer) {
    soundboardProducer.close();
    soundboardProducer = null;
  }
  soundboardDestination = null;
  if (soundboardAudioContext) {
    soundboardAudioContext.close().catch(() => Promise.resolve());
    soundboardAudioContext = null;
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
    if (entry.audioContext) {
      entry.audioContext.close().catch(() => Promise.resolve());
    }
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
