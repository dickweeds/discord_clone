import React from 'react';
import { Settings } from 'lucide-react';
import useAuthStore from '../../stores/useAuthStore';
import { useUIStore } from '../../stores/useUIStore';
import { Avatar } from '../../components';

export function UserPanel(): React.ReactNode {
  const user = useAuthStore((s) => s.user);

  if (!user) return null;

  return (
    <div className="h-[52px] px-2 flex items-center bg-bg-tertiary border-t border-border-default">
      {/* Avatar with status dot */}
      <div className="relative flex-shrink-0">
        <Avatar
          username={user.username}
          avatarUrl={user.avatarUrl}
          sizeClassName="w-8 h-8"
          textClassName="text-sm"
        />
        <div className="absolute bottom-0 right-0 w-2.5 h-2.5 rounded-full bg-status-online border-2 border-bg-tertiary" />
      </div>

      {/* Username */}
      <span className="text-sm font-medium text-text-primary truncate ml-2 flex-1">
        {user.username}
      </span>

      {/* Settings button */}
      <button
        aria-label="User settings"
        onClick={() => useUIStore.getState().setSettingsOpen(true)}
        className="ml-auto text-text-secondary hover:text-text-primary transition-colors duration-150 p-1 rounded focus-visible:ring-2 focus-visible:ring-accent-primary focus-visible:ring-offset-0 focus-visible:outline-none"
      >
        <Settings size={18} />
      </button>
    </div>
  );
}
