import React, { useState } from 'react';
import { useMemberStore } from '../../stores/useMemberStore';
import { usePresenceStore } from '../../stores/usePresenceStore';
import useAuthStore from '../../stores/useAuthStore';
import { ScrollArea } from '../../components';
import { MemberItem } from './MemberItem';
import { BannedUsersPanel } from '../admin/BannedUsersPanel';
import { UserContextMenu } from '../userContextMenu/UserContextMenu';

export function MemberList(): React.ReactNode {
  const members = useMemberStore((s) => s.members);
  const isLoading = useMemberStore((s) => s.isLoading);
  const onlineUsers = usePresenceStore((s) => s.onlineUsers);
  const isOwner = useAuthStore((s) => s.user?.role === 'owner');
  const [bannedPanelOpen, setBannedPanelOpen] = useState(false);

  if (isLoading) {
    return <MemberSkeletons />;
  }

  const onlineMembers = members.filter((m) => onlineUsers.has(m.id));
  const offlineMembers = members.filter((m) => !onlineUsers.has(m.id));

  return (
    <ScrollArea className="h-full">
      <div className="py-2">
        {isOwner && (
          <>
            <button
              className="mx-4 mb-2 text-xs text-text-muted hover:text-text-primary transition-colors"
              onClick={() => setBannedPanelOpen(true)}
            >
              Manage Bans
            </button>
            <BannedUsersPanel open={bannedPanelOpen} onOpenChange={setBannedPanelOpen} />
          </>
        )}
        {onlineMembers.length > 0 && (
          <div>
            <h2 className="text-text-muted text-xs font-semibold uppercase tracking-wide px-4 py-1.5">
              ONLINE — {onlineMembers.length}
            </h2>
            {onlineMembers.map((member) => (
              <UserContextMenu
                key={member.id}
                userId={member.id}
                username={member.username}
                surface="member-online"
                isTargetOnline={true}
                isTargetInVoice={false}
              >
                <MemberItem member={member} isOnline={true} />
              </UserContextMenu>
            ))}
          </div>
        )}
        {offlineMembers.length > 0 && (
          <div>
            <h2 className="text-text-muted text-xs font-semibold uppercase tracking-wide px-4 py-1.5">
              OFFLINE — {offlineMembers.length}
            </h2>
            {offlineMembers.map((member) => (
              <UserContextMenu
                key={member.id}
                userId={member.id}
                username={member.username}
                surface="member-offline"
                isTargetOnline={false}
                isTargetInVoice={false}
              >
                <MemberItem member={member} isOnline={false} />
              </UserContextMenu>
            ))}
          </div>
        )}
      </div>
    </ScrollArea>
  );
}

function MemberSkeletons(): React.ReactNode {
  return (
    <div className="py-2 px-2 flex flex-col gap-1">
      {Array.from({ length: 8 }, (_, i) => (
        <div key={i} className="h-[42px] mx-2 px-4 flex items-center gap-2">
          <div className="w-8 h-8 rounded-full bg-bg-hover animate-pulse flex-shrink-0" />
          <div className="h-4 flex-1 rounded bg-bg-hover animate-pulse" />
        </div>
      ))}
    </div>
  );
}
