import type { AshClient } from '@ash-ai/sdk';
import { cn } from '../utils.js';
import { PlaygroundProvider, usePlaygroundContext } from '../context/PlaygroundContext.js';
import { PlaygroundHeader } from './PlaygroundHeader.js';
import { Chat } from './Chat.js';
import { SessionHistory } from './SessionHistory.js';
import { Terminal } from './Terminal.js';
import { FileBrowser } from './FileBrowser.js';
import { BottomPanels } from './BottomPanels.js';
import { useTerminal } from '../hooks/useTerminal.js';
import { useFileBrowser } from '../hooks/useFileBrowser.js';

export interface PlaygroundProps {
  client: AshClient;
  defaultAgent?: string;
  className?: string;
}

function PlaygroundInner({ className }: { className?: string }) {
  const ctx = usePlaygroundContext();
  const {
    client,
    chat,
    agents,
    sessions,
    health,
    fileUpload,
    selectedAgent,
    setSelectedAgent,
    showHistory,
    setShowHistory,
    terminalOpen,
    setTerminalOpen,
    filesOpen,
    setFilesOpen,
  } = ctx;

  const selectedAgentObj = agents.agents.find((a) => (a.slug || a.name) === selectedAgent);
  const isActive = chat.sessionId !== null;

  return (
    <div className={cn('flex flex-col', className)}>
      {/* Header */}
      <PlaygroundHeader
        agents={agents.agents}
        selectedAgent={selectedAgent}
        onAgentChange={setSelectedAgent}
        runtimeConnected={health.connected}
        showHistory={showHistory}
        onToggleHistory={() => setShowHistory(!showHistory)}
        sessionId={chat.sessionId}
        onNewChat={chat.startNewChat}
      />

      {/* Main area */}
      <div className="flex flex-1 gap-4 min-h-0">
        {/* History sidebar */}
        {showHistory && (
          <SessionHistory
            sessions={sessions.sessions}
            activeSessionId={chat.sessionId}
            onSelectSession={(s) => {
              chat.loadSession(s.id);
              setShowHistory(false);
            }}
          />
        )}

        {/* Chat + panels */}
        <div className="flex-1 flex flex-col min-w-0 gap-0">
          <Chat
            messages={chat.messages}
            input={chat.input}
            onInputChange={chat.setInput}
            onSend={chat.send}
            sending={chat.sending}
            loading={chat.loading}
            error={chat.error}
            isActive={isActive}
            agentName={selectedAgentObj?.name}
            attachedFiles={chat.attachedFiles}
            onFileSelect={fileUpload.handleFileSelect}
            onRemoveFile={fileUpload.removeFile}
            className={cn(
              'rounded-lg border border-white/10 bg-white/[0.02]',
              terminalOpen && chat.sessionId ? 'flex-1 min-h-0' : 'flex-1'
            )}
          />

          {/* Terminal panel */}
          {chat.sessionId && (
            <div className={cn(
              'shrink-0 transition-all',
              terminalOpen ? 'h-64' : 'h-0'
            )}>
              {terminalOpen && (
                <TerminalPanel
                  client={client}
                  sessionId={chat.sessionId}
                />
              )}
            </div>
          )}

          {/* Files panel */}
          {chat.sessionId && (
            <div className={cn(
              'shrink-0 transition-all',
              filesOpen ? 'h-72' : 'h-0'
            )}>
              {filesOpen && (
                <FileBrowserPanel
                  client={client}
                  sessionId={chat.sessionId}
                />
              )}
            </div>
          )}

          {/* Bottom toggles */}
          {chat.sessionId && (
            <BottomPanels
              terminalOpen={terminalOpen}
              onToggleTerminal={() => setTerminalOpen(!terminalOpen)}
              filesOpen={filesOpen}
              onToggleFiles={() => setFilesOpen(!filesOpen)}
            />
          )}
        </div>
      </div>
    </div>
  );
}

/** Internal wrapper that connects the Terminal component with the useTerminal hook */
function TerminalPanel({ client, sessionId }: { client: AshClient; sessionId: string }) {
  const { logs, connected, clearLogs } = useTerminal({ client, sessionId });
  return (
    <Terminal
      logs={logs}
      connected={connected}
      onClear={clearLogs}
      className="h-full rounded-t-none border-t-0"
    />
  );
}

/** Internal wrapper that connects the FileBrowser component with the useFileBrowser hook */
function FileBrowserPanel({ client, sessionId }: { client: AshClient; sessionId: string }) {
  const fb = useFileBrowser({ client, sessionId });
  return (
    <FileBrowser
      files={fb.files}
      source={fb.source}
      loading={fb.loading}
      selectedPath={fb.selectedPath}
      fileContent={fb.fileContent}
      fileLoading={fb.fileLoading}
      fileError={fb.fileError}
      expandedDirs={fb.expandedDirs}
      filter={fb.filter}
      onFilterChange={fb.setFilter}
      onSelectFile={fb.selectFile}
      onToggleDir={fb.toggleDir}
      onRefresh={fb.refresh}
      className="h-full border-t border-white/10"
    />
  );
}

export function Playground({ client, defaultAgent, className }: PlaygroundProps) {
  return (
    <PlaygroundProvider client={client} defaultAgent={defaultAgent}>
      <PlaygroundInner className={className} />
    </PlaygroundProvider>
  );
}
