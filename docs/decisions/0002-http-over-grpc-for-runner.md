# Decision 0002: HTTP over gRPC for Runner Communication

*Date: 2026-02-18*

## Context

Step 08 adds a runner process that manages sandboxes on a remote host. The server needs to communicate with runners for sandbox lifecycle operations and command streaming. The two main options were:

1. **gRPC** — Binary protocol, multiplexed streams, generated clients/servers
2. **HTTP + SSE** — Standard REST endpoints, Server-Sent Events for streaming

## Decision

**HTTP + SSE**, using Fastify on the runner side and standard `fetch` on the server side.

## Why

### Simplicity wins at this scale

gRPC adds significant complexity: protobuf schema files, code generation step, the `@grpc/grpc-js` dependency (large, native modules on some platforms), and debugging is harder (binary protocol, no curl testing).

HTTP is what we already know. The runner endpoints are plain REST routes — identical patterns to the server's public API. The streaming path (send command, get events back) maps naturally to SSE, which we already use for the client-facing API.

### No performance bottleneck here

The runner communication overhead is not on the hot path in a meaningful way. The hot path is:

```
Client → Server → Runner → Bridge → Claude SDK → (LLM inference)
```

LLM inference takes seconds. The HTTP hop from server to runner adds single-digit milliseconds. gRPC would save maybe 1-2ms per request — irrelevant when the LLM call is 2-10 seconds.

If this becomes a bottleneck (it won't), we can switch to HTTP/2 multiplexing for the runner client without changing the protocol or the runner API.

### Ecosystem alignment

The runner uses the same Fastify framework as the server. Tests use the same patterns. Debugging uses the same tools (curl, browser, Swagger). One less technology to understand and maintain.

## Alternatives Considered

### gRPC with bidirectional streaming

Would give true bidirectional streaming for the command/event flow. But the flow is naturally request-response with server-push — SSE handles this well. We don't need client-side streaming (the client sends a single command and gets a stream of events back).

### WebSocket

More complex than SSE for the same use case. We'd need to manage the WebSocket lifecycle, handle reconnection, and frame our own messages. SSE already handles all of this for us since the flow is server-push-only.

## Consequences

- Runner endpoints are testable with `curl` and standard HTTP tools
- No code generation step needed
- SSE streaming works identically to the client-facing API
- If we ever need true bidirectional streaming to runners, we'd need to revisit (unlikely — the bridge protocol is inherently request/response)
