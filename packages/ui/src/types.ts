export interface ToolCall {
  id: string;
  name: string;
  input: unknown;
  output?: unknown;
  isError?: boolean;
  state: 'pending' | 'running' | 'completed' | 'error';
}

export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  toolCalls?: ToolCall[];
  timestamp?: string;
  isStreaming?: boolean;
}

export interface AttachedFile {
  id: string;
  filename: string;
  url: string;
  uploading?: boolean;
}

export interface TreeNode {
  name: string;
  path: string;
  isDir: boolean;
  size?: number;
  modifiedAt?: string;
  children: TreeNode[];
}

export interface LogEntry {
  index: number;
  level: 'stdout' | 'stderr' | 'system';
  text: string;
  ts: string;
}
