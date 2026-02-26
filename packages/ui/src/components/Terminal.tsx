import { useEffect, useState, useRef, useCallback } from 'react';
import { cn } from '../utils.js';
import { formatTimestamp } from '../utils.js';
import type { LogEntry } from '../types.js';
import {
  Terminal as TerminalIcon,
  Search,
  Trash2,
  ArrowDown,
  Wifi,
  WifiOff,
  Clock,
} from '../icons.js';

const levelColors: Record<string, string> = {
  stdout: 'text-green-300',
  stderr: 'text-red-400',
  system: 'text-white/40',
};

export interface TerminalProps {
  logs: LogEntry[];
  connected: boolean | null;
  onClear?: () => void;
  className?: string;
}

export function Terminal({ logs, connected, onClear, className }: TerminalProps) {
  const [filter, setFilter] = useState('');
  const [showTimestamps, setShowTimestamps] = useState(false);
  const [autoScroll, setAutoScroll] = useState(true);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (autoScroll && containerRef.current) {
      containerRef.current.scrollTop = containerRef.current.scrollHeight;
    }
  }, [logs, autoScroll]);

  const handleScroll = useCallback(() => {
    if (!containerRef.current) return;
    const { scrollTop, scrollHeight, clientHeight } = containerRef.current;
    const atBottom = scrollHeight - scrollTop - clientHeight < 40;
    setAutoScroll(atBottom);
  }, []);

  const scrollToBottom = () => {
    if (containerRef.current) {
      containerRef.current.scrollTop = containerRef.current.scrollHeight;
      setAutoScroll(true);
    }
  };

  const filteredLogs = filter
    ? logs.filter((l) => l.text.toLowerCase().includes(filter.toLowerCase()))
    : logs;

  return (
    <div className={cn('flex flex-col bg-[#0d1117] rounded-lg border border-white/10 overflow-hidden', className)}>
      {/* Toolbar */}
      <div className="flex items-center gap-2 border-b border-white/10 px-3 py-2 bg-[#161b22]">
        <TerminalIcon className="h-3.5 w-3.5 text-white/50" />
        <span className="text-xs font-medium text-white/60">Terminal</span>

        <div className={cn(
          'ml-1 flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-medium',
          connected === true ? 'text-green-400' : connected === false ? 'text-red-400' : 'text-white/30'
        )}>
          {connected === true ? (
            <><Wifi className="h-2.5 w-2.5" /> Live</>
          ) : connected === false ? (
            <><WifiOff className="h-2.5 w-2.5" /> Disconnected</>
          ) : (
            'Connecting...'
          )}
        </div>

        <div className="flex-1" />

        <span className="text-[10px] text-white/30">
          {filteredLogs.length.toLocaleString()} line{filteredLogs.length !== 1 ? 's' : ''}
        </span>

        <button
          onClick={() => setShowTimestamps(!showTimestamps)}
          className={cn(
            'rounded p-1 text-white/40 hover:bg-white/10 hover:text-white/70 transition-colors',
            showTimestamps && 'bg-white/10 text-white/70'
          )}
          title="Toggle timestamps"
        >
          <Clock className="h-3 w-3" />
        </button>

        <div className="relative">
          <Search className="absolute left-2 top-1/2 h-3 w-3 -translate-y-1/2 text-white/30" />
          <input
            type="text"
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            placeholder="Filter..."
            className="h-6 w-32 rounded border border-white/10 bg-white/5 pl-7 pr-2 text-[11px] text-white placeholder:text-white/30 focus:border-white/20 focus:outline-none"
          />
        </div>

        {!autoScroll && (
          <button
            onClick={scrollToBottom}
            className="rounded p-1 text-white/40 hover:bg-white/10 hover:text-white/70 transition-colors"
            title="Scroll to bottom"
          >
            <ArrowDown className="h-3 w-3" />
          </button>
        )}

        {onClear && (
          <button
            onClick={onClear}
            className="rounded p-1 text-white/40 hover:bg-white/10 hover:text-white/70 transition-colors"
            title="Clear"
          >
            <Trash2 className="h-3 w-3" />
          </button>
        )}
      </div>

      {/* Log content */}
      <div
        ref={containerRef}
        onScroll={handleScroll}
        className="flex-1 overflow-auto p-3 font-mono text-xs leading-5 scrollbar-thin min-h-[120px]"
      >
        {filteredLogs.length === 0 ? (
          <div className="flex h-full items-center justify-center text-white/20 text-xs">
            {logs.length === 0 ? 'Waiting for sandbox output...' : 'No matching lines'}
          </div>
        ) : (
          filteredLogs.map((entry, i) => (
            <div key={`${entry.index}-${i}`} className="flex hover:bg-white/5 rounded px-1 -mx-1">
              {showTimestamps && (
                <span className="mr-3 shrink-0 select-none text-white/20">
                  {formatTimestamp(entry.ts)}
                </span>
              )}
              <span className={cn(
                'whitespace-pre-wrap break-all',
                levelColors[entry.level] || 'text-white/60'
              )}>
                {entry.text}
              </span>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
