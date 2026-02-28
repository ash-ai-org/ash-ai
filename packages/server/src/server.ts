import Fastify, { type FastifyInstance } from 'fastify';
import swagger from '@fastify/swagger';
import swaggerUi from '@fastify/swagger-ui';
import { join, resolve } from 'node:path';
import { writeFileSync } from 'node:fs';
import { DEFAULT_PORT, DEFAULT_HOST, DEFAULT_DATA_DIR, DEFAULT_MAX_SANDBOXES, DEFAULT_IDLE_TIMEOUT_MS } from '@ash-ai/shared';
import { initDb, closeDb, updateSessionStatus, getAgent, getSession, insertSession, updateSessionRunner, listAgents, listApiKeysByTenant, insertApiKey } from './db/index.js';
import { QueueProcessor } from './queue/processor.js';
import { randomUUID } from 'node:crypto';
import { SandboxManager, SandboxPool, persistSessionState, syncStateToCloud } from '@ash-ai/sandbox';
import { LocalRunnerBackend } from './runner/local-backend.js';
import { RunnerCoordinator } from './runner/coordinator.js';
import { registerSchemas } from './schemas.js';
import { registerAuth, generateApiKey, hashApiKey } from './auth.js';
import { agentRoutes } from './routes/agents.js';
import { sessionRoutes } from './routes/sessions.js';
import { healthRoutes } from './routes/health.js';
import { runnerRoutes } from './routes/runners.js';
import { fileRoutes } from './routes/files.js';
import { credentialRoutes } from './routes/credentials.js';
import { queueRoutes } from './routes/queue.js';
import { attachmentRoutes } from './routes/attachments.js';
import { usageRoutes } from './routes/usage.js';
import { workspaceRoutes } from './routes/workspace.js';
import { createTelemetryExporter } from './telemetry/exporter.js';
import { VERSION } from './version.js';

export interface AshServerOptions {
  /** Data directory for sandboxes and state. Defaults to ASH_DATA_DIR or ~/.ash */
  dataDir?: string;
  /** Postgres connection URL. If omitted, uses SQLite in dataDir */
  databaseUrl?: string;
  /** Server mode: 'standalone' runs local sandboxes, 'coordinator' is control-plane only */
  mode?: 'standalone' | 'coordinator';
  /** Path to the bridge entry script */
  bridgeEntry?: string;
  /** Port for the HTTP server (used in OpenAPI docs URL) */
  port?: number;
  /** Host to bind to */
  host?: string;
  /** Maximum concurrent sandboxes (standalone mode) */
  maxSandboxes?: number;
  /** Idle timeout before evicting sandboxes (ms) */
  idleTimeoutMs?: number;
  /** API key for single-tenant auth fallback */
  apiKey?: string;
}

export interface AshServer {
  app: FastifyInstance;
  shutdown: () => Promise<void>;
}

/**
 * Create a configured Ash server instance without starting it.
 * Call `app.listen({ port, host })` to start, or use for testing.
 */
export async function createAshServer(opts: AshServerOptions = {}): Promise<AshServer> {
  const dataDir = resolve(opts.dataDir || DEFAULT_DATA_DIR);
  const mode = opts.mode || 'standalone';
  const port = opts.port || DEFAULT_PORT;
  const bridgeEntry = opts.bridgeEntry
    ? resolve(opts.bridgeEntry)
    : undefined;

  // Initialize DB
  const db = await initDb({ dataDir, databaseUrl: opts.databaseUrl });

  // Build the backend and coordinator based on mode
  let pool: SandboxPool | null = null;
  let coordinator: RunnerCoordinator;

  if (mode === 'standalone') {
    const sandboxManager = new SandboxManager({
      sandboxesDir: join(dataDir, 'sandboxes'),
      bridgeEntry: bridgeEntry || join(dataDir, '..', 'packages', 'bridge', 'dist', 'index.js'),
    });

    const maxCapacity = opts.maxSandboxes || DEFAULT_MAX_SANDBOXES;
    const idleTimeoutMs = opts.idleTimeoutMs || DEFAULT_IDLE_TIMEOUT_MS;

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
    pool.startColdCleanup();

    // Pre-warm sandboxes for agents that request it (fire-and-forget, doesn't block startup)
    listAgents().then(async (agents) => {
      for (const agent of agents) {
        const preWarmCount = (agent.config as Record<string, unknown> | undefined)?.preWarmCount;
        if (typeof preWarmCount === 'number' && preWarmCount > 0 && agent.path) {
          await pool!.warmUp(agent.name, agent.path, preWarmCount, {
            startupScript: (agent.config as Record<string, unknown> | undefined)?.startupScript as string | undefined,
          });
        }
      }
    }).catch((err) => {
      console.error('[server] Pre-warm failed:', err);
    });

    const localBackend = new LocalRunnerBackend(pool, dataDir);
    coordinator = new RunnerCoordinator({ localBackend });
  } else {
    coordinator = new RunnerCoordinator({});
  }

  const telemetry = createTelemetryExporter();

  const app = Fastify({ logger: true });

  // OpenAPI / Swagger
  await app.register(swagger, {
    openapi: {
      info: {
        title: 'Ash API',
        description: 'REST API for deploying and orchestrating hosted AI agents',
        version: VERSION,
      },
      servers: [{ url: `http://localhost:${port}` }],
      tags: [
        { name: 'health', description: 'Server health' },
        { name: 'agents', description: 'Agent deployment and management' },
        { name: 'sessions', description: 'Session lifecycle and messaging' },
        { name: 'credentials', description: 'Credential storage and management' },
        { name: 'attachments', description: 'File attachments for sessions' },
        { name: 'queue', description: 'Async message queue' },
        { name: 'usage', description: 'Usage tracking and analytics' },
      ],
    },
  });
  await app.register(swaggerUi, { routePrefix: '/docs' });
  registerSchemas(app);

  // Auto-generate API key on first start if no keys exist
  let hasDbKeys = false;
  const existingKeys = await listApiKeysByTenant('default');
  hasDbKeys = existingKeys.length > 0;

  if (!hasDbKeys && !opts.apiKey) {
    const plainKey = generateApiKey();
    const hmacSecret = process.env.ASH_CREDENTIAL_KEY;
    const keyHash = hashApiKey(plainKey, hmacSecret);
    await insertApiKey(randomUUID(), 'default', keyHash, 'auto-generated');
    hasDbKeys = true;

    // Write bootstrap file for CLI to pick up
    const bootstrapPath = join(dataDir, 'initial-api-key');
    writeFileSync(bootstrapPath, plainKey, { mode: 0o600 });

    console.log('');
    console.log('==========================================================');
    console.log('  Auto-generated API key (save this — it won\'t be shown again):');
    console.log('');
    console.log(`  ${plainKey}`);
    console.log('');
    console.log('  The key has been saved to:');
    console.log(`  ${bootstrapPath}`);
    console.log('==========================================================');
    console.log('');
  }

  // Auth
  registerAuth(app, opts.apiKey, db, hasDbKeys);

  // Routes
  agentRoutes(app, dataDir, pool);
  sessionRoutes(app, coordinator, dataDir, telemetry);
  fileRoutes(app, coordinator, dataDir);
  credentialRoutes(app);
  queueRoutes(app);
  attachmentRoutes(app, dataDir);
  usageRoutes(app);
  workspaceRoutes(app, coordinator, dataDir);
  healthRoutes(app, coordinator, pool);
  runnerRoutes(app, coordinator);

  coordinator.startLivenessSweep();

  // Queue processor
  const queueProcessor = new QueueProcessor({
    async process(item) {
      const agentRecord = await getAgent(item.agentName, item.tenantId);
      if (!agentRecord) throw new Error(`Agent "${item.agentName}" not found`);

      let sessionId = item.sessionId;

      if (!sessionId) {
        sessionId = randomUUID();
        const { backend, runnerId } = await coordinator.selectBackend();
        const handle = await backend.createSandbox({
          sessionId,
          agentDir: agentRecord.path,
          agentName: agentRecord.name,
          sandboxId: sessionId,
        });
        await insertSession(sessionId, agentRecord.name, handle.sandboxId, item.tenantId ?? 'default');
        const effectiveRunnerId = runnerId === '__local__' ? null : runnerId;
        if (effectiveRunnerId) {
          await updateSessionRunner(sessionId, effectiveRunnerId);
        }
        await updateSessionStatus(sessionId, 'active');
      }

      const session = await getSession(sessionId);
      if (!session) throw new Error(`Session ${sessionId} not found`);
      if (session.status !== 'active') throw new Error(`Session ${sessionId} is ${session.status}`);

      const backend = await coordinator.getBackendForRunnerAsync(session.runnerId);
      const sandbox = backend.getSandbox(session.sandboxId);
      if (!sandbox) throw new Error(`Sandbox ${session.sandboxId} not found`);

      backend.markRunning(session.sandboxId);
      try {
        const events = backend.sendCommand(session.sandboxId, {
          cmd: 'query',
          prompt: item.prompt,
          sessionId: session.id,
        });
        for await (const event of events) {
          if (event.ev === 'error') throw new Error(event.error as string);
        }
      } finally {
        backend.markWaiting(session.sandboxId);
      }
    },
    onFailed(item, error) {
      console.error(`[queue] Item ${item.id} permanently failed: ${error}`);
    },
  });
  queueProcessor.start();

  // Shutdown handler
  async function shutdown() {
    app.log.info('Shutting down...');
    queueProcessor.stop();
    await telemetry.shutdown();
    coordinator.stopLivenessSweep();
    if (pool) {
      pool.stopIdleSweep();
      pool.stopColdCleanup();
      await pool.destroyAll();
    }
    await closeDb();
    await app.close();
  }

  return { app, shutdown };
}
