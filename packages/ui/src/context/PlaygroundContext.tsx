import { createContext, useContext, useState, useCallback } from 'react';
import type { AshClient, Agent, Session } from '@ash-ai/sdk';
import { usePlaygroundChat, type UsePlaygroundChatReturn } from '../hooks/usePlaygroundChat.js';
import { useAgents, type UseAgentsReturn } from '../hooks/useAgents.js';
import { useSessions, type UseSessionsReturn } from '../hooks/useSessions.js';
import { useHealthCheck, type UseHealthCheckReturn } from '../hooks/useHealthCheck.js';
import { useFileUpload, type UseFileUploadReturn } from '../hooks/useFileUpload.js';

export interface PlaygroundContextValue {
  client: AshClient;
  chat: UsePlaygroundChatReturn;
  agents: UseAgentsReturn;
  sessions: UseSessionsReturn;
  health: UseHealthCheckReturn;
  fileUpload: UseFileUploadReturn;
  selectedAgent: string;
  setSelectedAgent: (slug: string) => void;
  showHistory: boolean;
  setShowHistory: (show: boolean) => void;
  terminalOpen: boolean;
  setTerminalOpen: (open: boolean) => void;
  filesOpen: boolean;
  setFilesOpen: (open: boolean) => void;
}

const PlaygroundCtx = createContext<PlaygroundContextValue | null>(null);

export function usePlaygroundContext(): PlaygroundContextValue {
  const ctx = useContext(PlaygroundCtx);
  if (!ctx) throw new Error('usePlaygroundContext must be used within <PlaygroundProvider>');
  return ctx;
}

export interface PlaygroundProviderProps {
  client: AshClient;
  defaultAgent?: string;
  children: React.ReactNode;
}

export function PlaygroundProvider({ client, defaultAgent, children }: PlaygroundProviderProps) {
  const [selectedAgent, setSelectedAgentRaw] = useState(defaultAgent || '');
  const [showHistory, setShowHistory] = useState(false);
  const [terminalOpen, setTerminalOpen] = useState(false);
  const [filesOpen, setFilesOpen] = useState(false);

  const agentsHook = useAgents({ client });
  const health = useHealthCheck({ client });

  // Auto-select first agent if none provided
  const resolvedAgent = selectedAgent || agentsHook.agents[0]?.slug || agentsHook.agents[0]?.name || '';

  const chat = usePlaygroundChat({
    client,
    agentSlug: resolvedAgent,
  });

  const sessions = useSessions({
    client,
    agent: resolvedAgent,
    enabled: showHistory,
  });

  const fileUpload = useFileUpload({
    client,
    onFilesChange: chat.setAttachedFiles,
    onError: (err) => {
      // Surface upload errors as chat errors
      chat.setMessages((prev) => [
        ...prev,
        { id: `err-${Date.now()}`, role: 'system', content: err },
      ]);
    },
  });

  const setSelectedAgent = useCallback((slug: string) => {
    setSelectedAgentRaw(slug);
    chat.startNewChat();
  }, [chat]);

  const value: PlaygroundContextValue = {
    client,
    chat,
    agents: agentsHook,
    sessions,
    health,
    fileUpload,
    selectedAgent: resolvedAgent,
    setSelectedAgent,
    showHistory,
    setShowHistory,
    terminalOpen,
    setTerminalOpen,
    filesOpen,
    setFilesOpen,
  };

  return <PlaygroundCtx.Provider value={value}>{children}</PlaygroundCtx.Provider>;
}
