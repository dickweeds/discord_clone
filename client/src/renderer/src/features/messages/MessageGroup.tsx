import React from 'react';
import type { MessageGroupData } from '../../utils/groupMessages';
import { formatTimestamp } from '../../utils/formatTimestamp';
import { useUsername } from '../../hooks/useUsername';

interface MessageGroupProps {
  group: MessageGroupData;
  isFirst: boolean;
}

export function MessageGroup({ group, isFirst }: MessageGroupProps): React.ReactNode {
  const { username, avatarColor } = useUsername(group.authorId);

  return (
    <div role="group" aria-label={`Messages from ${username}`} className={`flex gap-3 px-2 py-0.5 hover:bg-bg-hover transition-colors duration-150 ${isFirst ? '' : 'mt-4'}`}>
      {/* Avatar column */}
      <div className="flex-shrink-0 w-8 pt-0.5">
        <div
          aria-hidden="true"
          className="w-8 h-8 rounded-full flex items-center justify-center text-sm font-medium text-text-primary"
          style={{ backgroundColor: avatarColor }}
        >
          {username.charAt(0).toUpperCase()}
        </div>
      </div>

      {/* Message content column */}
      <div className="min-w-0 flex-1">
        {/* Group header */}
        <div className="flex items-baseline gap-2">
          <span className="text-base font-semibold text-text-primary">{username}</span>
          <span className="text-xs text-text-muted">{formatTimestamp(group.firstTimestamp)}</span>
        </div>

        {/* Message bodies */}
        {group.messages.map((msg) => {
          const isFailed = msg.status === 'failed';
          const isSending = msg.status === 'sending';

          return (
            <div key={msg.id} className="mt-1">
              <p className={`text-base text-text-secondary whitespace-pre-wrap break-words ${isFailed ? 'opacity-60' : ''}`}>
                {msg.content}
              </p>
              {isSending && <span className="text-text-muted text-xs italic">Sending...</span>}
              {isFailed && <span className="text-[#f23f43] text-xs">Message not delivered</span>}
            </div>
          );
        })}
      </div>
    </div>
  );
}
