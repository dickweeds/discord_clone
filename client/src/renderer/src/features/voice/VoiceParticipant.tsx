import React from 'react';
import { useMemberStore } from '../../stores/useMemberStore';
import { useVoiceStore } from '../../stores/useVoiceStore';
import { getAvatarColor } from '../../utils/avatarColor';
import useAuthStore from '../../stores/useAuthStore';
import { MicOff } from 'lucide-react';

interface VoiceParticipantProps {
  userId: string;
}

export function VoiceParticipant({ userId }: VoiceParticipantProps): React.ReactNode {
  const member = useMemberStore((s) => s.members.find((m) => m.id === userId));
  const isSpeaking = useVoiceStore((s) => s.speakingUsers.has(userId));
  const isMuted = useVoiceStore((s) => s.isMuted);
  const currentUserId = useAuthStore((s) => s.user?.id);
  const isLocalUser = userId === currentUserId;

  const username = member?.username ?? 'Unknown';
  const avatarColor = getAvatarColor(username);
  const initial = username.charAt(0).toUpperCase();

  return (
    <div
      className="h-8 flex items-center gap-2 pl-6 pr-2"
      role="listitem"
      aria-label={`${username}${isSpeaking ? ' (speaking)' : ''}${isLocalUser && isMuted ? ' (muted)' : ''}`}
    >
      <div
        className={[
          'w-6 h-6 rounded-full flex items-center justify-center text-xs font-medium text-text-primary flex-shrink-0 relative',
          isSpeaking && 'ring-2 ring-voice-speaking animate-speakingPulse',
        ].filter(Boolean).join(' ')}
        style={{ backgroundColor: avatarColor }}
      >
        {initial}
        {isLocalUser && isMuted && (
          <div className="absolute -bottom-0.5 -right-0.5 bg-bg-primary rounded-full p-0.5">
            <MicOff className="w-3 h-3 text-text-muted" />
          </div>
        )}
      </div>
      <span className="text-sm text-text-secondary truncate">{username}</span>
    </div>
  );
}
