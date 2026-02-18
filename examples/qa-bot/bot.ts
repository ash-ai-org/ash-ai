/**
 * QA Bot — Example application using the Ash SDK.
 *
 * Local usage:
 *   const bot = new QABot('http://localhost:4100');
 *   await bot.setup('qa-bot', './agent');
 *   const answer = await bot.ask('What is 2+2?');
 *   await bot.teardown();
 *
 * Remote usage (EC2/GCP):
 *   const bot = new QABot('http://<ec2-ip>:4100', 'your-api-key');
 *   await bot.resume('qa-bot', 'session-id-here');
 *   const answer = await bot.ask('What did we talk about?');
 */

import { AshClient, extractTextFromEvent } from '@ash-ai/sdk';
import type { Session } from '@ash-ai/sdk';

export interface BotMessage {
  role: 'user' | 'assistant';
  content: string;
}

export class QABot {
  private client: AshClient;
  private agentName: string | null = null;
  private session: Session | null = null;
  private history: BotMessage[] = [];

  constructor(serverUrl: string, apiKey?: string) {
    this.client = new AshClient({ serverUrl, apiKey });
  }

  /** Deploy agent and create a new session. */
  async setup(agentName: string, agentPath: string): Promise<Session> {
    await this.client.deployAgent(agentName, agentPath);
    this.agentName = agentName;
    this.session = await this.client.createSession(agentName);
    this.history = [];
    return this.session;
  }

  /** Resume an existing session by ID. */
  async resume(agentName: string, sessionId: string): Promise<Session> {
    this.agentName = agentName;
    this.session = await this.client.resumeSession(sessionId);
    this.history = [];
    return this.session;
  }

  /** List resumable sessions for an agent. */
  async listSessions(agentName?: string): Promise<Session[]> {
    const sessions = await this.client.listSessions(agentName ?? this.agentName ?? undefined);
    return sessions.filter(
      (s) => s.status === 'active' || s.status === 'paused' || s.status === 'error',
    );
  }

  /** Send a question and collect the streamed response. */
  async ask(question: string): Promise<string> {
    if (!this.session) throw new Error('Call setup() or resume() first');

    this.history.push({ role: 'user', content: question });

    const parts: string[] = [];
    for await (const event of this.client.sendMessageStream(this.session.id, question)) {
      if (event.type === 'message') {
        const text = extractTextFromEvent(event.data);
        if (text) parts.push(text);
      }
    }

    const content = parts.join('');

    this.history.push({ role: 'assistant', content });
    return content;
  }

  /** Get conversation history (local to this bot instance). */
  getHistory(): BotMessage[] {
    return [...this.history];
  }

  /** Get current session info from the server. */
  async getSessionInfo(): Promise<Session | null> {
    if (!this.session) return null;
    return this.client.getSession(this.session.id);
  }

  /** Get current session ID. */
  getSessionId(): string | null {
    return this.session?.id ?? null;
  }

  /** End the session and clean up. */
  async teardown(): Promise<void> {
    if (this.session) {
      await this.client.endSession(this.session.id);
      this.session = null;
    }
    if (this.agentName) {
      await this.client.deleteAgent(this.agentName);
      this.agentName = null;
    }
    this.history = [];
  }

  /** Check if Ash server is healthy. */
  async isHealthy(): Promise<boolean> {
    try {
      const h = await this.client.health();
      return h.status === 'ok';
    } catch {
      return false;
    }
  }
}
