import { getServerUrl, getApiKey } from './config.js';

const serverUrl = getServerUrl();

function authHeaders(): Record<string, string> {
  const key = getApiKey();
  return key ? { Authorization: `Bearer ${key}` } : {};
}

async function request(method: string, path: string, body?: unknown): Promise<Response> {
  const headers: Record<string, string> = { ...authHeaders() };
  if (body) headers['Content-Type'] = 'application/json';
  const url = `${serverUrl}${path}`;
  const res = await fetch(url, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) {
    const text = await res.text();
    let message: string;
    try {
      const json = JSON.parse(text) as { error?: string };
      message = json.error || text;
    } catch {
      message = text || `${res.status} ${res.statusText}`;
    }
    throw new Error(`${method} ${path} failed (${res.status}): ${message}`);
  }
  return res;
}

export async function deployAgent(name: string, path: string) {
  const res = await request('POST', '/api/agents', { name, path });
  return (await res.json() as { agent: unknown }).agent;
}

export async function listAgents() {
  const res = await request('GET', '/api/agents');
  return (await res.json() as { agents: unknown[] }).agents;
}

export async function getAgentInfo(name: string) {
  const res = await request('GET', `/api/agents/${name}`);
  return (await res.json() as { agent: unknown }).agent;
}

export async function createSession(agent: string) {
  const res = await request('POST', '/api/sessions', { agent });
  return (await res.json() as { session: unknown }).session;
}

export async function sendMessage(sessionId: string, content: string): Promise<ReadableStream<Uint8Array> | null> {
  const headers: Record<string, string> = { 'Content-Type': 'application/json', ...authHeaders() };
  const res = await fetch(`${serverUrl}/api/sessions/${sessionId}/messages`, {
    method: 'POST',
    headers,
    body: JSON.stringify({ content }),
  });
  if (!res.ok) {
    const text = await res.text();
    let message: string;
    try {
      const json = JSON.parse(text) as { error?: string };
      message = json.error || text;
    } catch {
      message = text || `${res.status} ${res.statusText}`;
    }
    throw new Error(`POST /api/sessions/${sessionId}/messages failed (${res.status}): ${message}`);
  }
  return res.body;
}

export async function listSessions() {
  const res = await request('GET', '/api/sessions');
  return (await res.json() as { sessions: unknown[] }).sessions;
}

export async function pauseSession(sessionId: string) {
  const res = await request('POST', `/api/sessions/${sessionId}/pause`);
  return (await res.json() as { session: unknown }).session;
}

export async function resumeSession(sessionId: string) {
  const res = await request('POST', `/api/sessions/${sessionId}/resume`);
  return (await res.json() as { session: unknown }).session;
}

export async function endSession(sessionId: string) {
  const res = await request('DELETE', `/api/sessions/${sessionId}`);
  return (await res.json() as { session: unknown }).session;
}

export async function deleteAgent(name: string) {
  const res = await request('DELETE', `/api/agents/${name}`);
  return true;
}

export async function getSessionEvents(sessionId: string, opts?: { after?: number; type?: string; limit?: number }) {
  const params = new URLSearchParams();
  if (opts?.after !== undefined) params.set('after', String(opts.after));
  if (opts?.type) params.set('type', opts.type);
  if (opts?.limit) params.set('limit', String(opts.limit));
  const qs = params.toString();
  const res = await request('GET', `/api/sessions/${sessionId}/events${qs ? `?${qs}` : ''}`);
  return (await res.json() as { events: Array<{ id: string; sequence: number; type: string; data: string; createdAt: string }> }).events;
}

export async function getSessionFiles(sessionId: string): Promise<{ files: Array<{ path: string; size: number; modifiedAt: string }>; source: string }> {
  const res = await request('GET', `/api/sessions/${sessionId}/files`);
  return await res.json() as { files: Array<{ path: string; size: number; modifiedAt: string }>; source: string };
}

export async function getSessionFile(sessionId: string, filePath: string): Promise<string> {
  const res = await request('GET', `/api/sessions/${sessionId}/files/${filePath}?format=json`);
  const data = await res.json() as { content: string };
  return data.content;
}

export async function execInSession(sessionId: string, command: string, timeout?: number): Promise<{ exitCode: number; stdout: string; stderr: string }> {
  const body: { command: string; timeout?: number } = { command };
  if (timeout) body.timeout = timeout;
  const res = await request('POST', `/api/sessions/${sessionId}/exec`, body);
  return await res.json() as { exitCode: number; stdout: string; stderr: string };
}

export async function getHealth() {
  const res = await request('GET', '/health');
  return await res.json();
}
