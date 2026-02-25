import React, { useState } from 'react';
import { Dialog } from 'radix-ui';
import { apiRequest } from '../../services/apiClient';
import { Button } from '../../components';

interface BanConfirmDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  userId: string;
  username: string;
}

export function BanConfirmDialog({ open, onOpenChange, userId, username }: BanConfirmDialogProps): React.ReactNode {
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleBan = async () => {
    setIsLoading(true);
    setError(null);
    try {
      await apiRequest(`/api/admin/ban/${userId}`, { method: 'POST' });
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
            Ban {username}?
          </Dialog.Title>
          <Dialog.Description className="mt-2 text-sm text-text-secondary">
            They will be permanently removed and cannot log in or create new accounts.
          </Dialog.Description>
          {error && <p className="mt-2 text-sm text-error">{error}</p>}
          <div className="mt-4 flex justify-end gap-2">
            <Button variant="secondary" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button
              className="bg-error text-text-primary hover:bg-error/80"
              onClick={handleBan}
              disabled={isLoading}
            >
              {isLoading ? 'Banning...' : 'Ban'}
            </Button>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
