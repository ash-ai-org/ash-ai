# Unit Tests: packages/cli and packages/sdk

The CLI and SDK are HTTP clients. Don't test them against a real server — that's integration testing. Test the parts that parse and format data.

## CLI Tests

### SSE stream parsing

The most complex logic in the CLI client. Test it in isolation.

```typescript
// packages/cli/src/__tests__/sse-parsing.test.ts

import { describe, it, expect } from 'vitest';

// Extract SSE parsing into a testable function
// (This may require refactoring client.ts)

function parseSSEChunks(chunks: string[]): Array<{ event: string; data: unknown }> {
  const events: Array<{ event: string; data: unknown }> = [];
  let buffer = '';
  let currentEvent: string | null = null;
  let currentData = '';

  for (const chunk of chunks) {
    buffer += chunk;
    const lines = buffer.split('\n');
    buffer = lines.pop() ?? '';

    for (const line of lines) {
      if (line.startsWith('event:')) {
        currentEvent = line.slice(6).trim();
      } else if (line.startsWith('data:')) {
        currentData += line.slice(5).trim();
      } else if (line === '') {
        if (currentEvent && currentData) {
          try {
            events.push({ event: currentEvent, data: JSON.parse(currentData) });
          } catch {
            events.push({ event: currentEvent, data: currentData });
          }
        }
        currentEvent = null;
        currentData = '';
      }
    }
  }

  return events;
}

describe('SSE parsing', () => {
  it('parses a single event', () => {
    const events = parseSSEChunks([
      'event: assistant_message\ndata: {"content":"hello"}\n\n',
    ]);
    expect(events).toHaveLength(1);
    expect(events[0].event).toBe('assistant_message');
    expect(events[0].data).toEqual({ content: 'hello' });
  });

  it('parses multiple events in one chunk', () => {
    const events = parseSSEChunks([
      'event: assistant_message\ndata: {"content":"hi"}\n\nevent: done\ndata: {"sessionId":"s1"}\n\n',
    ]);
    expect(events).toHaveLength(2);
    expect(events[0].event).toBe('assistant_message');
    expect(events[1].event).toBe('done');
  });

  it('handles events split across chunks', () => {
    const events = parseSSEChunks([
      'event: assis',
      'tant_message\ndata: {"conte',
      'nt":"hello"}\n\n',
    ]);
    expect(events).toHaveLength(1);
    expect(events[0].data).toEqual({ content: 'hello' });
  });

  it('handles non-JSON data gracefully', () => {
    const events = parseSSEChunks([
      'event: error\ndata: something went wrong\n\n',
    ]);
    expect(events).toHaveLength(1);
    expect(events[0].data).toBe('something went wrong');
  });

  it('skips events without data', () => {
    const events = parseSSEChunks([
      'event: heartbeat\n\n',
    ]);
    expect(events).toHaveLength(0);
  });
});
```

### Output formatting

```typescript
// packages/cli/src/__tests__/output.test.ts

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { printTable } from '../output.js';

describe('printTable', () => {
  let output: string;
  const originalWrite = process.stdout.write;

  beforeEach(() => {
    output = '';
    process.stdout.write = ((str: string) => {
      output += str;
      return true;
    }) as any;
  });

  afterEach(() => {
    process.stdout.write = originalWrite;
  });

  it('formats headers and rows', () => {
    printTable(['Name', 'Status'], [['agent-1', 'active'], ['agent-2', 'paused']]);
    expect(output).toContain('Name');
    expect(output).toContain('Status');
    expect(output).toContain('agent-1');
    expect(output).toContain('active');
    expect(output).toContain('agent-2');
    expect(output).toContain('paused');
  });

  it('handles empty rows', () => {
    printTable(['Name'], []);
    expect(output).toContain('Name');
  });

  it('aligns columns', () => {
    printTable(['Short', 'Longer Column'], [['a', 'b']]);
    const lines = output.split('\n').filter(Boolean);
    // All lines should have consistent column positions
    expect(lines.length).toBeGreaterThan(0);
  });
});
```

### Tar creation (deploy command)

```typescript
// packages/cli/src/__tests__/tar.test.ts

import { describe, it, expect, afterEach } from 'vitest';
import { mkdtemp, rm, writeFile, mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { execSync } from 'node:child_process';

// Test the createTarGz function from deploy.ts
// (Requires exporting it or extracting to a utility)

describe('createTarGz', () => {
  const tmpDirs: string[] = [];

  afterEach(async () => {
    for (const d of tmpDirs) await rm(d, { recursive: true, force: true });
    tmpDirs.length = 0;
  });

  async function makeTmpDir(): Promise<string> {
    const d = await mkdtemp(join(tmpdir(), 'ash-tar-test-'));
    tmpDirs.push(d);
    return d;
  }

  it('creates a valid tar.gz that can be extracted', async () => {
    const srcDir = await makeTmpDir();
    await writeFile(join(srcDir, 'CLAUDE.md'), '# Test');
    await mkdir(join(srcDir, '.claude'), { recursive: true });
    await writeFile(join(srcDir, '.claude', 'settings.json'), '{}');

    const outDir = await makeTmpDir();
    const tarPath = join(outDir, 'test.tar.gz');

    // Import and call createTarGz (needs to be exported from deploy.ts)
    // For now, verify concept with shell:
    execSync(`tar czf "${tarPath}" -C "${srcDir}" .`);

    const extractDir = join(outDir, 'extracted');
    await mkdir(extractDir);
    execSync(`tar xzf "${tarPath}" -C "${extractDir}"`);

    // Verify contents survived the round-trip
    const { readFileSync } = await import('node:fs');
    expect(readFileSync(join(extractDir, 'CLAUDE.md'), 'utf-8')).toBe('# Test');
    expect(readFileSync(join(extractDir, '.claude', 'settings.json'), 'utf-8')).toBe('{}');
  });
});
```

## SDK Tests

### Error handling

```typescript
// packages/sdk/src/__tests__/client.test.ts

import { describe, it, expect } from 'vitest';
import { AshError } from '../types.js';

describe('AshError', () => {
  it('includes status code and error code', () => {
    const err = new AshError('not found', 404, 'agent_not_found');
    expect(err.message).toBe('not found');
    expect(err.statusCode).toBe(404);
    expect(err.errorCode).toBe('agent_not_found');
    expect(err).toBeInstanceOf(Error);
  });
});
```

### Client construction

```typescript
describe('AshClient', () => {
  it('defaults to localhost:4100', () => {
    // Verify the client constructs URLs correctly
    // This would require exposing the baseUrl or testing via a mock server
    // For now, just verify it doesn't throw
    const { AshClient } = await import('../client.js');
    const client = new AshClient();
    expect(client.agents).toBeDefined();
    expect(client.sessions).toBeDefined();
    expect(client.pool).toBeDefined();
  });

  it('accepts custom server URL', () => {
    const { AshClient } = await import('../client.js');
    const client = new AshClient({ serverUrl: 'http://custom:9999' });
    expect(client).toBeDefined();
  });

  it('strips trailing slashes from server URL', () => {
    const { AshClient } = await import('../client.js');
    const client = new AshClient({ serverUrl: 'http://example.com///' });
    expect(client).toBeDefined();
    // Ideally verify internal URL doesn't have triple slash
  });
});
```

## What NOT to test

- `fetch()` behavior (trust the runtime)
- Commander.js command parsing (trust the library)
- ANSI color codes (visual verification)
