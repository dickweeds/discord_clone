import React from 'react';
import { Navigate } from 'react-router';
import { useChannelStore } from '../../stores/useChannelStore';

export function ChannelRedirect(): React.ReactNode {
  const channels = useChannelStore((s) => s.channels);
  const isLoading = useChannelStore((s) => s.isLoading);

  if (isLoading) return null;

  const firstTextChannel = channels.find((c) => c.type === 'text');
  if (firstTextChannel) {
    return <Navigate to={`/app/channels/${firstTextChannel.id}`} replace />;
  }

  return (
    <div className="flex-1 flex items-center justify-center">
      <p className="text-text-muted text-lg">No channels available</p>
    </div>
  );
}
