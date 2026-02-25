import { wsClient } from './wsClient';
import * as mediaService from './mediaService';
import type {
  VoiceJoinPayload,
  VoiceJoinResponse,
  VoiceCreateTransportPayload,
  VoiceCreateTransportResponse,
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

  // 5. Produce audio (capture mic and start sending)
  await mediaService.produceAudio(sendTransport);

  return { existingPeers };
}

export async function leaveVoiceChannel(channelId: string): Promise<void> {
  await wsClient.request<void>('voice:leave', { channelId });
}

export function cleanupMedia(): void {
  mediaService.cleanup();
}
