---
"@ash-ai/dashboard": patch
---

Fix dashboard polling tight loop when viewing completed/paused sessions.

- Remove `setLoadingData(true)` from subsequent fetches — only show loading shimmer on initial load, preventing re-render cascades
- Add fetch-in-flight guard (`fetchingRef`) to prevent concurrent duplicate requests
- Extract `sessionId`/`sessionStatus` as stable primitive values for `useCallback`/`useEffect` dependencies
- Add `key={session.id}` to `SessionDetail` for clean state reset when switching sessions
