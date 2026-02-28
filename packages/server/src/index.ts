import { resolve, join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { DEFAULT_PORT, DEFAULT_HOST, DEFAULT_DATA_DIR, DEFAULT_MAX_SANDBOXES, DEFAULT_IDLE_TIMEOUT_MS } from '@ash-ai/shared';
import { createAshServer } from './server.js';
import { VERSION } from './version.js';

export { createAshServer } from './server.js';
export type { AshServerOptions, AshServer } from './server.js';

// When run directly (not imported), start the server from env config
const __dirname = dirname(fileURLToPath(import.meta.url));
const monorepoRoot = resolve(__dirname, '..', '..', '..');

const port = parseInt(process.env.ASH_PORT || String(DEFAULT_PORT), 10);
const host = process.env.ASH_HOST || DEFAULT_HOST;
const dataDir = resolve(process.env.ASH_DATA_DIR || DEFAULT_DATA_DIR);
const bridgeEntry = process.env.ASH_BRIDGE_ENTRY
  ? resolve(process.env.ASH_BRIDGE_ENTRY)
  : join(monorepoRoot, 'packages', 'bridge', 'dist', 'index.js');
const mode = (process.env.ASH_MODE || 'standalone') as 'standalone' | 'coordinator';

const { app, shutdown } = await createAshServer({
  dataDir,
  databaseUrl: process.env.ASH_DATABASE_URL,
  mode,
  bridgeEntry,
  port,
  host,
  maxSandboxes: parseInt(process.env.ASH_MAX_SANDBOXES || String(DEFAULT_MAX_SANDBOXES), 10),
  idleTimeoutMs: parseInt(process.env.ASH_IDLE_TIMEOUT_MS || String(DEFAULT_IDLE_TIMEOUT_MS), 10),
  apiKey: process.env.ASH_API_KEY,
});

// Graceful shutdown
process.on('SIGTERM', async () => { await shutdown(); process.exit(0); });
process.on('SIGINT', async () => { await shutdown(); process.exit(0); });

// Start
try {
  await app.listen({ port, host });
  app.log.info(`Ash v${VERSION} listening on ${host}:${port} (mode: ${mode})`);
  app.log.info(`Data directory: ${dataDir}`);
  if (mode === 'standalone') {
    app.log.info(`Bridge entry: ${bridgeEntry}`);
  }
} catch (err) {
  app.log.error(err);
  process.exit(1);
}
