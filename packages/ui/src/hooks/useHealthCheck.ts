import { useEffect, useState } from 'react';
import type { AshClient } from '@ash-ai/sdk';

export interface UseHealthCheckOptions {
  client: AshClient;
}

export interface UseHealthCheckReturn {
  connected: boolean | null;
  refresh: () => void;
}

export function useHealthCheck({ client }: UseHealthCheckOptions): UseHealthCheckReturn {
  const [connected, setConnected] = useState<boolean | null>(null);

  const check = async () => {
    try {
      await client.health();
      setConnected(true);
    } catch {
      setConnected(false);
    }
  };

  useEffect(() => {
    check();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return { connected, refresh: check };
}
