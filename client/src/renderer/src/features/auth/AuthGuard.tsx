import React from 'react';
import { Navigate, Outlet } from 'react-router';
import useAuthStore from '../../stores/useAuthStore';

export function AuthGuard(): React.ReactNode {
  const { user, isLoading } = useAuthStore();

  if (isLoading) {
    return (
      <div className="flex h-screen items-center justify-center bg-bg-primary">
        <div className="flex flex-col items-center gap-4">
          <div className="h-8 w-8 animate-spin rounded-full border-2 border-bg-tertiary border-t-accent-primary" />
          <p className="text-sm text-text-muted">Loading...</p>
        </div>
      </div>
    );
  }

  if (!user) {
    return <Navigate to="/login" replace />;
  }

  return <Outlet />;
}
