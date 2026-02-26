import React, { useMemo } from 'react';
import { useVoiceStore } from '../../stores/useVoiceStore';
import useAuthStore from '../../stores/useAuthStore';
import { useMemberStore } from '../../stores/useMemberStore';
import * as mediaService from '../../services/mediaService';
import { VideoTile } from './VideoTile';

function getGridCols(count: number): string {
  if (count === 1) return 'grid-cols-1';
  if (count <= 4) return 'grid-cols-2';
  if (count <= 9) return 'grid-cols-3';
  if (count <= 16) return 'grid-cols-4';
  return 'grid-cols-5';
}

export function VideoGrid(): React.ReactNode {
  const currentChannelId = useVoiceStore((s) => s.currentChannelId);
  const videoParticipants = useVoiceStore((s) => s.videoParticipants);
  const speakingUsers = useVoiceStore((s) => s.speakingUsers);
  const currentUserId = useAuthStore((s) => s.user?.id);
  const members = useMemberStore((s) => s.members);

  const memberMap = useMemo(
    () => new Map(members.map((m) => [m.id, m])),
    [members],
  );

  if (!currentChannelId || videoParticipants.size === 0) return null;

  const tiles: { userId: string; stream: MediaStream; isLocal: boolean }[] = [];

  for (const userId of videoParticipants) {
    let stream: MediaStream | null = null;
    const isLocal = userId === currentUserId;

    if (isLocal) {
      stream = mediaService.getLocalVideoStream();
    } else {
      stream = mediaService.getVideoStreamByPeerId(userId);
    }

    if (stream) {
      tiles.push({ userId, stream, isLocal });
    }
  }

  if (tiles.length === 0) return null;

  return (
    <div className={`grid gap-2 p-4 w-full flex-shrink-0 place-items-center ${getGridCols(tiles.length)}`}>
      {tiles.map((tile) => {
        const username = memberMap.get(tile.userId)?.username ?? 'Unknown';
        const isSpeaking = speakingUsers.has(tile.userId);

        return (
          <VideoTile
            key={tile.userId}
            userId={tile.userId}
            stream={tile.stream}
            isSpeaking={isSpeaking}
            username={username}
            isLocal={tile.isLocal}
          />
        );
      })}
    </div>
  );
}
