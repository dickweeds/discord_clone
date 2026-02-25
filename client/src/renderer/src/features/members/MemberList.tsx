import React from 'react';
import useAuthStore from '../../stores/useAuthStore';
import { useMemberStore } from '../../stores/useMemberStore';
import { ScrollArea } from '../../components';
import { MemberItem } from './MemberItem';

export function MemberList(): React.ReactNode {
  const currentUser = useAuthStore((s) => s.user);
  const members = useMemberStore((s) => s.members);
  const isLoading = useMemberStore((s) => s.isLoading);

  if (isLoading) {
    return <MemberSkeletons />;
  }

  const onlineMembers = members.filter((m) => m.id === currentUser?.id);
  const offlineMembers = members.filter((m) => m.id !== currentUser?.id);

  return (
    <ScrollArea className="h-full">
      <div className="py-2">
        {onlineMembers.length > 0 && (
          <div>
            <h2 className="text-text-muted text-xs font-semibold uppercase tracking-wide px-4 py-1.5">
              ONLINE — {onlineMembers.length}
            </h2>
            {onlineMembers.map((member) => (
              <MemberItem key={member.id} member={member} isOnline={true} />
            ))}
          </div>
        )}
        {offlineMembers.length > 0 && (
          <div>
            <h2 className="text-text-muted text-xs font-semibold uppercase tracking-wide px-4 py-1.5">
              OFFLINE — {offlineMembers.length}
            </h2>
            {offlineMembers.map((member) => (
              <MemberItem key={member.id} member={member} isOnline={false} />
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
