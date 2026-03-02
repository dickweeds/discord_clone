import React from 'react';
import { useMemberStore } from '../../stores/useMemberStore';
import { useVoiceStore } from '../../stores/useVoiceStore';
import useAuthStore from '../../stores/useAuthStore';
import { MicOff, HeadphoneOff } from 'lucide-react';
import { Avatar } from '../../components';

interface VoiceParticipantProps {
  userId: string;
}

export function VoiceParticipant({ userId }: VoiceParticipantProps): React.ReactNode {
  const member = useMemberStore((s) => s.members.find((m) => m.id === userId));
  const isSpeaking = useVoiceStore((s) => s.speakingUsers.has(userId));
  const isMuted = useVoiceStore((s) => s.isMuted);
  const isDeafened = useVoiceStore((s) => s.isDeafened);
  const remoteMuteState = useVoiceStore((s) => s.remoteMuteState.get(userId));
  const currentUserId = useAuthStore((s) => s.user?.id);
  const isLocalUser = userId === currentUserId;

  // Determine mute/deafen state for display
  const showLocalMuted = isLocalUser && isMuted && !isDeafened;
  const showLocalDeafened = isLocalUser && isDeafened;
  const showRemoteMuted = !isLocalUser && remoteMuteState?.muted && !remoteMuteState?.deafened;
  const showRemoteDeafened = !isLocalUser && remoteMuteState?.deafened;

  const showMuteIcon = showLocalMuted || showRemoteMuted;
  const showDeafenIcon = showLocalDeafened || showRemoteDeafened;

  const username = member?.username ?? 'Unknown';
  const avatarUrl = member?.avatarUrl;

  // Build ARIA label
  let ariaLabel = username;
  if (isSpeaking) ariaLabel += ' (speaking)';
  if (isLocalUser && isDeafened) ariaLabel += ' (deafened)';
  else if (isLocalUser && isMuted) ariaLabel += ' (muted)';
  if (!isLocalUser && remoteMuteState?.deafened) ariaLabel += ' (deafened)';
  else if (!isLocalUser && remoteMuteState?.muted) ariaLabel += ' (muted)';

  return (
    <div
      className="h-8 flex items-center gap-2 pl-6 pr-2"
      role="listitem"
      aria-label={ariaLabel}
    >
      <Avatar
        username={username}
        avatarUrl={avatarUrl}
        sizeClassName="w-6 h-6"
        textClassName="text-xs"
        className={[
          'flex-shrink-0',
          isSpeaking && 'ring-2 ring-voice-speaking animate-speakingPulse',
        ].filter(Boolean).join(' ')}
      >
        {showDeafenIcon && (
          <div className="absolute -bottom-0.5 -right-0.5 bg-bg-primary rounded-full p-0.5">
            <HeadphoneOff className="w-3 h-3 text-text-muted" />
          </div>
        )}
        {showMuteIcon && !showDeafenIcon && (
          <div className="absolute -bottom-0.5 -right-0.5 bg-bg-primary rounded-full p-0.5">
            <MicOff className="w-3 h-3 text-text-muted" />
          </div>
        )}
      </Avatar>
      <span className="text-sm text-text-secondary truncate">{username}</span>
    </div>
  );
}
