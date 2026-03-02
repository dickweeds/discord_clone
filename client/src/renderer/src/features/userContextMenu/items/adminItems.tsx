import type { UserContextMenuContext, UserContextMenuDependencies, UserContextMenuItem } from '../types';

function isOwnerTargetingAnotherUser(context: UserContextMenuContext): boolean {
  return context.currentUserRole === 'owner' && context.currentUserId !== context.targetUserId;
}

export function getAdminMenuItems(
  context: UserContextMenuContext,
  dependencies: UserContextMenuDependencies,
): UserContextMenuItem[] {
  if (!isOwnerTargetingAnotherUser(context)) return [];

  return [
    {
      id: 'kick',
      order: 200,
      type: 'item',
      label: 'Kick',
      className:
        'cursor-pointer rounded px-2 py-1.5 text-sm text-text-secondary outline-none hover:bg-bg-hover hover:text-text-primary flex items-center gap-2',
      onSelect: dependencies.openKickDialog,
    },
    {
      id: 'admin-separator-1',
      order: 210,
      type: 'separator',
    },
    {
      id: 'ban',
      order: 220,
      type: 'item',
      label: 'Ban',
      className:
        'cursor-pointer rounded px-2 py-1.5 text-sm text-error outline-none hover:bg-bg-hover flex items-center gap-2',
      onSelect: dependencies.openBanDialog,
    },
    {
      id: 'admin-separator-2',
      order: 230,
      type: 'separator',
    },
    {
      id: 'reset-password',
      order: 240,
      type: 'item',
      label: 'Reset Password',
      className:
        'cursor-pointer rounded px-2 py-1.5 text-sm text-text-secondary outline-none hover:bg-bg-hover hover:text-text-primary flex items-center gap-2',
      onSelect: dependencies.openResetDialog,
    },
  ];
}
