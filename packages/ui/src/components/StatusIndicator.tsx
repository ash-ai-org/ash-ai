import { cn } from '../utils.js';
import { Wifi, WifiOff } from '../icons.js';

export interface StatusIndicatorProps {
  connected: boolean | null;
  className?: string;
}

export function StatusIndicator({ connected, className }: StatusIndicatorProps) {
  if (connected === null) return null;

  return (
    <div className={cn(
      'flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[10px] font-medium border',
      connected
        ? 'bg-green-500/10 text-green-400 border-green-500/20'
        : 'bg-red-500/10 text-red-400 border-red-500/20',
      className,
    )}>
      {connected
        ? <><Wifi className="h-3 w-3" /> Runtime connected</>
        : <><WifiOff className="h-3 w-3" /> Runtime disconnected</>
      }
    </div>
  );
}
