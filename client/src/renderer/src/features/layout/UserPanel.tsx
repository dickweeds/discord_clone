import React from 'react';
import { Settings } from 'lucide-react';
import useAuthStore from '../../stores/useAuthStore';

const AVATAR_COLORS = [
  '#c97b35', '#7b935e', '#5e8493', '#935e7b', '#93855e',
  '#5e7b93', '#8b6e4e', '#6e8b4e', '#4e6e8b', '#8b4e6e',
] as const;

function getAvatarColor(username: string): string {
  let hash = 0;
  for (let i = 0; i < username.length; i += 1) {
    hash = username.charCodeAt(i) + ((hash << 5) - hash);
  }
  return AVATAR_COLORS[Math.abs(hash) % AVATAR_COLORS.length];
}

export function UserPanel(): React.ReactNode {
  const user = useAuthStore((s) => s.user);

  if (!user) {
    return (
      <div className="h-[52px] border-t border-border-default bg-bg-tertiary" />
    );
  }

  return (
    <div className="h-[52px] border-t border-border-default bg-bg-tertiary px-2 flex items-center gap-2">
      <div className="relative">
        <div
          className="h-8 w-8 rounded-full flex items-center justify-center text-sm font-semibold text-text-primary"
          style={{ backgroundColor: getAvatarColor(user.username) }}
          aria-hidden="true"
        >
          {user.username.slice(0, 1).toUpperCase()}
        </div>
        <span className="absolute -bottom-0.5 -right-0.5 h-2.5 w-2.5 rounded-full border-2 border-bg-tertiary bg-status-online" />
      </div>

      <span className="truncate text-sm font-medium text-text-primary">{user.username}</span>

      <button
        type="button"
        className="ml-auto rounded-md p-1 text-text-secondary transition-colors hover:text-text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-primary focus-visible:ring-offset-0"
        aria-label="User settings"
        onClick={() => void 0}
      >
        <Settings size={18} />
      </button>
    </div>
  );
}
