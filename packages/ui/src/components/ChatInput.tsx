import { useRef } from 'react';
import { cn } from '../utils.js';
import type { AttachedFile } from '../types.js';
import { Send, Paperclip, Loader2, X } from '../icons.js';

export interface ChatInputProps {
  input: string;
  onInputChange: (value: string) => void;
  onSend: () => void;
  sending: boolean;
  disabled?: boolean;
  placeholder?: string;
  attachedFiles?: AttachedFile[];
  onFileSelect?: (e: React.ChangeEvent<HTMLInputElement>) => void;
  onRemoveFile?: (fileId: string) => void;
  className?: string;
}

export function ChatInput({
  input,
  onInputChange,
  onSend,
  sending,
  disabled,
  placeholder = 'Send a message...',
  attachedFiles = [],
  onFileSelect,
  onRemoveFile,
  className,
}: ChatInputProps) {
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      onSend();
    }
  };

  const readyFiles = attachedFiles.filter((f) => !f.uploading);
  const canSend = (input.trim() || readyFiles.length > 0) && !sending && !disabled;

  return (
    <div className={cn('shrink-0 border-t border-white/10 p-4', className)}>
      {/* Attached files chips */}
      {attachedFiles.length > 0 && (
        <div className="mb-2 flex flex-wrap gap-2">
          {attachedFiles.map((file) => (
            <div
              key={file.id}
              className={cn(
                'flex items-center gap-1.5 rounded-lg border px-2.5 py-1 text-xs',
                file.uploading
                  ? 'border-white/10 bg-white/5 text-white/40'
                  : 'border-accent/20 bg-accent/5 text-accent'
              )}
            >
              {file.uploading ? (
                <Loader2 className="h-3 w-3 animate-spin" />
              ) : (
                <Paperclip className="h-3 w-3" />
              )}
              <span className="max-w-[180px] truncate">{file.filename}</span>
              {!file.uploading && onRemoveFile && (
                <button
                  onClick={() => onRemoveFile(file.id)}
                  className="ml-0.5 rounded-full p-0.5 hover:bg-white/10 transition-colors"
                >
                  <X className="h-3 w-3" />
                </button>
              )}
            </div>
          ))}
        </div>
      )}

      <div className="flex items-end gap-3">
        {/* Hidden file input */}
        {onFileSelect && (
          <>
            <input
              ref={fileInputRef}
              type="file"
              multiple
              onChange={onFileSelect}
              className="hidden"
            />
            <button
              onClick={() => fileInputRef.current?.click()}
              disabled={sending || disabled}
              className={cn(
                'flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border transition-colors',
                'border-white/10 bg-white/5 text-white/40 hover:bg-white/10 hover:text-white/60',
                (sending || disabled) && 'opacity-50 cursor-not-allowed'
              )}
              title="Attach files"
            >
              <Paperclip className="h-4 w-4" />
            </button>
          </>
        )}
        <textarea
          ref={textareaRef}
          value={input}
          onChange={(e) => {
            onInputChange(e.target.value);
            const el = e.target;
            el.style.height = 'auto';
            el.style.height = Math.min(el.scrollHeight, 160) + 'px';
          }}
          onKeyDown={handleKeyDown}
          placeholder={placeholder}
          rows={1}
          className={cn(
            'w-full resize-none rounded-xl border bg-white/5 px-4 py-3 text-sm text-white',
            'border-white/10 placeholder:text-white/40',
            'focus:border-accent/50 focus:outline-none focus:ring-0',
          )}
        />
        <button
          onClick={onSend}
          disabled={!canSend}
          className={cn(
            'flex h-11 w-11 shrink-0 items-center justify-center rounded-xl transition-colors',
            canSend
              ? 'bg-accent text-white hover:bg-accent/90'
              : 'bg-white/5 text-white/20 cursor-not-allowed'
          )}
        >
          {sending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
        </button>
      </div>
    </div>
  );
}
