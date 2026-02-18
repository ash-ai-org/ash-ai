import { DEFAULT_PORT } from '@ash-ai/shared';

const serverUrl = process.env.ASH_SERVER_URL || `http://localhost:${DEFAULT_PORT}`;

async function request(method: string, path: string, body?: unknown): Promise<Response> {
  const res = await fetch(`${serverUrl}${path}`, {
    method,
    headers: body ? { 'Content-Type': 'application/json' } : {},
    body: body ? JSON.stringify(body) : undefined,
  });
  return res;
}

export async function deployAgent(name: string, path: string) {
  const res = await request('POST', '/api/agents', { name, path });
  if (!res.ok) {
    const err = await res.json() as { error: string };
    throw new Error(err.error);
  }
  return (await res.json() as { agent: unknown }).agent;
}

export async function listAgents() {
  const res = await request('GET', '/api/agents');
  return (await res.json() as { agents: unknown[] }).agents;
}

export async function getAgentInfo(name: string) {
  const res = await request('GET', `/api/agents/${name}`);
  if (!res.ok) {
    const err = await res.json() as { error: string };
    throw new Error(err.error);
  }
  return (await res.json() as { agent: unknown }).agent;
}

export async function createSession(agent: string) {
  const res = await request('POST', '/api/sessions', { agent });
  if (!res.ok) {
    const err = await res.json() as { error: string };
    throw new Error(err.error);
  }
  return (await res.json() as { session: unknown }).session;
}

export async function sendMessage(sessionId: string, content: string): Promise<ReadableStream<Uint8Array> | null> {
  const res = await fetch(`${serverUrl}/api/sessions/${sessionId}/messages`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ content }),
  });
  if (!res.ok) {
    const err = await res.json() as { error: string };
    throw new Error(err.error);
  }
  return res.body;
}

export async function listSessions() {
  const res = await request('GET', '/api/sessions');
  return (await res.json() as { sessions: unknown[] }).sessions;
}

export async function pauseSession(sessionId: string) {
  const res = await request('POST', `/api/sessions/${sessionId}/pause`);
  if (!res.ok) {
    const err = await res.json() as { error: string };
    throw new Error(err.error);
  }
  return (await res.json() as { session: unknown }).session;
}

export async function resumeSession(sessionId: string) {
  const res = await request('POST', `/api/sessions/${sessionId}/resume`);
  if (!res.ok) {
    const err = await res.json() as { error: string };
    throw new Error(err.error);
  }
  return (await res.json() as { session: unknown }).session;
}

export async function endSession(sessionId: string) {
  const res = await request('DELETE', `/api/sessions/${sessionId}`);
  if (!res.ok) {
    const err = await res.json() as { error: string };
    throw new Error(err.error);
  }
  return (await res.json() as { session: unknown }).session;
}

export async function deleteAgent(name: string) {
  const res = await request('DELETE', `/api/agents/${name}`);
  if (!res.ok) {
    const err = await res.json() as { error: string };
    throw new Error(err.error);
  }
  return true;
}

export async function getHealth() {
  const res = await request('GET', '/health');
  return await res.json();
}
