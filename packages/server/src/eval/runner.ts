import {
  getEvalRun,
  listEvalResults,
  getEvalCase,
  updateEvalRun,
  updateEvalResult,
  getActiveAgentVersion,
  getAgent,
  listPendingEvalRuns,
} from '../db/index.js';
import { topicScore, safetyScore } from './scoring.js';
import { extractTextFromEvent } from '@ash-ai/shared';
import type { EvalRunSummary, EvalRun, EvalResult, EvalCase } from '@ash-ai/shared';
import type { RunnerCoordinator } from '../runner/coordinator.js';
import type { RunnerBackend } from '../runner/types.js';

/**
 * EvalRunner polls the DB for eval_runs with status='pending' and processes
 * them by running each eval case against the agent, scoring the response,
 * and updating results.
 *
 * Design notes:
 * - Single-threaded per instance (guard flag prevents overlapping ticks)
 * - Polls every 5 seconds for pending runs
 * - Processes one run at a time, but all cases within a run sequentially
 * - On failure mid-run, sets status='failed' with error info
 * - Scoring is deterministic (topic/safety). LLM judge scoring is deferred.
 */
export class EvalRunner {
  private timer: ReturnType<typeof setInterval> | null = null;
  private running = false;

  constructor(
    private coordinator: RunnerCoordinator,
    private dataDir: string,
  ) {}

  start(): void {
    if (this.timer) return;
    this.timer = setInterval(() => this.tick(), 5000);
    console.log('[eval-runner] Started');
  }

  stop(): void {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }

  private async tick(): Promise<void> {
    if (this.running) return;
    this.running = true;
    try {
      await this.processPendingRuns();
    } catch (err) {
      console.error('[eval-runner] Error:', err);
    } finally {
      this.running = false;
    }
  }

  private async processPendingRuns(): Promise<void> {
    const pendingRuns = await listPendingEvalRuns();
    for (const run of pendingRuns) {
      await this.processRun(run.id);
    }
  }

  async processRun(runId: string): Promise<void> {
    const run = await getEvalRun(runId);
    if (!run) {
      console.error(`[eval-runner] Run ${runId} not found`);
      return;
    }
    if (run.status !== 'pending') {
      // Already picked up by another processor or manually updated
      return;
    }

    // Transition to 'running'
    const startedAt = new Date().toISOString();
    await updateEvalRun(runId, { status: 'running', startedAt });

    try {
      // Resolve the agent so we can create sandboxes
      const agent = await getAgent(run.agentName, run.tenantId);
      if (!agent) {
        throw new Error(`Agent '${run.agentName}' not found`);
      }

      // If the run targets a specific version, resolve the system prompt override
      let systemPrompt: string | undefined;
      if (run.versionNumber != null) {
        const version = await getActiveAgentVersion(run.agentName, run.tenantId);
        // Use the version's system prompt if available; otherwise fall back to agent default
        if (version && version.systemPrompt) {
          systemPrompt = version.systemPrompt;
        }
      }

      // Get all results for this run
      const results = await listEvalResults(runId);
      let completedCases = 0;

      for (const result of results) {
        await this.processResult(result, agent.path, agent.name, systemPrompt);
        completedCases++;
        await updateEvalRun(runId, { completedCases });
      }

      // Compute summary metrics
      const summary = await this.computeSummary(runId);

      // Mark as completed
      await updateEvalRun(runId, {
        status: 'completed',
        completedAt: new Date().toISOString(),
        summary,
      });

      console.log(`[eval-runner] Run ${runId} completed: ${completedCases} cases`);
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : String(err);
      console.error(`[eval-runner] Run ${runId} failed:`, errorMsg);
      await updateEvalRun(runId, {
        status: 'failed',
        completedAt: new Date().toISOString(),
      });
    }
  }

  private async processResult(
    result: EvalResult,
    agentDir: string,
    agentName: string,
    systemPrompt?: string,
  ): Promise<void> {
    const evalCase = await getEvalCase(result.evalCaseId);
    if (!evalCase) {
      await updateEvalResult(result.id, {
        status: 'error',
        error: `Eval case ${result.evalCaseId} not found`,
        completedAt: new Date().toISOString(),
      });
      return;
    }

    // Mark result as running
    await updateEvalResult(result.id, { status: 'running' });

    const caseStartTime = Date.now();
    let backend: RunnerBackend | undefined;
    let sandboxId: string | undefined;

    try {
      // Select a backend and create a sandbox for this eval case
      const selection = await this.coordinator.selectBackend();
      backend = selection.backend;

      const sessionId = `eval-${result.evalRunId}-${result.id}`;
      const handle = await backend.createSandbox({
        sessionId,
        agentDir,
        agentName,
        sandboxId: sessionId,
        ...(systemPrompt ? { systemPrompt } : {}),
      });
      sandboxId = handle.sandboxId;

      // Send the question and collect the full response
      const responseText = await this.queryAndCollect(backend, sandboxId, evalCase.question, sessionId);

      const latencyMs = Date.now() - caseStartTime;

      // Score the response
      const tScore = topicScore(responseText, evalCase.expectedTopics ?? []);
      const sScore = safetyScore(responseText, evalCase.expectedNotTopics ?? []);

      // Update the result
      await updateEvalResult(result.id, {
        agentResponse: responseText,
        topicScore: tScore,
        safetyScore: sScore,
        latencyMs,
        status: 'completed',
        completedAt: new Date().toISOString(),
      });
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : String(err);
      await updateEvalResult(result.id, {
        status: 'error',
        error: errorMsg,
        latencyMs: Date.now() - caseStartTime,
        completedAt: new Date().toISOString(),
      });
    } finally {
      // Clean up the sandbox
      if (backend && sandboxId) {
        try {
          await backend.destroySandbox(sandboxId);
        } catch {
          // Best-effort cleanup
        }
      }
    }
  }

  /**
   * Send a query to the sandbox and collect the full text response.
   * Iterates over all bridge events, extracting text from assistant messages.
   */
  private async queryAndCollect(
    backend: RunnerBackend,
    sandboxId: string,
    question: string,
    sessionId: string,
  ): Promise<string> {
    const events = backend.sendCommand(sandboxId, {
      cmd: 'query',
      prompt: question,
      sessionId,
    });

    const textParts: string[] = [];

    for await (const event of events) {
      if (event.ev === 'message') {
        const data = event.data as Record<string, any>;
        const text = extractTextFromEvent(data);
        if (text) {
          textParts.push(text);
        }
      } else if (event.ev === 'error') {
        throw new Error(`Bridge error: ${event.error}`);
      }
    }

    return textParts.join('');
  }

  /**
   * Compute summary metrics for a completed run.
   * Reads all results and averages the scores.
   */
  private async computeSummary(runId: string): Promise<EvalRunSummary> {
    const results = await listEvalResults(runId);
    const completed = results.filter(r => r.status === 'completed');

    if (completed.length === 0) {
      return {
        avgTopicScore: 0,
        avgSafetyScore: 0,
        avgLlmJudgeScore: null,
        avgLatencyMs: 0,
        passRate: 0,
      };
    }

    const avgTopicScore = completed.reduce((sum, r) => sum + (r.topicScore ?? 0), 0) / completed.length;
    const avgSafetyScore = completed.reduce((sum, r) => sum + (r.safetyScore ?? 0), 0) / completed.length;
    const avgLatencyMs = completed.reduce((sum, r) => sum + (r.latencyMs ?? 0), 0) / completed.length;

    // Pass rate: a case passes if both topic and safety scores are above 0.5
    const passThreshold = 0.5;
    const passed = completed.filter(r =>
      (r.topicScore ?? 0) >= passThreshold && (r.safetyScore ?? 0) >= passThreshold
    );
    const passRate = passed.length / results.length;

    return {
      avgTopicScore,
      avgSafetyScore,
      avgLlmJudgeScore: null, // Deferred to future iteration
      avgLatencyMs,
      passRate,
    };
  }
}
