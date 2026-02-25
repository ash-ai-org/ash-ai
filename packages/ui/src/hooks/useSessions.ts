import { useEffect, useState, useCallback } from 'react';
import type { AshClient, Session } from '@ash-ai/sdk';

export interface UseSessionsOptions {
  client: AshClient;
  agent?: string;
  limit?: number;
  /** If false, don't auto-fetch on mount. */
  enabled?: boolean;
}

export interface UseSessionsReturn {
  sessions: Session[];
  loading: boolean;
  error: string | null;
  refresh: () => void;
}

export function useSessions({
  client,
  agent,
  limit = 20,
  enabled = true,
}: UseSessionsOptions): UseSessionsReturn {
  const [sessions, setSessions] = useState<Session[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetch_ = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const result = await client.listSessions({ agent, limit });
      setSessions(result);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to fetch sessions');
    } finally {
      setLoading(false);
    }
  }, [client, agent, limit]);

  useEffect(() => {
    if (enabled) fetch_();
  }, [enabled, fetch_]);

  return { sessions, loading, error, refresh: fetch_ };
}
