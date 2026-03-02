import React, { useMemo, useState } from 'react';
import { getAvatarColor } from '../utils/avatarColor';

interface AvatarProps {
  username: string;
  avatarUrl?: string;
  sizeClassName: string;
  textClassName: string;
  className?: string;
  ariaHidden?: boolean;
  children?: React.ReactNode;
}

export function Avatar({
  username,
  avatarUrl,
  sizeClassName,
  textClassName,
  className = '',
  ariaHidden = false,
  children,
}: AvatarProps): React.ReactNode {
  const [imageError, setImageError] = useState(false);
  const avatarColor = useMemo(() => getAvatarColor(username), [username]);
  const initial = username.charAt(0).toUpperCase();
  const showImage = Boolean(avatarUrl) && !imageError;

  return (
    <div
      aria-hidden={ariaHidden}
      className={`${sizeClassName} rounded-full flex items-center justify-center font-medium text-text-primary relative overflow-hidden ${textClassName} ${className}`}
      style={!showImage ? { backgroundColor: avatarColor } : undefined}
    >
      {showImage ? (
        <img
          src={avatarUrl}
          alt=""
          className="w-full h-full object-cover"
          onError={() => setImageError(true)}
        />
      ) : (
        initial
      )}
      {children}
    </div>
  );
}
