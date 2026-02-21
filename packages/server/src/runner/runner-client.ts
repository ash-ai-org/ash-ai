import type { BridgeCommand, BridgeEvent, PoolStats } from '@ash-ai/shared';

export interface RunnerHealthResponse {
  runnerId: string;
  status: string;
  capacity: {
    max: number;
    active: number;
    available: number;
  };
  pool: PoolStats;
  uptime: number;
}

/**
 * HTTP client to a single runner process.
 * Uses standard HTTP (Fastify on the runner side). For SSE streaming,
 * parses the event stream from the response body.
 *
 * Note: Node.js >= 18 built-in fetch (undici) already uses HTTP keep-alive
 * by default. No custom agent needed — connections are pooled per origin.
 */
export class RunnerClient {
  private baseUrl: string;
  private _closed = false;

  constructor(opts: { host: string; port: number }) {
    this.baseUrl = `http://${opts.host}:${opts.port}`;
  }

  async createSandbox(opts: {
    sessionId: string;
    agentDir: string;
    agentName: string;
    sandboxId?: string;
    skipAgentCopy?: boolean;
    limits?: Record<string, number>;
  }): Promise<{ sandboxId: string; workspaceDir: string }> {
    const resp = await fetch(`${this.baseUrl}/runner/sandboxes`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(opts),
    });

    if (!resp.ok) {
      const body = await resp.text();
      throw new Error(`Runner createSandbox failed (${resp.status}): ${body}`);
    }

    return resp.json() as Promise<{ sandboxId: string; workspaceDir: string }>;
  }

  async destroySandbox(sandboxId: string): Promise<void> {
    const resp = await fetch(`${this.baseUrl}/runner/sandboxes/${sandboxId}`, {
      method: 'DELETE',
    });

    if (!resp.ok && resp.status !== 404) {
      const body = await resp.text();
      throw new Error(`Runner destroySandbox failed (${resp.status}): ${body}`);
    }
  }

  /**
   * Send a command to a sandbox and return an async generator of bridge events.
   * Parses SSE from the HTTP response body.
   */
  async *sendCommand(sandboxId: string, cmd: BridgeCommand): AsyncGenerator<BridgeEvent> {
    const resp = await fetch(`${this.baseUrl}/runner/sandboxes/${sandboxId}/cmd`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(cmd),
    });

    if (!resp.ok) {
      const body = await resp.text();
      throw new Error(`Runner sendCommand failed (${resp.status}): ${body}`);
    }

    if (!resp.body) {
      throw new Error('Runner sendCommand: no response body');
    }

    // Parse SSE from response body stream
    const reader = resp.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';

    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });

        // Process complete SSE events
        let doubleNewline: number;
        while ((doubleNewline = buffer.indexOf('\n\n')) !== -1) {
          const eventBlock = buffer.slice(0, doubleNewline);
          buffer = buffer.slice(doubleNewline + 2);

          const event = parseSSEEvent(eventBlock);
          if (event) {
            yield event;
          }
        }
      }

      // Process any remaining buffer
      if (buffer.trim()) {
        const event = parseSSEEvent(buffer);
        if (event) {
          yield event;
        }
      }
    } finally {
      reader.releaseLock();
    }
  }

  async interrupt(sandboxId: string): Promise<void> {
    const resp = await fetch(`${this.baseUrl}/runner/sandboxes/${sandboxId}/interrupt`, {
      method: 'POST',
    });
    if (!resp.ok && resp.status !== 404) {
      const body = await resp.text();
      throw new Error(`Runner interrupt failed (${resp.status}): ${body}`);
    }
  }

  async getSandbox(sandboxId: string): Promise<{ sandboxId: string; workspaceDir: string; alive: boolean } | null> {
    const resp = await fetch(`${this.baseUrl}/runner/sandboxes/${sandboxId}`);
    if (resp.status === 404) return null;
    if (!resp.ok) {
      throw new Error(`Runner getSandbox failed (${resp.status})`);
    }
    return resp.json() as Promise<{ sandboxId: string; workspaceDir: string; alive: boolean }>;
  }

  async markState(sandboxId: string, state: 'running' | 'waiting'): Promise<void> {
    await fetch(`${this.baseUrl}/runner/sandboxes/${sandboxId}/mark`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ state }),
    });
  }

  async persistState(sandboxId: string, sessionId: string, agentName: string): Promise<boolean> {
    const resp = await fetch(`${this.baseUrl}/runner/sandboxes/${sandboxId}/persist`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ sessionId, agentName }),
    });

    if (!resp.ok) return false;
    const result = await resp.json() as { success: boolean };
    return result.success;
  }

  async health(): Promise<RunnerHealthResponse> {
    const resp = await fetch(`${this.baseUrl}/runner/health`);
    if (!resp.ok) {
      throw new Error(`Runner health check failed (${resp.status})`);
    }
    return resp.json() as Promise<RunnerHealthResponse>;
  }

  close(): void {
    this._closed = true;
  }

  get closed(): boolean {
    return this._closed;
  }
}

/**
 * Parse a single SSE event block into a BridgeEvent.
 */
function parseSSEEvent(block: string): BridgeEvent | null {
  let eventType = '';
  let data = '';

  for (const line of block.split('\n')) {
    if (line.startsWith('event: ')) {
      eventType = line.slice(7);
    } else if (line.startsWith('data: ')) {
      data = line.slice(6);
    }
  }

  if (!eventType || !data) return null;

  try {
    const parsed = JSON.parse(data);

    if (eventType === 'message') {
      return { ev: 'message', data: parsed };
    } else if (eventType === 'error') {
      return { ev: 'error', error: parsed.error || 'Unknown error' };
    } else if (eventType === 'done') {
      return { ev: 'done', sessionId: parsed.sessionId || '' };
    }
  } catch {
    // Malformed JSON — skip
  }

  return null;
}
