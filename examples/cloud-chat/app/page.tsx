'use client';

import { useState, useRef, useEffect, useCallback } from 'react';
import { parseSSEStream, extractDisplayItems, extractStreamDelta } from '@ash-ai/sdk';
import type { AshStreamEvent, DisplayItem, Agent } from '@ash-ai/sdk';

// -- Types ------------------------------------------------------------------

interface Message {
  role: 'user' | 'assistant';
  items: DisplayItem[];
}

// -- Component --------------------------------------------------------------

export default function CloudChat() {
  const [agents, setAgents] = useState<Agent[]>([]);
  const [selectedAgent, setSelectedAgent] = useState<string>('');
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [isStreaming, setIsStreaming] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  // Fetch agents on mount
  const fetchAgents = useCallback(async () => {
    try {
      const res = await fetch('/api/agents');
      if (res.ok) {
        const { agents: list } = await res.json();
        setAgents(list);
        if (list.length > 0 && !selectedAgent) {
          // Use slug if available, fall back to name
          setSelectedAgent(list[0].slug || list[0].name);
        }
      }
    } catch {
      setError('Failed to load agents. Check your API key.');
    }
  }, [selectedAgent]);

  useEffect(() => {
    fetchAgents();
  }, [fetchAgents]);

  async function createSession(): Promise<string> {
    const res = await fetch('/api/sessions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ agent: selectedAgent }),
    });
    if (!res.ok) {
      const err = await res.json();
      throw new Error(err.error || 'Failed to create session');
    }
    const { session } = await res.json();
    setSessionId(session.id);
    return session.id;
  }

  async function handleSend() {
    const text = input.trim();
    if (!text || isStreaming || !selectedAgent) return;

    setInput('');
    setError(null);
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

          // Complete message -- replace streaming text with final items
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
          const errData = event.data as Record<string, unknown>;
          throw new Error((errData.error as string) || 'Stream error');
        }
      }

      // If no text came through, show a fallback
      if (!streamingText) {
        setMessages((prev) =>
          prev.map((msg, i) =>
            i === prev.length - 1 && msg.role === 'assistant' && msg.items.length === 0
              ? { ...msg, items: [{ type: 'text' as const, content: '[No response]' }] }
              : msg,
          ),
        );
      }
    } catch (e) {
      const errorMsg = e instanceof Error ? e.message : 'Unknown error';
      setMessages((prev) => [
        ...prev,
        { role: 'assistant', items: [{ type: 'text' as const, content: `Error: ${errorMsg}` }] },
      ]);
    } finally {
      setIsStreaming(false);
    }
  }

  function handleNewSession() {
    setSessionId(null);
    setMessages([]);
    setInput('');
    setError(null);
  }

  return (
    <div className="flex flex-col h-screen max-w-3xl mx-auto">
      {/* Header */}
      <header className="flex items-center justify-between px-4 py-3 border-b border-zinc-800">
        <div className="flex items-center gap-3">
          <h1 className="text-lg font-semibold">Ash Cloud Chat</h1>
          {sessionId && (
            <span className="text-xs font-mono text-zinc-500">{sessionId.slice(0, 8)}</span>
          )}
        </div>
        <div className="flex items-center gap-2">
          {/* Agent picker */}
          <select
            value={selectedAgent}
            onChange={(e) => {
              setSelectedAgent(e.target.value);
              handleNewSession();
            }}
            disabled={isStreaming}
            className="rounded-md bg-zinc-800 border border-zinc-700 px-2 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-blue-500 disabled:opacity-50"
          >
            {agents.length === 0 && <option value="">Loading agents...</option>}
            {agents.map((a) => (
              <option key={a.slug || a.name} value={a.slug || a.name}>
                {a.name}
              </option>
            ))}
          </select>
          <button
            onClick={handleNewSession}
            disabled={isStreaming}
            className="px-3 py-1.5 text-sm rounded-md bg-zinc-800 hover:bg-zinc-700 disabled:opacity-50 transition-colors"
          >
            New Session
          </button>
        </div>
      </header>

      {/* Error banner */}
      {error && (
        <div className="px-4 py-2 bg-red-900/30 border-b border-red-800 text-sm text-red-300">
          {error}
        </div>
      )}

      {/* Messages */}
      <div className="flex-1 overflow-y-auto px-4 py-6 space-y-4">
        {messages.length === 0 && (
          <div className="text-center text-zinc-500 mt-20 space-y-2">
            <p>Send a message to start a conversation.</p>
            {selectedAgent && (
              <p className="text-xs text-zinc-600">
                Agent: <span className="text-zinc-400">{selectedAgent}</span>
              </p>
            )}
          </div>
        )}
        {messages.map((msg, i) => (
          <div key={i} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
            <div className="max-w-[80%] space-y-2">
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
            placeholder={selectedAgent ? 'Type a message...' : 'Select an agent first...'}
            disabled={isStreaming || !selectedAgent}
            className="flex-1 rounded-md bg-zinc-800 border border-zinc-700 px-3 py-2 text-sm placeholder:text-zinc-500 focus:outline-none focus:ring-1 focus:ring-blue-500 disabled:opacity-50"
          />
          <button
            type="submit"
            disabled={isStreaming || !input.trim() || !selectedAgent}
            className="px-4 py-2 text-sm font-medium rounded-md bg-blue-600 hover:bg-blue-500 disabled:opacity-50 disabled:hover:bg-blue-600 transition-colors"
          >
            Send
          </button>
        </form>
      </div>
    </div>
  );
}
