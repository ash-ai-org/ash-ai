import { useEffect, useState } from 'react';
import type { AshClient, Agent } from '@ash-ai/sdk';

export interface UseAgentsOptions {
  client: AshClient;
}

export interface UseAgentsReturn {
  agents: Agent[];
  loading: boolean;
  error: string | null;
  refresh: () => void;
}

export function useAgents({ client }: UseAgentsOptions): UseAgentsReturn {
  const [agents, setAgents] = useState<Agent[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetch_ = async () => {
    setLoading(true);
    setError(null);
    try {
      const result = await client.listAgents();
      setAgents(result);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to fetch agents');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetch_();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return { agents, loading, error, refresh: fetch_ };
}
