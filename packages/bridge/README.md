# @ash-ai/bridge

Bridge process for [Ash](https://github.com/ash-ai-org/ash-ai) — runs inside each sandbox and communicates with the Claude Agent SDK.

The bridge is the boundary between the isolated sandbox environment and the AI model. It receives messages over a Unix socket, forwards them to the Claude Agent SDK, and streams responses back.

## Installation

```bash
npm install @ash-ai/bridge
```

## How it works

```
ash-server → Unix socket → bridge process → Claude Agent SDK
                          (inside sandbox)
```

The bridge runs as an isolated child process with restricted environment variables, resource limits, and filesystem isolation.

## Documentation

See the [Ash README](https://github.com/ash-ai-org/ash-ai) for full documentation.

## License

[MIT](https://github.com/ash-ai-org/ash-ai/blob/main/LICENSE)
