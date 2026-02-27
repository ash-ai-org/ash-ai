# @ash-ai/ui

## 0.0.8 - 2026-02-27

### Changed

- Updated dependencies: @ash-ai/shared@0.0.13, @ash-ai/sdk@0.0.13

## 0.0.7 - 2026-02-26

### Changed

- Updated dependencies: @ash-ai/shared@0.0.12, @ash-ai/sdk@0.0.12

## 0.0.6 - 2026-02-26

### Fixed

- Streaming content duplication: use final assembled message as authoritative content (#28)
- Only finalize streaming state when there's actual content to display (#28)

### Changed

- Updated dependencies

## 0.0.5 - 2026-02-26

### Fixed

- Duplicate React key warning in Terminal log list (#25)

### Changed

- Updated dependencies

## 0.0.4 - 2026-02-25

### Changed

- Updated dependencies

## 0.0.3 - 2026-02-24

### Added

- `ThinkingBlock` component: collapsible display for Claude thinking content blocks (#18)
- `Brain` icon for thinking indicator
- `thinking` field on `ChatMessage` type
- Parse `thinking` content blocks from Claude SDK messages in `parseContentBlocks`

## 0.0.2 - 2026-02-24

### Added

- Embeddable React component library for Ash agent playgrounds
- Components: Playground, Chat, ChatInput, ChatMessages, ChatMessage, Terminal, FileBrowser, FileTree, SessionHistory, StatusIndicator, PlaygroundHeader, BottomPanels, ToolCallBlock
- PlaygroundProvider context with full session and agent state management
- Hooks: usePlaygroundChat, useTerminal, useFileBrowser, useFileUpload, useAgents, useSessions, useHealthCheck
- Tailwind CSS stylesheets (with and without preflight)
- ESM and CommonJS builds via tsup
