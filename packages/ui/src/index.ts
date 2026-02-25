// Components
export { Playground } from './components/Playground.js';
export type { PlaygroundProps } from './components/Playground.js';

export { Chat } from './components/Chat.js';
export type { ChatProps } from './components/Chat.js';

export { ChatMessages } from './components/ChatMessages.js';
export type { ChatMessagesProps } from './components/ChatMessages.js';

export { ChatInput } from './components/ChatInput.js';
export type { ChatInputProps } from './components/ChatInput.js';

export { ChatMessage } from './components/ChatMessage.js';
export type { ChatMessageProps } from './components/ChatMessage.js';

export { ToolCallBlock, ThinkingBlock } from './components/ToolCallBlock.js';

export { Terminal } from './components/Terminal.js';
export type { TerminalProps } from './components/Terminal.js';

export { FileBrowser } from './components/FileBrowser.js';
export type { FileBrowserProps } from './components/FileBrowser.js';

export { FileTree } from './components/FileTree.js';
export type { FileTreeProps } from './components/FileTree.js';

export { SessionHistory } from './components/SessionHistory.js';
export type { SessionHistoryProps } from './components/SessionHistory.js';

export { StatusIndicator } from './components/StatusIndicator.js';
export type { StatusIndicatorProps } from './components/StatusIndicator.js';

export { PlaygroundHeader } from './components/PlaygroundHeader.js';
export type { PlaygroundHeaderProps } from './components/PlaygroundHeader.js';

export { BottomPanels } from './components/BottomPanels.js';
export type { BottomPanelsProps } from './components/BottomPanels.js';

// Context
export { PlaygroundProvider, usePlaygroundContext } from './context/PlaygroundContext.js';
export type { PlaygroundContextValue, PlaygroundProviderProps } from './context/PlaygroundContext.js';

// Hooks
export {
  usePlaygroundChat,
  useTerminal,
  useFileBrowser,
  useFileUpload,
  useAgents,
  useSessions,
  useHealthCheck,
} from './hooks/index.js';

export type {
  UsePlaygroundChatOptions,
  UsePlaygroundChatReturn,
  UseTerminalOptions,
  UseTerminalReturn,
  UseFileBrowserOptions,
  UseFileBrowserReturn,
  UseFileUploadOptions,
  UseFileUploadReturn,
  UseAgentsOptions,
  UseAgentsReturn,
  UseSessionsOptions,
  UseSessionsReturn,
  UseHealthCheckOptions,
  UseHealthCheckReturn,
} from './hooks/index.js';

// Types
export type { ChatMessage as ChatMessageType, ToolCall, AttachedFile, TreeNode, LogEntry } from './types.js';

// Utils
export { cn, formatBytes, formatTime, buildFileTree, parseContentBlocks, isImageFile, getFileLanguage } from './utils.js';
