import { ContextMenu as RadixContextMenu } from 'radix-ui';
import React from 'react';

interface ContextMenuProps {
  trigger: React.ReactNode;
  children: React.ReactNode;
}

export function ContextMenu({ trigger, children }: ContextMenuProps): React.ReactNode {
  return (
    <RadixContextMenu.Root>
      <RadixContextMenu.Trigger asChild>{trigger}</RadixContextMenu.Trigger>
      <RadixContextMenu.Portal>
        <RadixContextMenu.Content className="min-w-[180px] rounded-default bg-bg-floating p-1 shadow-lg">
          {children}
        </RadixContextMenu.Content>
      </RadixContextMenu.Portal>
    </RadixContextMenu.Root>
  );
}

export function ContextMenuItem({
  children,
  ...props
}: RadixContextMenu.ContextMenuItemProps): React.ReactNode {
  return (
    <RadixContextMenu.Item
      className="cursor-pointer rounded px-2 py-1.5 text-sm text-text-secondary outline-none hover:bg-bg-hover hover:text-text-primary"
      {...props}
    >
      {children}
    </RadixContextMenu.Item>
  );
}
