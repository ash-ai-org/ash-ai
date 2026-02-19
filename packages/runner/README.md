# @ash-ai/runner

[Ash](https://github.com/ash-ai-org/ash-ai) runner process — manages sandboxes on a worker node and exposes them over HTTP for the coordinator server.

Used in multi-machine deployments where the Ash server acts as a control plane and runners host the actual sandboxes.

## Installation

```bash
npm install @ash-ai/runner
```

## How it works

```
ash-server (coordinator)  ──HTTP──>  runner node 1  ──>  sandboxes
                          ──HTTP──>  runner node 2  ──>  sandboxes
```

Runners register with the server, send heartbeats, and accept sandbox assignments. Sessions route to the least-loaded runner.

## Documentation

See the [Ash README](https://github.com/ash-ai-org/ash-ai) for full documentation.

## License

[MIT](https://github.com/ash-ai-org/ash-ai/blob/main/LICENSE)
