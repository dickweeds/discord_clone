import React, { useState, useEffect } from 'react';
import { Dialog } from 'radix-ui';
import { apiRequest } from '../../services/apiClient';
import { Button } from '../../components';

interface ResetPasswordDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  userId: string;
  username: string;
}

export function ResetPasswordDialog({ open, onOpenChange, userId, username }: ResetPasswordDialogProps): React.ReactNode {
  const [isLoading, setIsLoading] = useState(false);
  const [temporaryPassword, setTemporaryPassword] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (open) {
      setTemporaryPassword(null);
      setCopied(false);
      setError(null);
      setIsLoading(true);
      apiRequest<{ temporaryPassword: string }>(`/api/admin/reset-password/${userId}`, { method: 'POST' })
        .then((data) => {
          setTemporaryPassword(data.temporaryPassword);
        })
        .catch((err) => {
          setError((err as Error).message);
        })
        .finally(() => {
          setIsLoading(false);
        });
    }
  }, [open, userId]);

  const handleCopy = async () => {
    if (temporaryPassword) {
      await navigator.clipboard.writeText(temporaryPassword);
      setCopied(true);
    }
  };

  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 bg-black/50" />
        <Dialog.Content className="fixed left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 rounded-lg bg-bg-floating p-4 max-w-[440px] w-full">
          <Dialog.Title className="text-lg font-semibold text-text-primary">
            Reset Password for {username}
          </Dialog.Title>

          {isLoading && (
            <p className="mt-3 text-sm text-text-muted">Generating temporary password...</p>
          )}

          {error && (
            <p className="mt-3 text-sm text-error">{error}</p>
          )}

          {temporaryPassword && (
            <>
              <div className="mt-3 rounded bg-bg-primary p-3 font-mono text-sm text-text-primary break-all">
                {temporaryPassword}
              </div>
              <Dialog.Description className="mt-2 text-sm text-text-secondary">
                Share this temporary password with {username} directly. Their current sessions have been invalidated.
              </Dialog.Description>
            </>
          )}

          <div className="mt-4 flex justify-end gap-2">
            {temporaryPassword && (
              <Button onClick={handleCopy}>
                {copied ? 'Copied!' : 'Copy Password'}
              </Button>
            )}
            <Button variant="secondary" onClick={() => onOpenChange(false)}>
              Done
            </Button>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
