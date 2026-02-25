import React from 'react';
import { Navigate } from 'react-router';
import useChannelStore from '../../stores/useChannelStore';

export function ChannelRedirect(): React.ReactNode {
  const channels = useChannelStore((s) => s.channels);
  const isLoading = useChannelStore((s) => s.isLoading);

  if (isLoading) {
    return <div className="h-full animate-pulse bg-bg-primary" />;
  }

  const fallbackChannel = channels.find((channel) => channel.type === 'text') ?? channels[0];

  if (!fallbackChannel) {
    return (
      <div className="flex h-full items-center justify-center text-text-secondary">
        No channels available.
      </div>
    );
  }

  return <Navigate to={`/app/channels/${fallbackChannel.id}`} replace />;
}
