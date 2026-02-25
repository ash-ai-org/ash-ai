import { cn } from '../utils.js';
import type { Agent } from '@ash-ai/sdk';
import { StatusIndicator } from './StatusIndicator.js';
import { Clock, Plus } from '../icons.js';

export interface PlaygroundHeaderProps {
  agents: Agent[];
  selectedAgent: string;
  onAgentChange: (slug: string) => void;
  runtimeConnected: boolean | null;
  showHistory: boolean;
  onToggleHistory: () => void;
  sessionId: string | null;
  onNewChat: () => void;
  className?: string;
}

export function PlaygroundHeader({
  agents,
  selectedAgent,
  onAgentChange,
  runtimeConnected,
  showHistory,
  onToggleHistory,
  sessionId,
  onNewChat,
  className,
}: PlaygroundHeaderProps) {
  return (
    <div className={cn('shrink-0 flex items-center justify-between border-b border-white/10 pb-3 mb-4', className)}>
      <div className="flex items-center gap-3">
        <div className="flex items-center gap-2 text-xs font-medium text-white/40 uppercase tracking-wider">
          <span className="w-1.5 h-1.5 rounded-full bg-accent animate-pulse" />
          PLAYGROUND
        </div>

        <select
          value={selectedAgent}
          onChange={(e) => onAgentChange(e.target.value)}
          className="rounded-lg border border-white/10 bg-white/5 px-3 py-1.5 text-sm text-white focus:border-accent/50 focus:outline-none"
        >
          <option value="" disabled>Select agent...</option>
          {agents.map((a) => (
            <option key={a.id} value={a.slug || a.name}>{a.name}</option>
          ))}
        </select>

        <StatusIndicator connected={runtimeConnected} />
      </div>

      <div className="flex items-center gap-2">
        <button
          onClick={onToggleHistory}
          className={cn(
            'flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium border transition-all',
            showHistory
              ? 'bg-accent/10 text-accent border-accent/30'
              : 'bg-white/5 text-white/50 border-white/10 hover:bg-white/10'
          )}
        >
          <Clock className="h-3 w-3" />
          History
        </button>
        {selectedAgent && (
          <button
            onClick={onNewChat}
            className={cn(
              'flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium border transition-all',
              !sessionId
                ? 'bg-accent/10 text-accent border-accent/30'
                : 'bg-white/5 text-white/50 border-white/10 hover:bg-white/10'
            )}
          >
            <Plus className="h-3 w-3" />
            New Chat
          </button>
        )}
      </div>
    </div>
  );
}
