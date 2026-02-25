import { useState, useRef, useEffect } from 'react';
import useMessageStore from '../../stores/useMessageStore';
import { usePresenceStore } from '../../stores/usePresenceStore';

interface MessageInputProps {
  channelId: string;
  channelName: string;
}

export default function MessageInput({ channelId, channelName }: MessageInputProps) {
  const [text, setText] = useState('');
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const sendMessage = useMessageStore((s) => s.sendMessage);
  const sendError = useMessageStore((s) => s.sendError);
  const clearSendError = useMessageStore((s) => s.clearSendError);
  const connectionState = usePresenceStore((s) => s.connectionState);

  const isDisabled = connectionState !== 'connected';

  useEffect(() => {
    if (sendError) {
      const timer = setTimeout(() => clearSendError(), 5000);
      return () => clearTimeout(timer);
    }
  }, [sendError, clearSendError]);

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      if (text.trim() && !isDisabled) {
        sendMessage(channelId, text.trim());
        setText('');
        // Reset textarea height
        if (textareaRef.current) {
          textareaRef.current.style.height = 'auto';
        }
      }
    }
  };

  const handleChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setText(e.target.value);
    // Auto-grow textarea
    const textarea = e.target;
    textarea.style.height = 'auto';
    textarea.style.height = `${textarea.scrollHeight}px`;
  };

  return (
    <div className="px-4 pb-6">
      <textarea
        ref={textareaRef}
        value={text}
        onChange={handleChange}
        onKeyDown={handleKeyDown}
        placeholder={`Message #${channelName}`}
        className="w-full bg-[#1c1915] text-[#f0e6d9] rounded-xl min-h-[44px] px-4 py-2.5 text-base resize-none focus:outline-none focus:ring-2 focus:ring-[#c97b35] disabled:opacity-50 disabled:cursor-not-allowed"
        disabled={isDisabled}
        rows={1}
      />
      {sendError && <p className="text-[#f23f43] text-sm mt-1">{sendError}</p>}
    </div>
  );
}
