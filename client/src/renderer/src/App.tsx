import React, { useEffect } from 'react';
import { HashRouter, Routes, Route, Navigate } from 'react-router';
import { Tooltip as RadixTooltip } from 'radix-ui';
import { LoginPage } from './features/auth/LoginPage';
import { RegisterPage } from './features/auth/RegisterPage';
import { SetupPage } from './features/auth/SetupPage';
import { AuthGuard } from './features/auth/AuthGuard';
import { AppLayout } from './features/layout/AppLayout';
import { ContentArea } from './features/layout/ContentArea';
import { ChannelRedirect } from './features/layout/ChannelRedirect';
import useAuthStore from './stores/useAuthStore';
import { useUpdateStore } from './stores/useUpdateStore';
import { KickedNotification } from './features/admin/KickedNotification';
import { BannedNotification } from './features/admin/BannedNotification';
import { useDeepLink } from './hooks/useDeepLink';

function DeepLinkHandler(): null {
  useDeepLink();
  return null;
}

function App(): React.ReactNode {
  const restoreSession = useAuthStore((s) => s.restoreSession);

  useEffect(() => {
    restoreSession();
  }, [restoreSession]);

  useEffect(() => {
    const cleanup = useUpdateStore.getState().initUpdateListeners();
    return cleanup;
  }, []);

  return (
    <RadixTooltip.Provider>
      <KickedNotification />
      <BannedNotification />
      <HashRouter>
        <DeepLinkHandler />
        <Routes>
          <Route path="/login" element={<LoginPage />} />
          <Route path="/setup" element={<SetupPage />} />
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
