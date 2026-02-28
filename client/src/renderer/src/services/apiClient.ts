const BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:3000';

let getAccessToken: () => string | null = () => null;
let getRefreshToken: () => string | null = () => null;
let onTokensRefreshed: (accessToken: string, refreshToken: string) => Promise<void> = async () => {};
let onSessionExpired: () => Promise<void> = async () => {};

export function configureApiClient(config: {
  getAccessToken: () => string | null;
  getRefreshToken: () => string | null;
  onTokensRefreshed: (accessToken: string, refreshToken: string) => Promise<void>;
  onSessionExpired: () => Promise<void>;
}): void {
  getAccessToken = config.getAccessToken;
  getRefreshToken = config.getRefreshToken;
  onTokensRefreshed = config.onTokensRefreshed;
  onSessionExpired = config.onSessionExpired;
}

async function attemptRefresh(): Promise<boolean> {
  const refreshToken = getRefreshToken();
  if (!refreshToken) return false;

  try {
    const response = await fetch(`${BASE_URL}/api/auth/refresh`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ refreshToken }),
    });

    if (!response.ok) return false;

    const body = await response.json();
    await onTokensRefreshed(body.data.accessToken, body.data.refreshToken);
    return true;
  } catch {
    return false;
  }
}

async function withRetry<T>(fn: () => Promise<T>, maxRetries = 2): Promise<T> {
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await fn();
    } catch (err) {
      // Only retry on transient failures: network errors + 5xx server errors
      const status = (err as { status?: number }).status;
      const isRetryable = (status !== undefined && status >= 500) ||
        err instanceof TypeError; // network failure from fetch()
      if (!isRetryable || attempt === maxRetries) throw err;
      // Linear backoff with jitter to prevent thundering herd against Supabase
      const jitter = Math.random() * 200;
      await new Promise((r) => setTimeout(r, 500 * (attempt + 1) + jitter));
    }
  }
  throw new Error('unreachable');
}

export async function apiRequest<T>(path: string, options?: RequestInit, returnFullBody?: boolean): Promise<T> {
  const accessToken = getAccessToken();
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
    ...(options?.headers as Record<string, string> || {}),
  };

  let response = await fetch(`${BASE_URL}${path}`, { ...options, headers });

  if (response.status === 401 && accessToken) {
    const refreshed = await attemptRefresh();
    if (refreshed) {
      const newToken = getAccessToken();
      headers.Authorization = `Bearer ${newToken}`;
      response = await fetch(`${BASE_URL}${path}`, { ...options, headers });
    } else {
      await onSessionExpired();
      throw new Error('Session expired');
    }
  }

  if (response.status === 204) return undefined as T;

  const body = await response.json();

  if (!response.ok) {
    const apiError = body.error || { code: 'UNKNOWN', message: 'Request failed' };
    const err = new Error(apiError.message);
    (err as { status?: number }).status = response.status;
    throw err;
  }

  return (returnFullBody ? body : body.data) as T;
}

export async function apiGet<T>(path: string, returnFullBody?: boolean): Promise<T> {
  return withRetry(() => apiRequest<T>(path, undefined, returnFullBody));
}
