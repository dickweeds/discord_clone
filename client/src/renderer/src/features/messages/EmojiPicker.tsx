import React from 'react';
import Picker from '@emoji-mart/react';
import data from '@emoji-mart/data';

interface EmojiPickerProps {
  onSelect: (emoji: string) => void;
}

export function EmojiPicker({ onSelect }: EmojiPickerProps): React.ReactNode {
  return (
    <Picker
      data={data}
      onEmojiSelect={(emoji: { native: string }) => onSelect(emoji.native)}
      theme="dark"
      previewPosition="none"
      skinTonePosition="none"
    />
  );
}
