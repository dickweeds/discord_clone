import React from 'react';
import type { UserContextMenuContext, UserContextMenuDependencies, UserContextMenuItem } from '../types';

function canShowVolumeItem(context: UserContextMenuContext): boolean {
  if (context.currentUserId === context.targetUserId) return false;
  return context.surface === 'voice' || context.surface === 'member-online';
}

export function getVolumeMenuItem(): UserContextMenuItem {
  return {
    id: 'user-volume',
    order: 100,
    type: 'custom',
    isVisible: canShowVolumeItem,
    render: (context: UserContextMenuContext, dependencies: UserContextMenuDependencies): React.ReactNode => {
      const volume = dependencies.getPeerVolume(context.targetUserId);

      return (
        <div
          className="px-2 py-1.5"
          onPointerDown={(e) => e.stopPropagation()}
          onClick={(e) => e.stopPropagation()}
          onContextMenu={(e) => e.stopPropagation()}
        >
          <div className="mb-1 flex items-center justify-between gap-3">
            <span className="text-xs font-medium uppercase tracking-wide text-text-muted">User Volume</span>
            <span className="text-xs text-text-secondary">{volume}%</span>
          </div>
          <input
            aria-label={`Volume for ${context.targetUsername}`}
            className="w-full accent-accent-primary"
            type="range"
            min={0}
            max={200}
            step={5}
            value={volume}
            onChange={(e) => dependencies.setPeerVolume(context.targetUserId, Number(e.target.value))}
          />
        </div>
      );
    },
  };
}
