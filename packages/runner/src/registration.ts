import type { SandboxPool } from '@ash-ai/sandbox';
import { RUNNER_HEARTBEAT_INTERVAL_MS } from '@ash-ai/shared';

interface RegistrationOpts {
  runnerId: string;
  host: string;
  port: number;
  maxSandboxes: number;
  serverUrl: string;
  pool: SandboxPool;
}

let heartbeatTimer: NodeJS.Timeout | null = null;

/**
 * Register this runner with the control plane and begin heartbeat loop.
 */
export function startRegistration(opts: RegistrationOpts): void {
  const { runnerId, host, port, maxSandboxes, serverUrl, pool } = opts;
  const registerUrl = `${serverUrl}/api/internal/runners/register`;
  const heartbeatUrl = `${serverUrl}/api/internal/runners/heartbeat`;

  // Initial registration
  const register = async () => {
    try {
      const resp = await fetch(registerUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ runnerId, host, port, maxSandboxes }),
      });
      if (!resp.ok) {
        console.error(`[runner] Registration failed: ${resp.status} ${await resp.text()}`);
      } else {
        console.log(`[runner] Registered with control plane at ${serverUrl}`);
      }
    } catch (err) {
      console.error(`[runner] Failed to register with ${serverUrl}:`, err);
    }
  };

  // Heartbeat
  const heartbeat = async () => {
    try {
      const stats = await pool.statsAsync();
      await fetch(heartbeatUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ runnerId, stats, activeCount: pool.activeCount }),
      });
    } catch (err) {
      console.error('[runner] Heartbeat failed:', err);
    }
  };

  register();

  heartbeatTimer = setInterval(heartbeat, RUNNER_HEARTBEAT_INTERVAL_MS);
  heartbeatTimer.unref();
}

export function stopRegistration(): void {
  if (heartbeatTimer) {
    clearInterval(heartbeatTimer);
    heartbeatTimer = null;
  }
}
