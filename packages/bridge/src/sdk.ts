// =============================================================================
// SDK wrapper. Calls @anthropic-ai/claude-agent-sdk and yields raw SDK messages.
//
// Set ASH_REAL_SDK=1 to use the real Claude Agent SDK. Otherwise uses the mock.
// The bridge protocol carries these messages as-is (principle 8: no type translation).
// =============================================================================

export interface QueryOptions {
  prompt: string;
  sessionId: string;
  /** The SDK's own session ID to resume from (captured from a previous result message). */
  resumeSessionId?: string;
  workspaceDir: string;
  claudeMd: string;
  resume: boolean;
  signal: AbortSignal;
  includePartialMessages?: boolean;
  /** Override the model for this query. Passed to SDK Options.model. */
  model?: string;
}

/**
 * Route to real or mock implementation based on ASH_REAL_SDK env var.
 */
export async function* runQuery(opts: QueryOptions): AsyncGenerator<unknown> {
  if (process.env.ASH_REAL_SDK === '1') {
    yield* runRealQuery(opts);
  } else {
    yield* runMockQuery(opts);
  }
}

/**
 * Real implementation — calls @anthropic-ai/claude-agent-sdk.
 * Yields SDK Message objects directly (no translation).
 */
async function* runRealQuery(opts: QueryOptions): AsyncGenerator<unknown> {
  const { query } = await import('@anthropic-ai/claude-agent-sdk');

  // The SDK reads .mcp.json from cwd automatically for MCP servers.
  // settingSources: ['project'] tells it to load .claude/settings.json and skills.
  const q = query({
    prompt: opts.prompt,
    options: {
      cwd: opts.workspaceDir,
      systemPrompt: opts.claudeMd || undefined,
      resume: opts.resume ? (opts.resumeSessionId || opts.sessionId) : undefined,
      persistSession: true,
      permissionMode: 'bypassPermissions',
      allowDangerouslySkipPermissions: true,
      abortController: abortControllerFromSignal(opts.signal),
      settingSources: ['project'],
      ...(opts.model && { model: opts.model }),
      ...(opts.includePartialMessages && { includePartialMessages: true }),
      ...(process.env.CLAUDE_CODE_EXECUTABLE && { pathToClaudeCodeExecutable: process.env.CLAUDE_CODE_EXECUTABLE }),
      stderr: (data: string) => process.stderr.write(`[claude-code] ${data}`),
    },
  });

  for await (const message of q) {
    if (opts.signal.aborted) return;
    yield message; // passthrough — no translation
  }
}

/**
 * Per-session prompt history for mock. Tracks all prompts sent to each session
 * so multi-turn tests can verify conversation context persists.
 */
const mockSessionHistory = new Map<string, string[]>();

/**
 * Mock implementation — yields objects shaped like SDK Messages.
 * When includePartialMessages is true, emits stream events before complete messages.
 * Tracks prompt history per session to simulate conversation context.
 */
async function* runMockQuery(opts: QueryOptions): AsyncGenerator<unknown> {
  if (opts.signal.aborted) return;

  await delay(50, opts.signal);
  if (opts.signal.aborted) return;

  // Track prompt history per session
  if (!mockSessionHistory.has(opts.sessionId)) {
    mockSessionHistory.set(opts.sessionId, []);
  }
  const history = mockSessionHistory.get(opts.sessionId)!;
  history.push(opts.prompt);

  const responseText = opts.resume
    ? '[Resumed session]'
    : `[Mock] Turn ${history.length} | History: ${history.join(' | ')}`;

  // When streaming enabled, emit incremental stream events first
  if (opts.includePartialMessages) {
    yield {
      type: 'stream_event',
      event: { type: 'message_start', message: { id: 'msg_mock', type: 'message', role: 'assistant', content: [] } },
      session_id: opts.sessionId,
    };

    yield {
      type: 'stream_event',
      event: { type: 'content_block_start', index: 0, content_block: { type: 'text', text: '' } },
      session_id: opts.sessionId,
    };

    // Split into chunks to simulate incremental delivery
    const chunkSize = Math.max(1, Math.ceil(responseText.length / 3));
    for (let i = 0; i < responseText.length; i += chunkSize) {
      if (opts.signal.aborted) return;
      const chunk = responseText.slice(i, i + chunkSize);
      yield {
        type: 'stream_event',
        event: { type: 'content_block_delta', index: 0, delta: { type: 'text_delta', text: chunk } },
        session_id: opts.sessionId,
      };
      await delay(10, opts.signal);
    }

    yield {
      type: 'stream_event',
      event: { type: 'content_block_stop', index: 0 },
      session_id: opts.sessionId,
    };

    yield {
      type: 'stream_event',
      event: { type: 'message_delta', delta: { stop_reason: 'end_turn' }, usage: { output_tokens: 10 } },
      session_id: opts.sessionId,
    };

    yield {
      type: 'stream_event',
      event: { type: 'message_stop' },
      session_id: opts.sessionId,
    };
  }

  // Complete assistant message (always emitted)
  yield {
    type: 'assistant',
    message: {
      role: 'assistant',
      content: [{ type: 'text', text: responseText }],
    },
    session_id: opts.sessionId,
  };

  if (opts.resume) return;

  await delay(50, opts.signal);
  if (opts.signal.aborted) return;

  // Final result message
  yield {
    type: 'result',
    subtype: 'success',
    session_id: opts.sessionId,
    cost_usd: 0,
    duration_ms: 100,
    duration_api_ms: 50,
    is_error: false,
    num_turns: 1,
    result: `Mock response to: ${opts.prompt}`,
  };
}

function delay(ms: number, signal: AbortSignal): Promise<void> {
  return new Promise((resolve) => {
    if (signal.aborted) { resolve(); return; }
    const timer = setTimeout(resolve, ms);
    signal.addEventListener('abort', () => { clearTimeout(timer); resolve(); }, { once: true });
  });
}

/** Create an AbortController that aborts when the given signal fires. */
function abortControllerFromSignal(signal: AbortSignal): AbortController {
  const controller = new AbortController();
  if (signal.aborted) {
    controller.abort();
  } else {
    signal.addEventListener('abort', () => controller.abort(), { once: true });
  }
  return controller;
}
