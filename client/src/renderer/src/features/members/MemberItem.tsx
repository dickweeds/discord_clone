import React from 'react';
import type { UserPublic } from 'discord-clone-shared';
import { Avatar } from '../../components';

interface MemberItemProps {
  member: UserPublic;
  isOnline: boolean;
}

export function MemberItem({ member, isOnline }: MemberItemProps): React.ReactNode {
  return (
    <div className={`h-[42px] px-4 flex items-center gap-2 rounded-md hover:bg-bg-hover mx-2 cursor-default ${!isOnline ? 'opacity-60' : ''}`}>
      {/* Avatar with status dot */}
      <div className="relative flex-shrink-0">
        <Avatar
          username={member.username}
          avatarUrl={member.avatarUrl}
          sizeClassName="w-8 h-8"
          textClassName="text-sm"
        />
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
