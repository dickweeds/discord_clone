import React, { useState } from 'react';
import { toggleReaction } from '../../services/reactionService';
import { Tooltip, Popover } from 'radix-ui';
import { EmojiPicker } from './EmojiPicker';

interface MessageHoverToolbarProps {
  messageId: string;
  channelId: string;
}

const QUICK_REACTIONS = [
  { emoji: '\u{1F44D}', name: 'Thumbs up' },
  { emoji: '\u2764\uFE0F', name: 'Heart' },
  { emoji: '\u{1F602}', name: 'Laughing' },
  { emoji: '\u{1F62E}', name: 'Surprised' },
  { emoji: '\u{1F622}', name: 'Crying' },
  { emoji: '\u{1F525}', name: 'Fire' },
];

export function MessageHoverToolbar({ messageId, channelId }: MessageHoverToolbarProps): React.ReactNode {
  const [showPicker, setShowPicker] = useState(false);

  return (
    <div className="hidden group-hover/msg:flex absolute -top-4 right-2 gap-0.5 rounded-md bg-bg-secondary border border-border-default shadow-md p-0.5 z-10">
      {QUICK_REACTIONS.map(({ emoji, name }) => (
        <Tooltip.Root key={emoji}>
          <Tooltip.Trigger asChild>
            <button
              type="button"
              onClick={() => toggleReaction(messageId, channelId, emoji)}
              className="w-7 h-7 flex items-center justify-center rounded text-sm text-text-muted hover:text-text-primary hover:bg-bg-hover transition-colors"
            >
              {emoji}
            </button>
          </Tooltip.Trigger>
          <Tooltip.Portal>
            <Tooltip.Content
              className="bg-bg-floating text-text-primary text-xs rounded px-2 py-1 shadow-lg border border-border-default"
              sideOffset={5}
            >
              {name}
              <Tooltip.Arrow className="fill-bg-floating" />
            </Tooltip.Content>
          </Tooltip.Portal>
        </Tooltip.Root>
      ))}
      <Popover.Root open={showPicker} onOpenChange={setShowPicker}>
        <Popover.Trigger asChild>
          <button
            type="button"
            className="w-7 h-7 flex items-center justify-center rounded text-sm text-text-muted hover:text-text-primary hover:bg-bg-hover transition-colors"
            aria-label="More reactions"
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
