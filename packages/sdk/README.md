# @ash-ai/sdk

TypeScript SDK for interacting with [Ash](https://github.com/ash-ai-org/ash-ai) agent servers.

## Installation

```bash
npm install @ash-ai/sdk
```

## Usage

```typescript
import { AshClient } from '@ash-ai/sdk';

const client = new AshClient({ serverUrl: 'http://localhost:4100' });

// Create a session
const session = await client.createSession('my-agent');

// Stream messages
for await (const event of client.sendMessageStream(session.id, 'Hello!')) {
  if (event.type === 'message') {
    process.stdout.write(event.data);
  }
}

// End session
await client.endSession(session.id);
```

## Documentation

See the [Ash README](https://github.com/ash-ai-org/ash-ai) for full documentation, including the [Python SDK](https://pypi.org/project/ash-ai/).

## License

[MIT](https://github.com/ash-ai-org/ash-ai/blob/main/LICENSE)
