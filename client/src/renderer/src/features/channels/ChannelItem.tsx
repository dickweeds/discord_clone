import React from 'react';
import type { Channel } from 'discord-clone-shared';
import { Hash, Volume2 } from 'lucide-react';

interface ChannelItemProps {
  channel: Channel;
  isActive: boolean;
  onClick: () => void;
}

export function ChannelItem({ channel, isActive, onClick }: ChannelItemProps): React.ReactNode {
  return (
    <button
      type="button"
      aria-current={isActive ? 'page' : undefined}
      onClick={onClick}
      className={`h-8 w-[calc(100%-1rem)] rounded-md px-2 mx-2 flex items-center gap-1.5 text-sm transition-colors duration-150 ${
        isActive
          ? 'bg-bg-active text-text-primary'
          : 'text-text-secondary hover:bg-bg-hover hover:text-text-primary'
      } focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-primary focus-visible:ring-offset-0`}
    >
      {channel.type === 'text' ? <Hash size={18} /> : <Volume2 size={18} />}
      <span className="truncate">{channel.name}</span>
    </button>
  );
}
