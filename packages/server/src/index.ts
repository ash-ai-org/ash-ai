import Fastify from 'fastify';
import swagger from '@fastify/swagger';
import swaggerUi from '@fastify/swagger-ui';
import { join, resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { DEFAULT_PORT, DEFAULT_HOST, DEFAULT_DATA_DIR, DEFAULT_MAX_SANDBOXES, DEFAULT_IDLE_TIMEOUT_MS } from '@ash-ai/shared';
import { initDb, closeDb, updateSessionStatus } from './db/index.js';
import { SandboxManager, SandboxPool, persistSessionState, syncStateToCloud } from '@ash-ai/sandbox';
import { LocalRunnerBackend } from './runner/local-backend.js';
import { RunnerCoordinator } from './runner/coordinator.js';
import { registerSchemas } from './schemas.js';
import { registerAuth } from './auth.js';
import { agentRoutes } from './routes/agents.js';
import { sessionRoutes } from './routes/sessions.js';
import { healthRoutes } from './routes/health.js';
import { runnerRoutes } from './routes/runners.js';
import { fileRoutes } from './routes/files.js';

// Config from env
const __dirname = dirname(fileURLToPath(import.meta.url));
const monorepoRoot = resolve(__dirname, '..', '..', '..');
const port = parseInt(process.env.ASH_PORT || String(DEFAULT_PORT), 10);
const host = process.env.ASH_HOST || DEFAULT_HOST;
const dataDir = resolve(process.env.ASH_DATA_DIR || DEFAULT_DATA_DIR);
const bridgeEntry = process.env.ASH_BRIDGE_ENTRY
  ? resolve(process.env.ASH_BRIDGE_ENTRY)
  : join(monorepoRoot, 'packages', 'bridge', 'dist', 'index.js');

// Mode: 'standalone' (default) or 'coordinator'
const mode = (process.env.ASH_MODE || 'standalone') as 'standalone' | 'coordinator';

// Initialize DB
const databaseUrl = process.env.ASH_DATABASE_URL;
const db = await initDb({ dataDir, databaseUrl });

// Build the backend and coordinator based on mode
let pool: SandboxPool | null = null;
let coordinator: RunnerCoordinator;

if (mode === 'standalone') {
  // Standalone: server creates local SandboxPool + LocalRunnerBackend
  const sandboxManager = new SandboxManager({
    sandboxesDir: join(dataDir, 'sandboxes'),
    bridgeEntry,
  });

  const maxCapacity = parseInt(process.env.ASH_MAX_SANDBOXES || String(DEFAULT_MAX_SANDBOXES), 10);
  const idleTimeoutMs = parseInt(process.env.ASH_IDLE_TIMEOUT_MS || String(DEFAULT_IDLE_TIMEOUT_MS), 10);

  pool = new SandboxPool({
    manager: sandboxManager,
    db,
    dataDir,
    maxCapacity,
    idleTimeoutMs,
    onBeforeEvict: async (entry) => {
      if (entry.sessionId) {
        persistSessionState(dataDir, entry.sessionId, entry.sandbox.workspaceDir, entry.agentName);
        syncStateToCloud(dataDir, entry.sessionId).catch((err) =>
          console.error(`[server] Cloud sync failed for ${entry.sessionId}:`, err)
        );
        await updateSessionStatus(entry.sessionId, 'paused');
      }
    },
  });
  await pool.init();
  pool.startIdleSweep();

  const localBackend = new LocalRunnerBackend(pool, dataDir);
  coordinator = new RunnerCoordinator({ localBackend });
} else {
  // Coordinator mode: pure control plane, no local sandbox pool
  // Runners must register and provide sandbox capacity
  coordinator = new RunnerCoordinator({});
}

const app = Fastify({ logger: true });

// OpenAPI / Swagger
await app.register(swagger, {
  openapi: {
    info: {
      title: 'Ash API',
      description: 'REST API for deploying and orchestrating hosted AI agents',
      version: '0.1.0',
    },
    servers: [{ url: `http://localhost:${port}` }],
    tags: [
      { name: 'health', description: 'Server health' },
      { name: 'agents', description: 'Agent deployment and management' },
      { name: 'sessions', description: 'Session lifecycle and messaging' },
    ],
  },
});
await app.register(swaggerUi, { routePrefix: '/docs' });
registerSchemas(app);

// Auth: multi-tenant API key resolution with ASH_API_KEY fallback
registerAuth(app, process.env.ASH_API_KEY, db);

// Routes
agentRoutes(app, dataDir);
sessionRoutes(app, coordinator, dataDir);
fileRoutes(app, coordinator, dataDir);
healthRoutes(app, coordinator, pool);
runnerRoutes(app, coordinator);

coordinator.startLivenessSweep();

// Graceful shutdown
async function shutdown() {
  app.log.info('Shutting down...');
  coordinator.stopLivenessSweep();
  if (pool) {
    pool.stopIdleSweep();
    await pool.destroyAll();
  }
  await closeDb();
  await app.close();
  process.exit(0);
}

process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);

// Start
try {
  await app.listen({ port, host });
  app.log.info(`Ash server listening on ${host}:${port} (mode: ${mode})`);
  app.log.info(`Data directory: ${dataDir}`);
  if (mode === 'standalone') {
    app.log.info(`Bridge entry: ${bridgeEntry}`);
  }
} catch (err) {
  app.log.error(err);
  process.exit(1);
}
