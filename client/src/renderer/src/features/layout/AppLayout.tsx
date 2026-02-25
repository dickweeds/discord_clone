import React, { useEffect, useRef, useCallback } from 'react';
import { Outlet } from 'react-router';
import useAuthStore from '../../stores/useAuthStore';
import { useChannelStore } from '../../stores/useChannelStore';
import { useMemberStore } from '../../stores/useMemberStore';
import { useUIStore } from '../../stores/useUIStore';
import { useVoiceStore } from '../../stores/useVoiceStore';
import { wsClient } from '../../services/wsClient';
import { ChannelSidebar } from '../channels/ChannelSidebar';
import { MemberList } from '../members/MemberList';

const MEMBER_LIST_BREAKPOINT = 1000;

export function AppLayout(): React.ReactNode {
  const isMemberListVisible = useUIStore((s) => s.isMemberListVisible);
  const setMemberListVisible = useUIStore((s) => s.setMemberListVisible);
  const fetchChannels = useChannelStore((s) => s.fetchChannels);
  const fetchMembers = useMemberStore((s) => s.fetchMembers);
  const accessToken = useAuthStore((s) => s.accessToken);
  const wasAutoCollapsed = useRef(false);

  useEffect(() => {
    fetchChannels();
    fetchMembers();
  }, [fetchChannels, fetchMembers]);

  // Connect WebSocket when authenticated
  const wsConnectedRef = useRef(false);
  useEffect(() => {
    if (accessToken && !wsConnectedRef.current) {
      wsClient.connect(accessToken);
      wsConnectedRef.current = true;
    } else if (accessToken && wsConnectedRef.current) {
      // Token refreshed — update stored token for reconnection
      wsClient.updateToken(accessToken);
    } else if (!accessToken && wsConnectedRef.current) {
      // Logged out — disconnect
      wsClient.disconnect();
      wsConnectedRef.current = false;
    }
  }, [accessToken]);

  // Disconnect WebSocket on unmount only
  useEffect(() => {
    return () => {
      if (wsConnectedRef.current) {
        wsClient.disconnect();
        wsConnectedRef.current = false;
      }
    };
  }, []);

  // Voice keyboard shortcuts
  const handleVoiceShortcuts = useCallback((e: KeyboardEvent) => {
    if (!(e.metaKey || e.ctrlKey) || !e.shiftKey) return;
    if (!useVoiceStore.getState().currentChannelId) return;

    const key = e.key.toLowerCase();
    if (key === 'm') {
      e.preventDefault();
      useVoiceStore.getState().toggleMute();
    } else if (key === 'd') {
      e.preventDefault();
      useVoiceStore.getState().toggleDeafen();
    } else if (key === 'e') {
      e.preventDefault();
      useVoiceStore.getState().leaveChannel();
    }
  }, []);

  useEffect(() => {
    window.addEventListener('keydown', handleVoiceShortcuts);
    return () => window.removeEventListener('keydown', handleVoiceShortcuts);
  }, [handleVoiceShortcuts]);

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
