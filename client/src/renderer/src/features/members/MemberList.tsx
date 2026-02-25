import React from 'react';
import { ScrollArea } from '../../components';
import useAuthStore from '../../stores/useAuthStore';
import useMemberStore from '../../stores/useMemberStore';
import { MemberItem } from './MemberItem';

export function MemberList(): React.ReactNode {
  const currentUser = useAuthStore((s) => s.user);
  const members = useMemberStore((s) => s.members);
  const isLoading = useMemberStore((s) => s.isLoading);

  const onlineMembers = members.filter((member) => member.id === currentUser?.id);
  const offlineMembers = members.filter((member) => member.id !== currentUser?.id);

  return (
    <div className="h-full bg-bg-secondary py-3">
      <ScrollArea className="h-full">
        <section>
          <h2 className="px-4 py-1.5 text-xs font-semibold uppercase tracking-wide text-text-muted" role="heading" aria-level={2}>
            ONLINE - {onlineMembers.length}
          </h2>
          {isLoading ? (
            <div className="space-y-2 px-4 py-2">
              {Array.from({ length: 4 }).map((_, index) => (
                <div key={`online-skeleton-${index}`} className="flex h-[42px] animate-pulse items-center gap-2">
                  <div className="h-8 w-8 rounded-full bg-bg-tertiary" />
                  <div className="h-3 w-24 rounded bg-bg-tertiary" />
                </div>
              ))}
            </div>
          ) : (
            onlineMembers.map((member) => (
              <MemberItem key={member.id} member={member} isOnline />
            ))
          )}
        </section>

        <section className="mt-3">
          <h2 className="px-4 py-1.5 text-xs font-semibold uppercase tracking-wide text-text-muted" role="heading" aria-level={2}>
            OFFLINE - {offlineMembers.length}
          </h2>
          {isLoading ? (
            <div className="space-y-2 px-4 py-2">
              {Array.from({ length: 4 }).map((_, index) => (
                <div key={`offline-skeleton-${index}`} className="flex h-[42px] animate-pulse items-center gap-2">
                  <div className="h-8 w-8 rounded-full bg-bg-tertiary" />
                  <div className="h-3 w-24 rounded bg-bg-tertiary" />
                </div>
              ))}
            </div>
          ) : (
            offlineMembers.map((member) => (
              <MemberItem key={member.id} member={member} isOnline={false} />
            ))
          )}
        </section>
      </ScrollArea>
    </div>
  );
}
