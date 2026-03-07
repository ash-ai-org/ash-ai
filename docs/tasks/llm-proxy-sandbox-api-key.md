# LLM Proxy: Remove API key from sandbox environment

## Problem

`ANTHROPIC_API_KEY` is currently passed directly to the sandbox via the env allowlist. A compromised agent could exfiltrate the key.

## Solution

Proxy all LLM calls through the server so the sandbox never sees the API key.

- Bridge sends LLM requests over the Unix socket to the server
- Server attaches the API key and forwards to Anthropic
- Sandbox only gets a session token, not the real key
- Remove `ANTHROPIC_API_KEY` from `SANDBOX_ENV_ALLOWLIST` in `packages/shared/src/constants.ts`

## Files

- `packages/shared/src/constants.ts` — env allowlist
- `packages/bridge/src/bridge-client.ts` — bridge protocol
- `packages/shared/src/protocol.ts` — add LLM proxy command/event types
- `packages/sandbox/src/manager.ts` — server-side proxy handler

## Priority

Medium — filesystem isolation is the primary security boundary today. This closes the last credential exposure.
