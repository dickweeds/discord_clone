import { useEffect } from 'react';
import { useNavigate } from 'react-router';

const PROTOCOL_PREFIX = 'discord-clone://invite/';

export function useDeepLink(): void {
  const navigate = useNavigate();

  useEffect(() => {
    if (!window.api?.onDeepLink) return;

    const unsubscribe = window.api.onDeepLink((url: string) => {
      if (!url.startsWith(PROTOCOL_PREFIX)) return;

      const token = url.slice(PROTOCOL_PREFIX.length);
      if (!token) return;

      navigate(`/register/${token}`);
    });

    return unsubscribe;
  }, [navigate]);
}
