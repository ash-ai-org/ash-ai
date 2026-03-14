import type { FastifyInstance } from 'fastify';
import { randomUUID } from 'node:crypto';
import {
  getAgent,
  insertEvalCase,
  getEvalCase,
  listEvalCases,
  updateEvalCase,
  deleteEvalCase,
  insertEvalRun,
  getEvalRun,
  listEvalRuns,
  updateEvalRun,
  insertEvalResult,
  getEvalResult,
  listEvalResults,
  updateEvalResult,
  listAgentVersions,
  getAgentVersionByNumber,
} from '../db/index.js';
import type { RunnerCoordinator } from '../runner/coordinator.js';
import type { TelemetryExporter } from '../telemetry/exporter.js';

const nameParam = {
  type: 'object',
  properties: { name: { type: 'string' } },
  required: ['name'],
} as const;

const nameAndIdParams = {
  type: 'object',
  properties: {
    name: { type: 'string' },
    id: { type: 'string', format: 'uuid' },
  },
  required: ['name', 'id'],
} as const;

const chatHistoryItemSchema = {
  type: 'object',
  properties: {
    role: { type: 'string' },
    content: { type: 'string' },
  },
  required: ['role', 'content'],
} as const;

const evalCaseBodyProperties = {
  question: { type: 'string', minLength: 1 },
  expectedTopics: { type: 'array', items: { type: 'string' }, nullable: true },
  expectedNotTopics: { type: 'array', items: { type: 'string' }, nullable: true },
  referenceAnswer: { type: 'string', nullable: true },
  category: { type: 'string', nullable: true },
  tags: { type: 'array', items: { type: 'string' }, nullable: true },
  chatHistory: { type: 'array', items: chatHistoryItemSchema, nullable: true },
  isActive: { type: 'boolean' },
} as const;

export function evalRoutes(
  app: FastifyInstance,
  _coordinator: RunnerCoordinator,
  _dataDir: string,
  _telemetry: TelemetryExporter | null,
): void {
  // ── Eval Cases CRUD ─────────────────────────────────────────────────────

  // Import cases (bulk create) — registered BEFORE :id to avoid "import" matching as :id
  app.post<{ Params: { name: string } }>('/api/agents/:name/eval-cases/import', {
    schema: {
      tags: ['evals'],
      params: nameParam,
      body: {
        type: 'object',
        properties: {
          cases: {
            type: 'array',
            items: {
              type: 'object',
              properties: evalCaseBodyProperties,
              required: ['question'],
            },
          },
        },
        required: ['cases'],
      },
      response: {
        200: {
          type: 'object',
          properties: { imported: { type: 'integer' } },
          required: ['imported'],
        },
        404: { $ref: 'ApiError#' },
      },
    },
  }, async (req, reply) => {
    const agent = await getAgent(req.params.name, req.tenantId);
    if (!agent) {
      return reply.status(404).send({ error: 'Agent not found', statusCode: 404 });
    }

    const { cases } = req.body as {
      cases: Array<{
        question: string;
        expectedTopics?: string[];
        expectedNotTopics?: string[];
        referenceAnswer?: string;
        category?: string;
        tags?: string[];
        chatHistory?: Array<{ role: string; content: string }>;
        isActive?: boolean;
      }>;
    };

    let imported = 0;
    for (const c of cases) {
      await insertEvalCase(randomUUID(), req.tenantId, agent.name, {
        question: c.question,
        expectedTopics: c.expectedTopics ?? null,
        expectedNotTopics: c.expectedNotTopics ?? null,
        referenceAnswer: c.referenceAnswer ?? null,
        category: c.category ?? null,
        tags: c.tags ?? null,
        chatHistory: c.chatHistory ?? null,
        isActive: c.isActive ?? true,
      });
      imported++;
    }

    return reply.send({ imported });
  });

  // Export cases — registered BEFORE :id to avoid "export" matching as :id
  app.get<{ Params: { name: string } }>('/api/agents/:name/eval-cases/export', {
    schema: {
      tags: ['evals'],
      params: nameParam,
      response: {
        200: {
          type: 'object',
          properties: {
            cases: { type: 'array' },
          },
          required: ['cases'],
        },
        404: { $ref: 'ApiError#' },
      },
    },
  }, async (req, reply) => {
    const agent = await getAgent(req.params.name, req.tenantId);
    if (!agent) {
      return reply.status(404).send({ error: 'Agent not found', statusCode: 404 });
    }

    const cases = await listEvalCases(req.tenantId, agent.name);
    return reply.send({ cases });
  });

  // List eval cases
  app.get<{ Params: { name: string }; Querystring: { category?: string; isActive?: string } }>('/api/agents/:name/eval-cases', {
    schema: {
      tags: ['evals'],
      params: nameParam,
      querystring: {
        type: 'object',
        properties: {
          category: { type: 'string' },
          isActive: { type: 'string', enum: ['true', 'false'] },
        },
      },
      response: {
        200: {
          type: 'object',
          properties: {
            cases: { type: 'array' },
          },
          required: ['cases'],
        },
        404: { $ref: 'ApiError#' },
      },
    },
  }, async (req, reply) => {
    const agent = await getAgent(req.params.name, req.tenantId);
    if (!agent) {
      return reply.status(404).send({ error: 'Agent not found', statusCode: 404 });
    }

    const { category, isActive } = req.query;
    const opts: { category?: string; isActive?: boolean } = {};
    if (category) opts.category = category;
    if (isActive !== undefined) opts.isActive = isActive === 'true';

    const cases = await listEvalCases(req.tenantId, agent.name, opts);
    return reply.send({ cases });
  });

  // Create eval case
  app.post<{ Params: { name: string } }>('/api/agents/:name/eval-cases', {
    schema: {
      tags: ['evals'],
      params: nameParam,
      body: {
        type: 'object',
        properties: evalCaseBodyProperties,
        required: ['question'],
      },
      response: {
        201: {
          type: 'object',
          properties: { case: { type: 'object', additionalProperties: true } },
          required: ['case'],
        },
        404: { $ref: 'ApiError#' },
      },
    },
  }, async (req, reply) => {
    const agent = await getAgent(req.params.name, req.tenantId);
    if (!agent) {
      return reply.status(404).send({ error: 'Agent not found', statusCode: 404 });
    }

    const body = req.body as {
      question: string;
      expectedTopics?: string[];
      expectedNotTopics?: string[];
      referenceAnswer?: string;
      category?: string;
      tags?: string[];
      chatHistory?: Array<{ role: string; content: string }>;
      isActive?: boolean;
    };

    const evalCase = await insertEvalCase(randomUUID(), req.tenantId, agent.name, {
      question: body.question,
      expectedTopics: body.expectedTopics ?? null,
      expectedNotTopics: body.expectedNotTopics ?? null,
      referenceAnswer: body.referenceAnswer ?? null,
      category: body.category ?? null,
      tags: body.tags ?? null,
      chatHistory: body.chatHistory ?? null,
      isActive: body.isActive ?? true,
    });

    return reply.status(201).send({ case: evalCase });
  });

  // Get eval case
  app.get<{ Params: { name: string; id: string } }>('/api/agents/:name/eval-cases/:id', {
    schema: {
      tags: ['evals'],
      params: nameAndIdParams,
      response: {
        200: {
          type: 'object',
          properties: { case: { type: 'object', additionalProperties: true } },
          required: ['case'],
        },
        404: { $ref: 'ApiError#' },
      },
    },
  }, async (req, reply) => {
    const agent = await getAgent(req.params.name, req.tenantId);
    if (!agent) {
      return reply.status(404).send({ error: 'Agent not found', statusCode: 404 });
    }

    const evalCase = await getEvalCase(req.params.id);
    if (!evalCase || evalCase.agentName !== agent.name) {
      return reply.status(404).send({ error: 'Eval case not found', statusCode: 404 });
    }

    return reply.send({ case: evalCase });
  });

  // Update eval case
  app.patch<{ Params: { name: string; id: string } }>('/api/agents/:name/eval-cases/:id', {
    schema: {
      tags: ['evals'],
      params: nameAndIdParams,
      body: {
        type: 'object',
        properties: evalCaseBodyProperties,
      },
      response: {
        200: {
          type: 'object',
          properties: { case: { type: 'object', additionalProperties: true } },
          required: ['case'],
        },
        404: { $ref: 'ApiError#' },
      },
    },
  }, async (req, reply) => {
    const agent = await getAgent(req.params.name, req.tenantId);
    if (!agent) {
      return reply.status(404).send({ error: 'Agent not found', statusCode: 404 });
    }

    const existing = await getEvalCase(req.params.id);
    if (!existing || existing.agentName !== agent.name) {
      return reply.status(404).send({ error: 'Eval case not found', statusCode: 404 });
    }

    const body = req.body as Partial<{
      question: string;
      expectedTopics: string[] | null;
      expectedNotTopics: string[] | null;
      referenceAnswer: string | null;
      category: string | null;
      tags: string[] | null;
      chatHistory: Array<{ role: string; content: string }> | null;
      isActive: boolean;
    }>;

    const updated = await updateEvalCase(req.params.id, body);
    if (!updated) {
      return reply.status(404).send({ error: 'Eval case not found', statusCode: 404 });
    }

    return reply.send({ case: updated });
  });

  // Delete eval case
  app.delete<{ Params: { name: string; id: string } }>('/api/agents/:name/eval-cases/:id', {
    schema: {
      tags: ['evals'],
      params: nameAndIdParams,
      response: {
        204: { type: 'null', description: 'No content' },
        404: { $ref: 'ApiError#' },
      },
    },
  }, async (req, reply) => {
    const agent = await getAgent(req.params.name, req.tenantId);
    if (!agent) {
      return reply.status(404).send({ error: 'Agent not found', statusCode: 404 });
    }

    const existing = await getEvalCase(req.params.id);
    if (!existing || existing.agentName !== agent.name) {
      return reply.status(404).send({ error: 'Eval case not found', statusCode: 404 });
    }

    await deleteEvalCase(req.params.id);
    return reply.status(204).send();
  });

  // ── Eval Runs ───────────────────────────────────────────────────────────

  // Compare runs — registered BEFORE :id to avoid "compare" matching as :id
  app.get<{ Params: { name: string }; Querystring: { runA: string; runB: string } }>('/api/agents/:name/eval-runs/compare', {
    schema: {
      tags: ['evals'],
      params: nameParam,
      querystring: {
        type: 'object',
        properties: {
          runA: { type: 'string', format: 'uuid' },
          runB: { type: 'string', format: 'uuid' },
        },
        required: ['runA', 'runB'],
      },
      response: {
        200: {
          type: 'object',
          properties: {
            comparison: {
              type: 'object',
              additionalProperties: true,
              properties: {
                runA: { type: 'object', additionalProperties: true },
                runB: { type: 'object', additionalProperties: true },
                results: { type: 'array' },
              },
              required: ['runA', 'runB', 'results'],
            },
          },
          required: ['comparison'],
        },
        404: { $ref: 'ApiError#' },
      },
    },
  }, async (req, reply) => {
    const agent = await getAgent(req.params.name, req.tenantId);
    if (!agent) {
      return reply.status(404).send({ error: 'Agent not found', statusCode: 404 });
    }

    const { runA: runAId, runB: runBId } = req.query;

    const runA = await getEvalRun(runAId);
    if (!runA || runA.agentName !== agent.name) {
      return reply.status(404).send({ error: 'Eval run A not found', statusCode: 404 });
    }

    const runB = await getEvalRun(runBId);
    if (!runB || runB.agentName !== agent.name) {
      return reply.status(404).send({ error: 'Eval run B not found', statusCode: 404 });
    }

    const resultsA = await listEvalResults(runAId);
    const resultsB = await listEvalResults(runBId);

    // Build a map of caseId -> result for each run
    const mapA = new Map(resultsA.map(r => [r.evalCaseId, r]));
    const mapB = new Map(resultsB.map(r => [r.evalCaseId, r]));

    // Collect all unique case IDs
    const allCaseIds = new Set([...mapA.keys(), ...mapB.keys()]);

    // Build paired results, resolving the question from each eval case
    const pairedResults: Array<{
      caseId: string;
      question: string;
      resultA: typeof resultsA[number] | null;
      resultB: typeof resultsB[number] | null;
    }> = [];

    for (const caseId of allCaseIds) {
      const evalCase = await getEvalCase(caseId);
      pairedResults.push({
        caseId,
        question: evalCase?.question ?? '',
        resultA: mapA.get(caseId) ?? null,
        resultB: mapB.get(caseId) ?? null,
      });
    }

    return reply.send({
      comparison: {
        runA,
        runB,
        results: pairedResults,
      },
    });
  });

  // Create eval run
  app.post<{ Params: { name: string } }>('/api/agents/:name/eval-runs', {
    schema: {
      tags: ['evals'],
      params: nameParam,
      body: {
        type: 'object',
        properties: {
          versionNumber: { type: 'integer' },
          categories: { type: 'array', items: { type: 'string' } },
          tags: { type: 'array', items: { type: 'string' } },
        },
      },
      response: {
        201: {
          type: 'object',
          properties: { run: { type: 'object', additionalProperties: true } },
          required: ['run'],
        },
        404: { $ref: 'ApiError#' },
      },
    },
  }, async (req, reply) => {
    const agent = await getAgent(req.params.name, req.tenantId);
    if (!agent) {
      return reply.status(404).send({ error: 'Agent not found', statusCode: 404 });
    }

    const body = req.body as {
      versionNumber?: number;
      categories?: string[];
      tags?: string[];
    } | undefined;

    const versionNumber = body?.versionNumber;

    // If a versionNumber is specified, verify it exists
    if (versionNumber !== undefined) {
      const version = await getAgentVersionByNumber(agent.name, versionNumber, req.tenantId);
      if (!version) {
        return reply.status(404).send({ error: `Agent version ${versionNumber} not found`, statusCode: 404 });
      }
    }

    // Fetch matching active eval cases
    let cases = await listEvalCases(req.tenantId, agent.name, { isActive: true });

    // Filter by categories if provided
    if (body?.categories && body.categories.length > 0) {
      const categorySet = new Set(body.categories);
      cases = cases.filter(c => c.category !== null && categorySet.has(c.category));
    }

    // Filter by tags if provided
    if (body?.tags && body.tags.length > 0) {
      const tagSet = new Set(body.tags);
      cases = cases.filter(c => c.tags !== null && c.tags.some(t => tagSet.has(t)));
    }

    // Create the eval run
    const runId = randomUUID();
    const filters: Record<string, unknown> = {};
    if (body?.categories) filters.categories = body.categories;
    if (body?.tags) filters.tags = body.tags;

    const run = await insertEvalRun(runId, req.tenantId, agent.name, {
      versionNumber,
      filters: Object.keys(filters).length > 0 ? filters : undefined,
    });

    // Update total cases count
    await updateEvalRun(runId, { totalCases: cases.length });

    // Create a pending eval_result entry for each matching case
    for (const evalCase of cases) {
      await insertEvalResult(randomUUID(), req.tenantId, runId, evalCase.id);
    }

    // Re-fetch run to include updated totalCases
    const updatedRun = await getEvalRun(runId);

    return reply.status(201).send({ run: updatedRun ?? run });
  });

  // List eval runs
  app.get<{ Params: { name: string } }>('/api/agents/:name/eval-runs', {
    schema: {
      tags: ['evals'],
      params: nameParam,
      response: {
        200: {
          type: 'object',
          properties: {
            runs: { type: 'array' },
          },
          required: ['runs'],
        },
        404: { $ref: 'ApiError#' },
      },
    },
  }, async (req, reply) => {
    const agent = await getAgent(req.params.name, req.tenantId);
    if (!agent) {
      return reply.status(404).send({ error: 'Agent not found', statusCode: 404 });
    }

    const runs = await listEvalRuns(req.tenantId, agent.name);
    return reply.send({ runs });
  });

  // Get eval run
  app.get<{ Params: { name: string; id: string } }>('/api/agents/:name/eval-runs/:id', {
    schema: {
      tags: ['evals'],
      params: nameAndIdParams,
      response: {
        200: {
          type: 'object',
          properties: { run: { type: 'object', additionalProperties: true } },
          required: ['run'],
        },
        404: { $ref: 'ApiError#' },
      },
    },
  }, async (req, reply) => {
    const agent = await getAgent(req.params.name, req.tenantId);
    if (!agent) {
      return reply.status(404).send({ error: 'Agent not found', statusCode: 404 });
    }

    const run = await getEvalRun(req.params.id);
    if (!run || run.agentName !== agent.name) {
      return reply.status(404).send({ error: 'Eval run not found', statusCode: 404 });
    }

    return reply.send({ run });
  });

  // Get eval run results
  app.get<{ Params: { name: string; id: string } }>('/api/agents/:name/eval-runs/:id/results', {
    schema: {
      tags: ['evals'],
      params: nameAndIdParams,
      response: {
        200: {
          type: 'object',
          properties: {
            results: { type: 'array' },
          },
          required: ['results'],
        },
        404: { $ref: 'ApiError#' },
      },
    },
  }, async (req, reply) => {
    const agent = await getAgent(req.params.name, req.tenantId);
    if (!agent) {
      return reply.status(404).send({ error: 'Agent not found', statusCode: 404 });
    }

    const run = await getEvalRun(req.params.id);
    if (!run || run.agentName !== agent.name) {
      return reply.status(404).send({ error: 'Eval run not found', statusCode: 404 });
    }

    const results = await listEvalResults(req.params.id);
    return reply.send({ results });
  });

  // ── Human Scoring ─────────────────────────────────────────────────────

  // Update eval result with human score/notes
  app.patch<{ Params: { name: string; id: string } }>('/api/agents/:name/eval-results/:id', {
    schema: {
      tags: ['evals'],
      params: nameAndIdParams,
      body: {
        type: 'object',
        properties: {
          humanScore: { type: 'number', minimum: 1, maximum: 5 },
          humanNotes: { type: 'string', maxLength: 10_000 },
        },
      },
      response: {
        200: {
          type: 'object',
          properties: { result: { type: 'object', additionalProperties: true } },
          required: ['result'],
        },
        404: { $ref: 'ApiError#' },
      },
    },
  }, async (req, reply) => {
    const agent = await getAgent(req.params.name, req.tenantId);
    if (!agent) {
      return reply.status(404).send({ error: 'Agent not found', statusCode: 404 });
    }

    const existing = await getEvalResult(req.params.id);
    if (!existing) {
      return reply.status(404).send({ error: 'Eval result not found', statusCode: 404 });
    }

    const body = req.body as { humanScore?: number; humanNotes?: string } | undefined;
    if (!body || (body.humanScore === undefined && body.humanNotes === undefined)) {
      return reply.status(400).send({ error: 'Provide humanScore and/or humanNotes', statusCode: 400 });
    }

    await updateEvalResult(req.params.id, {
      humanScore: body.humanScore,
      humanNotes: body.humanNotes,
    });

    const updated = await getEvalResult(req.params.id);
    return reply.send({ result: updated });
  });
}
