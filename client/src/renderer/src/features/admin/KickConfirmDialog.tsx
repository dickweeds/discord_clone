import React, { useState } from 'react';
import { Dialog } from 'radix-ui';
import { apiRequest } from '../../services/apiClient';
import { Button } from '../../components';

interface KickConfirmDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  userId: string;
  username: string;
}

export function KickConfirmDialog({ open, onOpenChange, userId, username }: KickConfirmDialogProps): React.ReactNode {
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleKick = async () => {
    setIsLoading(true);
    setError(null);
    try {
      await apiRequest(`/api/admin/kick/${userId}`, { method: 'POST' });
      onOpenChange(false);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 bg-black/50" />
        <Dialog.Content className="fixed left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 rounded-lg bg-bg-floating p-4 max-w-[440px] w-full">
          <Dialog.Title className="text-lg font-semibold text-text-primary">
            Kick {username}?
          </Dialog.Title>
          <Dialog.Description className="mt-2 text-sm text-text-secondary">
            They will be removed from the server but can rejoin with a new invite.
          </Dialog.Description>
          {error && <p className="mt-2 text-sm text-error">{error}</p>}
          <div className="mt-4 flex justify-end gap-2">
            <Button variant="secondary" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button
              className="bg-error text-text-primary hover:bg-error/80"
              onClick={handleKick}
              disabled={isLoading}
            >
              {isLoading ? 'Kicking...' : 'Kick'}
            </Button>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
