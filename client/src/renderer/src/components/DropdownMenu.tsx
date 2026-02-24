import { DropdownMenu as RadixDropdownMenu } from 'radix-ui';
import React from 'react';

interface DropdownMenuProps {
  trigger: React.ReactNode;
  children: React.ReactNode;
}

export function DropdownMenu({ trigger, children }: DropdownMenuProps): React.ReactNode {
  return (
    <RadixDropdownMenu.Root>
      <RadixDropdownMenu.Trigger asChild>{trigger}</RadixDropdownMenu.Trigger>
      <RadixDropdownMenu.Portal>
        <RadixDropdownMenu.Content className="min-w-[180px] rounded-default bg-bg-floating p-1 shadow-lg">
          {children}
        </RadixDropdownMenu.Content>
      </RadixDropdownMenu.Portal>
    </RadixDropdownMenu.Root>
  );
}

export function DropdownMenuItem({
  children,
  ...props
}: RadixDropdownMenu.DropdownMenuItemProps): React.ReactNode {
  return (
    <RadixDropdownMenu.Item
      className="cursor-pointer rounded px-2 py-1.5 text-sm text-text-secondary outline-none hover:bg-bg-hover hover:text-text-primary"
      {...props}
    >
      {children}
    </RadixDropdownMenu.Item>
  );
}
