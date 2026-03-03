import React, { useRef, useState } from 'react';
import { Upload } from 'lucide-react';
import { Dialog } from 'radix-ui';
import { useSoundboardStore } from '../../stores/useSoundboardStore';

const ACCEPTED_FORMATS = '.mp3,.wav,.ogg,.flac,.aac,.webm';
const MAX_FILE_SIZE = 20 * 1024 * 1024; // 20MB
const MAX_DURATION_S = 20;

interface SoundboardUploadDialogProps {
  onClose: () => void;
}

export function SoundboardUploadDialog({ onClose }: SoundboardUploadDialogProps): React.ReactNode {
  const uploadSound = useSoundboardStore((s) => s.uploadSound);
  const [file, setFile] = useState<File | null>(null);
  const [name, setName] = useState('');
  const [durationMs, setDurationMs] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  async function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const selectedFile = e.target.files?.[0];
    if (!selectedFile) return;

    setError(null);

    if (selectedFile.size > MAX_FILE_SIZE) {
      setError(`File size exceeds ${MAX_FILE_SIZE / (1024 * 1024)}MB limit`);
      return;
    }

    // Decode audio to check duration
    try {
      const arrayBuffer = await selectedFile.arrayBuffer();
      const audioContext = new AudioContext();
      const audioBuffer = await audioContext.decodeAudioData(arrayBuffer);
      await audioContext.close();

      if (audioBuffer.duration > MAX_DURATION_S) {
        setError(`Duration exceeds ${MAX_DURATION_S} seconds (${Math.round(audioBuffer.duration)}s)`);
        return;
      }

      setFile(selectedFile);
      setName(selectedFile.name.replace(/\.[^.]+$/, ''));
      setDurationMs(Math.round(audioBuffer.duration * 1000));
    } catch {
      setError('Could not decode audio file. Please try a different format.');
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!file || !name.trim() || durationMs === null) return;

    setIsUploading(true);
    setError(null);

    try {
      await uploadSound(file, name.trim(), durationMs);
      onClose();
    } catch (err) {
      setError((err as Error).message);
      setIsUploading(false);
    }
  }

  return (
    <Dialog.Root open={true} onOpenChange={(open) => { if (!open) onClose(); }}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-50 bg-black/50" />
        <Dialog.Content aria-describedby={undefined} className="fixed left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 z-50 bg-bg-secondary rounded-lg shadow-xl w-[400px] max-w-[90vw]">
          {/* Header */}
          <div className="flex items-center justify-between px-4 py-3 border-b border-bg-hover">
            <Dialog.Title className="text-sm font-semibold text-text-primary">Upload Sound</Dialog.Title>
            <Dialog.Close className="text-text-muted hover:text-text-primary" aria-label="Close">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <line x1="18" y1="6" x2="6" y2="18" />
                <line x1="6" y1="6" x2="18" y2="18" />
              </svg>
            </Dialog.Close>
          </div>

          <form onSubmit={handleSubmit} className="p-4 space-y-3">
            {/* File picker */}
            <div>
              <input
                ref={fileInputRef}
                type="file"
                accept={ACCEPTED_FORMATS}
                onChange={handleFileChange}
                className="hidden"
              />
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                className="w-full flex items-center justify-center gap-2 px-3 py-6 border-2 border-dashed border-bg-hover rounded-lg text-sm text-text-muted hover:border-text-muted hover:text-text-secondary transition-colors"
              >
                <Upload size={16} />
                {file ? file.name : 'Choose audio file'}
              </button>
              <p className="mt-1 text-xs text-text-muted">
                MP3, WAV, OGG, FLAC, AAC, WEBM — max {MAX_FILE_SIZE / (1024 * 1024)}MB, {MAX_DURATION_S}s
              </p>
            </div>

            {/* Name input */}
            {file && (
              <div>
                <label className="block text-xs text-text-secondary mb-1">Sound Name</label>
                <input
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  maxLength={50}
                  className="w-full px-3 py-1.5 text-sm bg-bg-primary border border-bg-hover rounded text-text-primary focus:outline-none focus:ring-1 focus:ring-accent-primary"
                />
              </div>
            )}

            {/* Duration info */}
            {durationMs !== null && (
              <p className="text-xs text-text-muted">
                Duration: {(durationMs / 1000).toFixed(1)}s
              </p>
            )}

            {/* Error */}
            {error && (
              <p className="text-xs text-error">{error}</p>
            )}

            {/* Submit */}
            <div className="flex justify-end gap-2 pt-1">
              <Dialog.Close className="px-3 py-1.5 text-xs text-text-secondary hover:text-text-primary transition-colors">
                Cancel
              </Dialog.Close>
              <button
                type="submit"
                disabled={!file || !name.trim() || isUploading}
                className="px-3 py-1.5 text-xs bg-accent-primary text-white rounded hover:brightness-90 transition disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {isUploading ? 'Uploading...' : 'Upload'}
              </button>
            </div>
          </form>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
