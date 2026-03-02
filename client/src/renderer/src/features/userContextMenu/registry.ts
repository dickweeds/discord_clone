import { getAdminMenuItems } from './items/adminItems';
import { getVolumeMenuItem } from './items/volumeItem';
import type { UserContextMenuContext, UserContextMenuDependencies, UserContextMenuItem } from './types';

export function getUserContextMenuItems(
  context: UserContextMenuContext,
  dependencies: UserContextMenuDependencies,
): UserContextMenuItem[] {
  return [
    getVolumeMenuItem(),
    ...getAdminMenuItems(context, dependencies),
  ].sort((a, b) => a.order - b.order);
}
