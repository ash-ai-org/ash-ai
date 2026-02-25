import { cn } from '../utils.js';
import { formatTime } from '../utils.js';
import type { ChatMessage as ChatMessageType } from '../types.js';
import { Bot, User } from '../icons.js';
import { ToolCallBlock, ThinkingBlock } from './ToolCallBlock.js';

export interface ChatMessageProps {
  message: ChatMessageType;
}

export function ChatMessage({ message: msg }: ChatMessageProps) {
  const isUser = msg.role === 'user';
  const isSystem = msg.role === 'system';

  if (isSystem) {
    return (
      <div className="flex justify-center">
        <span className="max-w-lg rounded-xl bg-red-500/10 border border-red-500/20 px-4 py-2 text-xs text-red-400">{msg.content}</span>
      </div>
    );
  }

  return (
    <div className={cn('flex gap-3', isUser ? 'flex-row-reverse' : 'flex-row')}>
      <div className={cn(
        'flex h-8 w-8 shrink-0 items-center justify-center rounded-full',
        isUser ? 'bg-accent/20' : 'bg-white/10'
      )}>
        {isUser ? <User className="h-4 w-4 text-accent" /> : <Bot className="h-4 w-4 text-white/60" />}
      </div>
      <div className={cn(
        'max-w-[75%] rounded-2xl px-4 py-2.5',
        isUser ? 'bg-accent/10 border border-accent/20 text-white' : 'bg-white/5 border border-white/10 text-white/80'
      )}>
        {/* Thinking */}
        {msg.thinking && msg.thinking.length > 0 && (
          <ThinkingBlock thinking={msg.thinking} />
        )}
        {/* Text content */}
        {msg.content && (
          <div className="whitespace-pre-wrap text-sm leading-relaxed">
            {msg.content}
            {msg.isStreaming && !msg.toolCalls?.some((tc) => tc.state === 'running') && (
              <span className="ml-1 inline-block h-4 w-0.5 animate-pulse bg-accent align-text-bottom" />
            )}
          </div>
        )}
        {/* Tool calls */}
        {msg.toolCalls && msg.toolCalls.length > 0 && (
          <div className={cn(msg.content && 'mt-2')}>
            {msg.toolCalls.map((tc) => (
              <ToolCallBlock key={tc.id} tool={tc} />
            ))}
            {msg.isStreaming && msg.toolCalls.some((tc) => tc.state === 'running') && (
              <span className="ml-1 inline-block h-4 w-0.5 animate-pulse bg-accent align-text-bottom" />
            )}
          </div>
        )}
        {/* Streaming cursor when no content yet */}
        {msg.isStreaming && !msg.content && (!msg.toolCalls || msg.toolCalls.length === 0) && (
          <span className="inline-block h-4 w-0.5 animate-pulse bg-accent align-text-bottom" />
        )}
        {msg.timestamp && (
          <div className="mt-1 text-right text-xs text-white/30">{formatTime(msg.timestamp)}</div>
        )}
      </div>
    </div>
  );
}
