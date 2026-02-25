import React from 'react';
import { useNavigate } from 'react-router';
import { ScrollArea } from '../../components';
import useChannelStore from '../../stores/useChannelStore';
import { ChannelItem } from './ChannelItem';
import { ServerHeader } from './ServerHeader';
import { UserPanel } from '../layout/UserPanel';

export function ChannelSidebar(): React.ReactNode {
  const navigate = useNavigate();
  const channels = useChannelStore((s) => s.channels);
  const activeChannelId = useChannelStore((s) => s.activeChannelId);
  const isLoading = useChannelStore((s) => s.isLoading);
  const setActiveChannel = useChannelStore((s) => s.setActiveChannel);

  const textChannels = channels.filter((channel) => channel.type === 'text');
  const voiceChannels = channels.filter((channel) => channel.type === 'voice');

  return (
    <div className="flex h-full flex-col bg-bg-secondary">
      <ServerHeader />

      <ScrollArea className="flex-1">
        <section className="py-2">
          <h2 className="px-2 py-1.5 text-xs font-semibold uppercase tracking-wide text-text-muted" role="heading" aria-level={2}>
            Text Channels
          </h2>
          {isLoading ? (
            <div className="space-y-2 px-2">
              {Array.from({ length: 6 }).map((_, index) => (
                <div key={`text-skeleton-${index}`} className="h-8 animate-pulse rounded-md bg-bg-tertiary" />
              ))}
            </div>
          ) : (
            textChannels.map((channel) => (
              <ChannelItem
                key={channel.id}
                channel={channel}
                isActive={activeChannelId === channel.id}
                onClick={() => {
                  setActiveChannel(channel.id);
                  navigate(`/app/channels/${channel.id}`);
                }}
              />
            ))
          )}
        </section>

        <section className="pb-2">
          <h2 className="px-2 py-1.5 text-xs font-semibold uppercase tracking-wide text-text-muted" role="heading" aria-level={2}>
            Voice Channels
          </h2>
          {isLoading ? (
            <div className="space-y-2 px-2">
              {Array.from({ length: 3 }).map((_, index) => (
                <div key={`voice-skeleton-${index}`} className="h-8 animate-pulse rounded-md bg-bg-tertiary" />
              ))}
            </div>
          ) : (
            voiceChannels.map((channel) => (
              <ChannelItem
                key={channel.id}
                channel={channel}
                isActive={activeChannelId === channel.id}
                onClick={() => {
                  setActiveChannel(channel.id);
                  navigate(`/app/channels/${channel.id}`);
                }}
              />
            ))
          )}
        </section>
      </ScrollArea>

      <div className="mt-auto">
        <UserPanel />
      </div>
    </div>
  );
}
