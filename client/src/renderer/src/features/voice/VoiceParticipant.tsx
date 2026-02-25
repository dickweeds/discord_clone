import React from 'react';
import { useMemberStore } from '../../stores/useMemberStore';
import { getAvatarColor } from '../../utils/avatarColor';

interface VoiceParticipantProps {
  userId: string;
}

export function VoiceParticipant({ userId }: VoiceParticipantProps): React.ReactNode {
  const member = useMemberStore((s) => s.members.find((m) => m.id === userId));

  const username = member?.username ?? 'Unknown';
  const avatarColor = getAvatarColor(username);
  const initial = username.charAt(0).toUpperCase();

  return (
    <div className="h-8 flex items-center gap-2 pl-6 pr-2">
      <div
        className="w-6 h-6 rounded-full flex items-center justify-center text-xs font-medium text-text-primary flex-shrink-0"
        style={{ backgroundColor: avatarColor }}
      >
        {initial}
      </div>
      <span className="text-sm text-text-secondary truncate">{username}</span>
    </div>
  );
}
