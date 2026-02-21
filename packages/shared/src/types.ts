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

export type SessionStatus = 'starting' | 'active' | 'paused' | 'stopped' | 'ended' | 'error';

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
  /** Parent session this was forked from. Null if not a fork. */
  parentSessionId?: string | null;
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


// -- Runners ------------------------------------------------------------------

export interface RunnerRecord {
  id: string;
  host: string;
  port: number;
  maxSandboxes: number;
  activeCount: number;
  warmingCount: number;
  lastHeartbeatAt: string;
  registeredAt: string;
}

// -- Messages -----------------------------------------------------------------

export interface Message {
  id: string;
  sessionId: string;
  tenantId?: string;
  role: 'user' | 'assistant';
  content: string; // JSON string of SDK message content (passthrough)
  sequence: number;
  createdAt: string;
}

export interface ListMessagesResponse {
  messages: Message[];
}

// -- Structured Message Content -----------------------------------------------
// Parse-on-read layer over raw SDK JSON. Known block types get structured;
// anything unrecognized becomes RawContent. Never drops data.

export interface TextContent { type: 'text'; text: string }
export interface ToolUseContent { type: 'tool_use'; id: string; name: string; input: unknown }
export interface ToolResultContent { type: 'tool_result'; tool_use_id: string; content: unknown; is_error?: boolean }
export interface ThinkingContent { type: 'thinking'; thinking: string }
export interface ImageContent { type: 'image'; source: Record<string, unknown> }
/** Catch-all for any SDK content block type we don't recognize. Forward-compatible. */
export interface RawContent { type: 'raw'; rawType: string; raw: Record<string, unknown> }

export type MessageContent =
  | TextContent
  | ToolUseContent
  | ToolResultContent
  | ThinkingContent
  | ImageContent
  | RawContent;

/**
 * Parse raw SDK message JSON into structured MessageContent[].
 * Known block types are parsed; everything else becomes RawContent.
 * Never throws, never drops data.
 */
export function parseMessageContent(rawJson: string): MessageContent[] {
  let parsed: unknown;
  try {
    parsed = JSON.parse(rawJson);
  } catch {
    return [{ type: 'text', text: rawJson }];
  }

  const data = parsed as Record<string, any>;

  // Assistant message with content blocks array
  if (data.type === 'assistant' && Array.isArray(data.message?.content)) {
    return data.message.content.map(parseContentBlock);
  }

  // Direct content blocks array (some SDK shapes)
  if (Array.isArray(data.content)) {
    return data.content.map(parseContentBlock);
  }

  // Tool result message
  if (data.type === 'user' && data.tool_use_result) {
    const r = data.tool_use_result;
    return [{
      type: 'tool_result',
      tool_use_id: r.tool_use_id ?? '',
      content: r.stdout ?? r.content ?? '',
      is_error: r.is_error,
    }];
  }

  // Result message — wrap as text
  if (data.type === 'result' && typeof data.result === 'string') {
    return [{ type: 'text', text: data.result }];
  }

  // Fallback: wrap the whole thing as raw
  return [{ type: 'raw', rawType: data.type ?? 'unknown', raw: data }];
}

function parseContentBlock(block: Record<string, any>): MessageContent {
  switch (block.type) {
    case 'text':
      return { type: 'text', text: block.text ?? '' };
    case 'tool_use':
      return { type: 'tool_use', id: block.id ?? '', name: block.name ?? '', input: block.input };
    case 'tool_result':
      return { type: 'tool_result', tool_use_id: block.tool_use_id ?? '', content: block.content, is_error: block.is_error };
    case 'thinking':
      return { type: 'thinking', thinking: block.thinking ?? '' };
    case 'image':
      return { type: 'image', source: block.source ?? {} };
    default:
      // Unknown block type — preserve everything, never drop
      return { type: 'raw', rawType: block.type ?? 'unknown', raw: block };
  }
}

// -- Session Events (Timeline) ------------------------------------------------

export type SessionEventType =
  | 'text'           // Assistant text content block
  | 'tool_start'     // Tool use started (name + input)
  | 'tool_result'    // Tool result returned (output)
  | 'reasoning'      // Extended thinking / chain-of-thought
  | 'error'          // Error during execution
  | 'turn_complete'  // Agent turn finished (result message)
  | 'lifecycle';     // Session state change (created, paused, resumed, ended)

export interface SessionEvent {
  id: string;
  sessionId: string;
  tenantId?: string;
  type: SessionEventType;
  data: string | null;  // JSON payload (event-type-specific)
  sequence: number;
  createdAt: string;
}

export interface ListSessionEventsResponse {
  events: SessionEvent[];
}

/**
 * Classify a raw SDK message (from bridge) into session events.
 * A single SDK message can produce multiple events (e.g. an assistant message
 * with text + tool_use blocks yields both a 'text' and 'tool_start' event).
 */
export function classifyBridgeMessage(data: Record<string, any>): Array<{ type: SessionEventType; data: Record<string, any> }> {
  const events: Array<{ type: SessionEventType; data: Record<string, any> }> = [];

  // Assistant message with content blocks
  if (data.type === 'assistant' && data.message?.content && Array.isArray(data.message.content)) {
    for (const block of data.message.content) {
      if (block.type === 'text') {
        events.push({ type: 'text', data: { text: block.text } });
      } else if (block.type === 'tool_use') {
        events.push({
          type: 'tool_start',
          data: { toolName: block.name, toolId: block.id, input: block.input },
        });
      } else if (block.type === 'thinking') {
        events.push({ type: 'reasoning', data: { thinking: block.thinking } });
      }
    }
  }

  // Tool result message
  if (data.type === 'user' && data.tool_use_result) {
    const r = data.tool_use_result;
    events.push({
      type: 'tool_result',
      data: {
        toolName: r.tool_name,
        toolId: r.tool_use_id,
        stdout: r.stdout,
        stderr: r.stderr,
      },
    });
  }

  // Result / turn complete
  if (data.type === 'result') {
    events.push({
      type: 'turn_complete',
      data: { numTurns: data.num_turns, result: data.result },
    });
  }

  return events;
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

// -- Credentials --------------------------------------------------------------

export type CredentialType = 'anthropic' | 'openai' | 'custom';

export interface Credential {
  id: string;
  tenantId?: string;
  type: CredentialType;
  label: string;
  active: boolean;
  createdAt: string;
  lastUsedAt: string | null;
}

export interface ListCredentialsResponse {
  credentials: Credential[];
}

// -- Attachments --------------------------------------------------------------

export interface Attachment {
  id: string;
  tenantId?: string;
  messageId: string;
  sessionId: string;
  filename: string;
  mimeType: string;
  size: number;
  storagePath: string;
  createdAt: string;
}

export interface ListAttachmentsResponse {
  attachments: Attachment[];
}

// -- Usage Tracking -----------------------------------------------------------

export type UsageEventType = 'input_tokens' | 'output_tokens' | 'cache_creation_tokens' | 'cache_read_tokens' | 'tool_call' | 'message' | 'compute_seconds';

export interface UsageEvent {
  id: string;
  tenantId?: string;
  sessionId: string;
  agentName: string;
  eventType: UsageEventType;
  value: number;
  createdAt: string;
}

export interface UsageStats {
  totalInputTokens: number;
  totalOutputTokens: number;
  totalCacheCreationTokens: number;
  totalCacheReadTokens: number;
  totalToolCalls: number;
  totalMessages: number;
  totalComputeSeconds: number;
}

export interface ListUsageResponse {
  events: UsageEvent[];
}

// -- Queue --------------------------------------------------------------------

export type QueueItemStatus = 'pending' | 'processing' | 'completed' | 'failed' | 'cancelled';

export interface QueueItem {
  id: string;
  tenantId?: string;
  sessionId: string | null;
  agentName: string;
  prompt: string;
  status: QueueItemStatus;
  priority: number;
  retryCount: number;
  maxRetries: number;
  error: string | null;
  createdAt: string;
  startedAt: string | null;
  completedAt: string | null;
}

export interface QueueStats {
  pending: number;
  processing: number;
  completed: number;
  failed: number;
}

export interface ListQueueResponse {
  items: QueueItem[];
}

// -- API request/response -----------------------------------------------------

export interface CreateSessionRequest {
  agent: string;
  /** Credential ID to inject into sandbox env. */
  credentialId?: string;
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
// Granular event layer on top of raw SDK messages. Clients get both:
//   1. Granular events (text_delta, tool_use, etc.) for structured consumption
//   2. Raw `message` events for passthrough / backward compat
// The type is an open string — unknown event types flow through, never dropped.

/** Known SSE event types we actively parse and structure. */
export type KnownSSEEventType =
  | 'session_start'
  | 'text_delta'
  | 'thinking_delta'
  | 'tool_use'
  | 'tool_result'
  | 'turn_complete'
  | 'message'       // full raw SDK message (always emitted alongside granular events)
  | 'session_end'
  | 'error'
  | 'done';

/** Open type — known events get autocomplete, unknown strings still work. */
export type AshSSEEventType = KnownSSEEventType | (string & {});

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

export interface AshTextDeltaEvent {
  type: 'text_delta';
  data: { delta: string };
}

export interface AshThinkingDeltaEvent {
  type: 'thinking_delta';
  data: { delta: string };
}

export interface AshToolUseEvent {
  type: 'tool_use';
  data: { id: string; name: string; input: unknown };
}

export interface AshToolResultEvent {
  type: 'tool_result';
  data: { tool_use_id: string; content: unknown; is_error?: boolean };
}

export interface AshTurnCompleteEvent {
  type: 'turn_complete';
  data: { numTurns?: number; result?: string };
}

export interface AshSessionStartEvent {
  type: 'session_start';
  data: { sessionId: string };
}

export interface AshSessionEndEvent {
  type: 'session_end';
  data: { sessionId: string };
}

/** Catch-all for unknown event types — raw data preserved. */
export interface AshUnknownEvent {
  type: string;
  data: Record<string, any>;
}

export type AshStreamEvent =
  | AshMessageEvent
  | AshErrorEvent
  | AshDoneEvent
  | AshTextDeltaEvent
  | AshThinkingDeltaEvent
  | AshToolUseEvent
  | AshToolResultEvent
  | AshTurnCompleteEvent
  | AshSessionStartEvent
  | AshSessionEndEvent
  | AshUnknownEvent;

/**
 * Classify a raw SDK message into granular SSE events.
 * Always includes a 'message' event with the raw data for backward compat.
 * Unknown SDK shapes are emitted with their original type string + raw data.
 * Never drops, never errors.
 */
export function classifyToStreamEvents(data: Record<string, any>): AshStreamEvent[] {
  const events: AshStreamEvent[] = [];

  // Stream event — partial message delta
  if (data.type === 'stream_event') {
    const event = data.event;
    if (event?.type === 'content_block_delta') {
      const delta = event.delta;
      if (delta?.type === 'text_delta' && typeof delta.text === 'string') {
        events.push({ type: 'text_delta', data: { delta: delta.text } });
      } else if (delta?.type === 'thinking_delta' && typeof delta.thinking === 'string') {
        events.push({ type: 'thinking_delta', data: { delta: delta.thinking } });
      }
      // input_json_delta and other delta types — emit as unknown for forward compat
      if (delta && delta.type !== 'text_delta' && delta.type !== 'thinking_delta') {
        events.push({ type: delta.type, data: delta });
      }
    }
    // Always emit the raw message too
    events.push({ type: 'message', data });
    return events;
  }

  // Assistant message with content blocks
  if (data.type === 'assistant' && Array.isArray(data.message?.content)) {
    for (const block of data.message.content) {
      if (block.type === 'text') {
        events.push({ type: 'text_delta', data: { delta: block.text } });
      } else if (block.type === 'tool_use') {
        events.push({ type: 'tool_use', data: { id: block.id, name: block.name, input: block.input } });
      } else if (block.type === 'thinking') {
        events.push({ type: 'thinking_delta', data: { delta: block.thinking } });
      } else {
        // Unknown block type — forward as-is
        events.push({ type: block.type, data: block });
      }
    }
  }

  // Tool result message
  if (data.type === 'user' && data.tool_use_result) {
    const r = data.tool_use_result;
    events.push({
      type: 'tool_result',
      data: { tool_use_id: r.tool_use_id, content: r.stdout ?? r.content, is_error: r.is_error },
    });
  }

  // Result / turn complete
  if (data.type === 'result') {
    events.push({
      type: 'turn_complete',
      data: { numTurns: data.num_turns, result: data.result },
    });
  }

  // Always emit the raw message for backward compat
  events.push({ type: 'message', data });
  return events;
}

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
