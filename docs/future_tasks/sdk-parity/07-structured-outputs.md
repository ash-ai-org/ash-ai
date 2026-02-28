# Gap 07: `outputFormat` (Structured Outputs)

## Status: Done

## Problem

The Claude Agent SDK supports `outputFormat` — a JSON schema that constrains the agent's final output. The SDK validates the output against the schema and retries if it doesn't match. Ash does not expose this.

Structured outputs are important for programmatic consumers that need machine-readable results (e.g., "extract these fields from the document" → JSON).

## SDK Reference

```typescript
// Claude Agent SDK Options
outputFormat?: { type: 'json_schema'; schema: JSONSchema };
```

The result message includes `structured_output` when this is set.

## Current State

Not exposed at any layer. The SDK's `structured_output` field in result messages already flows through as part of the opaque message passthrough, but users can't set `outputFormat` to trigger it.

## Approach

Passthrough with schema validation. Settable **per-message** — different prompts may need different output schemas.

The JSON schema is an arbitrary object. Pass it through as-is — the SDK validates it. The Fastify body schema should accept it as a generic object.

## Files to Change

1. **`packages/shared/src/types.ts`** — Add `outputFormat?: { type: string; schema: Record<string, unknown> }` to `SendMessageRequest`
2. **`packages/shared/src/protocol.ts`** — Add `outputFormat?` to `QueryCommand`
3. **`packages/bridge/src/sdk.ts`** — Add `outputFormat?` to `QueryOptions`, pass to SDK `options.outputFormat`
4. **`packages/server/src/routes/sessions.ts`** — Add to message-send body schema, wire to `QueryCommand`
5. **`packages/sdk/src/client.ts`** — Add `outputFormat?` to `SendMessageOptions`

## Design Note

The `structured_output` field in result messages already passes through in the SSE stream (it's part of the SDK `result` message). No changes needed on the output side — just need to enable the input.

## Effort

M — Passthrough with a nested JSON schema object. Slightly more complex schema definition in Fastify, but no new infrastructure.
