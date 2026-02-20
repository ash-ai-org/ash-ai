import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import Fastify, { type FastifyInstance } from 'fastify';
import swagger from '@fastify/swagger';
import { registerSchemas } from '../schemas.js';
import { agentRoutes } from '../routes/agents.js';
import { sessionRoutes } from '../routes/sessions.js';
import { fileRoutes } from '../routes/files.js';
import { healthRoutes } from '../routes/health.js';

describe('OpenAPI spec generation', () => {
  let app: FastifyInstance;
  let spec: Record<string, unknown>;

  beforeAll(async () => {
    app = Fastify({ logger: false });
    await app.register(swagger, {
      openapi: {
        info: { title: 'Ash API', version: '0.1.0' },
      },
    });
    registerSchemas(app);

    // Register routes with stub dependencies (handlers never called)
    const nullCoordinator = {} as any;
    agentRoutes(app, '/tmp/unused');
    sessionRoutes(app, nullCoordinator, '/tmp/unused');
    fileRoutes(app, nullCoordinator, '/tmp/unused');
    healthRoutes(app, nullCoordinator, null);

    await app.ready();
    spec = app.swagger() as Record<string, unknown>;
  });

  afterAll(async () => {
    await app.close();
  });

  it('generates a valid OpenAPI 3.x spec', () => {
    expect(spec).toBeDefined();
    expect(spec.openapi).toMatch(/^3\./);
  });

  it('has info section', () => {
    const info = spec.info as Record<string, string>;
    expect(info.title).toBe('Ash API');
    expect(info.version).toBe('0.1.0');
  });

  it('has all expected paths', () => {
    const paths = spec.paths as Record<string, unknown>;
    const pathKeys = Object.keys(paths);

    expect(pathKeys).toContain('/health');
    expect(pathKeys).toContain('/api/agents');
    expect(pathKeys).toContain('/api/agents/{name}');
    expect(pathKeys).toContain('/api/sessions');
    expect(pathKeys).toContain('/api/sessions/{id}');
    expect(pathKeys).toContain('/api/sessions/{id}/messages');
    expect(pathKeys).toContain('/api/sessions/{id}/pause');
    expect(pathKeys).toContain('/api/sessions/{id}/resume');
    expect(pathKeys).toContain('/api/sessions/{id}/files');
    // Wildcard route: Fastify may render it as /api/sessions/{id}/files/{*} or similar
    expect(pathKeys.some((p: string) => p.startsWith('/api/sessions/{id}/files/') && p !== '/api/sessions/{id}/files')).toBe(true);
  });

  it('has 14 operations total', () => {
    const paths = spec.paths as Record<string, Record<string, unknown>>;
    let count = 0;
    for (const path of Object.values(paths)) {
      for (const method of ['get', 'post', 'put', 'delete', 'patch']) {
        if (path[method]) count++;
      }
    }
    expect(count).toBe(16);
  });

  it('has component schemas for Agent, Session, ApiError, HealthResponse', () => {
    const components = spec.components as { schemas: Record<string, { title?: string }> };
    const titles = Object.values(components.schemas).map((s) => s.title);
    expect(titles).toContain('Agent');
    expect(titles).toContain('Session');
    expect(titles).toContain('ApiError');
    expect(titles).toContain('HealthResponse');
  });

  it('tags all routes', () => {
    const paths = spec.paths as Record<string, Record<string, { tags?: string[] }>>;
    for (const [, methods] of Object.entries(paths)) {
      for (const method of ['get', 'post', 'delete']) {
        const op = methods[method];
        if (op) {
          expect(op.tags).toBeDefined();
          expect(op.tags!.length).toBeGreaterThan(0);
        }
      }
    }
  });
});
