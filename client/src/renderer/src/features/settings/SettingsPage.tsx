import React, { useEffect } from 'react';
import { X, LogOut } from 'lucide-react';
import { useNavigate } from 'react-router';
import { AudioSettings } from './AudioSettings';
import { Button } from '../../components';
import useAuthStore from '../../stores/useAuthStore';
import { useUpdateStore } from '../../stores/useUpdateStore';

interface SettingsPageProps {
  onClose: () => void;
}

export function SettingsPage({ onClose }: SettingsPageProps): React.ReactNode {
  const logout = useAuthStore((s) => s.logout);
  const checkForUpdates = useUpdateStore((s) => s.checkForUpdates);
  const updateStatus = useUpdateStore((s) => s.status);
  const navigate = useNavigate();
  const isCheckingOrDownloading = updateStatus === 'checking' || updateStatus === 'downloading';

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
        <AudioSettings />
        <section className="px-4 py-4 border-t border-border-default">
          <h2 className="text-base font-semibold text-text-primary">App Updates</h2>
          <p className="text-sm text-text-secondary mt-1">Check for new desktop app versions.</p>
          <div className="mt-3">
            <Button
              type="button"
              variant="secondary"
              size="sm"
              onClick={checkForUpdates}
              disabled={isCheckingOrDownloading}
            >
              {updateStatus === 'checking' ? 'Checking...' : 'Check for Updates'}
            </Button>
          </div>
        </section>
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
