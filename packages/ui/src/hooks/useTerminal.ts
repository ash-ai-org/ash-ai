import { useEffect, useState, useRef, useCallback } from 'react';
import type { AshClient } from '@ash-ai/sdk';
import type { LogEntry } from '../types.js';

export interface UseTerminalOptions {
  client: AshClient;
  sessionId: string;
  /** If true, fetch all logs once (no polling). Used for ended sessions. */
  historical?: boolean;
  /** Polling interval in ms. Defaults to 500. */
  pollInterval?: number;
}

export interface UseTerminalReturn {
  logs: LogEntry[];
  connected: boolean | null;
  clearLogs: () => void;
}

export function useTerminal({
  client,
  sessionId,
  historical,
  pollInterval = 500,
}: UseTerminalOptions): UseTerminalReturn {
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [connected, setConnected] = useState<boolean | null>(null);
  const lastIndexRef = useRef(-1);
  const pollingRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const fetchLogs = useCallback(async () => {
    try {
      const afterOpt = lastIndexRef.current >= 0 ? { after: lastIndexRef.current } : undefined;
      const data = await client.getSessionLogs(sessionId, afterOpt);
      setConnected(true);

      if (data.logs && data.logs.length > 0) {
        setLogs((prev) => [...prev, ...data.logs]);
        lastIndexRef.current = data.logs[data.logs.length - 1].index;
      }
    } catch {
      setConnected(false);
    }
  }, [client, sessionId]);

  useEffect(() => {
    setLogs([]);
    lastIndexRef.current = -1;
    setConnected(null);

    fetchLogs();

    if (!historical) {
      pollingRef.current = setInterval(fetchLogs, pollInterval);
      return () => {
        if (pollingRef.current) clearInterval(pollingRef.current);
      };
    }
  }, [sessionId, historical, pollInterval, fetchLogs]);

  const clearLogs = useCallback(() => {
    setLogs([]);
  }, []);

  return { logs, connected, clearLogs };
}
