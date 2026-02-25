import React from 'react';
import { ChevronDown } from 'lucide-react';
import { useChannelStore, type ChannelListItem } from '../../stores/useChannelStore';
import { ScrollArea } from '../../components';
import { ChannelItem } from './ChannelItem';
import { UserPanel } from '../layout/UserPanel';

export function ChannelSidebar(): React.ReactNode {
  const channels = useChannelStore((s) => s.channels);
  const activeChannelId = useChannelStore((s) => s.activeChannelId);
  const isLoading = useChannelStore((s) => s.isLoading);

  const textChannels = channels.filter((c) => c.type === 'text');
  const voiceChannels = channels.filter((c) => c.type === 'voice');

  return (
    <>
      {/* Server Header */}
      <div className="h-12 px-4 flex items-center border-b border-border-default shadow-sm cursor-pointer hover:bg-bg-hover transition-colors duration-150">
        <span className="text-text-primary font-semibold truncate flex-1">discord_clone</span>
        <ChevronDown size={18} className="text-text-secondary flex-shrink-0" />
      </div>

      {/* Channel List */}
      <ScrollArea className="flex-1">
        <div className="py-2">
          {isLoading ? (
            <ChannelSkeletons />
          ) : (
            <>
              <ChannelGroup label="TEXT CHANNELS" channels={textChannels} activeChannelId={activeChannelId} />
              <ChannelGroup label="VOICE CHANNELS" channels={voiceChannels} activeChannelId={activeChannelId} />
            </>
          )}
        </div>
      </ScrollArea>

      {/* User Panel */}
      <UserPanel />
    </>
  );
}

function ChannelGroup({
  label,
  channels,
  activeChannelId,
}: {
  label: string;
  channels: ChannelListItem[];
  activeChannelId: string | null;
}): React.ReactNode {
  if (channels.length === 0) return null;

  return (
    <div className="mt-2">
      <h2 className="text-text-muted text-xs font-semibold uppercase tracking-wide px-2 py-1.5">
        {label}
      </h2>
      {channels.map((channel) => (
        <ChannelItem
          key={channel.id}
          channel={channel}
          isActive={channel.id === activeChannelId}
        />
      ))}
    </div>
  );
}

function ChannelSkeletons(): React.ReactNode {
  return (
    <div className="px-2 py-2 flex flex-col gap-1">
      {Array.from({ length: 6 }, (_, i) => (
        <div key={i} className="h-8 mx-2 rounded-md bg-bg-hover animate-pulse" />
      ))}
    </div>
  );
}
