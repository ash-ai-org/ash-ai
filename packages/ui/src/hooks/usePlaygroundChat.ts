import { useState, useCallback, useRef } from 'react';
import type { AshClient } from '@ash-ai/sdk';
import type { ChatMessage, ToolCall, AttachedFile } from '../types.js';

export interface UsePlaygroundChatOptions {
  client: AshClient;
  agentSlug: string;
  initialSessionId?: string;
  onSessionStart?: (sessionId: string) => void;
  onError?: (error: string) => void;
}

export interface UsePlaygroundChatReturn {
  messages: ChatMessage[];
  input: string;
  setInput: (input: string) => void;
  sending: boolean;
  loading: boolean;
  error: string | null;
  sessionId: string | null;
  attachedFiles: AttachedFile[];
  setAttachedFiles: React.Dispatch<React.SetStateAction<AttachedFile[]>>;
  send: () => Promise<void>;
  loadSession: (sessionId: string) => Promise<void>;
  startNewChat: () => void;
  setMessages: React.Dispatch<React.SetStateAction<ChatMessage[]>>;
}

export function usePlaygroundChat({
  client,
  agentSlug,
  initialSessionId,
  onSessionStart,
  onError,
}: UsePlaygroundChatOptions): UsePlaygroundChatReturn {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState('');
  const [sending, setSending] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sessionId, setSessionId] = useState<string | null>(initialSessionId ?? null);
  const [attachedFiles, setAttachedFiles] = useState<AttachedFile[]>([]);
  const sendingRef = useRef(false);

  const startNewChat = useCallback(() => {
    setSessionId(null);
    setMessages([]);
    setAttachedFiles([]);
    setError(null);
  }, []);

  const loadSession = useCallback(async (sid: string) => {
    setSessionId(sid);
    setLoading(true);
    setError(null);

    try {
      const sdkMessages = await client.listMessages(sid);
      const msgs: ChatMessage[] = [];

      for (let i = 0; i < sdkMessages.length; i++) {
        const m = sdkMessages[i];
        let text = '';
        const tools: ToolCall[] = [];

        let parsed: unknown;
        try {
          parsed = JSON.parse(m.content);
        } catch {
          parsed = m.content;
        }

        const data = parsed as Record<string, any>;

        // Assistant message with content blocks
        if (data.type === 'assistant' && Array.isArray(data.message?.content)) {
          for (const b of data.message.content) {
            if (b.type === 'text' && b.text) {
              text += (text ? '\n' : '') + b.text;
            } else if (b.type === 'tool_use') {
              tools.push({
                id: b.id || `tool-${tools.length}`,
                name: b.name || 'unknown',
                input: b.input,
                state: 'completed',
              });
            }
          }
        }

        // Tool result message
        if (data.type === 'user' && data.tool_use_result) {
          const r = data.tool_use_result;
          const match = tools.find((tc) => tc.id === r.tool_use_id) ||
            (msgs.length > 0 ? msgs[msgs.length - 1].toolCalls?.find((tc) => tc.id === r.tool_use_id) : undefined);
          if (match) {
            match.output = r.stdout ?? r.content;
            match.isError = r.is_error ?? false;
            match.state = r.is_error ? 'error' : 'completed';
          }
          continue; // Tool results get merged into the previous assistant message
        }

        // User message
        if (data.type === 'user' && !data.tool_use_result) {
          const content = Array.isArray(data.content)
            ? data.content.filter((b: any) => b.type === 'text').map((b: any) => b.text).join('\n')
            : typeof data.content === 'string' ? data.content : '';
          if (content) {
            msgs.push({
              id: m.id || `msg-${i}`,
              role: 'user',
              content,
              timestamp: m.createdAt,
            });
          }
          continue;
        }

        // Result message (turn complete)
        if (data.type === 'result' && typeof data.result === 'string') {
          text = data.result;
        }

        if (text || tools.length > 0) {
          msgs.push({
            id: m.id || `msg-${i}`,
            role: m.role === 'user' ? 'user' : 'assistant',
            content: text,
            toolCalls: tools.length > 0 ? tools : undefined,
            timestamp: m.createdAt,
          });
        }
      }
      setMessages(msgs);
    } catch {
      setMessages([{ id: 'err', role: 'system', content: 'Failed to load session messages.' }]);
    } finally {
      setLoading(false);
    }
  }, [client]);

  const send = useCallback(async () => {
    const textContent = input.trim();
    const readyFiles = attachedFiles.filter((f) => !f.uploading);
    if ((!textContent && readyFiles.length === 0) || !agentSlug || sendingRef.current) return;

    let content = textContent;
    if (readyFiles.length > 0) {
      const fileRefs = readyFiles.map((f) => `[Attached file: ${f.filename}](${f.url})`).join('\n');
      content = content ? `${content}\n\n${fileRefs}` : fileRefs;
    }

    // Create session on-the-fly if none exists
    let activeSessionId = sessionId;
    if (!activeSessionId) {
      setSending(true);
      sendingRef.current = true;
      setError(null);
      try {
        const session = await client.createSession(agentSlug);
        activeSessionId = session.id;
        setSessionId(activeSessionId);
        onSessionStart?.(activeSessionId);
      } catch (err) {
        const msg = err instanceof Error ? err.message : 'Failed to create session';
        setError(msg);
        onError?.(msg);
        setSending(false);
        sendingRef.current = false;
        return;
      }
    }

    setInput('');
    setAttachedFiles([]);

    const userMsg: ChatMessage = {
      id: `user-${Date.now()}`,
      role: 'user',
      content,
      timestamp: new Date().toISOString(),
    };
    setMessages((prev) => [...prev, userMsg]);
    setSending(true);
    sendingRef.current = true;

    const assistantId = `assistant-${Date.now()}`;
    setMessages((prev) => [...prev, { id: assistantId, role: 'assistant', content: '', isStreaming: true }]);

    try {
      let fullContent = '';
      const toolCalls: ToolCall[] = [];

      for await (const event of client.sendMessageStream(activeSessionId, content, { includePartialMessages: true })) {
        if (event.type === 'text_delta') {
          const delta = (event.data as { delta: string }).delta || '';
          fullContent += delta;
          setMessages((prev) => prev.map((m) =>
            m.id === assistantId ? { ...m, content: fullContent, toolCalls: [...toolCalls], isStreaming: true } : m
          ));
        } else if (event.type === 'tool_use') {
          const data = event.data as { id: string; name: string; input: unknown };
          const tc: ToolCall = {
            id: data.id || `tool-${Date.now()}-${toolCalls.length}`,
            name: data.name || 'unknown',
            input: data.input,
            state: 'running',
          };
          toolCalls.push(tc);
          setMessages((prev) => prev.map((m) =>
            m.id === assistantId ? { ...m, content: fullContent, toolCalls: [...toolCalls], isStreaming: true } : m
          ));
        } else if (event.type === 'tool_result') {
          const data = event.data as { tool_use_id: string; content: unknown; is_error?: boolean };
          const matchIdx = toolCalls.findIndex((tc) => tc.id === data.tool_use_id);
          if (matchIdx !== -1) {
            toolCalls[matchIdx] = {
              ...toolCalls[matchIdx],
              output: data.content,
              isError: data.is_error ?? false,
              state: data.is_error ? 'error' : 'completed',
            };
          } else {
            toolCalls.push({
              id: data.tool_use_id || `result-${Date.now()}`,
              name: 'tool_result',
              input: undefined,
              output: data.content,
              isError: data.is_error ?? false,
              state: data.is_error ? 'error' : 'completed',
            });
          }
          setMessages((prev) => prev.map((m) =>
            m.id === assistantId ? { ...m, content: fullContent, toolCalls: [...toolCalls], isStreaming: true } : m
          ));
        } else if (event.type === 'turn_complete' || event.type === 'done') {
          const data = event.data as { result?: string };
          if (!fullContent && data.result) {
            fullContent = data.result;
          }
          for (const tc of toolCalls) {
            if (tc.state === 'running' || tc.state === 'pending') tc.state = 'completed';
          }
          setMessages((prev) => prev.map((m) =>
            m.id === assistantId ? { ...m, content: fullContent || '(no response)', toolCalls: [...toolCalls], isStreaming: false, timestamp: new Date().toISOString() } : m
          ));
        } else if (event.type === 'error') {
          const data = event.data as { error: string };
          const errText = data.error || 'Unknown error';
          setMessages((prev) => prev.map((m) =>
            m.id === assistantId ? { ...m, role: 'system' as const, content: `Error: ${errText}`, isStreaming: false } : m
          ));
        }
      }

      // Finalize
      for (const tc of toolCalls) {
        if (tc.state === 'running' || tc.state === 'pending') tc.state = 'completed';
      }
      setMessages((prev) => prev.map((m) =>
        m.id === assistantId && m.isStreaming
          ? { ...m, content: fullContent || '(no response)', toolCalls: toolCalls.length > 0 ? [...toolCalls] : undefined, isStreaming: false, timestamp: new Date().toISOString() }
          : m
      ));
    } catch (err) {
      const errMsg = err instanceof Error ? err.message : 'Failed to send';
      setMessages((prev) => prev.map((m) =>
        m.id === assistantId ? { ...m, role: 'system' as const, content: `Error: ${errMsg}`, isStreaming: false } : m
      ));
    } finally {
      setSending(false);
      sendingRef.current = false;
    }
  }, [input, attachedFiles, sessionId, agentSlug, client, onSessionStart, onError]);

  return {
    messages,
    input,
    setInput,
    sending,
    loading,
    error,
    sessionId,
    attachedFiles,
    setAttachedFiles,
    send,
    loadSession,
    startNewChat,
    setMessages,
  };
}
