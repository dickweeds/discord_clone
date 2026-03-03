import React, { useState } from 'react';
import useMessageStore from '../../stores/useMessageStore';
import type { ReactionSummary } from '../../stores/useMessageStore';
import useAuthStore from '../../stores/useAuthStore';
import { useMemberStore } from '../../stores/useMemberStore';
import { toggleReaction } from '../../services/reactionService';
import { Tooltip, Popover } from 'radix-ui';
import { EmojiPicker } from './EmojiPicker';

interface ReactionPillsProps {
  messageId: string;
  channelId: string;
}

const EMPTY_REACTIONS: ReactionSummary[] = [];

export function ReactionPills({ messageId, channelId }: ReactionPillsProps): React.ReactNode {
  const reactions = useMessageStore((s) => s.reactions.get(messageId) ?? EMPTY_REACTIONS);
  const currentUserId = useAuthStore((s) => s.user?.id);
  const members = useMemberStore((s) => s.members);
  const [showPicker, setShowPicker] = useState(false);

  if (reactions.length === 0) return null;

  return (
    <div className="flex flex-wrap gap-1 mt-1 items-center">
      {reactions.map((reaction) => {
        const hasReacted = currentUserId ? reaction.userIds.includes(currentUserId) : false;
        return (
          <Tooltip.Root key={reaction.emoji}>
            <Tooltip.Trigger asChild>
              <button
                type="button"
                onClick={() => toggleReaction(messageId, channelId, reaction.emoji)}
                className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full text-xs border transition-colors ${
                  hasReacted
                    ? 'border-accent-primary bg-accent-primary/10 text-text-primary'
                    : 'border-border-default bg-bg-tertiary hover:bg-bg-hover text-text-muted'
                }`}
              >
                <span>{reaction.emoji}</span>
                <span>{reaction.count}</span>
              </button>
            </Tooltip.Trigger>
            <Tooltip.Portal>
              <Tooltip.Content
                className="bg-bg-floating text-text-primary text-xs rounded px-2 py-1 shadow-lg border border-border-default"
                sideOffset={5}
              >
                {(() => {
                  const names = reaction.userIds.map((uid) => {
                    const member = members.find((m) => m.id === uid);
                    return member?.username ?? uid.slice(0, 8);
                  });
                  return names.length <= 3
                    ? names.join(', ')
                    : `${names.slice(0, 3).join(', ')} and ${names.length - 3} more`;
                })()}
                <Tooltip.Arrow className="fill-bg-floating" />
              </Tooltip.Content>
            </Tooltip.Portal>
          </Tooltip.Root>
        );
      })}
      <Popover.Root open={showPicker} onOpenChange={setShowPicker}>
        <Popover.Trigger asChild>
          <button
            type="button"
            className="inline-flex items-center justify-center w-6 h-6 rounded-full text-xs border border-border-default bg-bg-tertiary hover:bg-bg-hover text-text-muted"
            aria-label="Add reaction"
          >
            +
          </button>
        </Popover.Trigger>
        <Popover.Portal>
          <Popover.Content
            side="top"
            align="end"
            sideOffset={5}
            className="z-50 bg-bg-floating rounded-lg shadow-lg border border-border-default"
            onOpenAutoFocus={(e) => e.preventDefault()}
          >
            <EmojiPicker
              onSelect={(emoji) => {
                toggleReaction(messageId, channelId, emoji);
                setShowPicker(false);
              }}
            />
          </Popover.Content>
        </Popover.Portal>
      </Popover.Root>
    </div>
  );
}
