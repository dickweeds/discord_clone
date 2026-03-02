import { create } from 'zustand';
import { apiRequest, configureApiClient } from '../services/apiClient';
import { initializeSodium, generateKeyPair, decryptGroupKey, serializeKey, deserializeKey } from '../services/encryptionService';

interface User {
  id: string;
  username: string;
  role: string;
  avatarUrl?: string;
}

interface AuthState {
  user: User | null;
  accessToken: string | null;
  refreshToken: string | null;
  groupKey: Uint8Array | null;
  isLoading: boolean;
  error: string | null;
  needsSetup: boolean;
  login: (username: string, password: string) => Promise<void>;
  register: (username: string, password: string, inviteToken: string) => Promise<void>;
  setup: (username: string, password: string) => Promise<void>;
  checkServerStatus: () => Promise<void>;
  logout: () => Promise<void>;
  refreshTokens: () => Promise<void>;
  restoreSession: () => Promise<void>;
  setUserAvatarUrl: (avatarUrl?: string) => void;
  clearError: () => void;
}

let restoreInFlight = false;

// Scope crypto keys per user so multi-account devices don't overwrite each other
function userKey(userId: string, key: string): string {
  return `${key}:${userId}`;
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
      } catch (err) {
        console.warn('safeStorage unavailable:', err instanceof Error ? err.message : err);
      }
    },
    onSessionExpired: async () => {
      set({ user: null, accessToken: null, refreshToken: null, groupKey: null, error: null });
      try {
        await window.api.secureStorage.delete('accessToken');
        await window.api.secureStorage.delete('refreshToken');
      } catch (err) {
        console.warn('safeStorage unavailable:', err instanceof Error ? err.message : err);
      }
    },
  });

  return {
    user: null,
    accessToken: null,
    refreshToken: null,
    groupKey: null,
    isLoading: true,
    error: null,
    needsSetup: false,

    login: async (username: string, password: string) => {
      set({ isLoading: true, error: null });
      try {
        const data = await apiRequest<{
          accessToken: string;
          refreshToken: string;
          user: User;
          encryptedGroupKey: string | null;
        }>('/api/auth/login', {
          method: 'POST',
          body: JSON.stringify({ username, password }),
        });

        // Persist tokens to safeStorage
        try {
          await window.api.secureStorage.set('accessToken', data.accessToken);
          await window.api.secureStorage.set('refreshToken', data.refreshToken);
        } catch (err) {
          console.warn('safeStorage unavailable:', err instanceof Error ? err.message : err);
        }

        // Decrypt group key BEFORE setting user — setting user triggers navigation
        // and components will immediately try to use groupKey
        const uid = data.user.id;
        let groupKey: Uint8Array | null = null;
        if (data.encryptedGroupKey) {
          try {
            await initializeSodium();
            const privateKeyB64 = await window.api.secureStorage.get(userKey(uid, 'private-key'));
            const publicKeyB64 = await window.api.secureStorage.get(userKey(uid, 'public-key'));
            if (privateKeyB64 && publicKeyB64) {
              const privateKey = deserializeKey(privateKeyB64);
              const publicKey = deserializeKey(publicKeyB64);
              groupKey = decryptGroupKey(data.encryptedGroupKey, publicKey, privateKey);
            }
            // Store encrypted group key for session restoration
            await window.api.secureStorage.set(userKey(uid, 'encrypted-group-key'), data.encryptedGroupKey);
          } catch (err) {
            console.warn('Failed to decrypt group key:', err instanceof Error ? err.message : err);
          }
        }

        set({
          user: data.user,
          accessToken: data.accessToken,
          refreshToken: data.refreshToken,
          groupKey,
          isLoading: false,
          error: null,
        });
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

    register: async (username: string, password: string, inviteToken: string) => {
      set({ isLoading: true, error: null });
      try {
        await initializeSodium();
        const { publicKey, secretKey } = generateKeyPair();

        const data = await apiRequest<{
          accessToken: string;
          refreshToken: string;
          user: User;
          encryptedGroupKey: string | null;
        }>('/api/auth/register', {
          method: 'POST',
          body: JSON.stringify({
            username,
            password,
            inviteToken,
            publicKey: serializeKey(publicKey),
          }),
        });

        const uid = data.user.id;

        // Store keys in safeStorage (scoped per user)
        try {
          await window.api.secureStorage.set(userKey(uid, 'private-key'), serializeKey(secretKey));
          await window.api.secureStorage.set(userKey(uid, 'public-key'), serializeKey(publicKey));
          if (data.encryptedGroupKey) {
            await window.api.secureStorage.set(userKey(uid, 'encrypted-group-key'), data.encryptedGroupKey);
          }
        } catch (err) {
          console.warn('safeStorage unavailable:', err instanceof Error ? err.message : err);
        }

        // Decrypt group key
        let groupKey: Uint8Array | null = null;
        if (data.encryptedGroupKey) {
          groupKey = decryptGroupKey(data.encryptedGroupKey, publicKey, secretKey);
        }

        set({
          user: data.user,
          accessToken: data.accessToken,
          refreshToken: data.refreshToken,
          groupKey,
          isLoading: false,
          error: null,
        });

        try {
          await window.api.secureStorage.set('accessToken', data.accessToken);
          await window.api.secureStorage.set('refreshToken', data.refreshToken);
        } catch (err) {
          console.warn('safeStorage unavailable:', err instanceof Error ? err.message : err);
        }
      } catch (err: unknown) {
        const error = err as { code?: string; message?: string };
        let message = 'Registration failed. Please try again.';
        if (error.code === 'INVALID_INVITE') {
          message = 'This invite is no longer valid.';
        } else if (error.code === 'USERNAME_TAKEN') {
          message = 'That username is taken. Try another.';
        } else if (error.code === 'INVALID_PUBLIC_KEY') {
          message = 'Encryption setup failed. Please try again.';
        }
        set({ isLoading: false, error: message });
      }
    },

    setup: async (username: string, password: string) => {
      set({ isLoading: true, error: null });
      try {
        await initializeSodium();
        const { publicKey, secretKey } = generateKeyPair();

        const data = await apiRequest<{
          accessToken: string;
          refreshToken: string;
          user: User;
          encryptedGroupKey: string | null;
        }>('/api/auth/register', {
          method: 'POST',
          body: JSON.stringify({
            username,
            password,
            publicKey: serializeKey(publicKey),
          }),
        });

        const uid = data.user.id;

        // Store keys in safeStorage (scoped per user)
        try {
          await window.api.secureStorage.set(userKey(uid, 'private-key'), serializeKey(secretKey));
          await window.api.secureStorage.set(userKey(uid, 'public-key'), serializeKey(publicKey));
          if (data.encryptedGroupKey) {
            await window.api.secureStorage.set(userKey(uid, 'encrypted-group-key'), data.encryptedGroupKey);
          }
        } catch (err) {
          console.warn('safeStorage unavailable:', err instanceof Error ? err.message : err);
        }

        // Decrypt group key
        let groupKey: Uint8Array | null = null;
        if (data.encryptedGroupKey) {
          groupKey = decryptGroupKey(data.encryptedGroupKey, publicKey, secretKey);
        }

        set({
          user: data.user,
          accessToken: data.accessToken,
          refreshToken: data.refreshToken,
          groupKey,
          needsSetup: false,
          isLoading: false,
          error: null,
        });

        try {
          await window.api.secureStorage.set('accessToken', data.accessToken);
          await window.api.secureStorage.set('refreshToken', data.refreshToken);
        } catch (err) {
          console.warn('safeStorage unavailable:', err instanceof Error ? err.message : err);
        }
      } catch (err: unknown) {
        const error = err as { code?: string; message?: string };
        let message = 'Setup failed. Please try again.';
        if (error.code === 'USERNAME_TAKEN') {
          message = 'That username is taken. Try another.';
        } else if (error.code === 'SETUP_ALREADY_COMPLETED') {
          message = 'Server setup was already completed by another user.';
        } else if (error.code === 'INVALID_PUBLIC_KEY') {
          message = 'Encryption setup failed. Please try again.';
        }
        set({ isLoading: false, error: message });
      }
    },

    checkServerStatus: async () => {
      try {
        const data = await apiRequest<{ needsSetup: boolean }>('/api/server/status', {
          method: 'GET',
        });
        set({ needsSetup: data.needsSetup });
      } catch {
        // If the endpoint fails, assume no setup needed
        set({ needsSetup: false });
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
      } catch (err) {
        console.warn('Logout API call failed:', err instanceof Error ? err.message : err);
      }

      // Clear groupKey from memory but keep private key + encrypted group key in safeStorage
      set({ user: null, accessToken: null, refreshToken: null, groupKey: null, isLoading: false, error: null });

      try {
        await window.api.secureStorage.delete('accessToken');
        await window.api.secureStorage.delete('refreshToken');
      } catch (err) {
        console.warn('safeStorage unavailable:', err instanceof Error ? err.message : err);
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
      } catch (err) {
        console.warn('safeStorage unavailable:', err instanceof Error ? err.message : err);
      }
    },

    restoreSession: async () => {
      // Guard against React StrictMode double-invocation racing two refresh calls
      if (restoreInFlight) return;
      restoreInFlight = true;

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
          const uid = payload.userId;

          const me = await apiRequest<User>('/api/users/me', { method: 'GET' });

          await window.api.secureStorage.set('accessToken', data.accessToken);
          await window.api.secureStorage.set('refreshToken', data.refreshToken);

          // Restore group key from safeStorage (scoped per user)
          let groupKey: Uint8Array | null = null;
          try {
            await initializeSodium();
            const privateKeyB64 = await window.api.secureStorage.get(userKey(uid, 'private-key'));
            const publicKeyB64 = await window.api.secureStorage.get(userKey(uid, 'public-key'));
            const encryptedGroupKeyB64 = await window.api.secureStorage.get(userKey(uid, 'encrypted-group-key'));
            if (privateKeyB64 && publicKeyB64 && encryptedGroupKeyB64) {
              const privateKey = deserializeKey(privateKeyB64);
              const publicKey = deserializeKey(publicKeyB64);
              groupKey = decryptGroupKey(encryptedGroupKeyB64, publicKey, privateKey);
            }
          } catch (err) {
            console.warn('Failed to restore group key:', err instanceof Error ? err.message : err);
          }

          set({
            user: {
              id: uid,
              username: me.username ?? payload.username,
              role: me.role ?? payload.role,
              ...(me.avatarUrl ? { avatarUrl: me.avatarUrl } : {}),
            },
            accessToken: data.accessToken,
            refreshToken: data.refreshToken,
            groupKey,
            isLoading: false,
          });
        } catch (err) {
          console.warn('Session restore failed, clearing tokens:', err instanceof Error ? err.message : err);
          // Tokens are invalid, clear everything
          set({ user: null, accessToken: null, refreshToken: null, groupKey: null, isLoading: false });
          await window.api.secureStorage.delete('accessToken');
          await window.api.secureStorage.delete('refreshToken');
        }
      } catch (err) {
        console.warn('safeStorage unavailable:', err instanceof Error ? err.message : err);
        set({ isLoading: false });
      } finally {
        restoreInFlight = false;
      }
    },

    setUserAvatarUrl: (avatarUrl?: string) => set((state) => ({
      user: state.user ? { ...state.user, avatarUrl } : null,
    })),

    clearError: () => set({ error: null }),
  };
});

export default useAuthStore;
