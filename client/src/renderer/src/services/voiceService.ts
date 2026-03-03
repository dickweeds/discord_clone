import { wsClient } from './wsClient';
import * as mediaService from './mediaService';
import * as vadService from './vadService';
import { WS_TYPES } from 'discord-clone-shared';
import type {
  VoiceJoinPayload,
  VoiceJoinResponse,
  VoiceCreateTransportPayload,
  VoiceCreateTransportResponse,
  VoiceStatePayload,
} from 'discord-clone-shared';

export interface JoinVoiceResult {
  existingPeers: string[];
}

export async function joinVoiceChannel(channelId: string): Promise<JoinVoiceResult> {
  // 1. Join voice channel on server
  const { routerRtpCapabilities, existingPeers } = await wsClient.request<VoiceJoinResponse>(
    'voice:join',
    { channelId } satisfies VoiceJoinPayload,
  );

  // 2. Initialize mediasoup Device
  await mediaService.initDevice(routerRtpCapabilities as Parameters<typeof mediaService.initDevice>[0]);

  // 2b. Send device rtpCapabilities to server so it can validate consume requests
  const device = mediaService.getDevice();
  if (device) {
    await wsClient.request<void>('voice:set-rtp-capabilities', {
      rtpCapabilities: device.rtpCapabilities,
    });
  }

  // 3. Create send transport
  const sendTransportResponse = await wsClient.request<VoiceCreateTransportResponse>(
    'voice:create-transport',
    { direction: 'send' } satisfies VoiceCreateTransportPayload,
  );
  const sendTransport = mediaService.createSendTransport(
    sendTransportResponse.transportParams as Parameters<typeof mediaService.createSendTransport>[0],
    sendTransportResponse.iceServers as RTCIceServer[],
  );

  // 4. Create recv transport
  const recvTransportResponse = await wsClient.request<VoiceCreateTransportResponse>(
    'voice:create-transport',
    { direction: 'recv' } satisfies VoiceCreateTransportPayload,
  );
  mediaService.createRecvTransport(
    recvTransportResponse.transportParams as Parameters<typeof mediaService.createRecvTransport>[0],
    recvTransportResponse.iceServers as RTCIceServer[],
  );

  // 4b. Consume any producers that arrived before recv transport was ready
  wsClient.flushPendingProducers();

  // 5. Read selected device from store (if user has a preference)
  const { useVoiceStore } = await import('../stores/useVoiceStore');
  const selectedDeviceId = useVoiceStore.getState().selectedAudioInputId;

  // 6. Produce audio with selected device (or system default if null)
  await mediaService.produceAudio(sendTransport, selectedDeviceId);

  // 6b. Create soundboard producer (silent until a sound is played)
  try {
    await mediaService.produceSoundboardAudio(sendTransport);
  } catch (err) {
    console.warn('[voiceService] Failed to create soundboard producer:', err);
  }

  // 7. Start local VAD for speaking detection
  const localStream = mediaService.getLocalStream();
  if (localStream) {
    const userId = useVoiceStore.getState().currentUserId;
    if (userId) {
      vadService.startLocalVAD(localStream, (speaking) => {
        useVoiceStore.getState().setSpeaking(userId, speaking);
      });
    }
  } else {
    console.warn('[voiceService] Local stream unavailable — speaking indicator disabled');
  }

  return { existingPeers };
}

export async function leaveVoiceChannel(channelId: string): Promise<void> {
  await wsClient.request<void>('voice:leave', { channelId });
}

export async function startVideo(): Promise<void> {
  const sendTransport = mediaService.getSendTransport();
  if (!sendTransport) throw new Error('Send transport not available');
  await mediaService.produceVideo(sendTransport);
}

export function stopVideo(): void {
  mediaService.stopVideo();
}

export function broadcastVoiceState(payload: VoiceStatePayload): void {
  try {
    wsClient.send({
      type: WS_TYPES.VOICE_STATE,
      payload,
    });
  } catch {
    // WS may not be connected — non-critical for fire-and-forget broadcast
  }
}

export function cleanupMedia(): void {
  vadService.stopAllVAD();
  mediaService.cleanup();
}
