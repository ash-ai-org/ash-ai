import { execSync, spawn, type ChildProcess } from 'node:child_process';

const CRDB_IMAGE = 'cockroachdb/cockroach:v24.3.0';

export interface CrdbHandle {
  /** postgresql://root@localhost:{port}/ash */
  url: string;
  sqlPort: number;
  stop(): Promise<void>;
}

/**
 * Launch a single-node CockroachDB in Docker, wait for it to accept SQL
 * connections, and create the `ash` database.
 */
export async function launchCrdb(opts: { port: number }): Promise<CrdbHandle> {
  const { port } = opts;
  const containerName = `ash-test-crdb-${port}`;

  // Clean up leftover container from a previous crashed run
  try {
    execSync(`docker stop ${containerName}`, { stdio: 'ignore', timeout: 5_000 });
  } catch {
    /* fine */
  }

  const child = spawn('docker', [
    'run', '--rm',
    '--name', containerName,
    '-p', `${port}:26257`,
    CRDB_IMAGE,
    'start-single-node', '--insecure',
  ], {
    stdio: ['ignore', 'pipe', 'pipe'],
  });

  // Log CRDB output for debugging
  child.stderr?.on('data', (chunk: Buffer) => {
    const line = chunk.toString().trimEnd();
    if (line.includes('error') || line.includes('Error') || line.includes('FATAL')) {
      console.error('[crdb]', line);
    }
  });

  // Wait for SQL port to be ready
  await waitForSql(port, 30_000);

  // Create the ash database
  await createDatabase(port);

  const url = `postgresql://root@localhost:${port}/ash`;

  return {
    url,
    sqlPort: port,
    stop: async () => {
      try {
        execSync(`docker stop ${containerName}`, { stdio: 'ignore', timeout: 10_000 });
      } catch {
        /* fine */
      }
      await stopChild(child);
    },
  };
}

/**
 * Poll the CRDB SQL port until it accepts a connection.
 */
async function waitForSql(port: number, timeoutMs: number): Promise<void> {
  // Dynamic import — pg is a server dependency, not available everywhere
  const { default: pg } = await import('pg');
  const start = Date.now();

  while (Date.now() - start < timeoutMs) {
    const client = new pg.Client({
      host: 'localhost',
      port,
      user: 'root',
      database: 'defaultdb',
      ssl: false,
    });

    try {
      await client.connect();
      await client.query('SELECT 1');
      await client.end();
      return;
    } catch {
      // not ready yet
      try { await client.end(); } catch { /* ignore */ }
    }

    await new Promise((r) => setTimeout(r, 500));
  }

  throw new Error(`CockroachDB on port ${port} did not become ready within ${timeoutMs}ms`);
}

/**
 * Create the `ash` database if it doesn't exist.
 */
async function createDatabase(port: number): Promise<void> {
  const { default: pg } = await import('pg');
  const client = new pg.Client({
    host: 'localhost',
    port,
    user: 'root',
    database: 'defaultdb',
    ssl: false,
  });

  await client.connect();
  await client.query('CREATE DATABASE IF NOT EXISTS ash');
  await client.end();
}

function stopChild(child: ChildProcess): Promise<void> {
  return new Promise<void>((resolve) => {
    if (child.exitCode !== null) return resolve();
    child.kill('SIGTERM');
    child.on('exit', () => resolve());
    setTimeout(() => {
      if (child.exitCode === null) child.kill('SIGKILL');
      resolve();
    }, 5_000);
  });
}
