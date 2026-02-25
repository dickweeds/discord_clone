import React from 'react';
import type { UserPublic } from 'discord-clone-shared';
import { getAvatarColor } from '../../utils/avatarColor';

interface MemberItemProps {
  member: UserPublic;
  isOnline: boolean;
}

export function MemberItem({ member, isOnline }: MemberItemProps): React.ReactNode {
  const avatarColor = getAvatarColor(member.username);
  const initial = member.username.charAt(0).toUpperCase();

  return (
    <div className={`h-[42px] px-4 flex items-center gap-2 rounded-md hover:bg-bg-hover mx-2 cursor-default ${!isOnline ? 'opacity-60' : ''}`}>
      {/* Avatar with status dot */}
      <div className="relative flex-shrink-0">
        <div
          className="w-8 h-8 rounded-full flex items-center justify-center text-sm font-medium text-text-primary"
          style={{ backgroundColor: avatarColor }}
        >
          {initial}
        </div>
        <div className={`absolute bottom-0 right-0 w-2.5 h-2.5 rounded-full border-2 border-bg-secondary ${isOnline ? 'bg-status-online' : 'bg-status-offline'}`} />
      </div>

      {/* Username */}
      <span className={`text-sm truncate ${isOnline ? 'text-text-primary' : 'text-text-muted'}`}>
        {member.username}
      </span>

      {/* Owner badge */}
      {member.role === 'owner' && (
        <span className="text-xs text-accent-primary flex-shrink-0">OWNER</span>
      )}
    </div>
  );
}
