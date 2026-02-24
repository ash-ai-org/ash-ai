#!/usr/bin/env node

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';

const serverUrl = (process.env.ASH_SERVER_URL || 'http://localhost:4100').replace(/\/$/, '');
const apiKey = process.env.ASH_API_KEY;

function headers(json = false): Record<string, string> {
  const h: Record<string, string> = {};
  if (json) h['Content-Type'] = 'application/json';
  if (apiKey) h['Authorization'] = `Bearer ${apiKey}`;
  return h;
}

async function request<T>(method: string, path: string, body?: unknown): Promise<T> {
  const res = await fetch(`${serverUrl}${path}`, {
    method,
    headers: headers(!!body),
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: res.statusText })) as { error: string };
    throw new Error(err.error);
  }
  return await res.json() as T;
}

async function consumeSSEStream(res: Response): Promise<string> {
  if (!res.body) return 'No response body';

  const reader = (res.body as ReadableStream<Uint8Array>).getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  let currentEvent = '';
  const textParts: string[] = [];
  let errorMsg: string | null = null;

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop() || '';

      for (const line of lines) {
        if (line.startsWith('event: ')) {
          currentEvent = line.slice(7).trim();
        } else if (line.startsWith('data: ')) {
          const raw = line.slice(6);
          try {
            const data = JSON.parse(raw) as Record<string, unknown>;
            if (currentEvent === 'message') {
              // Extract text from assistant messages
              if (data.type === 'assistant' && data.message) {
                const msg = data.message as Record<string, unknown>;
                const content = msg.content;
                if (Array.isArray(content)) {
                  for (const block of content) {
                    const b = block as Record<string, unknown>;
                    if (b.type === 'text' && typeof b.text === 'string') {
                      textParts.push(b.text);
                    } else if (b.type === 'tool_use') {
                      textParts.push(`[Tool: ${b.name as string}]`);
                    }
                  }
                }
              } else if (data.type === 'result' && typeof data.result === 'string') {
                textParts.push(data.result);
              }
            } else if (currentEvent === 'error') {
              errorMsg = (data as { error: string }).error;
            }
          } catch {
            // Non-JSON data, skip
          }
        }
      }
    }
  } finally {
    reader.releaseLock();
  }

  if (errorMsg) return `Error: ${errorMsg}`;
  return textParts.join('\n') || 'No text response';
}

const server = new McpServer({
  name: 'ash',
  version: '0.0.1',
});

// -- Tools --

server.tool(
  'list_agents',
  'List all deployed agents on the Ash server',
  {},
  async () => {
    const res = await request<{ agents: unknown[] }>('GET', '/api/agents');
    return { content: [{ type: 'text' as const, text: JSON.stringify(res.agents, null, 2) }] };
  },
);

server.tool(
  'create_session',
  'Create a new agent session. Returns the session object with its ID.',
  { agent: z.string().describe('Name of the deployed agent') },
  async ({ agent }) => {
    const res = await request<{ session: unknown }>('POST', '/api/sessions', { agent });
    return { content: [{ type: 'text' as const, text: JSON.stringify(res.session, null, 2) }] };
  },
);

server.tool(
  'send_message',
  'Send a message to an active session and return the agent response. The response is collected from the SSE stream.',
  {
    sessionId: z.string().describe('Session ID (UUID)'),
    content: z.string().describe('Message content to send to the agent'),
  },
  async ({ sessionId, content }) => {
    const res = await fetch(`${serverUrl}/api/sessions/${sessionId}/messages`, {
      method: 'POST',
      headers: headers(true),
      body: JSON.stringify({ content }),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({ error: res.statusText })) as { error: string };
      throw new Error(err.error);
    }
    const text = await consumeSSEStream(res);
    return { content: [{ type: 'text' as const, text }] };
  },
);

server.tool(
  'list_sessions',
  'List all sessions, optionally filtered by agent name',
  { agent: z.string().optional().describe('Filter by agent name') },
  async ({ agent }) => {
    const path = agent ? `/api/sessions?agent=${encodeURIComponent(agent)}` : '/api/sessions';
    const res = await request<{ sessions: unknown[] }>('GET', path);
    return { content: [{ type: 'text' as const, text: JSON.stringify(res.sessions, null, 2) }] };
  },
);

server.tool(
  'get_session',
  'Get details of a specific session by ID',
  { sessionId: z.string().describe('Session ID (UUID)') },
  async ({ sessionId }) => {
    const res = await request<{ session: unknown }>('GET', `/api/sessions/${sessionId}`);
    return { content: [{ type: 'text' as const, text: JSON.stringify(res.session, null, 2) }] };
  },
);

server.tool(
  'end_session',
  'End a session permanently. Destroys the sandbox but preserves messages.',
  { sessionId: z.string().describe('Session ID (UUID)') },
  async ({ sessionId }) => {
    const res = await request<{ session: unknown }>('DELETE', `/api/sessions/${sessionId}`);
    return { content: [{ type: 'text' as const, text: JSON.stringify(res.session, null, 2) }] };
  },
);

server.tool(
  'pause_session',
  'Pause a session. Sandbox may stay alive for fast resume.',
  { sessionId: z.string().describe('Session ID (UUID)') },
  async ({ sessionId }) => {
    const res = await request<{ session: unknown }>('POST', `/api/sessions/${sessionId}/pause`);
    return { content: [{ type: 'text' as const, text: JSON.stringify(res.session, null, 2) }] };
  },
);

server.tool(
  'resume_session',
  'Resume a paused or errored session.',
  { sessionId: z.string().describe('Session ID (UUID)') },
  async ({ sessionId }) => {
    const res = await request<{ session: unknown }>('POST', `/api/sessions/${sessionId}/resume`);
    return { content: [{ type: 'text' as const, text: JSON.stringify(res.session, null, 2) }] };
  },
);

server.tool(
  'health',
  'Check Ash server health status',
  {},
  async () => {
    const res = await request<unknown>('GET', '/health');
    return { content: [{ type: 'text' as const, text: JSON.stringify(res, null, 2) }] };
  },
);

// -- Start --

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
}

main().catch((err) => {
  console.error('MCP server error:', err);
  process.exit(1);
});
