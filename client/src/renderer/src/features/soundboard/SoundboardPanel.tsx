import React, { useEffect, useState } from 'react';
import { Play, Square, Trash2, Upload, Clock, User } from 'lucide-react';
import { useSoundboardStore } from '../../stores/useSoundboardStore';
import { useVoiceStore } from '../../stores/useVoiceStore';
import useAuthStore from '../../stores/useAuthStore';
import { SoundboardUploadDialog } from './SoundboardUploadDialog';

export function SoundboardPanel(): React.ReactNode {
  const sounds = useSoundboardStore((s) => s.sounds);
  const isLoading = useSoundboardStore((s) => s.isLoading);
  const error = useSoundboardStore((s) => s.error);
  const isPlaying = useSoundboardStore((s) => s.isPlaying);
  const currentSoundId = useSoundboardStore((s) => s.currentSoundId);
  const playSound = useSoundboardStore((s) => s.playSound);
  const stopSound = useSoundboardStore((s) => s.stopSound);
  const deleteSound = useSoundboardStore((s) => s.deleteSound);
  const loadSounds = useSoundboardStore((s) => s.loadSounds);

  const isInVoice = useVoiceStore((s) => s.connectionState === 'connected');
  const currentUserId = useAuthStore((s) => s.user?.id);
  const userRole = useAuthStore((s) => s.user?.role);

  const [showUpload, setShowUpload] = useState(false);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);

  useEffect(() => {
    loadSounds();
  }, [loadSounds]);

  function formatDuration(ms: number): string {
    const seconds = Math.round(ms / 1000);
    return `${seconds}s`;
  }

  function handleDelete(soundId: string) {
    if (confirmDeleteId === soundId) {
      deleteSound(soundId);
      setConfirmDeleteId(null);
    } else {
      setConfirmDeleteId(soundId);
    }
  }

  return (
    <div className="w-full max-h-[320px] bg-bg-secondary border-t border-bg-hover flex flex-col">
      {/* Header */}
      <div className="flex items-center justify-between px-3 py-2 border-b border-bg-hover">
        <span className="text-xs font-semibold text-text-secondary uppercase tracking-wider">Soundboard</span>
        <button
          onClick={() => setShowUpload(true)}
          className="flex items-center gap-1 text-xs text-text-muted hover:text-text-primary transition-colors"
        >
          <Upload size={14} />
          Upload
        </button>
      </div>

      {/* Error */}
      {error && (
        <div className="px-3 py-1 text-xs text-error bg-error/10">{error}</div>
      )}

      {/* Sound list */}
      <div className="flex-1 overflow-y-auto px-2 py-1">
        {isLoading && sounds.length === 0 && (
          <div className="text-xs text-text-muted text-center py-4">Loading sounds...</div>
        )}
        {!isLoading && sounds.length === 0 && (
          <div className="text-xs text-text-muted text-center py-4">No sounds yet. Upload one to get started.</div>
        )}
        <div className="grid grid-cols-2 gap-1">
          {sounds.map((sound) => {
            const isCurrent = currentSoundId === sound.id && isPlaying;
            const canDelete = sound.uploadedBy === currentUserId || userRole === 'owner';

            return (
              <div
                key={sound.id}
                className={[
                  'group relative flex items-center gap-2 px-2 py-1.5 rounded text-xs transition-colors',
                  isCurrent ? 'bg-accent-primary/20 ring-1 ring-accent-primary/40' : 'hover:bg-bg-hover',
                ].join(' ')}
              >
                {/* Play/Stop button */}
                <button
                  onClick={() => isCurrent ? stopSound() : playSound(sound.id)}
                  disabled={!isInVoice && !isCurrent}
                  className={[
                    'flex-shrink-0 w-6 h-6 flex items-center justify-center rounded transition-colors',
                    !isInVoice && !isCurrent
                      ? 'text-text-muted/40 cursor-not-allowed'
                      : isCurrent
                        ? 'text-accent-primary hover:text-accent-primary/80'
                        : 'text-text-muted hover:text-text-primary',
                  ].join(' ')}
                  aria-label={isCurrent ? 'Stop sound' : `Play ${sound.name}`}
                >
                  {isCurrent ? <Square size={14} /> : <Play size={14} />}
                </button>

                {/* Sound info */}
                <div className="flex-1 min-w-0">
                  <div className="text-text-primary truncate">{sound.name}</div>
                  <div className="flex items-center gap-2 text-text-muted">
                    <span className="flex items-center gap-0.5">
                      <Clock size={10} />
                      {formatDuration(sound.durationMs)}
                    </span>
                    <span className="flex items-center gap-0.5 truncate">
                      <User size={10} />
                      {sound.uploadedByUsername}
                    </span>
                  </div>
                </div>

                {/* Delete button */}
                {canDelete && (
                  <button
                    onClick={() => handleDelete(sound.id)}
                    className={[
                      'flex-shrink-0 w-5 h-5 flex items-center justify-center rounded opacity-0 group-hover:opacity-100 transition-opacity',
                      confirmDeleteId === sound.id
                        ? 'text-error'
                        : 'text-text-muted hover:text-error',
                    ].join(' ')}
                    aria-label={confirmDeleteId === sound.id ? 'Confirm delete' : 'Delete sound'}
                  >
                    <Trash2 size={12} />
                  </button>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* Upload dialog */}
      {showUpload && (
        <SoundboardUploadDialog onClose={() => setShowUpload(false)} />
      )}
    </div>
  );
}
