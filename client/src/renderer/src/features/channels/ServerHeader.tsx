import React from 'react';
import { ChevronDown } from 'lucide-react';

export function ServerHeader(): React.ReactNode {
  return (
    <header className="flex h-12 items-center border-b border-border-default px-3 shadow-sm">
      <button
        type="button"
        className="flex w-full items-center justify-between rounded-md px-1.5 py-1 text-left text-sm font-semibold text-text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-primary focus-visible:ring-offset-0"
        aria-label="Server settings"
      >
        <span className="truncate">discord_clone</span>
        <ChevronDown size={16} className="text-text-secondary" />
      </button>
    </header>
  );
}
