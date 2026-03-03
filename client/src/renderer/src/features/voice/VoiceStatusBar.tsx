import React, { useEffect, useState } from 'react';
import { Mic, MicOff, Headphones, HeadphoneOff, Video, VideoOff, PhoneOff, Music } from 'lucide-react';
import { useVoiceStore } from '../../stores/useVoiceStore';
import { useChannelStore } from '../../stores/useChannelStore';
import { SoundboardPanel } from '../soundboard/SoundboardPanel';

const ERROR_DISMISS_MS = 5000;

export function VoiceStatusBar(): React.ReactNode {
  const [showSoundboard, setShowSoundboard] = useState(false);
  const currentChannelId = useVoiceStore((s) => s.currentChannelId);
  const connectionState = useVoiceStore((s) => s.connectionState);
  const isMuted = useVoiceStore((s) => s.isMuted);
  const isDeafened = useVoiceStore((s) => s.isDeafened);
  const isVideoEnabled = useVoiceStore((s) => s.isVideoEnabled);
  const error = useVoiceStore((s) => s.error);
  const toggleMute = useVoiceStore((s) => s.toggleMute);
  const toggleDeafen = useVoiceStore((s) => s.toggleDeafen);
  const toggleVideo = useVoiceStore((s) => s.toggleVideo);
  const leaveChannel = useVoiceStore((s) => s.leaveChannel);
  const clearError = useVoiceStore((s) => s.clearError);
  const channels = useChannelStore((s) => s.channels);

  // Auto-dismiss error after timeout
  useEffect(() => {
    if (!error) return;
    const timer = setTimeout(() => clearError(), ERROR_DISMISS_MS);
    return () => clearTimeout(timer);
  }, [error, clearError]);

  if (!currentChannelId && connectionState === 'disconnected' && !error) return null;

  const channel = channels.find((c) => c.id === currentChannelId);
  const channelName = channel?.name ?? 'Unknown';

  const isConnecting = connectionState === 'connecting';
  const isConnected = connectionState === 'connected';

  const MuteIcon = isMuted ? MicOff : Mic;
  const DeafenIcon = isDeafened ? HeadphoneOff : Headphones;
  const VideoIcon = isVideoEnabled ? Video : VideoOff;

  return (
    <div className="flex flex-col">
      {showSoundboard && isConnected && <SoundboardPanel />}
    <div
      className="h-[52px] w-full px-3 flex items-center justify-between bg-bg-tertiary border-t border-bg-hover animate-slideUp"
      role="region"
      aria-label="Voice connection status"
    >
      {/* Left: Status + Channel name */}
      <div className="flex flex-col min-w-0">
        {error && (
          <span className="text-xs font-medium text-error">Connection failed</span>
        )}
        {!error && isConnecting && (
          <span className="text-xs font-medium text-text-secondary">Connecting...</span>
        )}
        {!error && isConnected && (
          <span className="text-xs font-medium text-voice-speaking">Voice Connected</span>
        )}
        {currentChannelId && (
          <span className="text-xs text-text-secondary truncate">{channelName}</span>
        )}
      </div>

      {/* Right: Control buttons */}
      <div className="flex items-center gap-1">
        <button
          onClick={toggleMute}
          aria-label="Mute microphone"
          className={`w-8 h-8 flex items-center justify-center rounded transition-colors duration-150 ${
            isMuted
              ? 'text-accent-primary'
              : 'text-text-muted hover:bg-bg-hover hover:text-text-primary'
          }`}
        >
          <MuteIcon size={18} />
        </button>

        <button
          onClick={toggleDeafen}
          aria-label="Deafen audio"
          className={`w-8 h-8 flex items-center justify-center rounded transition-colors duration-150 ${
            isDeafened
              ? 'text-accent-primary'
              : 'text-text-muted hover:bg-bg-hover hover:text-text-primary'
          }`}
        >
          <DeafenIcon size={18} />
        </button>

        {isConnected && (
          <button
            onClick={() => setShowSoundboard(!showSoundboard)}
            aria-label={showSoundboard ? 'Hide soundboard' : 'Show soundboard'}
            className={`w-8 h-8 flex items-center justify-center rounded transition-colors duration-150 ${
              showSoundboard
                ? 'text-accent-primary'
                : 'text-text-muted hover:bg-bg-hover hover:text-text-primary'
            }`}
          >
            <Music size={18} />
          </button>
        )}

        <button
          onClick={() => toggleVideo()}
          aria-label={isVideoEnabled ? 'Turn off camera' : 'Turn on camera'}
          className={`w-8 h-8 flex items-center justify-center rounded transition-colors duration-150 ${
            isVideoEnabled
              ? 'text-accent-primary'
              : 'text-text-muted hover:bg-bg-hover hover:text-text-primary'
          }`}
        >
          <VideoIcon size={18} />
        </button>

        <button
          onClick={() => leaveChannel()}
          aria-label="Disconnect from voice"
          className="w-8 h-8 flex items-center justify-center rounded bg-error text-white hover:brightness-90 transition-colors duration-150"
        >
          <PhoneOff size={18} />
        </button>
      </div>
    </div>
    </div>
  );
}
