import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';
import type { TreeNode, ToolCall } from './types.js';

export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs));
}

export function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
}

export function formatTime(ts: string): string {
  return new Date(ts).toLocaleTimeString('en-US', { hour12: false, hour: '2-digit', minute: '2-digit' });
}

export function formatTimestamp(ts: string): string {
  return new Date(ts).toLocaleTimeString('en-US', {
    hour12: false,
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });
}

export function buildFileTree(files: Array<{ path: string; size: number; modifiedAt: string }>): TreeNode[] {
  const root: TreeNode[] = [];

  for (const file of files) {
    const parts = file.path.split('/');
    let current = root;

    for (let i = 0; i < parts.length; i++) {
      const name = parts[i];
      const isLast = i === parts.length - 1;
      const partialPath = parts.slice(0, i + 1).join('/');

      let existing = current.find((n) => n.name === name && n.isDir === !isLast);
      if (!existing) {
        existing = {
          name,
          path: partialPath,
          isDir: !isLast,
          size: isLast ? file.size : undefined,
          modifiedAt: isLast ? file.modifiedAt : undefined,
          children: [],
        };
        current.push(existing);
      }
      current = existing.children;
    }
  }

  function sortNodes(nodes: TreeNode[]) {
    nodes.sort((a, b) => {
      if (a.isDir !== b.isDir) return a.isDir ? -1 : 1;
      return a.name.localeCompare(b.name);
    });
    for (const n of nodes) {
      if (n.children.length > 0) sortNodes(n.children);
    }
  }

  sortNodes(root);
  return root;
}

/**
 * Unwrap a message envelope object into content blocks or plain text.
 * Handles Claude Code conversation formats like:
 *   { type: "user", content: "hello" }
 *   { type: "assistant", message: { content: [...blocks] } }
 *   { type: "result", result: "text" }
 */
function unwrapMessageObject(obj: Record<string, unknown>): unknown {
  if (obj.message && typeof obj.message === 'object') {
    const msg = obj.message as Record<string, unknown>;
    if (Array.isArray(msg.content)) return msg.content;
  }
  if (Array.isArray(obj.content)) return obj.content;
  if (typeof obj.content === 'string') return obj.content;
  if (typeof obj.result === 'string') return obj.result;
  return '';
}

/**
 * Parse content blocks (from Anthropic SDK format) into text + tool calls + thinking.
 * Handles both JSON string content and pre-parsed arrays, as well as
 * wrapped message envelopes from Claude Code conversations.
 */
export function parseContentBlocks(content: unknown): { text: string; toolCalls: ToolCall[]; thinking: string[] } {
  let blocks: unknown[] | null = null;

  if (typeof content === 'string') {
    try {
      const parsed = JSON.parse(content);
      if (Array.isArray(parsed)) {
        blocks = parsed;
      } else if (parsed && typeof parsed === 'object') {
        return parseContentBlocks(unwrapMessageObject(parsed));
      }
    } catch {
      return { text: content, toolCalls: [], thinking: [] };
    }
  } else if (Array.isArray(content)) {
    blocks = content;
  } else if (content && typeof content === 'object') {
    return parseContentBlocks(unwrapMessageObject(content as Record<string, unknown>));
  }

  if (!blocks) {
    return { text: typeof content === 'string' ? content : '', toolCalls: [], thinking: [] };
  }

  let text = '';
  const toolCalls: ToolCall[] = [];
  const thinking: string[] = [];

  for (const block of blocks) {
    const b = block as Record<string, unknown>;
    if (b.type === 'text' && typeof b.text === 'string') {
      text += (text ? '\n' : '') + b.text;
    } else if (b.type === 'tool_use') {
      toolCalls.push({
        id: (b.id as string) || `tool-${toolCalls.length}`,
        name: (b.name as string) || 'unknown',
        input: b.input,
        state: 'completed',
      });
    } else if (b.type === 'tool_result') {
      const match = toolCalls.find((tc) => tc.id === (b.tool_use_id as string));
      if (match) {
        match.output = b.content;
        match.isError = (b.is_error as boolean) ?? false;
        match.state = b.is_error ? 'error' : 'completed';
      }
    } else if (b.type === 'thinking') {
      const t = (b.thinking as string) || (b.text as string) || '';
      if (t) thinking.push(t);
    }
  }

  return { text, toolCalls, thinking };
}

const IMAGE_EXTS = new Set(['png', 'jpg', 'jpeg', 'gif', 'svg', 'webp', 'ico']);

export function isImageFile(name: string): boolean {
  const ext = name.split('.').pop()?.toLowerCase();
  return IMAGE_EXTS.has(ext || '');
}

export function getFileLanguage(name: string): string {
  const ext = name.split('.').pop()?.toLowerCase();
  const map: Record<string, string> = {
    ts: 'typescript', tsx: 'typescript', js: 'javascript', jsx: 'javascript',
    py: 'python', rs: 'rust', go: 'go', rb: 'ruby',
    json: 'json', yaml: 'yaml', yml: 'yaml', toml: 'toml',
    md: 'markdown', sh: 'bash', bash: 'bash', css: 'css',
    html: 'html', sql: 'sql', xml: 'xml',
  };
  return map[ext || ''] || 'text';
}
