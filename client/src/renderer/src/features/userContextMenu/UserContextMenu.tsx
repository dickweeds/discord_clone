import React, { useMemo, useState } from 'react';
import { ContextMenu as RadixContextMenu } from 'radix-ui';
import useAuthStore from '../../stores/useAuthStore';
import { useVoiceStore } from '../../stores/useVoiceStore';
import { BanConfirmDialog } from '../admin/BanConfirmDialog';
import { KickConfirmDialog } from '../admin/KickConfirmDialog';
import { ResetPasswordDialog } from '../admin/ResetPasswordDialog';
import { getUserContextMenuItems } from './registry';
import type { UserContextMenuContext, UserContextMenuSurface } from './types';

interface UserContextMenuProps {
  userId: string;
  username: string;
  surface: UserContextMenuSurface;
  isTargetOnline: boolean;
  isTargetInVoice: boolean;
  children: React.ReactNode;
}

export function UserContextMenu({
  userId,
  username,
  surface,
  isTargetOnline,
  isTargetInVoice,
  children,
}: UserContextMenuProps): React.ReactNode {
  const currentUser = useAuthStore((s) => s.user);
  const peerVolumes = useVoiceStore((s) => s.peerVolumes);
  const setPeerVolume = useVoiceStore((s) => s.setPeerVolume);

  const [kickOpen, setKickOpen] = useState(false);
  const [banOpen, setBanOpen] = useState(false);
  const [resetOpen, setResetOpen] = useState(false);

  const context = useMemo<UserContextMenuContext>(() => ({
    targetUserId: userId,
    targetUsername: username,
    currentUserId: currentUser?.id ?? null,
    currentUserRole: currentUser?.role ?? null,
    surface,
    isTargetOnline,
    isTargetInVoice,
  }), [currentUser?.id, currentUser?.role, isTargetInVoice, isTargetOnline, surface, userId, username]);

  const items = useMemo(() =>
    getUserContextMenuItems(context, {
      openKickDialog: () => setKickOpen(true),
      openBanDialog: () => setBanOpen(true),
      openResetDialog: () => setResetOpen(true),
      getPeerVolume: (targetUserId: string) => peerVolumes.get(targetUserId) ?? 100,
      setPeerVolume,
    }).filter((item) => (item.isVisible ? item.isVisible(context) : true)),
  [context, peerVolumes, setPeerVolume]);

  return (
    <>
      <RadixContextMenu.Root>
        <RadixContextMenu.Trigger asChild><div>{children}</div></RadixContextMenu.Trigger>
        <RadixContextMenu.Portal>
          <RadixContextMenu.Content className="min-w-[220px] rounded-lg bg-bg-floating p-1.5 shadow-lg">
            {items.length === 0 && (
              <RadixContextMenu.Item
                disabled
                className="cursor-default rounded px-2 py-1.5 text-sm text-text-muted outline-none opacity-80"
              >
                No actions available
              </RadixContextMenu.Item>
            )}
            {items.map((item) => {
              if (item.type === 'separator') {
                return <RadixContextMenu.Separator key={item.id} className="my-1 h-px bg-border" />;
              }

              if (item.type === 'custom') {
                return <div key={item.id}>{item.render(context, {
                  openKickDialog: () => setKickOpen(true),
                  openBanDialog: () => setBanOpen(true),
                  openResetDialog: () => setResetOpen(true),
                  getPeerVolume: (targetUserId: string) => peerVolumes.get(targetUserId) ?? 100,
                  setPeerVolume,
                })}</div>;
              }

              return (
                <RadixContextMenu.Item
                  key={item.id}
                  className={item.className}
                  onSelect={item.onSelect}
                >
                  {item.label}
                </RadixContextMenu.Item>
              );
            })}
          </RadixContextMenu.Content>
        </RadixContextMenu.Portal>
      </RadixContextMenu.Root>

      <KickConfirmDialog open={kickOpen} onOpenChange={setKickOpen} userId={userId} username={username} />
      <BanConfirmDialog open={banOpen} onOpenChange={setBanOpen} userId={userId} username={username} />
      <ResetPasswordDialog open={resetOpen} onOpenChange={setResetOpen} userId={userId} username={username} />
    </>
  );
}
