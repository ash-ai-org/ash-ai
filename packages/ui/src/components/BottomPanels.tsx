import { cn } from '../utils.js';
import { Terminal as TerminalIcon, FolderOpen, ChevronDown, ChevronUp } from '../icons.js';

export interface BottomPanelsProps {
  terminalOpen: boolean;
  onToggleTerminal: () => void;
  filesOpen: boolean;
  onToggleFiles: () => void;
  className?: string;
}

export function BottomPanels({
  terminalOpen,
  onToggleTerminal,
  filesOpen,
  onToggleFiles,
  className,
}: BottomPanelsProps) {
  return (
    <div className={cn('flex border-t border-white/10 bg-[#161b22] rounded-b-lg', className)}>
      <button
        onClick={onToggleTerminal}
        className={cn(
          'flex flex-1 items-center justify-center gap-1.5 py-1 text-[10px] font-medium transition-colors',
          terminalOpen
            ? 'text-accent hover:text-accent/80'
            : 'text-white/40 hover:text-white/60 hover:bg-[#1c2128]'
        )}
      >
        <TerminalIcon className="h-3 w-3" />
        Terminal
        {terminalOpen ? <ChevronDown className="h-3 w-3" /> : <ChevronUp className="h-3 w-3" />}
      </button>
      <div className="w-px bg-white/10" />
      <button
        onClick={onToggleFiles}
        className={cn(
          'flex flex-1 items-center justify-center gap-1.5 py-1 text-[10px] font-medium transition-colors',
          filesOpen
            ? 'text-accent hover:text-accent/80'
            : 'text-white/40 hover:text-white/60 hover:bg-[#1c2128]'
        )}
      >
        <FolderOpen className="h-3 w-3" />
        Files
        {filesOpen ? <ChevronDown className="h-3 w-3" /> : <ChevronUp className="h-3 w-3" />}
      </button>
    </div>
  );
}
