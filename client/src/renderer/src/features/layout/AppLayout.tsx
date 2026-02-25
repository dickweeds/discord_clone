import React, { useEffect, useRef } from 'react';
import { Outlet } from 'react-router';
import { useChannelStore } from '../../stores/useChannelStore';
import { useMemberStore } from '../../stores/useMemberStore';
import { useUIStore } from '../../stores/useUIStore';
import { ChannelSidebar } from '../channels/ChannelSidebar';
import { MemberList } from '../members/MemberList';

const MEMBER_LIST_BREAKPOINT = 1000;

export function AppLayout(): React.ReactNode {
  const isMemberListVisible = useUIStore((s) => s.isMemberListVisible);
  const setMemberListVisible = useUIStore((s) => s.setMemberListVisible);
  const fetchChannels = useChannelStore((s) => s.fetchChannels);
  const fetchMembers = useMemberStore((s) => s.fetchMembers);
  const wasAutoCollapsed = useRef(false);

  useEffect(() => {
    fetchChannels();
    fetchMembers();
  }, [fetchChannels, fetchMembers]);

  useEffect(() => {
    const handleResize = () => {
      if (window.innerWidth < MEMBER_LIST_BREAKPOINT) {
        if (useUIStore.getState().isMemberListVisible) {
          wasAutoCollapsed.current = true;
          setMemberListVisible(false);
        }
      } else if (wasAutoCollapsed.current) {
        wasAutoCollapsed.current = false;
        setMemberListVisible(true);
      }
    };

    window.addEventListener('resize', handleResize);
    handleResize();
    return () => window.removeEventListener('resize', handleResize);
  }, [setMemberListVisible]);

  return (
    <div className="flex h-screen overflow-hidden">
      <nav aria-label="Channel navigation" className="w-[240px] flex-shrink-0 bg-bg-secondary flex flex-col">
        <ChannelSidebar />
      </nav>
      <main aria-label="Channel content" className="flex-1 min-w-0 bg-bg-primary flex flex-col">
        <Outlet />
      </main>
      {isMemberListVisible && (
        <aside aria-label="Member list" className="w-[240px] flex-shrink-0 bg-bg-secondary">
          <MemberList />
        </aside>
      )}
    </div>
  );
}
