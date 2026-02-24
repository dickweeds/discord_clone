import { ScrollArea as RadixScrollArea } from 'radix-ui';
import React from 'react';

interface ScrollAreaProps {
  children: React.ReactNode;
  className?: string;
}

export function ScrollArea({ children, className = '' }: ScrollAreaProps): React.ReactNode {
  return (
    <RadixScrollArea.Root className={`overflow-hidden ${className}`}>
      <RadixScrollArea.Viewport className="h-full w-full rounded">
        {children}
      </RadixScrollArea.Viewport>
      <RadixScrollArea.Scrollbar
        className="flex touch-none select-none p-0.5 transition-colors hover:bg-bg-hover"
        orientation="vertical"
      >
        <RadixScrollArea.Thumb className="relative flex-1 rounded-full bg-text-muted" />
      </RadixScrollArea.Scrollbar>
    </RadixScrollArea.Root>
  );
}
