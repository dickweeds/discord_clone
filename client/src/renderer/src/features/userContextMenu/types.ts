import React from 'react';

export type UserContextMenuSurface = 'voice' | 'member-online' | 'member-offline';
export type UserRole = 'owner' | 'admin' | 'user' | null;

export interface UserContextMenuContext {
  targetUserId: string;
  targetUsername: string;
  currentUserId: string | null;
  currentUserRole: UserRole;
  surface: UserContextMenuSurface;
  isTargetOnline: boolean;
  isTargetInVoice: boolean;
}

export interface UserContextMenuDependencies {
  openKickDialog: () => void;
  openBanDialog: () => void;
  openResetDialog: () => void;
  getPeerVolume: (userId: string) => number;
  setPeerVolume: (userId: string, volumePercent: number) => void;
}

export type UserContextMenuItem =
  | {
      id: string;
      order: number;
      type: 'item';
      label: string;
      className: string;
      onSelect: () => void;
      isVisible?: (context: UserContextMenuContext) => boolean;
    }
  | {
      id: string;
      order: number;
      type: 'separator';
      isVisible?: (context: UserContextMenuContext) => boolean;
    }
  | {
      id: string;
      order: number;
      type: 'custom';
      render: (context: UserContextMenuContext, dependencies: UserContextMenuDependencies) => React.ReactNode;
      isVisible?: (context: UserContextMenuContext) => boolean;
    };
