import { Tooltip as RadixTooltip } from 'radix-ui';
import React from 'react';

interface TooltipProps {
  content: string;
  children: React.ReactNode;
}

export function Tooltip({ content, children }: TooltipProps): React.ReactNode {
  return (
    <RadixTooltip.Root>
      <RadixTooltip.Trigger asChild>{children}</RadixTooltip.Trigger>
      <RadixTooltip.Portal>
        <RadixTooltip.Content
          className="rounded bg-bg-floating px-2 py-1 text-sm text-text-primary shadow-lg"
          sideOffset={5}
        >
          {content}
          <RadixTooltip.Arrow className="fill-bg-floating" />
        </RadixTooltip.Content>
      </RadixTooltip.Portal>
    </RadixTooltip.Root>
  );
}
