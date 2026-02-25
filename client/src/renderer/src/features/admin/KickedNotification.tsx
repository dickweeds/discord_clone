import React from 'react';
import { Dialog } from 'radix-ui';
import { Button } from '../../components';
import useAuthStore from '../../stores/useAuthStore';
import { useAdminNotificationStore } from '../../stores/useAdminNotificationStore';

export function KickedNotification(): React.ReactNode {
  const notification = useAdminNotificationStore((s) => s.notification);
  const dismiss = useAdminNotificationStore((s) => s.dismiss);
  const logout = useAuthStore((s) => s.logout);

  const handleOk = async () => {
    await logout();
    dismiss();
  };

  return (
    <Dialog.Root open={notification === 'kicked'} onOpenChange={() => {}}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 bg-black/50" />
        <Dialog.Content
          className="fixed left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 rounded-lg bg-bg-floating p-4 max-w-[440px] w-full"
          onEscapeKeyDown={(e) => e.preventDefault()}
          onPointerDownOutside={(e) => e.preventDefault()}
          onInteractOutside={(e) => e.preventDefault()}
        >
          <Dialog.Title className="text-lg font-semibold text-text-primary">
            You've been kicked
          </Dialog.Title>
          <Dialog.Description className="mt-2 text-sm text-text-secondary">
            The server owner has removed you from the server. You can rejoin with a new invite link.
          </Dialog.Description>
          <div className="mt-4 flex justify-end">
            <Button onClick={handleOk}>OK</Button>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
