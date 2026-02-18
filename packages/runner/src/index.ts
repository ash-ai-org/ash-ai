import Fastify from 'fastify';
import { join, resolve } from 'node:path';
import { DEFAULT_DATA_DIR, DEFAULT_MAX_SANDBOXES, DEFAULT_IDLE_TIMEOUT_MS, DEFAULT_RUNNER_PORT } from '@ash-ai/shared';
import { SandboxManager, SandboxPool, persistSessionState, syncStateToCloud } from '@ash-ai/sandbox';
import { sandboxRoutes } from './routes/sandboxes.js';
import { healthRoutes } from './routes/health.js';
import { startRegistration, stopRegistration } from './registration.js';

// Config from env
const runnerId = process.env.ASH_RUNNER_ID || `runner-${process.pid}`;
const port = parseInt(process.env.ASH_RUNNER_PORT || String(DEFAULT_RUNNER_PORT), 10);
const host = process.env.ASH_RUNNER_HOST || '0.0.0.0';
const dataDir = resolve(process.env.ASH_DATA_DIR || DEFAULT_DATA_DIR);
const bridgeEntry = process.env.ASH_BRIDGE_ENTRY
  ? resolve(process.env.ASH_BRIDGE_ENTRY)
  : join(resolve('.'), 'packages', 'bridge', 'dist', 'index.js');
const serverUrl = process.env.ASH_SERVER_URL; // e.g., http://server:4100

// Initialize sandbox infrastructure (runner uses a simple in-memory DB for sandboxes)
const sandboxManager = new SandboxManager({
  sandboxesDir: join(dataDir, 'sandboxes'),
  bridgeEntry,
});

const maxCapacity = parseInt(process.env.ASH_MAX_SANDBOXES || String(DEFAULT_MAX_SANDBOXES), 10);
const idleTimeoutMs = parseInt(process.env.ASH_IDLE_TIMEOUT_MS || String(DEFAULT_IDLE_TIMEOUT_MS), 10);

// Runner uses a lightweight in-memory sandbox DB (no SQLite needed for pool tracking)
import { InMemorySandboxDb } from './mem-db.js';
const sandboxDb = new InMemorySandboxDb();

const pool = new SandboxPool({
  manager: sandboxManager,
  db: sandboxDb,
  dataDir,
  maxCapacity,
  idleTimeoutMs,
  onBeforeEvict: async (entry) => {
    if (entry.sessionId) {
      persistSessionState(dataDir, entry.sessionId, entry.sandbox.workspaceDir, entry.agentName);
      syncStateToCloud(dataDir, entry.sessionId).catch((err) =>
        console.error(`[runner] Cloud sync failed for ${entry.sessionId}:`, err)
      );
    }
  },
});
await pool.init();
pool.startIdleSweep();

const app = Fastify({ logger: true });

// Routes
sandboxRoutes(app, pool, dataDir);
healthRoutes(app, pool, runnerId, maxCapacity);

// Graceful shutdown
async function shutdown() {
  app.log.info('Runner shutting down...');
  stopRegistration();
  pool.stopIdleSweep();
  await pool.destroyAll();
  await app.close();
  process.exit(0);
}

process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);

// Start
try {
  await app.listen({ port, host });
  app.log.info(`Ash runner ${runnerId} listening on ${host}:${port}`);
  app.log.info(`Data directory: ${dataDir}`);

  // Register with control plane if ASH_SERVER_URL is set
  if (serverUrl) {
    startRegistration({
      runnerId,
      host: process.env.ASH_RUNNER_ADVERTISE_HOST || host,
      port,
      maxSandboxes: maxCapacity,
      serverUrl,
      pool,
    });
  }
} catch (err) {
  app.log.error(err);
  process.exit(1);
}
