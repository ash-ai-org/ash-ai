import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { execSync } from 'node:child_process';
import { mkdtempSync, writeFileSync, mkdirSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { launchServer, waitForReady, shouldUseDocker, type ServerHandle } from '../helpers/server-launcher.js';

/**
 * Integration test: exercises the Python SDK against a real Ash server.
 *
 * Runs Python scripts that use the ash_sdk package to deploy agents,
 * create sessions, stream messages, and clean up. Validates that the
 * Python SDK correctly interacts with the Ash API.
 */

let server: ServerHandle;
let testRoot: string;
let agentDir: string;
const sdkPythonPath = join(process.cwd(), 'packages', 'sdk-python');

function isPythonAvailable(): boolean {
  try {
    execSync('python3 --version', { stdio: 'ignore', timeout: 5000 });
    return true;
  } catch {
    return false;
  }
}

function isHttpxAvailable(): boolean {
  try {
    execSync('python3 -c "import httpx"', { stdio: 'ignore', timeout: 5000 });
    return true;
  } catch {
    return false;
  }
}

/**
 * Run a Python script inline, with PYTHONPATH set to include the SDK.
 * Returns stdout as a string.
 */
function runPython(script: string, env?: Record<string, string>): string {
  return execSync(`python3 -c ${JSON.stringify(script)}`, {
    env: {
      ...process.env,
      PYTHONPATH: sdkPythonPath,
      ...env,
    },
    timeout: 30_000,
  }).toString().trim();
}

beforeAll(async () => {
  if (!isPythonAvailable()) {
    console.log('[python-sdk] Skipping: python3 not available');
    return;
  }
  if (!isHttpxAvailable()) {
    console.log('[python-sdk] Skipping: httpx not installed (pip install httpx)');
    return;
  }

  testRoot = mkdtempSync(join(tmpdir(), 'ash-py-int-'));
  agentDir = join(testRoot, 'py-agent');
  mkdirSync(agentDir);
  writeFileSync(join(agentDir, 'CLAUDE.md'), '# Python Test Agent\nBe concise.');

  const port = 4300 + Math.floor(Math.random() * 700);

  if (shouldUseDocker()) {
    console.log('[python-sdk] Using Docker mode');
  } else {
    console.log('[python-sdk] Using direct mode');
  }

  server = await launchServer({ port, testRoot });
  await waitForReady(server.url);
  // server.apiKey is available for Python SDK tests to use
}, 120_000);

afterAll(async () => {
  if (server) await server.stop();
  if (testRoot) rmSync(testRoot, { recursive: true, force: true });
});

describe.skipIf(!isPythonAvailable() || !isHttpxAvailable())('Python SDK integration', () => {

  it('imports ash_sdk without errors', () => {
    const output = runPython(`
from ash_sdk import AshClient, Agent, Session, ApiError
from ash_sdk.streaming import MessageEvent, ErrorEvent, DoneEvent, parse_sse_lines
print("ok")
`);
    expect(output).toBe('ok');
  });

  it('checks server health', () => {
    const output = runPython(`
from ash_sdk import AshClient
client = AshClient("${server.url}")
health = client.health()
print(health["status"])
print(type(health["uptime"]).__name__)
`, { ASH_SERVER_URL: server.url });
    const lines = output.split('\n');
    expect(lines[0]).toBe('ok');
    expect(lines[1]).toBe('int');
  });

  it('deploys an agent', () => {
    const serverAgentDir = server.toServerPath(agentDir);
    const output = runPython(`
from ash_sdk import AshClient
client = AshClient("${server.url}")
agent = client.deploy_agent("py-test-agent", "${serverAgentDir}")
print(agent.name)
print(agent.version)
`);
    const lines = output.split('\n');
    expect(lines[0]).toBe('py-test-agent');
    expect(lines[1]).toBe('1');
  });

  it('lists agents', () => {
    const output = runPython(`
from ash_sdk import AshClient
client = AshClient("${server.url}")
agents = client.list_agents()
names = [a.name for a in agents]
print(",".join(names))
`);
    expect(output).toContain('py-test-agent');
  });

  it('gets a specific agent', () => {
    const output = runPython(`
from ash_sdk import AshClient
client = AshClient("${server.url}")
agent = client.get_agent("py-test-agent")
print(agent.name)
print(agent.version)
`);
    const lines = output.split('\n');
    expect(lines[0]).toBe('py-test-agent');
    expect(parseInt(lines[1])).toBeGreaterThanOrEqual(1);
  });

  it('creates a session', () => {
    const output = runPython(`
from ash_sdk import AshClient
client = AshClient("${server.url}")
session = client.create_session("py-test-agent")
print(session.id)
print(session.status)
print(session.agent_name)
`);
    const lines = output.split('\n');
    expect(lines[0]).toBeTruthy(); // UUID
    expect(lines[1]).toBe('active');
    expect(lines[2]).toBe('py-test-agent');
  });

  it('streams a response via send_message_stream', () => {
    const output = runPython(`
import json
from ash_sdk import AshClient
from ash_sdk.streaming import MessageEvent, DoneEvent

client = AshClient("${server.url}")
session = client.create_session("py-test-agent")

event_types = []
got_assistant = False
for event in client.send_message_stream(session.id, "Say hello"):
    event_types.append(event.type)
    if isinstance(event, MessageEvent) and event.data.get("type") == "assistant":
        got_assistant = True

print(",".join(event_types))
print(got_assistant)

client.end_session(session.id)
`);
    const lines = output.split('\n');
    const types = lines[0];
    expect(types).toContain('message');
    expect(types).toContain('done');
    expect(lines[1]).toBe('True');
  }, 15_000);

  it('handles multi-turn conversation', () => {
    const output = runPython(`
from ash_sdk import AshClient
from ash_sdk.streaming import DoneEvent

client = AshClient("${server.url}")
session = client.create_session("py-test-agent")

# Turn 1
done1 = False
for event in client.send_message_stream(session.id, "Hello"):
    if isinstance(event, DoneEvent):
        done1 = True

# Turn 2
done2 = False
for event in client.send_message_stream(session.id, "Follow up"):
    if isinstance(event, DoneEvent):
        done2 = True

print(done1)
print(done2)

client.end_session(session.id)
`);
    const lines = output.split('\n');
    expect(lines[0]).toBe('True');
    expect(lines[1]).toBe('True');
  }, 20_000);

  it('raises ApiError for nonexistent session', () => {
    const output = runPython(`
from ash_sdk import AshClient, ApiError
client = AshClient("${server.url}")
try:
    client.get_session("00000000-0000-0000-0000-000000000000")
    print("no_error")
except ApiError as e:
    print(f"error:{e.status_code}")
except Exception as e:
    print(f"other:{e}")
`);
    expect(output).toBe('error:404');
  });

  it('raises ApiError for nonexistent agent session', () => {
    const output = runPython(`
from ash_sdk import AshClient, ApiError
client = AshClient("${server.url}")
try:
    client.create_session("ghost-agent-xyz")
    print("no_error")
except ApiError as e:
    print(f"error:{e.status_code}")
`);
    expect(output).toBe('error:404');
  });

  it('ends a session', () => {
    const output = runPython(`
from ash_sdk import AshClient
client = AshClient("${server.url}")
session = client.create_session("py-test-agent")
ended = client.end_session(session.id)
print(ended.status)
`);
    expect(output).toBe('ended');
  });

  it('pauses and resumes a session', () => {
    const output = runPython(`
from ash_sdk import AshClient
client = AshClient("${server.url}")
session = client.create_session("py-test-agent")

paused = client.pause_session(session.id)
print(paused.status)

resumed = client.resume_session(session.id)
print(resumed.status)

client.end_session(session.id)
`);
    const lines = output.split('\n');
    expect(lines[0]).toBe('paused');
    expect(lines[1]).toBe('active');
  });

  it('redeploys with version bump', () => {
    const serverAgentDir = server.toServerPath(agentDir);
    const output = runPython(`
from ash_sdk import AshClient
client = AshClient("${server.url}")
agent = client.deploy_agent("py-test-agent", "${serverAgentDir}")
print(agent.version)
`);
    expect(parseInt(output)).toBeGreaterThanOrEqual(2);
  });

  it('deletes agent', () => {
    const output = runPython(`
from ash_sdk import AshClient
client = AshClient("${server.url}")
client.delete_agent("py-test-agent")
agents = client.list_agents()
names = [a.name for a in agents]
print("py-test-agent" not in names)
`);
    expect(output).toBe('True');
  });

  it('runs the example bot.py script', () => {
    // Deploy agent first using the example's agent directory
    const exampleAgentDir = join(process.cwd(), 'examples', 'python-bot', 'agent');
    const serverExampleAgentDir = server.toServerPath(exampleAgentDir);

    // The bot.py uses its own agent dir, but we need to point it at the server.
    // Run a simplified version of the bot flow.
    const output = runPython(`
import sys
sys.path.insert(0, "${sdkPythonPath}")
from ash_sdk import AshClient
from ash_sdk.streaming import MessageEvent, DoneEvent

client = AshClient("${server.url}")

# Deploy
agent = client.deploy_agent("python-bot", "${serverExampleAgentDir}")
print(f"deployed:{agent.name}")

# Session
session = client.create_session("python-bot")
print(f"session:{session.status}")

# Stream a message
got_message = False
got_done = False
for event in client.send_message_stream(session.id, "Hello from Python"):
    if isinstance(event, MessageEvent):
        got_message = True
    elif isinstance(event, DoneEvent):
        got_done = True

print(f"message:{got_message}")
print(f"done:{got_done}")

# Cleanup
client.end_session(session.id)
client.delete_agent("python-bot")
print("cleanup:ok")
`);
    const lines = output.split('\n');
    expect(lines).toContain('deployed:python-bot');
    expect(lines).toContain('session:active');
    expect(lines).toContain('message:True');
    expect(lines).toContain('done:True');
    expect(lines).toContain('cleanup:ok');
  }, 20_000);
});
