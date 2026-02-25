import React, { useEffect } from 'react';
import { useParams } from 'react-router';
import { Hash, Users } from 'lucide-react';
import { useChannelStore } from '../../stores/useChannelStore';
import { useUIStore } from '../../stores/useUIStore';
import useMessageStore from '../../stores/useMessageStore';
import type { DecryptedMessage } from '../../stores/useMessageStore';
import { ConnectionBanner } from './ConnectionBanner';
import MessageInput from '../messages/MessageInput';

const EMPTY_MESSAGES: DecryptedMessage[] = [];

export function ContentArea(): React.ReactNode {
  const { channelId } = useParams<{ channelId: string }>();
  const channels = useChannelStore((s) => s.channels);
  const setActiveChannel = useChannelStore((s) => s.setActiveChannel);
  const isMemberListVisible = useUIStore((s) => s.isMemberListVisible);
  const toggleMemberList = useUIStore((s) => s.toggleMemberList);
  const fetchMessages = useMessageStore((s) => s.fetchMessages);
  const setCurrentChannel = useMessageStore((s) => s.setCurrentChannel);
  const channelMessages = useMessageStore((s) => channelId ? s.messages.get(channelId) ?? EMPTY_MESSAGES : EMPTY_MESSAGES);
  const isLoadingMessages = useMessageStore((s) => s.isLoading);

  useEffect(() => {
    if (channelId) {
      setActiveChannel(channelId);
      setCurrentChannel(channelId);
      fetchMessages(channelId);
    }
  }, [channelId, setActiveChannel, setCurrentChannel, fetchMessages]);

  const channel = channels.find((c) => c.id === channelId);

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
      <div className="flex-1 overflow-y-auto flex flex-col">
        {isLoadingMessages ? (
          <div className="flex-1 flex items-center justify-center">
            <p className="text-text-muted">Loading messages...</p>
          </div>
        ) : channelMessages.length === 0 ? (
          <div className="flex-1 flex items-center justify-center">
            <div className="text-center">
              <h2 className="text-2xl font-bold text-text-primary">Welcome to #{channel.name}</h2>
              <p className="text-text-secondary mt-2">This is the start of the #{channel.name} channel.</p>
            </div>
          </div>
        ) : (
          <div className="flex-1 overflow-y-auto p-4 space-y-1">
            {channelMessages.map((msg) => (
              <MessageBubble key={msg.id} message={msg} />
            ))}
          </div>
        )}
      </div>
      <MessageInput channelId={channel.id} channelName={channel.name} />
    </>
  );
}

function MessageBubble({ message }: { message: DecryptedMessage }): React.ReactNode {
  const time = new Date(message.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  const isFailed = message.status === 'failed';
  const isSending = message.status === 'sending';

  return (
    <div className={`py-1 px-2 hover:bg-bg-secondary/30 rounded ${isFailed ? 'opacity-60' : ''}`}>
      <div className="flex items-baseline gap-2">
        <span className="text-text-primary font-medium text-sm">{message.authorId.slice(0, 8)}</span>
        <span className="text-text-muted text-xs">{time}</span>
        {isSending && <span className="text-text-muted text-xs italic">Sending...</span>}
        {isFailed && <span className="text-[#f23f43] text-xs">Message not delivered</span>}
      </div>
      <p className="text-text-secondary text-sm whitespace-pre-wrap break-words">{message.content}</p>
    </div>
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
