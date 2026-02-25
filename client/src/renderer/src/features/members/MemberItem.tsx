import React from 'react';
import type { UserPublic } from 'discord-clone-shared';

interface MemberItemProps {
  member: UserPublic;
  isOnline: boolean;
}

export function MemberItem({ member, isOnline }: MemberItemProps): React.ReactNode {
  return (
    <div className="mx-2 flex h-[42px] cursor-default items-center gap-2 rounded-md px-4 hover:bg-bg-hover">
      <div className="relative">
        <div className="flex h-8 w-8 items-center justify-center rounded-full bg-bg-active text-sm font-medium text-text-primary" aria-hidden="true">
          {member.username.slice(0, 1).toUpperCase()}
        </div>
        <span
          className={`absolute -bottom-0.5 -right-0.5 h-2.5 w-2.5 rounded-full border-2 border-bg-secondary ${isOnline ? 'bg-status-online' : 'bg-status-offline'}`}
        />
      </div>

      <div className="flex min-w-0 items-center gap-2">
        <span className={`truncate text-sm ${isOnline ? 'text-text-primary' : 'text-text-muted opacity-60'}`}>
          {member.username}
        </span>
        {member.role === 'owner' ? <span className="text-xs text-accent-primary">OWNER</span> : null}
      </div>
    </div>
  );
}
