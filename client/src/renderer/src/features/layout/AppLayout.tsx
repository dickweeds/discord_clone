import React, { useEffect, useRef } from 'react';
import { Outlet } from 'react-router';
import { ChannelSidebar } from '../channels/ChannelSidebar';
import { MemberList } from '../members/MemberList';
import useChannelStore from '../../stores/useChannelStore';
import useMemberStore from '../../stores/useMemberStore';
import useUIStore from '../../stores/useUIStore';

const MEMBER_LIST_BREAKPOINT = 1000;

export function AppLayout(): React.ReactNode {
  const fetchChannels = useChannelStore((s) => s.fetchChannels);
  const fetchMembers = useMemberStore((s) => s.fetchMembers);
  const isMemberListVisible = useUIStore((s) => s.isMemberListVisible);

  const wasAutoCollapsed = useRef(false);
  const userManuallyClosed = useRef(false);
  const previousVisibility = useRef(isMemberListVisible);

  useEffect(() => {
    void fetchChannels();
    void fetchMembers();
  }, [fetchChannels, fetchMembers]);

  useEffect(() => {
    if (
      window.innerWidth >= MEMBER_LIST_BREAKPOINT
      && previousVisibility.current
      && !isMemberListVisible
      && !wasAutoCollapsed.current
    ) {
      userManuallyClosed.current = true;
    }

    if (!previousVisibility.current && isMemberListVisible) {
      userManuallyClosed.current = false;
    }

    previousVisibility.current = isMemberListVisible;
  }, [isMemberListVisible]);

  useEffect(() => {
    const handleResize = () => {
      const currentState = useUIStore.getState();

      if (window.innerWidth < MEMBER_LIST_BREAKPOINT) {
        if (currentState.isMemberListVisible) {
          wasAutoCollapsed.current = true;
          currentState.setMemberListVisible(false);
        }
        return;
      }

      if (wasAutoCollapsed.current) {
        wasAutoCollapsed.current = false;
        if (!userManuallyClosed.current) {
          currentState.setMemberListVisible(true);
        }
      }
    };

    window.addEventListener('resize', handleResize);
    handleResize();

    return () => {
      window.removeEventListener('resize', handleResize);
    };
  }, []);

  return (
    <div className="flex h-screen overflow-hidden bg-bg-primary">
      <nav className="w-[240px] shrink-0 bg-bg-secondary" aria-label="Channel navigation">
        <ChannelSidebar />
      </nav>

      <main className="min-w-0 flex-1 bg-bg-primary" aria-label="Channel content">
        <Outlet />
      </main>

      {isMemberListVisible ? (
        <aside className="w-[240px] shrink-0 bg-bg-secondary" aria-label="Member list">
          <MemberList />
        </aside>
      ) : null}
    </div>
  );
}
