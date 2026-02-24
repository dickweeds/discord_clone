import React, { useEffect } from 'react';
import { HashRouter, Routes, Route, Navigate } from 'react-router';
import { Tooltip as RadixTooltip } from 'radix-ui';
import { LoginPage } from './features/auth/LoginPage';
import { AuthGuard } from './features/auth/AuthGuard';
import useAuthStore from './stores/useAuthStore';

function MainApp(): React.ReactNode {
  return (
    <div className="flex h-screen items-center justify-center bg-bg-primary">
      <h1 className="text-2xl font-bold text-text-primary">Discord Clone</h1>
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
