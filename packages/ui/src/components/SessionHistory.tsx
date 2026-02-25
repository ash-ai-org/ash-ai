import { cn } from '../utils.js';
import type { Session } from '@ash-ai/sdk';

export interface SessionHistoryProps {
  sessions: Session[];
  activeSessionId: string | null;
  onSelectSession: (session: Session) => void;
  className?: string;
}

export function SessionHistory({ sessions, activeSessionId, onSelectSession, className }: SessionHistoryProps) {
  return (
    <div className={cn('w-64 shrink-0 rounded-lg border border-white/10 bg-white/[0.02] flex flex-col overflow-hidden', className)}>
      <div className="px-3 py-2 border-b border-white/10 text-xs font-medium text-white/40 uppercase tracking-wider">
        Recent Sessions
      </div>
      <div className="flex-1 overflow-auto scrollbar-thin">
        {sessions.length === 0 ? (
          <p className="px-3 py-6 text-center text-xs text-white/30">No sessions yet</p>
        ) : (
          sessions.map((s) => (
            <button
              key={s.id}
              onClick={() => onSelectSession(s)}
              className={cn(
                'w-full text-left px-3 py-2.5 border-b border-white/5 hover:bg-white/5 transition-colors',
                activeSessionId === s.id && 'border-l-2 border-l-accent bg-accent/5'
              )}
            >
              <div className="text-xs font-medium text-white truncate">{s.agentName}</div>
              <div className="text-[10px] text-white/30 mt-0.5">
                {s.createdAt ? new Date(s.createdAt).toLocaleDateString() : 'No events'}
                <span className="mx-1 text-white/15">|</span>
                <span className={cn(
                  s.status === 'active' ? 'text-green-400' : 'text-white/30'
                )}>{s.status}</span>
              </div>
            </button>
          ))
        )}
      </div>
    </div>
  );
}
