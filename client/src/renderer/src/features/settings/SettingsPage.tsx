import React, { useEffect, useRef, useState } from 'react';
import { X, LogOut } from 'lucide-react';
import { useNavigate } from 'react-router';
import { AudioSettings } from './AudioSettings';
import useAuthStore from '../../stores/useAuthStore';
import { apiRequest } from '../../services/apiClient';
import { Avatar } from '../../components';
import { useMemberStore } from '../../stores/useMemberStore';

interface SettingsPageProps {
  onClose: () => void;
}

export function SettingsPage({ onClose }: SettingsPageProps): React.ReactNode {
  const logout = useAuthStore((s) => s.logout);
  const user = useAuthStore((s) => s.user);
  const setUserAvatarUrl = useAuthStore((s) => s.setUserAvatarUrl);
  const updateMemberAvatar = useMemberStore((s) => s.updateMemberAvatar);
  const [isAvatarLoading, setIsAvatarLoading] = useState(false);
  const [avatarError, setAvatarError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const navigate = useNavigate();

  const handleLogout = async (): Promise<void> => {
    await logout();
    onClose();
    navigate('/login');
  };

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') {
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onClose]);

  const updateAvatarStores = (avatarUrl?: string): void => {
    if (!user) return;
    setUserAvatarUrl(avatarUrl);
    updateMemberAvatar(user.id, avatarUrl);
  };

  const handleAvatarUpload = async (event: React.ChangeEvent<HTMLInputElement>): Promise<void> => {
    const file = event.target.files?.[0];
    if (!file) return;

    const allowedTypes = ['image/png', 'image/jpeg', 'image/webp'];
    if (!allowedTypes.includes(file.type)) {
      setAvatarError('Supported formats: PNG, JPEG, WEBP.');
      event.target.value = '';
      return;
    }
    if (file.size > 2 * 1024 * 1024) {
      setAvatarError('Avatar must be 2MB or smaller.');
      event.target.value = '';
      return;
    }

    setAvatarError(null);
    setIsAvatarLoading(true);
    try {
      const formData = new FormData();
      formData.append('avatar', file);
      const data = await apiRequest<{ avatarUrl?: string }>('/api/users/me/avatar', {
        method: 'POST',
        body: formData,
      });
      updateAvatarStores(data.avatarUrl);
    } catch (err) {
      setAvatarError((err as Error).message || 'Failed to upload avatar.');
    } finally {
      setIsAvatarLoading(false);
      event.target.value = '';
    }
  };

  const handleAvatarRemove = async (): Promise<void> => {
    setAvatarError(null);
    setIsAvatarLoading(true);
    try {
      await apiRequest('/api/users/me/avatar', {
        method: 'DELETE',
      });
      updateAvatarStores(undefined);
    } catch (err) {
      setAvatarError((err as Error).message || 'Failed to remove avatar.');
    } finally {
      setIsAvatarLoading(false);
    }
  };

  return (
    <div className="flex-1 flex flex-col bg-bg-primary overflow-y-auto">
      <div className="flex items-center justify-between px-4 py-3 border-b border-border-default">
        <h1 className="text-lg font-semibold text-text-primary">Settings</h1>
        <button
          onClick={onClose}
          aria-label="Close settings"
          className="text-text-secondary hover:text-text-primary transition-colors duration-150 p-1 rounded focus-visible:ring-2 focus-visible:ring-accent-primary focus-visible:ring-offset-0 focus-visible:outline-none"
        >
          <X size={20} />
        </button>
      </div>
      <div className="max-w-2xl">
        {user && (
          <section className="px-4 py-4 border-b border-border-default">
            <h2 className="text-base font-semibold text-text-primary mb-3">Profile Picture</h2>
            <div className="flex items-center gap-4">
              <Avatar
                username={user.username}
                avatarUrl={user.avatarUrl}
                sizeClassName="w-14 h-14"
                textClassName="text-lg"
              />
              <div className="flex items-center gap-2">
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/png,image/jpeg,image/webp"
                  className="hidden"
                  onChange={handleAvatarUpload}
                  disabled={isAvatarLoading}
                />
                <button
                  onClick={() => fileInputRef.current?.click()}
                  disabled={isAvatarLoading}
                  className="px-3 py-1.5 rounded bg-accent-primary text-white text-sm disabled:opacity-50"
                >
                  {user.avatarUrl ? 'Replace' : 'Upload'}
                </button>
                <button
                  onClick={handleAvatarRemove}
                  disabled={isAvatarLoading || !user.avatarUrl}
                  className="px-3 py-1.5 rounded border border-border-default text-text-secondary text-sm disabled:opacity-50"
                >
                  Remove
                </button>
              </div>
            </div>
            {avatarError && <p className="mt-2 text-xs text-status-dnd">{avatarError}</p>}
          </section>
        )}
        <AudioSettings />
      </div>
      <div className="mt-auto border-t border-border-default px-4 py-4">
        <button
          onClick={handleLogout}
          className="flex items-center gap-2 text-sm text-status-dnd hover:text-red-400 transition-colors duration-150 focus-visible:ring-2 focus-visible:ring-accent-primary focus-visible:ring-offset-0 focus-visible:outline-none rounded px-2 py-1.5"
        >
          <LogOut size={16} />
          Log Out
        </button>
      </div>
    </div>
  );
}
