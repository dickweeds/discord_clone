import React, { useState } from 'react';
import { useNavigate } from 'react-router';
import { Button, Input } from '../../components';
import useAuthStore from '../../stores/useAuthStore';

export function LoginPage(): React.ReactNode {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const navigate = useNavigate();
  const { login, isLoading, error, clearError } = useAuthStore();

  const canSubmit = username.trim().length > 0 && password.length > 0 && !isLoading;

  async function handleSubmit(e: React.FormEvent): Promise<void> {
    e.preventDefault();
    if (!canSubmit) return;

    clearError();
    await login(username, password);

    // Check if login succeeded (user is now set)
    const { user } = useAuthStore.getState();
    if (user) {
      navigate('/app');
    }
  }

  function handleKeyDown(e: React.KeyboardEvent): void {
    if (e.key === 'Enter' && canSubmit) {
      handleSubmit(e);
    }
  }

  return (
    <div className="flex h-screen items-center justify-center bg-bg-primary">
      <div className="w-full max-w-sm rounded-lg bg-bg-secondary p-8 shadow-lg">
        <h1 className="mb-6 text-center text-2xl font-bold text-text-primary">Welcome Back</h1>

        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          <Input
            label="Username"
            type="text"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Enter your username"
            autoFocus
            autoComplete="username"
          />

          <Input
            label="Password"
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Enter your password"
            autoComplete="current-password"
          />

          {error && (
            <p className="text-sm text-status-dnd">{error}</p>
          )}

          <Button
            type="submit"
            variant="primary"
            disabled={!canSubmit}
            className={!canSubmit ? 'opacity-50 cursor-not-allowed' : ''}
          >
            {isLoading ? 'Logging in...' : 'Log In'}
          </Button>
        </form>
      </div>
    </div>
  );
}
