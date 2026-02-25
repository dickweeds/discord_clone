import React, { useEffect } from 'react';
import { HashRouter, Routes, Route, Navigate } from 'react-router';
import { Tooltip as RadixTooltip } from 'radix-ui';
import { LoginPage } from './features/auth/LoginPage';
import { RegisterPage } from './features/auth/RegisterPage';
import { AuthGuard } from './features/auth/AuthGuard';
import { Button } from './components';
import useAuthStore from './stores/useAuthStore';

function MainApp(): React.ReactNode {
  const user = useAuthStore((s) => s.user);
  const logout = useAuthStore((s) => s.logout);

  return (
    <div className="flex h-screen items-center justify-center bg-bg-primary p-6">
      <div className="w-full max-w-md rounded-lg bg-bg-secondary p-6 shadow-lg">
        <h1 className="mb-2 text-2xl font-bold text-text-primary">Discord Clone</h1>
        <p className="mb-6 text-text-secondary">
          Logged in as <span className="font-semibold text-text-primary">{user?.username}</span>
        </p>
        <Button type="button" variant="secondary" onClick={() => void logout()}>
          Log Out
        </Button>
      </div>
    </div>
  );
}

function App(): React.ReactNode {
  const restoreSession = useAuthStore((s) => s.restoreSession);

  useEffect(() => {
    restoreSession();
  }, [restoreSession]);

  return (
    <RadixTooltip.Provider>
      <HashRouter>
        <Routes>
          <Route path="/login" element={<LoginPage />} />
          <Route path="/register/:token" element={<RegisterPage />} />
          <Route path="/app" element={<AuthGuard />}>
            <Route index element={<MainApp />} />
          </Route>
          <Route path="/" element={<Navigate to="/app" replace />} />
        </Routes>
      </HashRouter>
    </RadixTooltip.Provider>
  );
}

export default App;
