import { useState } from 'react';
import { cn } from '../utils.js';
import type { ToolCall } from '../types.js';
import { Brain, Wrench, CheckCircle2, XCircle, Loader2, ChevronDown, ChevronRight } from '../icons.js';

export function ThinkingBlock({ thinking }: { thinking: string[] }) {
  const [open, setOpen] = useState(false);
  const combined = thinking.join('\n\n');

  return (
    <div className="my-2 rounded-lg border border-amber-500/20 bg-amber-500/[0.03] overflow-hidden">
      <button
        onClick={() => setOpen(!open)}
        className="flex w-full items-center gap-2 px-3 py-2 text-left hover:bg-amber-500/5 transition-colors"
      >
        <Brain className="h-3.5 w-3.5 shrink-0 text-amber-500/60" />
        <span className="text-xs font-medium text-amber-400/70">Thinking</span>
        <span className="ml-auto flex items-center gap-1.5">
          {open ? (
            <ChevronDown className="h-3 w-3 text-white/30" />
          ) : (
            <ChevronRight className="h-3 w-3 text-white/30" />
          )}
        </span>
      </button>
      {open && (
        <div className="border-t border-amber-500/10 px-3 py-2">
          <pre className="whitespace-pre-wrap text-xs text-white/50 leading-relaxed max-h-96 overflow-y-auto">
            {combined}
          </pre>
        </div>
      )}
    </div>
  );
}

export function ToolCallBlock({ tool }: { tool: ToolCall }) {
  const [open, setOpen] = useState(false);

  const isRunning = tool.state === 'running' || tool.state === 'pending';
  const isError = tool.state === 'error';
  const isDone = tool.state === 'completed';

  return (
    <div className="my-2 rounded-lg border border-white/10 bg-white/[0.03] overflow-hidden">
      <button
        onClick={() => setOpen(!open)}
        className="flex w-full items-center gap-2 px-3 py-2 text-left hover:bg-white/5 transition-colors"
      >
        <Wrench className="h-3.5 w-3.5 shrink-0 text-white/40" />
        <span className="text-xs font-medium text-white/70 truncate">{tool.name}</span>
        <span className="ml-auto flex items-center gap-1.5">
          {isRunning && (
            <span className="flex items-center gap-1 rounded-full bg-blue-500/10 border border-blue-500/20 px-2 py-0.5 text-[10px] font-medium text-blue-400">
              <Loader2 className="h-3 w-3 animate-spin" />
              Running
            </span>
          )}
          {isDone && (
            <span className="flex items-center gap-1 rounded-full bg-green-500/10 border border-green-500/20 px-2 py-0.5 text-[10px] font-medium text-green-400">
              <CheckCircle2 className="h-3 w-3" />
              Done
            </span>
          )}
          {isError && (
            <span className="flex items-center gap-1 rounded-full bg-red-500/10 border border-red-500/20 px-2 py-0.5 text-[10px] font-medium text-red-400">
              <XCircle className="h-3 w-3" />
              Error
            </span>
          )}
          {open ? (
            <ChevronDown className="h-3 w-3 text-white/30" />
          ) : (
            <ChevronRight className="h-3 w-3 text-white/30" />
          )}
        </span>
      </button>
      {open && (
        <div className="border-t border-white/10 px-3 py-2 space-y-2">
          {tool.input != null && (
            <div>
              <div className="text-[10px] font-medium text-white/30 uppercase tracking-wider mb-1">
                Input
              </div>
              <pre className="rounded-md bg-black/30 px-3 py-2 text-[11px] text-white/60 overflow-x-auto max-h-48 scrollbar-thin">
                {typeof tool.input === 'string' ? tool.input : JSON.stringify(tool.input, null, 2)}
              </pre>
            </div>
          )}
          {tool.output != null && (
            <div>
              <div className="text-[10px] font-medium text-white/30 uppercase tracking-wider mb-1">
                {isError ? 'Error' : 'Output'}
              </div>
              <pre
                className={cn(
                  'rounded-md px-3 py-2 text-[11px] overflow-x-auto max-h-64 scrollbar-thin',
                  isError ? 'bg-red-500/10 text-red-400' : 'bg-black/30 text-white/60'
                )}
              >
                {typeof tool.output === 'string'
                  ? tool.output
                  : JSON.stringify(tool.output, null, 2)}
              </pre>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
