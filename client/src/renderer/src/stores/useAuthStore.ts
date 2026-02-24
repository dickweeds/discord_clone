import { create } from 'zustand';
import { apiRequest, configureApiClient } from '../services/apiClient';

interface User {
  id: string;
  username: string;
  role: string;
}

interface AuthState {
  user: User | null;
  accessToken: string | null;
  refreshToken: string | null;
  isLoading: boolean;
  error: string | null;
  login: (username: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
  refreshTokens: () => Promise<void>;
  restoreSession: () => Promise<void>;
  clearError: () => void;
}

const useAuthStore = create<AuthState>((set, get) => {
  // Configure the API client to integrate with this store
  configureApiClient({
    getAccessToken: () => get().accessToken,
    getRefreshToken: () => get().refreshToken,
    onTokensRefreshed: async (accessToken, refreshToken) => {
      set({ accessToken, refreshToken });
      try {
        await window.api.secureStorage.set('accessToken', accessToken);
        await window.api.secureStorage.set('refreshToken', refreshToken);
      } catch {
        // safeStorage may not be available in all environments
      }
    },
    onSessionExpired: async () => {
      set({ user: null, accessToken: null, refreshToken: null, error: null });
      try {
        await window.api.secureStorage.delete('accessToken');
        await window.api.secureStorage.delete('refreshToken');
      } catch {
        // safeStorage may not be available
      }
    },
  });

  return {
    user: null,
    accessToken: null,
    refreshToken: null,
    isLoading: false,
    error: null,

    login: async (username: string, password: string) => {
      set({ isLoading: true, error: null });
      try {
        const data = await apiRequest<{
          accessToken: string;
          refreshToken: string;
          user: User;
        }>('/api/auth/login', {
          method: 'POST',
          body: JSON.stringify({ username, password }),
        });

        set({
          user: data.user,
          accessToken: data.accessToken,
          refreshToken: data.refreshToken,
          isLoading: false,
          error: null,
        });

        // Persist tokens to safeStorage
        try {
          await window.api.secureStorage.set('accessToken', data.accessToken);
          await window.api.secureStorage.set('refreshToken', data.refreshToken);
        } catch {
          // safeStorage may not be available
        }
      } catch (err: unknown) {
        const error = err as { code?: string; message?: string };
        let message = 'Login failed. Please try again.';
        if (error.code === 'INVALID_CREDENTIALS') {
          message = 'Invalid username or password.';
        } else if (error.code === 'ACCOUNT_BANNED') {
          message = 'Your account has been banned.';
        }
        set({ isLoading: false, error: message });
      }
    },

    logout: async () => {
      const { refreshToken, accessToken } = get();
      set({ isLoading: true });

      try {
        if (refreshToken && accessToken) {
          await apiRequest('/api/auth/logout', {
            method: 'POST',
            body: JSON.stringify({ refreshToken }),
          });
        }
      } catch {
        // Logout is best-effort — clear local state regardless
      }

      set({ user: null, accessToken: null, refreshToken: null, isLoading: false, error: null });

      try {
        await window.api.secureStorage.delete('accessToken');
        await window.api.secureStorage.delete('refreshToken');
      } catch {
        // safeStorage may not be available
      }
    },

    refreshTokens: async () => {
      const { refreshToken } = get();
      if (!refreshToken) throw new Error('No refresh token');

      const data = await apiRequest<{
        accessToken: string;
        refreshToken: string;
      }>('/api/auth/refresh', {
        method: 'POST',
        body: JSON.stringify({ refreshToken }),
      });

      set({ accessToken: data.accessToken, refreshToken: data.refreshToken });

      try {
        await window.api.secureStorage.set('accessToken', data.accessToken);
        await window.api.secureStorage.set('refreshToken', data.refreshToken);
      } catch {
        // safeStorage may not be available
      }
    },

    restoreSession: async () => {
      set({ isLoading: true });

      try {
        const accessToken = await window.api.secureStorage.get('accessToken');
        const refreshToken = await window.api.secureStorage.get('refreshToken');

        if (!accessToken || !refreshToken) {
          set({ isLoading: false });
          return;
        }

        set({ accessToken, refreshToken });

        // Try to use the access token to get user info by making a refresh call
        // This validates the tokens and gets a fresh pair
        try {
          const data = await apiRequest<{
            accessToken: string;
            refreshToken: string;
          }>('/api/auth/refresh', {
            method: 'POST',
            body: JSON.stringify({ refreshToken }),
          });

          // Decode user info from the new access token (JWT payload)
          const payload = JSON.parse(atob(data.accessToken.split('.')[1]));
          set({
            user: { id: payload.userId, username: payload.username || '', role: payload.role },
            accessToken: data.accessToken,
            refreshToken: data.refreshToken,
            isLoading: false,
          });

          await window.api.secureStorage.set('accessToken', data.accessToken);
          await window.api.secureStorage.set('refreshToken', data.refreshToken);
        } catch {
          // Tokens are invalid, clear everything
          set({ user: null, accessToken: null, refreshToken: null, isLoading: false });
          await window.api.secureStorage.delete('accessToken');
          await window.api.secureStorage.delete('refreshToken');
        }
      } catch {
        // safeStorage unavailable
        set({ isLoading: false });
      }
    },

    clearError: () => set({ error: null }),
  };
});

export default useAuthStore;
