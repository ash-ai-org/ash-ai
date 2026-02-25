import { cn } from '../utils.js';
import type { ChatMessage, AttachedFile } from '../types.js';
import { ChatMessages } from './ChatMessages.js';
import { ChatInput } from './ChatInput.js';
import { MessageSquare, Bot, Loader2 } from '../icons.js';

export interface ChatProps {
  messages: ChatMessage[];
  input: string;
  onInputChange: (value: string) => void;
  onSend: () => void;
  sending: boolean;
  loading?: boolean;
  error?: string | null;
  /** Whether an active session exists */
  isActive: boolean;
  agentName?: string;
  attachedFiles?: AttachedFile[];
  onFileSelect?: (e: React.ChangeEvent<HTMLInputElement>) => void;
  onRemoveFile?: (fileId: string) => void;
  className?: string;
}

export function Chat({
  messages,
  input,
  onInputChange,
  onSend,
  sending,
  loading,
  error,
  isActive,
  agentName,
  attachedFiles,
  onFileSelect,
  onRemoveFile,
  className,
}: ChatProps) {
  return (
    <div className={cn('flex flex-col overflow-hidden', className)}>
      {loading ? (
        <div className="flex flex-1 items-center justify-center">
          <Loader2 className="mr-2 h-5 w-5 animate-spin text-white/40" />
          <span className="text-sm text-white/50">Loading session...</span>
        </div>
      ) : !isActive ? (
        <div className="flex flex-1 flex-col items-center justify-center text-center px-8">
          <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-accent/10 border border-accent/20">
            <MessageSquare className="h-8 w-8 text-accent" />
          </div>
          <h2 className="text-xl font-semibold text-white">Agent Playground</h2>
          <p className="mt-2 max-w-md text-sm text-white/50">
            {agentName
              ? `Start a new conversation with ${agentName}, or resume a past session from History.`
              : 'Select an agent above to get started.'}
          </p>
          {agentName && (
            <div className="mt-4 inline-flex items-center gap-2 rounded-full bg-white/10 px-4 py-2 text-sm text-white/70">
              <Bot className="h-4 w-4 text-accent" />
              {agentName}
            </div>
          )}
        </div>
      ) : (
        <ChatMessages messages={messages} />
      )}

      {/* Error banner */}
      {error && (
        <div className="shrink-0 mx-4 mb-2 rounded-xl border border-red-500/20 bg-red-500/10 px-4 py-2.5 text-sm text-red-400">
          {error}
        </div>
      )}

      {/* Input */}
      {agentName && (
        <ChatInput
          input={input}
          onInputChange={onInputChange}
          onSend={onSend}
          sending={sending}
          placeholder={isActive ? 'Send a message...' : 'Send a message to start a new session...'}
          attachedFiles={attachedFiles}
          onFileSelect={onFileSelect}
          onRemoveFile={onRemoveFile}
        />
      )}
    </div>
  );
}
