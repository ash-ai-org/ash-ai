import type {
  Agent,
  AgentUpdate,
  Session,
  SessionStatus,
  Message,
  SessionEvent,
  SessionEventType,
  Credential,
  Attachment,
  UsageEvent,
  UsageStats,
  QueueItem,
  QueueItemStatus,
  QueueStats,
  ProjectFile,
  UploadFileInput,
  ListAgentsResponse,
  ListSessionsResponse,
  ListSessionsWithTotalResponse,
  ListSessionsOptions,
  ListMessagesResponse,
  ListSessionEventsResponse,
  ListCredentialsResponse,
  ListAttachmentsResponse,
  ListUsageResponse,
  ListQueueResponse,
  ListProjectFilesResponse,
  ListSessionLogsResponse,
  HealthResponse,
  AshStreamEvent,
  ListFilesResponse,
  GetFileResponse,
  ListAgentFilesResponse,
  GetAgentFileResponse,
  WriteFileInput,
  WriteSessionFilesResponse,
  DeleteSessionFileResponse,
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

export interface ExecResult {
  exitCode: number;
  stdout: string;
  stderr: string;
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

  /** Update an existing agent's metadata. */
  async updateAgent(name: string, updates: AgentUpdate): Promise<Agent> {
    const res = await this.request<{ agent: Agent }>('PATCH', `/api/agents/${name}`, updates);
    return res.agent;
  }

  /** List files in the agent's source directory. */
  async listAgentFiles(name: string): Promise<ListAgentFilesResponse> {
    return this.request<ListAgentFilesResponse>('GET', `/api/agents/${encodeURIComponent(name)}/files`);
  }

  /** Read a single file from the agent's source directory as JSON (UTF-8, 1 MB limit). */
  async getAgentFile(name: string, path: string): Promise<GetAgentFileResponse> {
    return this.request<GetAgentFileResponse>('GET', `/api/agents/${encodeURIComponent(name)}/files/${path}?format=json`);
  }

  // -- Sessions ---------------------------------------------------------------

  async createSession(agent: string, opts?: { credentialId?: string; extraEnv?: Record<string, string>; startupScript?: string }): Promise<Session> {
    const body: Record<string, unknown> = { agent };
    if (opts?.credentialId) body.credentialId = opts.credentialId;
    if (opts?.extraEnv) body.extraEnv = opts.extraEnv;
    if (opts?.startupScript) body.startupScript = opts.startupScript;
    const res = await this.request<{ session: Session }>('POST', '/api/sessions', body);
    return res.session;
  }

  async listSessions(agentOrOpts?: string | ListSessionsOptions): Promise<Session[]> {
    const opts: ListSessionsOptions = typeof agentOrOpts === 'string' ? { agent: agentOrOpts } : (agentOrOpts ?? {});
    const params = new URLSearchParams();
    if (opts.agent) params.set('agent', opts.agent);
    if (opts.status) params.set('status', opts.status);
    if (opts.limit) params.set('limit', String(opts.limit));
    if (opts.offset) params.set('offset', String(opts.offset));
    const qs = params.toString();
    const path = `/api/sessions${qs ? `?${qs}` : ''}`;
    const res = await this.request<ListSessionsResponse>('GET', path);
    return res.sessions;
  }

  /** List sessions with total count for pagination. */
  async listSessionsWithTotal(opts?: ListSessionsOptions): Promise<ListSessionsWithTotalResponse> {
    const params = new URLSearchParams();
    if (opts?.agent) params.set('agent', opts.agent);
    if (opts?.status) params.set('status', opts.status);
    if (opts?.limit) params.set('limit', String(opts.limit));
    if (opts?.offset) params.set('offset', String(opts.offset));
    params.set('includeTotal', 'true');
    const qs = params.toString();
    const path = `/api/sessions?${qs}`;
    return this.request<ListSessionsWithTotalResponse>('GET', path);
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

  async stopSession(id: string): Promise<Session> {
    const res = await this.request<{ session: Session }>('POST', `/api/sessions/${id}/stop`);
    return res.session;
  }

  async forkSession(id: string): Promise<Session> {
    const res = await this.request<{ session: Session }>('POST', `/api/sessions/${id}/fork`);
    return res.session;
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

  /** Execute a shell command in the session's sandbox. Returns stdout, stderr, and exit code. */
  async exec(sessionId: string, command: string, opts?: { timeout?: number }): Promise<ExecResult> {
    const body: Record<string, unknown> = { command };
    if (opts?.timeout) body.timeout = opts.timeout;
    return this.request<ExecResult>('POST', `/api/sessions/${sessionId}/exec`, body);
  }

  // -- Messages ---------------------------------------------------------------

  /** List persisted messages for a session. */
  async listMessages(sessionId: string, opts?: { limit?: number; afterSequence?: number }): Promise<Message[]> {
    const params = new URLSearchParams();
    if (opts?.limit) params.set('limit', String(opts.limit));
    if (opts?.afterSequence) params.set('after', String(opts.afterSequence));
    const qs = params.toString();
    const path = `/api/sessions/${sessionId}/messages${qs ? `?${qs}` : ''}`;
    const res = await this.request<ListMessagesResponse>('GET', path);
    return res.messages;
  }

  // -- Session Events ---------------------------------------------------------

  /** List timeline events for a session. Filterable by type, supports cursor pagination. */
  async listSessionEvents(sessionId: string, opts?: { limit?: number; afterSequence?: number; type?: SessionEventType }): Promise<SessionEvent[]> {
    const params = new URLSearchParams();
    if (opts?.limit) params.set('limit', String(opts.limit));
    if (opts?.afterSequence) params.set('after', String(opts.afterSequence));
    if (opts?.type) params.set('type', opts.type);
    const qs = params.toString();
    const path = `/api/sessions/${sessionId}/events${qs ? `?${qs}` : ''}`;
    const res = await this.request<ListSessionEventsResponse>('GET', path);
    return res.events;
  }

  // -- Session Logs ------------------------------------------------------------

  /** Get sandbox logs for a session. Pass `after` to get only logs after that index. */
  async getSessionLogs(sessionId: string, opts?: { after?: number }): Promise<ListSessionLogsResponse> {
    const params = new URLSearchParams();
    if (opts?.after != null) params.set('after', String(opts.after));
    const qs = params.toString();
    const path = `/api/sessions/${sessionId}/logs${qs ? `?${qs}` : ''}`;
    return this.request<ListSessionLogsResponse>('GET', path);
  }

  // -- Files ------------------------------------------------------------------

  /** List files in the session's workspace. Works on active, paused, and ended sessions. */
  async getSessionFiles(sessionId: string, opts?: { includeHidden?: boolean }): Promise<ListFilesResponse> {
    const params = new URLSearchParams();
    // Default to true — show hidden dirs like .claude
    const includeHidden = opts?.includeHidden ?? true;
    if (!includeHidden) params.set('includeHidden', 'false');
    const qs = params.toString();
    return this.request<ListFilesResponse>('GET', `/api/sessions/${sessionId}/files${qs ? `?${qs}` : ''}`);
  }

  /** Read a single file from the session's workspace as JSON (content as UTF-8 string, 1 MB limit). */
  async getSessionFile(sessionId: string, path: string): Promise<GetFileResponse> {
    return this.request<GetFileResponse>('GET', `/api/sessions/${sessionId}/files/${path}?format=json`);
  }

  /** Download a single file from the session's workspace as raw bytes. No size limit (up to 100 MB). */
  async downloadSessionFile(sessionId: string, path: string): Promise<{ buffer: Buffer; mimeType: string; source: string }> {
    const res = await fetch(`${this.serverUrl}/api/sessions/${sessionId}/files/${path}`, {
      headers: this.headers(),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({ error: res.statusText })) as { error: string };
      throw new Error(err.error);
    }
    return {
      buffer: Buffer.from(await res.arrayBuffer()),
      mimeType: res.headers.get('Content-Type') || 'application/octet-stream',
      source: res.headers.get('X-Ash-Source') || 'unknown',
    };
  }

  /** Download a session file as a raw Response for streaming/proxying. */
  async downloadSessionFileRaw(sessionId: string, path: string): Promise<Response> {
    const res = await fetch(`${this.serverUrl}/api/sessions/${sessionId}/files/${path}`, {
      headers: this.headers(),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({ error: res.statusText })) as { error: string };
      throw new Error(err.error);
    }
    return res;
  }

  /**
   * Write one or more files to the session's workspace.
   * File content must be base64-encoded.
   */
  async writeSessionFiles(
    sessionId: string,
    files: WriteFileInput[],
    targetPath?: string,
  ): Promise<WriteSessionFilesResponse> {
    const body: Record<string, unknown> = { files };
    if (targetPath) body.targetPath = targetPath;
    return this.request<WriteSessionFilesResponse>('POST', `/api/sessions/${sessionId}/files`, body);
  }

  /** Delete a file from the session's workspace. */
  async deleteSessionFile(sessionId: string, path: string): Promise<DeleteSessionFileResponse> {
    return this.request<DeleteSessionFileResponse>('DELETE', `/api/sessions/${sessionId}/files/${path}`);
  }

  // -- Credentials ------------------------------------------------------------

  async storeCredential(type: string, key: string, label?: string): Promise<Credential> {
    const body: Record<string, unknown> = { type, key };
    if (label) body.label = label;
    const res = await this.request<{ credential: Credential }>('POST', '/api/credentials', body);
    return res.credential;
  }

  async listCredentials(): Promise<Credential[]> {
    const res = await this.request<ListCredentialsResponse>('GET', '/api/credentials');
    return res.credentials;
  }

  async deleteCredential(id: string): Promise<void> {
    await this.request('DELETE', `/api/credentials/${id}`);
  }

  // -- Attachments -------------------------------------------------------------

  async uploadAttachment(sessionId: string, filename: string, content: Buffer, opts?: { mimeType?: string; messageId?: string }): Promise<Attachment> {
    const body: Record<string, unknown> = {
      filename,
      content: content.toString('base64'),
    };
    if (opts?.mimeType) body.mimeType = opts.mimeType;
    if (opts?.messageId) body.messageId = opts.messageId;
    const res = await this.request<{ attachment: Attachment }>('POST', `/api/sessions/${sessionId}/attachments`, body);
    return res.attachment;
  }

  async listAttachments(sessionId: string): Promise<Attachment[]> {
    const res = await this.request<ListAttachmentsResponse>('GET', `/api/sessions/${sessionId}/attachments`);
    return res.attachments;
  }

  async downloadAttachment(id: string): Promise<Buffer> {
    const res = await fetch(`${this.serverUrl}/api/attachments/${id}`, {
      headers: this.headers(),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({ error: res.statusText })) as { error: string };
      throw new Error(err.error);
    }
    return Buffer.from(await res.arrayBuffer());
  }

  async deleteAttachment(id: string): Promise<void> {
    await this.request('DELETE', `/api/attachments/${id}`);
  }

  // -- Workspace Bundles -------------------------------------------------------

  /** Download the session's workspace as a tar.gz bundle. */
  async downloadWorkspace(sessionId: string): Promise<Buffer> {
    const res = await fetch(`${this.serverUrl}/api/sessions/${sessionId}/workspace`, {
      headers: this.headers(),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({ error: res.statusText })) as { error: string };
      throw new Error(err.error);
    }
    return Buffer.from(await res.arrayBuffer());
  }

  /** Upload a tar.gz bundle to restore the session's workspace. */
  async uploadWorkspace(sessionId: string, bundle: Buffer): Promise<void> {
    await this.request('POST', `/api/sessions/${sessionId}/workspace`, {
      bundle: bundle.toString('base64'),
    });
  }

  // -- Queue ------------------------------------------------------------------

  async enqueue(agentName: string, prompt: string, opts?: { sessionId?: string; priority?: number; maxRetries?: number }): Promise<QueueItem> {
    const body: Record<string, unknown> = { agentName, prompt };
    if (opts?.sessionId) body.sessionId = opts.sessionId;
    if (opts?.priority !== undefined) body.priority = opts.priority;
    if (opts?.maxRetries !== undefined) body.maxRetries = opts.maxRetries;
    const res = await this.request<{ item: QueueItem }>('POST', '/api/queue', body);
    return res.item;
  }

  async listQueueItems(opts?: { status?: QueueItemStatus; limit?: number }): Promise<QueueItem[]> {
    const params = new URLSearchParams();
    if (opts?.status) params.set('status', opts.status);
    if (opts?.limit) params.set('limit', String(opts.limit));
    const qs = params.toString();
    const res = await this.request<ListQueueResponse>('GET', `/api/queue${qs ? `?${qs}` : ''}`);
    return res.items;
  }

  async getQueueItem(id: string): Promise<QueueItem> {
    const res = await this.request<{ item: QueueItem }>('GET', `/api/queue/${id}`);
    return res.item;
  }

  async cancelQueueItem(id: string): Promise<QueueItem> {
    const res = await this.request<{ item: QueueItem }>('DELETE', `/api/queue/${id}`);
    return res.item;
  }

  async getQueueStats(): Promise<QueueStats> {
    const res = await this.request<{ stats: QueueStats }>('GET', '/api/queue/stats');
    return res.stats;
  }

  // -- Usage ------------------------------------------------------------------

  async listUsageEvents(opts?: { sessionId?: string; agentName?: string; limit?: number }): Promise<UsageEvent[]> {
    const params = new URLSearchParams();
    if (opts?.sessionId) params.set('sessionId', opts.sessionId);
    if (opts?.agentName) params.set('agentName', opts.agentName);
    if (opts?.limit) params.set('limit', String(opts.limit));
    const qs = params.toString();
    const res = await this.request<ListUsageResponse>('GET', `/api/usage${qs ? `?${qs}` : ''}`);
    return res.events;
  }

  async getUsageStats(opts?: { sessionId?: string; agentName?: string }): Promise<UsageStats> {
    const params = new URLSearchParams();
    if (opts?.sessionId) params.set('sessionId', opts.sessionId);
    if (opts?.agentName) params.set('agentName', opts.agentName);
    const qs = params.toString();
    const res = await this.request<{ stats: UsageStats }>('GET', `/api/usage/stats${qs ? `?${qs}` : ''}`);
    return res.stats;
  }

  // -- Project Files -----------------------------------------------------------

  /** List uploaded project files. */
  async listFiles(): Promise<ProjectFile[]> {
    const res = await this.request<ListProjectFilesResponse>('GET', '/api/files');
    return res.files;
  }

  /** Upload a new project file (base64-encoded content). */
  async uploadFile(input: UploadFileInput): Promise<ProjectFile> {
    const res = await this.request<{ file: ProjectFile }>('POST', '/api/files', input);
    return res.file;
  }

  /** Get a signed download URL for a project file. */
  async getFileUrl(fileId: string): Promise<string> {
    const res = await this.request<{ url: string }>('GET', `/api/files/${fileId}/url`);
    return res.url;
  }

  /** Delete a project file. */
  async deleteFile(fileId: string): Promise<void> {
    await this.request('DELETE', `/api/files/${fileId}`);
  }

  // -- Health -----------------------------------------------------------------

  async health(): Promise<HealthResponse> {
    return this.request<HealthResponse>('GET', '/health');
  }
}
