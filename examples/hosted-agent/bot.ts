/**
 * Research Assistant — Example hosted agent using Ash SDK with skills + MCP.
 *
 * This agent demonstrates:
 * - Custom skills (search-and-summarize, analyze-code, write-memo)
 * - MCP servers (fetch for web content, memory for persistent knowledge graph)
 * - Streaming responses via SSE
 *
 * Usage:
 *   import { ResearchBot } from './bot.js';
 *   const bot = new ResearchBot('http://localhost:4100');
 *   await bot.setup();
 *   const answer = await bot.ask('Research the latest Node.js release');
 *   await bot.teardown();
 */

import { AshClient, extractTextFromEvent } from '@ash-ai/sdk';
import type { Session } from '@ash-ai/sdk';

const AGENT_NAME = 'research-assistant';
const AGENT_PATH = './agent';

export class ResearchBot {
  private client: AshClient;
  private session: Session | null = null;

  constructor(serverUrl: string) {
    this.client = new AshClient({ serverUrl });
  }

  /** Deploy the agent and create a session. */
  async setup(): Promise<Session> {
    await this.client.deployAgent(AGENT_NAME, AGENT_PATH);
    this.session = await this.client.createSession(AGENT_NAME);
    return this.session;
  }

  /** Resume an existing session. */
  async resume(sessionId: string): Promise<Session> {
    this.session = await this.client.resumeSession(sessionId);
    return this.session;
  }

  /** Send a message and collect the full response. */
  async ask(question: string): Promise<string> {
    if (!this.session) throw new Error('Call setup() or resume() first');

    const parts: string[] = [];
    for await (const event of this.client.sendMessageStream(this.session.id, question)) {
      if (event.type === 'message') {
        const text = extractTextFromEvent(event.data);
        if (text) parts.push(text);
      }
    }
    return parts.join('');
  }

  /** Send a message and stream tokens to a callback. */
  async askStreaming(
    question: string,
    onToken: (token: string) => void,
  ): Promise<string> {
    if (!this.session) throw new Error('Call setup() or resume() first');

    const parts: string[] = [];
    for await (const event of this.client.sendMessageStream(this.session.id, question, {
      includePartialMessages: true,
    })) {
      if (event.type === 'message') {
        const text = extractTextFromEvent(event.data);
        if (text) {
          parts.push(text);
          onToken(text);
        }
      }
    }
    return parts.join('');
  }

  /** Get the current session ID. */
  getSessionId(): string | null {
    return this.session?.id ?? null;
  }

  /** End session and clean up. */
  async teardown(): Promise<void> {
    if (this.session) {
      await this.client.endSession(this.session.id);
      this.session = null;
    }
    await this.client.deleteAgent(AGENT_NAME);
  }
}
