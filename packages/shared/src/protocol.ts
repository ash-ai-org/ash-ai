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
}

export interface ResumeCommand {
  cmd: 'resume';
  sessionId: string;
}

export interface InterruptCommand {
  cmd: 'interrupt';
}

export interface ShutdownCommand {
  cmd: 'shutdown';
}

export type BridgeCommand =
  | QueryCommand
  | ResumeCommand
  | InterruptCommand
  | ShutdownCommand;

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

export type BridgeEvent =
  | ReadyEvent
  | MessageEvent
  | ErrorEvent
  | DoneEvent;

// -- Wire encoding/decoding ---------------------------------------------------

export function encode(msg: BridgeCommand | BridgeEvent): string {
  return JSON.stringify(msg) + '\n';
}

export function decode(line: string): BridgeCommand | BridgeEvent {
  return JSON.parse(line.trim());
}
