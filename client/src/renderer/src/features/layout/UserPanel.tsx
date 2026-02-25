import React from 'react';
import { Settings } from 'lucide-react';
import useAuthStore from '../../stores/useAuthStore';
import { getAvatarColor } from '../../utils/avatarColor';

export function UserPanel(): React.ReactNode {
  const user = useAuthStore((s) => s.user);

  if (!user) return null;

  const avatarColor = getAvatarColor(user.username);
  const initial = user.username.charAt(0).toUpperCase();

  return (
    <div className="h-[52px] px-2 flex items-center bg-bg-tertiary border-t border-border-default">
      {/* Avatar with status dot */}
      <div className="relative flex-shrink-0">
        <div
          className="w-8 h-8 rounded-full flex items-center justify-center text-sm font-medium text-text-primary"
          style={{ backgroundColor: avatarColor }}
        >
          {initial}
        </div>
        <div className="absolute bottom-0 right-0 w-2.5 h-2.5 rounded-full bg-status-online border-2 border-bg-tertiary" />
      </div>

      {/* Username */}
      <span className="text-sm font-medium text-text-primary truncate ml-2 flex-1">
        {user.username}
      </span>

      {/* Settings button */}
      <button
        aria-label="User settings"
        className="ml-auto text-text-secondary hover:text-text-primary transition-colors duration-150 p-1 rounded focus-visible:ring-2 focus-visible:ring-accent-primary focus-visible:ring-offset-0 focus-visible:outline-none"
      >
        <Settings size={18} />
      </button>
    </div>
  );
}
