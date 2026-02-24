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

import { writeFileSync, mkdirSync, copyFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import Fastify from 'fastify';
import swagger from '@fastify/swagger';
import { registerSchemas } from '../src/schemas.js';
import { agentRoutes } from '../src/routes/agents.js';
import { sessionRoutes } from '../src/routes/sessions.js';
import { healthRoutes } from '../src/routes/health.js';
import { fileRoutes } from '../src/routes/files.js';
import { credentialRoutes } from '../src/routes/credentials.js';
import { queueRoutes } from '../src/routes/queue.js';
import { attachmentRoutes } from '../src/routes/attachments.js';
import { usageRoutes } from '../src/routes/usage.js';
import { workspaceRoutes } from '../src/routes/workspace.js';
import { runnerRoutes } from '../src/routes/runners.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const packageDir = resolve(__dirname, '..');
const docsDir = resolve(packageDir, '..', '..', 'docs');
const websiteStaticDir = resolve(packageDir, '..', '..', 'website', 'static');

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
      { name: 'files', description: 'Sandbox file access' },
      { name: 'credentials', description: 'Credential storage and management' },
      { name: 'attachments', description: 'File attachments for sessions' },
      { name: 'queue', description: 'Async message queue' },
      { name: 'usage', description: 'Usage tracking and analytics' },
      { name: 'workspace', description: 'Workspace bundle download/upload' },
      { name: 'runners', description: 'Internal runner management' },
    ],
  },
});

registerSchemas(app);

// Register ALL routes with stub dependencies.
// Handlers are never invoked — we only need the schema metadata for spec generation.
const stub = {} as any;
agentRoutes(app, '/tmp/unused');
sessionRoutes(app, stub, '/tmp/unused', stub);
fileRoutes(app, stub, '/tmp/unused');
credentialRoutes(app);
queueRoutes(app);
attachmentRoutes(app, '/tmp/unused');
usageRoutes(app);
workspaceRoutes(app, stub, '/tmp/unused');
healthRoutes(app, stub, null);
runnerRoutes(app, stub);

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

// Also copy to website/static/openapi.json for Docusaurus
mkdirSync(websiteStaticDir, { recursive: true });
const websiteOut = resolve(websiteStaticDir, 'openapi.json');
copyFileSync(serverOut, websiteOut);
console.log(`Wrote ${websiteOut}`);

await app.close();
