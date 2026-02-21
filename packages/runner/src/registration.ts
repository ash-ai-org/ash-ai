import type { SandboxPool } from '@ash-ai/sandbox';
import { RUNNER_HEARTBEAT_INTERVAL_MS } from '@ash-ai/shared';

interface RegistrationOpts {
  runnerId: string;
  host: string;
  port: number;
  maxSandboxes: number;
  serverUrl: string;
  pool: SandboxPool;
  /** Shared secret for internal endpoint auth. */
  internalSecret?: string;
}

let heartbeatTimer: NodeJS.Timeout | null = null;
let registrationState: { runnerId: string; serverUrl: string; internalSecret?: string } | null = null;

function internalHeaders(secret?: string): Record<string, string> {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (secret) headers['Authorization'] = `Bearer ${secret}`;
  return headers;
}

/**
 * Register this runner with the control plane and begin heartbeat loop.
 * Registration retries with exponential backoff until successful.
 */
export function startRegistration(opts: RegistrationOpts): void {
  const { runnerId, host, port, maxSandboxes, serverUrl, pool, internalSecret } = opts;
  const registerUrl = `${serverUrl}/api/internal/runners/register`;
  const heartbeatUrl = `${serverUrl}/api/internal/runners/heartbeat`;
  const headers = internalHeaders(internalSecret);

  registrationState = { runnerId, serverUrl, internalSecret };

  // Registration with exponential backoff (1s, 2s, 4s, 8s, 16s)
  const registerWithRetry = async () => {
    const maxRetries = 5;
    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      try {
        const resp = await fetch(registerUrl, {
          method: 'POST',
          headers,
          body: JSON.stringify({ runnerId, host, port, maxSandboxes }),
        });
        if (resp.ok) {
          console.log(`[runner] Registered with control plane at ${serverUrl}`);
          return;
        }
        console.error(`[runner] Registration failed: ${resp.status} ${await resp.text()}`);
      } catch (err) {
        console.error(`[runner] Failed to register with ${serverUrl}:`, err);
      }
      if (attempt < maxRetries) {
        const delay = 1000 * Math.pow(2, attempt);
        console.log(`[runner] Retrying registration in ${delay}ms (attempt ${attempt + 1}/${maxRetries})...`);
        await new Promise(r => setTimeout(r, delay));
      }
    }
    console.error(`[runner] Registration failed after ${maxRetries + 1} attempts — will retry on next heartbeat`);
  };

  // Heartbeat
  const heartbeat = async () => {
    try {
      const stats = await pool.statsAsync();
      await fetch(heartbeatUrl, {
        method: 'POST',
        headers,
        body: JSON.stringify({ runnerId, stats, activeCount: pool.activeCount }),
      });
    } catch (err) {
      console.error('[runner] Heartbeat failed:', err);
    }
  };

  registerWithRetry();

  heartbeatTimer = setInterval(heartbeat, RUNNER_HEARTBEAT_INTERVAL_MS);
  heartbeatTimer.unref();
}

/**
 * Gracefully deregister from the control plane and stop heartbeats.
 * Sessions are paused immediately rather than waiting for liveness timeout.
 */
export async function stopRegistration(): Promise<void> {
  if (heartbeatTimer) {
    clearInterval(heartbeatTimer);
    heartbeatTimer = null;
  }

  // Graceful deregistration — tell the server to pause sessions immediately
  if (registrationState) {
    const { runnerId, serverUrl, internalSecret } = registrationState;
    const deregisterUrl = `${serverUrl}/api/internal/runners/deregister`;
    try {
      const resp = await fetch(deregisterUrl, {
        method: 'POST',
        headers: internalHeaders(internalSecret),
        body: JSON.stringify({ runnerId }),
      });
      if (resp.ok) {
        console.log(`[runner] Deregistered from control plane`);
      } else {
        console.error(`[runner] Deregistration failed: ${resp.status}`);
      }
    } catch (err) {
      console.error('[runner] Deregistration failed:', err);
    }
    registrationState = null;
  }
}
