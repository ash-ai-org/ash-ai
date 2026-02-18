import type {
  Agent,
  Session,
  ListAgentsResponse,
  ListSessionsResponse,
  HealthResponse,
  AshStreamEvent,
} from '@ash-ai/shared';
import { parseSSEStream } from './sse.js';

export interface AshClientOptions {
  serverUrl: string;
  apiKey?: string;
}

export interface SendMessageOptions {
  /** Enable partial message streaming. Yields incremental StreamEvent messages with raw API deltas. */
  includePartialMessages?: boolean;
}

export class AshClient {
  private serverUrl: string;
  private apiKey?: string;

  constructor(opts: AshClientOptions) {
    this.serverUrl = opts.serverUrl.replace(/\/$/, '');
    this.apiKey = opts.apiKey;
  }

  private headers(json = false): Record<string, string> {
    const h: Record<string, string> = {};
    if (json) h['Content-Type'] = 'application/json';
    if (this.apiKey) h['Authorization'] = `Bearer ${this.apiKey}`;
    return h;
  }

  private async request<T>(method: string, path: string, body?: unknown): Promise<T> {
    const res = await fetch(`${this.serverUrl}${path}`, {
      method,
      headers: this.headers(!!body),
      body: body ? JSON.stringify(body) : undefined,
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({ error: res.statusText })) as { error: string };
      throw new Error(err.error);
    }
    return await res.json() as T;
  }

  // -- Agents -----------------------------------------------------------------

  async deployAgent(name: string, path: string): Promise<Agent> {
    const res = await this.request<{ agent: Agent }>('POST', '/api/agents', { name, path });
    return res.agent;
  }

  async listAgents(): Promise<Agent[]> {
    const res = await this.request<ListAgentsResponse>('GET', '/api/agents');
    return res.agents;
  }

  async getAgent(name: string): Promise<Agent> {
    const res = await this.request<{ agent: Agent }>('GET', `/api/agents/${name}`);
    return res.agent;
  }

  async deleteAgent(name: string): Promise<void> {
    await this.request('DELETE', `/api/agents/${name}`);
  }

  // -- Sessions ---------------------------------------------------------------

  async createSession(agent: string): Promise<Session> {
    const res = await this.request<{ session: Session }>('POST', '/api/sessions', { agent });
    return res.session;
  }

  async listSessions(agent?: string): Promise<Session[]> {
    const path = agent ? `/api/sessions?agent=${encodeURIComponent(agent)}` : '/api/sessions';
    const res = await this.request<ListSessionsResponse>('GET', path);
    return res.sessions;
  }

  async getSession(id: string): Promise<Session> {
    const res = await this.request<{ session: Session }>('GET', `/api/sessions/${id}`);
    return res.session;
  }

  /**
   * Send a message and return the raw SSE Response for streaming.
   * The SSE stream carries SDK Message objects in `event: message` frames.
   */
  async sendMessage(sessionId: string, content: string, opts?: SendMessageOptions): Promise<Response> {
    const body: Record<string, unknown> = { content };
    if (opts?.includePartialMessages) body.includePartialMessages = true;
    const res = await fetch(`${this.serverUrl}/api/sessions/${sessionId}/messages`, {
      method: 'POST',
      headers: this.headers(true),
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({ error: res.statusText })) as { error: string };
      throw new Error(err.error);
    }
    return res;
  }

  /**
   * Send a message and yield parsed SSE events.
   * Pass `includePartialMessages: true` to receive incremental StreamEvent
   * messages with raw API deltas as they arrive, in addition to complete messages.
   */
  async *sendMessageStream(sessionId: string, content: string, opts?: SendMessageOptions): AsyncGenerator<AshStreamEvent> {
    const res = await this.sendMessage(sessionId, content, opts);
    if (!res.body) return;
    yield* parseSSEStream(res.body);
  }

  async pauseSession(id: string): Promise<Session> {
    const res = await this.request<{ session: Session }>('POST', `/api/sessions/${id}/pause`);
    return res.session;
  }

  async resumeSession(id: string): Promise<Session> {
    const res = await this.request<{ session: Session }>('POST', `/api/sessions/${id}/resume`);
    return res.session;
  }

  async endSession(id: string): Promise<Session> {
    const res = await this.request<{ session: Session }>('DELETE', `/api/sessions/${id}`);
    return res.session;
  }

  // -- Health -----------------------------------------------------------------

  async health(): Promise<HealthResponse> {
    return this.request<HealthResponse>('GET', '/health');
  }
}
