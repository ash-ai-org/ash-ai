// =============================================================================
// Bridge protocol: communication between server host and bridge process inside
// sandbox. Newline-delimited JSON over Unix socket.
//
// SDK message passthrough: bridge events carry raw SDK Message objects (from
// @anthropic-ai/claude-code) as opaque JSON. We do NOT define our own message
// types — the SDK's types are the contract. See CLAUDE.md principle 8.
// =============================================================================

// -- Commands: server → bridge ------------------------------------------------

export interface QueryCommand {
  cmd: 'query';
  prompt: string;
  sessionId: string;
  includePartialMessages?: boolean;
  /** Override the model for this query. Overrides agent's .claude/settings.json. */
  model?: string;
  // -- Per-message SDK options --
  maxTurns?: number;
  maxBudgetUsd?: number;
  effort?: 'low' | 'medium' | 'high' | 'max';
  thinking?: { type: string; budgetTokens?: number };
  outputFormat?: { type: string; schema: Record<string, unknown> };
  // -- Session-level SDK options (injected by server) --
  allowedTools?: string[];
  disallowedTools?: string[];
  betas?: string[];
  subagents?: Record<string, unknown>;
  initialAgent?: string;
  /** W3C traceparent header for distributed tracing */
  traceContext?: string;
}

export interface ResumeCommand {
  cmd: 'resume';
  sessionId: string;
  /** W3C traceparent header for distributed tracing */
  traceContext?: string;
}

export interface InterruptCommand {
  cmd: 'interrupt';
}

export interface ShutdownCommand {
  cmd: 'shutdown';
}

export interface ExecCommand {
  cmd: 'exec';
  command: string;
  timeout?: number;
  /** W3C traceparent header for distributed tracing */
  traceContext?: string;
}

export type BridgeCommand =
  | QueryCommand
  | ResumeCommand
  | InterruptCommand
  | ShutdownCommand
  | ExecCommand;

// -- Events: bridge → server --------------------------------------------------
// SDK messages are passed through as-is in the `data` field of a 'message' event.
// The `data` value is whatever the SDK yields — we don't type it here.

export interface ReadyEvent {
  ev: 'ready';
}

export interface MessageEvent {
  ev: 'message';
  data: unknown; // SDK Message object — passthrough, not translated
}

export interface ErrorEvent {
  ev: 'error';
  error: string;
}

export interface DoneEvent {
  ev: 'done';
  sessionId: string;
}

export interface ExecResultEvent {
  ev: 'exec_result';
  exitCode: number;
  stdout: string;
  stderr: string;
}

export interface LogEvent {
  ev: 'log';
  level: 'stdout' | 'stderr' | 'system';
  text: string;
  ts: string;
}

export type BridgeEvent =
  | ReadyEvent
  | MessageEvent
  | ErrorEvent
  | DoneEvent
  | ExecResultEvent
  | LogEvent;

// -- Wire encoding/decoding ---------------------------------------------------

export function encode(msg: BridgeCommand | BridgeEvent): string {
  return JSON.stringify(msg) + '\n';
}

/** All valid command discriminator values */
const VALID_COMMANDS = new Set(['query', 'resume', 'interrupt', 'shutdown', 'exec']);
/** All valid event discriminator values */
const VALID_EVENTS = new Set(['ready', 'message', 'error', 'done', 'exec_result', 'log']);
/** Keys that indicate prototype pollution attempts */
const DANGEROUS_KEYS = new Set(['__proto__', 'constructor', 'prototype']);

/**
 * Required fields for each command type (beyond the `cmd` discriminator).
 */
const COMMAND_REQUIRED_FIELDS: Record<string, string[]> = {
  query: ['prompt', 'sessionId'],
  resume: ['sessionId'],
  exec: ['command'],
  // interrupt and shutdown have no additional required fields
};

function hasDangerousKeys(obj: Record<string, unknown>): boolean {
  for (const key of Object.keys(obj)) {
    if (DANGEROUS_KEYS.has(key)) return true;
  }
  return false;
}

export function decode(line: string): BridgeCommand | BridgeEvent {
  const parsed: unknown = JSON.parse(line.trim());

  // Must be a plain object (not null, not array, not primitive)
  if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new Error('Protocol error: decoded value must be a plain object');
  }

  const obj = parsed as Record<string, unknown>;

  // Reject prototype pollution attempts
  if (hasDangerousKeys(obj)) {
    throw new Error('Protocol error: message contains forbidden keys');
  }

  // Validate discriminator: must have exactly one of `cmd` or `ev`
  const hasCmd = 'cmd' in obj;
  const hasEv = 'ev' in obj;

  if (!hasCmd && !hasEv) {
    throw new Error('Protocol error: message must have a "cmd" or "ev" field');
  }
  if (hasCmd && hasEv) {
    throw new Error('Protocol error: message must not have both "cmd" and "ev" fields');
  }

  if (hasCmd) {
    if (typeof obj.cmd !== 'string' || !VALID_COMMANDS.has(obj.cmd)) {
      throw new Error(`Protocol error: unknown command type: ${String(obj.cmd)}`);
    }
    // Validate required fields for known command types
    const requiredFields = COMMAND_REQUIRED_FIELDS[obj.cmd];
    if (requiredFields) {
      for (const field of requiredFields) {
        if (!(field in obj)) {
          throw new Error(`Protocol error: command "${obj.cmd}" missing required field "${field}"`);
        }
      }
    }
  }

  if (hasEv) {
    if (typeof obj.ev !== 'string' || !VALID_EVENTS.has(obj.ev)) {
      throw new Error(`Protocol error: unknown event type: ${String(obj.ev)}`);
    }
  }

  return obj as unknown as BridgeCommand | BridgeEvent;
}
