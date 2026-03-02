import React from 'react';
import { Hash, Volume2 } from 'lucide-react';
import { useNavigate } from 'react-router';
import type { ChannelListItem } from '../../stores/useChannelStore';
import { useVoiceStore } from '../../stores/useVoiceStore';
import useAuthStore from '../../stores/useAuthStore';

interface ChannelItemProps {
  channel: ChannelListItem;
  isActive: boolean;
}

export function ChannelItem({ channel, isActive }: ChannelItemProps): React.ReactNode {
  const navigate = useNavigate();
  const joinChannel = useVoiceStore((s) => s.joinChannel);
  const currentChannelId = useVoiceStore((s) => s.currentChannelId);
  const userId = useAuthStore((s) => s.user?.id);
  const Icon = channel.type === 'text' ? Hash : Volume2;

  const handleClick = () => {
    if (channel.type === 'text') {
      navigate(`/app/channels/${channel.id}`);
    } else if (userId && channel.id !== currentChannelId) {
      joinChannel(channel.id, userId);
    }
  };

  return (
    <button
      onClick={handleClick}
      aria-current={isActive ? 'page' : undefined}
      className={`h-8 px-2 mx-2 rounded-md flex items-center gap-1.5 cursor-pointer w-[calc(100%-16px)] text-left transition-colors duration-150 focus-visible:ring-2 focus-visible:ring-accent-primary focus-visible:ring-offset-0 focus-visible:outline-none ${
        isActive
          ? 'bg-bg-active text-text-primary'
          : 'text-text-secondary hover:bg-bg-hover hover:text-text-primary'
      }`}
    >
      <Icon size={18} className="flex-shrink-0" />
      <span className="truncate text-sm">{channel.name}</span>
    </button>
  );
}
