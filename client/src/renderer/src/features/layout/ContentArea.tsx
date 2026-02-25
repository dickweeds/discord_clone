import React, { useEffect } from 'react';
import { Hash, Users } from 'lucide-react';
import { useParams } from 'react-router';
import useChannelStore from '../../stores/useChannelStore';
import useUIStore from '../../stores/useUIStore';

export function ContentArea(): React.ReactNode {
  const { channelId } = useParams();
  const channels = useChannelStore((s) => s.channels);
  const activeChannelId = useChannelStore((s) => s.activeChannelId);
  const setActiveChannel = useChannelStore((s) => s.setActiveChannel);
  const isMemberListVisible = useUIStore((s) => s.isMemberListVisible);
  const toggleMemberList = useUIStore((s) => s.toggleMemberList);

  useEffect(() => {
    if (channelId && channelId !== activeChannelId) {
      setActiveChannel(channelId);
    }
  }, [activeChannelId, channelId, setActiveChannel]);

  const activeChannel = channels.find((channel) => channel.id === (channelId ?? activeChannelId));

  return (
    <div className="flex h-full min-w-0 flex-1 flex-col bg-bg-primary">
      <header className="h-12 border-b border-border-default bg-bg-primary px-4 shadow-sm flex items-center">
        <div className="flex min-w-0 items-center gap-2">
          <Hash size={20} className="text-text-secondary" />
          <span className="truncate font-semibold text-text-primary">
            {activeChannel?.name ?? 'Select a channel'}
          </span>
        </div>

        <button
          type="button"
          onClick={toggleMemberList}
          aria-label="Toggle member list"
          className={`ml-auto rounded-md p-1.5 transition-colors ${
            isMemberListVisible ? 'text-text-primary' : 'text-text-muted'
          } hover:bg-bg-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-primary focus-visible:ring-offset-0`}
        >
          <Users size={20} />
        </button>
      </header>

      <div className="flex-1 overflow-y-auto p-8">
        {activeChannel ? (
          <>
            <h1 className="text-2xl font-bold text-text-primary">Welcome to #{activeChannel.name}</h1>
            <p className="mt-2 text-text-secondary">This is the start of the #{activeChannel.name} channel.</p>
          </>
        ) : (
          <h1 className="text-2xl font-bold text-text-primary">Select a channel</h1>
        )}
      </div>
    </div>
  );
}
