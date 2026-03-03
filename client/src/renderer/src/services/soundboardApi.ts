import { apiRequest, apiGet } from './apiClient';
import type { SoundResponse } from 'discord-clone-shared';
import { WS_TYPES } from 'discord-clone-shared';
import { wsClient } from './wsClient';

export async function fetchSounds(): Promise<{ data: SoundResponse[]; count: number }> {
  return apiGet<{ data: SoundResponse[]; count: number }>('/api/soundboard', true);
}

export async function requestUploadUrl(data: {
  fileName: string;
  contentType: string;
  fileSize: number;
  durationMs: number;
}): Promise<{ uploadUrl: string; soundId: string }> {
  return apiRequest<{ uploadUrl: string; soundId: string }>(
    '/api/soundboard/upload-url',
    { method: 'POST', body: JSON.stringify(data) },
  );
}

const UPLOAD_TIMEOUT_MS = 120_000; // 2 minutes

export async function uploadToS3(uploadUrl: string, file: File): Promise<void> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), UPLOAD_TIMEOUT_MS);

  try {
    const response = await fetch(uploadUrl, {
      method: 'PUT',
      headers: { 'Content-Type': file.type },
      body: file,
      signal: controller.signal,
    });
    if (!response.ok) {
      throw new Error(`S3 upload failed: ${response.status}`);
    }
  } finally {
    clearTimeout(timeout);
  }
}

export async function getDownloadUrl(soundId: string): Promise<string> {
  const result = await apiGet<{ downloadUrl: string }>(`/api/soundboard/${soundId}/download-url`);
  return result.downloadUrl;
}

export async function deleteSound(soundId: string): Promise<void> {
  await apiRequest<void>(`/api/soundboard/${soundId}`, { method: 'DELETE' });
}

export function notifySoundPlaying(soundId: string): void {
  wsClient.send({ type: WS_TYPES.SOUNDBOARD_PLAY, payload: { soundId } });
}

export function notifySoundStopped(): void {
  wsClient.send({ type: WS_TYPES.SOUNDBOARD_STOP, payload: {} });
}
