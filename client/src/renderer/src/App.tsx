import React, { useEffect } from 'react';
import { HashRouter, Routes, Route, Navigate } from 'react-router';
import { Tooltip as RadixTooltip } from 'radix-ui';
import { LoginPage } from './features/auth/LoginPage';
import { RegisterPage } from './features/auth/RegisterPage';
import { AuthGuard } from './features/auth/AuthGuard';
import { AppLayout } from './features/layout/AppLayout';
import { ContentArea } from './features/layout/ContentArea';
import { ChannelRedirect } from './features/layout/ChannelRedirect';
import useAuthStore from './stores/useAuthStore';

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
            <Route element={<AppLayout />}>
              <Route index element={<Navigate to="channels" replace />} />
              <Route path="channels" element={<ChannelRedirect />} />
              <Route path="channels/:channelId" element={<ContentArea />} />
            </Route>
          </Route>
          <Route path="/" element={<Navigate to="/app" replace />} />
        </Routes>
      </HashRouter>
    </RadixTooltip.Provider>
  );
}

export default App;
