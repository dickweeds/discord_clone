import React from 'react';
import { UserContextMenu } from '../userContextMenu/UserContextMenu';

interface MemberContextMenuProps {
  userId: string;
  username: string;
  children: React.ReactNode;
  surface?: 'member-online' | 'member-offline' | 'voice';
  isTargetOnline?: boolean;
  isTargetInVoice?: boolean;
}

// Legacy compatibility wrapper: keep old imports working while using the new extensible menu.
export function MemberContextMenu({
  userId,
  username,
  children,
  surface = 'member-online',
  isTargetOnline = surface !== 'member-offline',
  isTargetInVoice = surface === 'voice',
}: MemberContextMenuProps): React.ReactNode {
  return (
    <UserContextMenu
      userId={userId}
      username={username}
      surface={surface}
      isTargetOnline={isTargetOnline}
      isTargetInVoice={isTargetInVoice}
    >
      {children}
    </UserContextMenu>
  );
}
