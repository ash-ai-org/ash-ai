// =============================================================================
// Ash-specific types. These are for orchestration concerns that Ash owns.
// Conversation/message types come from @anthropic-ai/claude-code — see protocol.ts.
// =============================================================================

// -- Agents -------------------------------------------------------------------

export interface Agent {
  id: string;
  name: string;
  tenantId?: string;
  version: number;
  path: string;
  createdAt: string;
  updatedAt: string;
}

// -- Sessions -----------------------------------------------------------------

export type SessionStatus = 'starting' | 'active' | 'paused' | 'ended' | 'error';

export interface Session {
  id: string;
  tenantId?: string;
  agentName: string;
  sandboxId: string;
  status: SessionStatus;
  createdAt: string;
  lastActiveAt: string;
  /** Runner that owns this session's sandbox. Null in standalone mode. */
  runnerId?: string | null;
}

// -- Sandboxes ----------------------------------------------------------------

export type SandboxState = 'cold' | 'warming' | 'warm' | 'waiting' | 'running';

export interface SandboxInfo {
  id: string;
  pid: number | null;
  state: SandboxState;
  socketPath: string;
  workspaceDir: string;
  createdAt: string;
}

export interface SandboxRecord {
  id: string;
  tenantId?: string;
  sessionId: string | null;
  agentName: string;
  state: SandboxState;
  workspaceDir: string;
  createdAt: string;
  lastUsedAt: string;
}

// -- API Keys -----------------------------------------------------------------

export interface ApiKey {
  id: string;
  tenantId: string;
  keyHash: string;
  label: string;
  createdAt: string;
}

export interface PoolStats {
  total: number;
  cold: number;
  warming: number;
  warm: number;
  waiting: number;
  running: number;
  maxCapacity: number;
  resumeWarmHits: number;
  resumeColdHits: number;
}

// -- Resource Limits ----------------------------------------------------------

export interface SandboxLimits {
  memoryMb: number;      // Max RSS in MB
  cpuPercent: number;    // 100 = 1 core, 200 = 2 cores
  diskMb: number;        // Max workspace size in MB
  maxProcesses: number;  // Max PIDs (fork bomb protection)
}

// -- Files --------------------------------------------------------------------

export interface FileEntry {
  path: string;       // Relative to workspace root, e.g. "src/index.ts"
  size: number;       // Bytes
  modifiedAt: string; // ISO 8601
}

export interface ListFilesResponse {
  files: FileEntry[];
  /** Where the file listing was read from: 'sandbox' (live) or 'snapshot' (persisted). */
  source: 'sandbox' | 'snapshot';
}

export interface GetFileResponse {
  path: string;
  content: string;
  size: number;
  source: 'sandbox' | 'snapshot';
}

// -- API request/response -----------------------------------------------------

export interface CreateSessionRequest {
  agent: string;
}

export interface CreateSessionResponse {
  session: Session;
}

export interface SendMessageRequest {
  content: string;
  /** Enable partial message streaming. When true, yields incremental StreamEvent messages with raw API deltas in addition to complete messages. */
  includePartialMessages?: boolean;
}

export interface DeployAgentRequest {
  name: string;
  path: string;
}

export interface ListAgentsResponse {
  agents: Agent[];
}

export interface ListSessionsResponse {
  sessions: Session[];
}

export interface HealthResponse {
  status: 'ok';
  activeSessions: number;
  activeSandboxes: number;
  uptime: number;
  pool: PoolStats;
}

export interface ApiError {
  error: string;
  statusCode: number;
}

// -- SSE Stream Events --------------------------------------------------------
// These carry SDK messages as-is (principle 8: no type translation).
// The `message` event data is a raw SDK Message object passed through from the bridge.

export type AshSSEEventType = 'message' | 'error' | 'done';

export interface AshMessageEvent {
  type: 'message';
  // Raw SDK Message — shape varies (assistant, result, etc.)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  data: Record<string, any>;
}

export interface AshErrorEvent {
  type: 'error';
  data: { error: string };
}

export interface AshDoneEvent {
  type: 'done';
  data: { sessionId: string };
}

export type AshStreamEvent = AshMessageEvent | AshErrorEvent | AshDoneEvent;

// -- SDK Message Display Helpers -----------------------------------------------

export type DisplayItemType = 'text' | 'tool_use' | 'tool_result';

export interface DisplayItem {
  type: DisplayItemType;
  /** For text: the text content. For tool_use: tool name. For tool_result: output. */
  content: string;
  /** Tool name (tool_use and tool_result only) */
  toolName?: string;
  /** Abbreviated tool input (tool_use only) */
  toolInput?: string;
}

/**
 * Extract display items from an SDK message event's data.
 * Returns structured items for text, tool use, and tool results.
 * Returns null for messages that shouldn't be displayed (system, result).
 */
export function extractDisplayItems(data: Record<string, any>): DisplayItem[] | null {
  // Assistant message with content blocks
  if (data.type === 'assistant' && data.message?.content) {
    const content = data.message.content;
    if (!Array.isArray(content)) return null;

    const items: DisplayItem[] = [];
    for (const block of content) {
      if (block.type === 'text') {
        items.push({ type: 'text', content: block.text });
      } else if (block.type === 'tool_use') {
        const inputStr = block.input
          ? Object.entries(block.input)
              .map(([k, v]) => `${k}: ${typeof v === 'string' ? v : JSON.stringify(v)}`)
              .join(', ')
          : '';
        items.push({
          type: 'tool_use',
          content: block.name,
          toolName: block.name,
          toolInput: inputStr.length > 200 ? inputStr.slice(0, 200) + '...' : inputStr,
        });
      }
    }
    return items.length > 0 ? items : null;
  }

  // Tool result message
  if (data.type === 'user' && data.tool_use_result) {
    const r = data.tool_use_result;
    const output = (r.stdout || '') + (r.stderr ? `\n${r.stderr}` : '');
    if (!output.trim()) return null;
    return [{
      type: 'tool_result',
      content: output.length > 1000 ? output.slice(0, 1000) + '\n...' : output,
    }];
  }

  return null;
}

/**
 * Simple text-only extraction for consumers that just want a string.
 * Extracts text content from assistant messages, ignores tools and results.
 */
export function extractTextFromEvent(data: Record<string, any>): string | null {
  if (data.type === 'assistant' && data.message?.content) {
    const content = data.message.content;
    if (typeof content === 'string') return content;
    if (Array.isArray(content)) {
      const text = content
        .filter((block: any) => block.type === 'text')
        .map((block: any) => block.text)
        .join('');
      return text || null;
    }
  }
  return null;
}

/**
 * Extract a text delta from an SDK StreamEvent message.
 * Returns the incremental text chunk from `content_block_delta` events with `text_delta`,
 * or null for any other event type. Use this to build real-time streaming UIs.
 *
 * Only yields values when `includePartialMessages` is enabled on the request.
 */
export function extractStreamDelta(data: Record<string, any>): string | null {
  if (data.type !== 'stream_event') return null;
  const event = data.event;
  if (!event || event.type !== 'content_block_delta') return null;
  const delta = event.delta;
  if (!delta || delta.type !== 'text_delta') return null;
  return delta.text ?? null;
}
