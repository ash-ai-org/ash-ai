import { useEffect, useRef } from 'react';
import type { ChatMessage as ChatMessageType } from '../types.js';
import { ChatMessage } from './ChatMessage.js';
import { MessageSquare } from '../icons.js';

export interface ChatMessagesProps {
  messages: ChatMessageType[];
  className?: string;
}

export function ChatMessages({ messages, className }: ChatMessagesProps) {
  const chatRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (chatRef.current) {
      chatRef.current.scrollTo({ top: chatRef.current.scrollHeight, behavior: 'smooth' });
    }
  }, [messages]);

  return (
    <div ref={chatRef} className={className ?? 'flex-1 overflow-auto p-4 space-y-3 scrollbar-thin'}>
      {messages.length === 0 ? (
        <div className="flex h-full flex-col items-center justify-center text-center">
          <MessageSquare className="mb-3 h-8 w-8 text-white/20" />
          <p className="text-sm text-white/40">No messages yet</p>
          <p className="mt-1 text-xs text-white/30">Send a message to start the conversation</p>
        </div>
      ) : (
        messages.map((msg) => <ChatMessage key={msg.id} message={msg} />)
      )}
    </div>
  );
}
