import React from 'react';
import { useChannelStore, type ChannelListItem } from '../../stores/useChannelStore';
import { useVoiceStore } from '../../stores/useVoiceStore';
import { ScrollArea } from '../../components';
import { ChannelItem } from './ChannelItem';
import { ChannelContextMenu } from './ChannelContextMenu';
import { ServerHeader } from './ServerHeader';
import { UserPanel } from '../layout/UserPanel';
import { VoiceStatusBar } from '../voice/VoiceStatusBar';
import { VoiceParticipant } from '../voice/VoiceParticipant';
import useAuthStore from '../../stores/useAuthStore';

export function ChannelSidebar(): React.ReactNode {
  const channels = useChannelStore((s) => s.channels);
  const activeChannelId = useChannelStore((s) => s.activeChannelId);
  const isLoading = useChannelStore((s) => s.isLoading);
  const userRole = useAuthStore((s) => s.user?.role);
  const channelParticipants = useVoiceStore((s) => s.channelParticipants);

  const textChannels = channels.filter((c) => c.type === 'text');
  const voiceChannels = channels.filter((c) => c.type === 'voice');

  return (
    <>
      <ServerHeader />

      <ScrollArea className="flex-1">
        <div className="py-2">
          {isLoading ? (
            <ChannelSkeletons />
          ) : (
            <>
              <ChannelGroup label="TEXT CHANNELS" channels={textChannels} activeChannelId={activeChannelId} isOwner={userRole === 'owner'} channelParticipants={channelParticipants} />
              <ChannelGroup label="VOICE CHANNELS" channels={voiceChannels} activeChannelId={activeChannelId} isOwner={userRole === 'owner'} channelParticipants={channelParticipants} />
            </>
          )}
        </div>
      </ScrollArea>

      <VoiceStatusBar />
      <UserPanel />
    </>
  );
}

function ChannelGroup({
  label,
  channels,
  activeChannelId,
  isOwner,
  channelParticipants,
}: {
  label: string;
  channels: ChannelListItem[];
  activeChannelId: string | null;
  isOwner: boolean;
  channelParticipants: Map<string, string[]>;
}): React.ReactNode {
  if (channels.length === 0) return null;

  return (
    <div className="mt-2">
      <h2 className="text-text-muted text-xs font-semibold uppercase tracking-wide px-2 py-1.5">
        {label}
      </h2>
      {channels.map((channel) => {
        const participants = channelParticipants.get(channel.id) ?? [];
        const channelItem = (
          <ChannelItem
            channel={channel}
            isActive={channel.id === activeChannelId}
          />
        );

        const wrappedChannelItem = isOwner
          ? (
            <ChannelContextMenu channelId={channel.id} channelName={channel.name}>
              {channelItem}
            </ChannelContextMenu>
          )
          : channelItem;

        return (
          <React.Fragment key={channel.id}>
            {wrappedChannelItem}
            {channel.type === 'voice' && participants.length > 0 && (
              <div>
                {participants.map((userId) => (
                  <VoiceParticipant key={userId} userId={userId} />
                ))}
              </div>
            )}
          </React.Fragment>
        );
      })}
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
