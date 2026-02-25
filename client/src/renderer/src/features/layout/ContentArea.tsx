import React, { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { useParams, useNavigate } from 'react-router';
import { ArrowDown, Hash, Loader2, Users } from 'lucide-react';
import { useChannelStore } from '../../stores/useChannelStore';
import { useUIStore } from '../../stores/useUIStore';
import useMessageStore from '../../stores/useMessageStore';
import type { DecryptedMessage } from '../../stores/useMessageStore';
import { fetchMessages, fetchOlderMessages } from '../../services/messageService';
import { ConnectionBanner } from './ConnectionBanner';
import MessageInput from '../messages/MessageInput';
import { MessageGroup } from '../messages/MessageGroup';
import { groupMessages } from '../../utils/groupMessages';

const EMPTY_MESSAGES: DecryptedMessage[] = [];

export function ContentArea(): React.ReactNode {
  const { channelId } = useParams<{ channelId: string }>();
  const channels = useChannelStore((s) => s.channels);
  const activeChannelId = useChannelStore((s) => s.activeChannelId);
  const setActiveChannel = useChannelStore((s) => s.setActiveChannel);
  const isMemberListVisible = useUIStore((s) => s.isMemberListVisible);
  const toggleMemberList = useUIStore((s) => s.toggleMemberList);
  const setCurrentChannel = useMessageStore((s) => s.setCurrentChannel);
  const channelMessages = useMessageStore((s) => channelId ? s.messages.get(channelId) ?? EMPTY_MESSAGES : EMPTY_MESSAGES);
  const isLoadingMessages = useMessageStore((s) => s.isLoading);
  const isLoadingMore = useMessageStore((s) => s.isLoadingMore);
  const hasMore = useMessageStore((s) => channelId ? s.hasMoreMessages.get(channelId) ?? true : false);
  const messageError = useMessageStore((s) => s.error);
  const navigate = useNavigate();

  const scrollRef = useRef<HTMLDivElement>(null);
  const isAtBottom = useRef(true);
  const prevMessageCount = useRef(0);
  const [hasNewMessages, setHasNewMessages] = useState(false);
  const prevFirstMsgId = useRef<string | undefined>();
  const loadingMoreRef = useRef(false);

  const messageGroups = useMemo(() => groupMessages(channelMessages), [channelMessages]);

  useEffect(() => {
    if (channelId) {
      setActiveChannel(channelId);
      setCurrentChannel(channelId);
      setHasNewMessages(false);
      isAtBottom.current = true;
      prevMessageCount.current = 0;
      prevScrollHeight.current = 0;
      prevFirstMsgId.current = undefined;
      loadingMoreRef.current = false;
      fetchMessages(channelId);
    }
  }, [channelId, setActiveChannel, setCurrentChannel]);

  // Scroll to bottom on initial load (isLoading transitions false)
  useEffect(() => {
    if (!isLoadingMessages && scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
      isAtBottom.current = true;
      prevMessageCount.current = channelMessages.length;
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isLoadingMessages]);

  // Auto-scroll or show new messages indicator when messages change
  useEffect(() => {
    const count = channelMessages.length;
    if (count > prevMessageCount.current && prevMessageCount.current > 0) {
      if (isAtBottom.current && scrollRef.current) {
        scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
      } else if (!isAtBottom.current) {
        setHasNewMessages(true);
      }
    }
    prevMessageCount.current = count;
  }, [channelMessages]);

  const handleScroll = useCallback(() => {
    const el = scrollRef.current;
    if (!el) return;

    // Track if at bottom (50px threshold)
    isAtBottom.current = el.scrollHeight - el.scrollTop - el.clientHeight < 50;

    // Hide new messages indicator when user scrolls to bottom
    if (isAtBottom.current) {
      setHasNewMessages(false);
    }

    // Infinite scroll-up: load older messages when near top
    // Uses ref guard (synchronous) instead of React state to prevent duplicate requests
    if (el.scrollTop < 100 && hasMore && !loadingMoreRef.current && channelId) {
      loadingMoreRef.current = true;
      fetchOlderMessages(channelId).finally(() => {
        loadingMoreRef.current = false;
      });
    }
  }, [hasMore, channelId]);

  // Preserve scroll position only after prepending older messages (not on append)
  const prevScrollHeight = useRef(0);
  useLayoutEffect(() => {
    const el = scrollRef.current;
    if (!el) return;

    const firstMsgId = channelMessages.length > 0 ? channelMessages[0].id : undefined;
    const wasPrepend =
      prevFirstMsgId.current !== undefined &&
      firstMsgId !== undefined &&
      prevFirstMsgId.current !== firstMsgId;

    if (wasPrepend && prevScrollHeight.current > 0 && el.scrollHeight > prevScrollHeight.current) {
      const delta = el.scrollHeight - prevScrollHeight.current;
      el.scrollTop += delta;
    }

    prevScrollHeight.current = el.scrollHeight;
    prevFirstMsgId.current = firstMsgId;
  }, [channelMessages]);

  const scrollToBottom = useCallback(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' });
      setHasNewMessages(false);
    }
  }, []);

  const channel = channels.find((c) => c.id === channelId);

  // Redirect when the current channel is deleted
  useEffect(() => {
    if (channelId && channels.length > 0 && !channel) {
      if (activeChannelId) {
        navigate(`/app/channels/${activeChannelId}`, { replace: true });
      } else {
        navigate('/app/channels', { replace: true });
      }
    }
  }, [channelId, channel, channels.length, activeChannelId, navigate]);

  if (!channel) {
    return (
      <>
        <ContentHeader channelName={null} isMemberListVisible={isMemberListVisible} onToggleMemberList={toggleMemberList} />
        <ConnectionBanner />
        <div className="flex-1 flex items-center justify-center">
          <p className="text-text-muted text-lg">Select a channel</p>
        </div>
      </>
    );
  }

  return (
    <>
      <ContentHeader channelName={channel.name} isMemberListVisible={isMemberListVisible} onToggleMemberList={toggleMemberList} />
      <ConnectionBanner />
      <div className="flex-1 flex flex-col min-h-0">
        {isLoadingMessages ? (
          <div className="flex-1 flex items-center justify-center">
            <p className="text-text-muted">Loading messages...</p>
          </div>
        ) : messageError ? (
          <div className="flex-1 flex items-center justify-center">
            <p className="text-[#f23f43]">Failed to load messages. Please try again.</p>
          </div>
        ) : channelMessages.length === 0 ? (
          <div className="flex-1 flex items-center justify-center">
            <div className="text-center">
              <h2 className="text-2xl font-bold text-text-primary">{channel.name}</h2>
              <p className="text-text-secondary mt-2">This is the beginning of #{channel.name}. Send the first message!</p>
            </div>
          </div>
        ) : (
          <div className="flex-1 overflow-y-auto relative" ref={scrollRef} onScroll={handleScroll} role="log" aria-label={`Messages in ${channel.name}`}>
            {isLoadingMore && (
              <div className="flex justify-center py-2">
                <Loader2 className="animate-spin text-text-muted" size={20} aria-label="Loading older messages" />
              </div>
            )}
            {!hasMore && (
              <div className="text-center py-4">
                <p className="text-text-muted text-sm">This is the beginning of #{channel.name}</p>
              </div>
            )}
            <div className="max-w-[720px] mx-auto w-full px-4 py-4">
              {messageGroups.map((group, index) => (
                <MessageGroup key={`${group.authorId}-${group.firstTimestamp}`} group={group} isFirst={index === 0} />
              ))}
            </div>
            {hasNewMessages && (
              <button
                onClick={scrollToBottom}
                className="sticky bottom-2 left-1/2 -translate-x-1/2 bg-accent-primary text-text-primary rounded-full px-4 py-1.5 text-sm font-medium shadow-lg cursor-pointer flex items-center gap-1.5 z-10"
                aria-label="Jump to new messages"
              >
                New messages
                <ArrowDown size={14} />
              </button>
            )}
          </div>
        )}
      </div>
      <MessageInput channelId={channel.id} channelName={channel.name} />
    </>
  );
}

function ContentHeader({
  channelName,
  isMemberListVisible,
  onToggleMemberList,
}: {
  channelName: string | null;
  isMemberListVisible: boolean;
  onToggleMemberList: () => void;
}): React.ReactNode {
  return (
    <div className="h-12 px-4 flex items-center border-b border-border-default bg-bg-primary shadow-sm flex-shrink-0">
      {channelName && (
        <div className="flex items-center gap-2">
          <Hash size={20} className="text-text-muted" />
          <span className="text-text-primary font-semibold">{channelName}</span>
        </div>
      )}
      <div className="ml-auto">
        <button
          aria-label="Toggle member list"
          onClick={onToggleMemberList}
          className={`p-1 rounded transition-colors duration-150 focus-visible:ring-2 focus-visible:ring-accent-primary focus-visible:ring-offset-0 focus-visible:outline-none ${
            isMemberListVisible ? 'text-text-primary' : 'text-text-muted'
          }`}
        >
          <Users size={20} />
        </button>
      </div>
    </div>
  );
}
