#!/usr/bin/env tsx
/**
 * Build-time script: starts a minimal Fastify instance with swagger + schemas + routes,
 * calls app.ready(), then writes the generated OpenAPI spec to openapi.json.
 *
 * Routes are registered with null/stub dependencies — handlers are never called,
 * we only need the schema metadata.
 *
 * Usage: tsx scripts/export-openapi.ts
 */

import { writeFileSync, mkdirSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import Fastify from 'fastify';
import swagger from '@fastify/swagger';
import { registerSchemas } from '../src/schemas.js';
import { agentRoutes } from '../src/routes/agents.js';
import { sessionRoutes } from '../src/routes/sessions.js';
import { healthRoutes } from '../src/routes/health.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const packageDir = resolve(__dirname, '..');
const docsDir = resolve(packageDir, '..', '..', 'docs');

const app = Fastify({ logger: false });

await app.register(swagger, {
  openapi: {
    info: {
      title: 'Ash API',
      description: 'REST API for deploying and orchestrating hosted AI agents',
      version: '0.1.0',
    },
    servers: [{ url: 'http://localhost:4100' }],
    tags: [
      { name: 'health', description: 'Server health' },
      { name: 'agents', description: 'Agent deployment and management' },
      { name: 'sessions', description: 'Session lifecycle and messaging' },
    ],
  },
});

registerSchemas(app);

// Register routes with stub dependencies.
// Handlers are never invoked — we only need the schema metadata for spec generation.
const nullSandboxManager = {} as any;
agentRoutes(app, '/tmp/unused');
sessionRoutes(app, nullSandboxManager, '/tmp/unused');
healthRoutes(app, nullSandboxManager);

await app.ready();

const spec = app.swagger();
const json = JSON.stringify(spec, null, 2);

// Write to packages/server/openapi.json
const serverOut = resolve(packageDir, 'openapi.json');
writeFileSync(serverOut, json + '\n');
console.log(`Wrote ${serverOut}`);

// Also copy to docs/openapi.json
mkdirSync(docsDir, { recursive: true });
const docsOut = resolve(docsDir, 'openapi.json');
writeFileSync(docsOut, json + '\n');
console.log(`Wrote ${docsOut}`);

await app.close();
