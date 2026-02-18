'use client';

import { useState, useRef, useEffect, useCallback } from 'react';
import { parseSSEStream, extractDisplayItems, extractStreamDelta } from '@ash-ai/sdk';
import type { AshStreamEvent, DisplayItem, Session } from '@ash-ai/sdk';

interface Message {
  role: 'user' | 'assistant';
  items: DisplayItem[];
}

const AGENT_NAME = 'qa-bot';
const STORAGE_KEY = 'ash-qa-bot-messages';

// --- localStorage helpers ---

function saveMessages(sessionId: string, messages: Message[]) {
  try {
    const all = JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}');
    all[sessionId] = messages;
    localStorage.setItem(STORAGE_KEY, JSON.stringify(all));
  } catch { /* quota exceeded or SSR — ignore */ }
}

function loadMessages(sessionId: string): Message[] {
  try {
    const all = JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}');
    return all[sessionId] || [];
  } catch { return []; }
}

function deleteMessages(sessionId: string) {
  try {
    const all = JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}');
    delete all[sessionId];
    localStorage.setItem(STORAGE_KEY, JSON.stringify(all));
  } catch { /* ignore */ }
}

// --- Component ---

export default function Chat() {
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [isStreaming, setIsStreaming] = useState(false);
  const [sessions, setSessions] = useState<Session[]>([]);
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [loadingSessions, setLoadingSessions] = useState(false);
  const [resuming, setResuming] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // Persist messages to localStorage whenever they change
  useEffect(() => {
    if (sessionId && messages.length > 0) {
      saveMessages(sessionId, messages);
    }
  }, [sessionId, messages]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  // Fetch sessions on mount
  const fetchSessions = useCallback(async () => {
    setLoadingSessions(true);
    try {
      const res = await fetch(`/api/sessions?agent=${AGENT_NAME}`);
      if (res.ok) {
        const { sessions: list } = await res.json();
        setSessions(list);
      }
    } catch { /* ignore */ }
    setLoadingSessions(false);
  }, []);

  useEffect(() => { fetchSessions(); }, [fetchSessions]);

  async function createSession(): Promise<string> {
    const res = await fetch('/api/sessions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ agent: AGENT_NAME }),
    });
    if (!res.ok) {
      const err = await res.json();
      throw new Error(err.error || 'Failed to create session');
    }
    const { session } = await res.json();
    setSessionId(session.id);
    fetchSessions();
    return session.id;
  }

  async function handleSend() {
    const text = input.trim();
    if (!text || isStreaming) return;

    setInput('');
    setMessages((prev) => [...prev, { role: 'user', items: [{ type: 'text', content: text }] }]);
    setIsStreaming(true);

    try {
      const sid = sessionId ?? (await createSession());

      const res = await fetch(`/api/sessions/${sid}/messages`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content: text }),
      });

      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || 'Failed to send message');
      }

      if (!res.body) throw new Error('No response body');

      setMessages((prev) => [...prev, { role: 'assistant', items: [] }]);

      let streamingText = '';

      for await (const event of parseSSEStream(res.body) as AsyncGenerator<AshStreamEvent>) {
        if (event.type === 'message') {
          // Check for incremental text delta (streaming tokens)
          const delta = extractStreamDelta(event.data);
          if (delta !== null) {
            streamingText += delta;
            const currentText = streamingText;
            setMessages((prev) =>
              prev.map((msg, i) =>
                i === prev.length - 1 && msg.role === 'assistant'
                  ? { ...msg, items: [{ type: 'text' as const, content: currentText }] }
                  : msg,
              ),
            );
            continue;
          }

          // Complete message — replace streaming text with final items
          const displayItems = extractDisplayItems(event.data);
          if (displayItems) {
            streamingText = '';
            setMessages((prev) =>
              prev.map((msg, i) =>
                i === prev.length - 1 && msg.role === 'assistant'
                  ? { ...msg, items: displayItems }
                  : msg,
              ),
            );
          }
        } else if (event.type === 'error') {
          setMessages((prev) =>
            prev.map((msg, i) =>
              i === prev.length - 1 && msg.role === 'assistant'
                ? { ...msg, items: [{ type: 'text' as const, content: `Error: ${event.data.error}` }] }
                : msg,
            ),
          );
        }
      }
    } catch (e) {
      setMessages((prev) => [
        ...prev,
        { role: 'assistant', items: [{ type: 'text' as const, content: `Error: ${e instanceof Error ? e.message : 'Unknown error'}` }] },
      ]);
    } finally {
      setIsStreaming(false);
      fetchSessions();
    }
  }

  function handleNewSession() {
    setSessionId(null);
    setMessages([]);
    setInput('');
  }

  async function handleResumeSession(session: Session) {
    if (session.id === sessionId) return;
    if (isStreaming) return;

    setResuming(true);
    try {
      // Resume on server (handles paused/error states, no-ops if already active)
      if (session.status !== 'active') {
        const res = await fetch(`/api/sessions/${session.id}/resume`, { method: 'POST' });
        if (!res.ok) {
          const err = await res.json();
          throw new Error(err.error || 'Failed to resume session');
        }
      }

      // Load local message history
      setSessionId(session.id);
      setMessages(loadMessages(session.id));
      setInput('');
      fetchSessions();
    } catch (e) {
      alert(e instanceof Error ? e.message : 'Failed to resume session');
    } finally {
      setResuming(false);
    }
  }

  async function handleDeleteSession(e: React.MouseEvent, session: Session) {
    e.stopPropagation();
    if (isStreaming) return;

    try {
      await fetch(`/api/sessions/${session.id}`, { method: 'DELETE' });
      deleteMessages(session.id);
      if (session.id === sessionId) {
        setSessionId(null);
        setMessages([]);
      }
      fetchSessions();
    } catch { /* ignore */ }
  }

  const resumableSessions = sessions.filter(
    (s) => s.status === 'active' || s.status === 'paused' || s.status === 'error',
  );

  function formatTime(iso: string) {
    const d = new Date(iso);
    const now = new Date();
    const diffMs = now.getTime() - d.getTime();
    const diffMins = Math.floor(diffMs / 60_000);
    if (diffMins < 1) return 'just now';
    if (diffMins < 60) return `${diffMins}m ago`;
    const diffHours = Math.floor(diffMins / 60);
    if (diffHours < 24) return `${diffHours}h ago`;
    return d.toLocaleDateString();
  }

  return (
    <div className="flex h-screen">
      {/* Sidebar */}
      {sidebarOpen && (
        <aside className="w-64 flex-shrink-0 border-r border-zinc-800 flex flex-col bg-zinc-950">
          <div className="px-3 py-3 border-b border-zinc-800 flex items-center justify-between">
            <span className="text-sm font-medium text-zinc-300">Sessions</span>
            <button
              onClick={handleNewSession}
              className="px-2 py-1 text-xs rounded bg-blue-600 hover:bg-blue-500 transition-colors"
            >
              + New
            </button>
          </div>

          <div className="flex-1 overflow-y-auto">
            {loadingSessions && resumableSessions.length === 0 && (
              <p className="text-xs text-zinc-500 px-3 py-4 text-center">Loading...</p>
            )}
            {!loadingSessions && resumableSessions.length === 0 && (
              <p className="text-xs text-zinc-500 px-3 py-4 text-center">No sessions yet</p>
            )}
            {resumableSessions.map((s) => (
              <button
                key={s.id}
                onClick={() => handleResumeSession(s)}
                disabled={resuming || isStreaming}
                className={`w-full text-left px-3 py-2.5 border-b border-zinc-800/50 hover:bg-zinc-800/50 transition-colors group ${
                  s.id === sessionId ? 'bg-zinc-800' : ''
                } disabled:opacity-50`}
              >
                <div className="flex items-center justify-between">
                  <span className="text-xs font-mono text-zinc-400 truncate">
                    {s.id.slice(0, 8)}
                  </span>
                  <div className="flex items-center gap-1.5">
                    <span className={`inline-block w-1.5 h-1.5 rounded-full ${
                      s.status === 'active' ? 'bg-green-400' :
                      s.status === 'paused' ? 'bg-yellow-400' :
                      'bg-red-400'
                    }`} />
                    <button
                      onClick={(e) => handleDeleteSession(e, s)}
                      className="text-zinc-600 hover:text-red-400 opacity-0 group-hover:opacity-100 transition-opacity text-xs"
                      title="End session"
                    >
                      x
                    </button>
                  </div>
                </div>
                <div className="text-[11px] text-zinc-500 mt-0.5">
                  {formatTime(s.lastActiveAt)}
                </div>
              </button>
            ))}
          </div>
        </aside>
      )}

      {/* Main chat area */}
      <div className="flex flex-col flex-1 min-w-0">
        {/* Header */}
        <header className="flex items-center justify-between px-4 py-3 border-b border-zinc-800">
          <div className="flex items-center gap-2">
            <button
              onClick={() => setSidebarOpen(!sidebarOpen)}
              className="px-2 py-1 text-sm rounded hover:bg-zinc-800 transition-colors"
              title={sidebarOpen ? 'Hide sidebar' : 'Show sidebar'}
            >
              {sidebarOpen ? '\u2190' : '\u2192'}
            </button>
            <h1 className="text-lg font-semibold">QA Bot</h1>
            {sessionId && (
              <span className="text-xs font-mono text-zinc-500">
                {sessionId.slice(0, 8)}
              </span>
            )}
          </div>
          <button
            onClick={handleNewSession}
            className="px-3 py-1.5 text-sm rounded-md bg-zinc-800 hover:bg-zinc-700 transition-colors"
          >
            New Session
          </button>
        </header>

        {/* Messages */}
        <div className="flex-1 overflow-y-auto px-4 py-6 space-y-4">
          {messages.length === 0 && (
            <p className="text-center text-zinc-500 mt-20">
              {resuming ? 'Resuming session...' : 'Send a message to start a conversation.'}
            </p>
          )}
          {messages.map((msg, i) => (
            <div
              key={i}
              className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}
            >
              <div className={`max-w-[80%] space-y-2`}>
                {msg.items.length === 0 && isStreaming && i === messages.length - 1 && (
                  <div className="rounded-lg px-4 py-2.5 bg-zinc-800 text-zinc-400 text-sm">
                    Thinking...
                  </div>
                )}
                {msg.items.map((item, j) => {
                  if (item.type === 'text') {
                    return (
                      <div
                        key={j}
                        className={`rounded-lg px-4 py-2.5 whitespace-pre-wrap ${
                          msg.role === 'user'
                            ? 'bg-blue-600 text-white'
                            : 'bg-zinc-800 text-zinc-100'
                        }`}
                      >
                        {item.content}
                      </div>
                    );
                  }
                  if (item.type === 'tool_use') {
                    return (
                      <div key={j} className="rounded-lg px-3 py-2 bg-zinc-900 border border-zinc-700 text-xs font-mono">
                        <span className="text-amber-400">{item.toolName}</span>
                        {item.toolInput && (
                          <span className="text-zinc-400 ml-2">{item.toolInput}</span>
                        )}
                      </div>
                    );
                  }
                  if (item.type === 'tool_result') {
                    return (
                      <pre key={j} className="rounded-lg px-3 py-2 bg-zinc-900 border border-zinc-700 text-xs font-mono text-zinc-300 overflow-x-auto max-h-48 overflow-y-auto">
                        {item.content}
                      </pre>
                    );
                  }
                  return null;
                })}
              </div>
            </div>
          ))}
          <div ref={messagesEndRef} />
        </div>

        {/* Input */}
        <div className="border-t border-zinc-800 px-4 py-3">
          <form
            onSubmit={(e) => {
              e.preventDefault();
              handleSend();
            }}
            className="flex gap-2"
          >
            <input
              type="text"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="Type a message..."
              disabled={isStreaming || resuming}
              className="flex-1 rounded-md bg-zinc-800 border border-zinc-700 px-3 py-2 text-sm placeholder:text-zinc-500 focus:outline-none focus:ring-1 focus:ring-blue-500 disabled:opacity-50"
            />
            <button
              type="submit"
              disabled={isStreaming || resuming || !input.trim()}
              className="px-4 py-2 text-sm font-medium rounded-md bg-blue-600 hover:bg-blue-500 disabled:opacity-50 disabled:hover:bg-blue-600 transition-colors"
            >
              Send
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}
