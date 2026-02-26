import React, { useCallback } from 'react';

interface VideoTileProps {
  userId: string;
  stream: MediaStream;
  isSpeaking: boolean;
  username: string;
  isLocal: boolean;
}

export function VideoTile({ userId, stream, isSpeaking, username, isLocal }: VideoTileProps): React.ReactNode {
  const videoRef = useCallback(
    (video: HTMLVideoElement | null) => {
      if (video && stream) {
        video.srcObject = stream;
      }
    },
    [stream],
  );

  return (
    <div
      data-testid={`video-tile-${userId}`}
      className={[
        'relative overflow-hidden rounded-lg bg-zinc-900 aspect-video',
        isSpeaking && 'ring-2 ring-[#23a55a]',
      ]
        .filter(Boolean)
        .join(' ')}
    >
      <video
        ref={videoRef}
        autoPlay
        playsInline
        muted
        className={['w-full h-full object-cover', isLocal && 'scale-x-[-1]'].filter(Boolean).join(' ')}
      />
      <div className="absolute bottom-0 left-0 right-0 bg-black/60 px-2 py-1">
        <span className="text-white text-sm truncate block">{username}</span>
      </div>
    </div>
  );
}
