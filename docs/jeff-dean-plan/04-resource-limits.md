# 04: Add Resource Limits to Sandbox Processes

## Current State

Each sandbox is a `child_process.spawn('node', [...])` with no resource constraints. A malicious or buggy agent can:

- Allocate unbounded memory until the host OOMs
- Spin CPU at 100% across all cores
- Write unbounded data to the workspace directory (fill disk)
- Fork child processes without limit (fork bomb)
- Open thousands of network connections

On a machine running 100+ sandboxes, one bad actor kills everyone.

## Target State

Every sandbox process runs with enforced limits on memory, CPU, disk, and process count. Exceeding limits kills the sandbox, not the host.

## Implementation

### On Linux: cgroups v2

This is the production path. Most EC2 instances run kernels with cgroups v2.

```typescript
import { execSync } from 'node:child_process';

interface SandboxLimits {
  memoryMb: number;      // Default: 512
  cpuPercent: number;     // Default: 100 (= 1 core)
  diskMb: number;         // Default: 1024
  maxProcesses: number;   // Default: 64
}

const DEFAULT_LIMITS: SandboxLimits = {
  memoryMb: 512,
  cpuPercent: 100,
  diskMb: 1024,
  maxProcesses: 64,
};

function createCgroup(sandboxId: string, limits: SandboxLimits): string {
  const cgroupPath = `/sys/fs/cgroup/ash/${sandboxId}`;

  execSync(`mkdir -p ${cgroupPath}`);

  // Memory limit
  const memoryBytes = limits.memoryMb * 1024 * 1024;
  execSync(`echo ${memoryBytes} > ${cgroupPath}/memory.max`);
  execSync(`echo ${memoryBytes} > ${cgroupPath}/memory.swap.max`);  // No swap

  // CPU limit (100000 = 1 core, 200000 = 2 cores)
  const cpuQuota = limits.cpuPercent * 1000;
  execSync(`echo "${cpuQuota} 100000" > ${cgroupPath}/cpu.max`);

  // Process limit
  execSync(`echo ${limits.maxProcesses} > ${cgroupPath}/pids.max`);

  return cgroupPath;
}
```

Then spawn the bridge inside the cgroup:

```typescript
const cgroupPath = createCgroup(sandboxId, limits);

// Write the child PID to the cgroup after spawn
const bridgeProcess = spawn('node', [bridgeEntryPoint], { ... });
execSync(`echo ${bridgeProcess.pid} > ${cgroupPath}/cgroup.procs`);
```

### On macOS (development): ulimit fallback

macOS doesn't have cgroups. Use `ulimit` for basic protection during development:

```typescript
function spawnWithLimits(command: string, args: string[], opts: SpawnOptions, limits: SandboxLimits) {
  if (process.platform === 'darwin') {
    // Wrap in shell with ulimit
    const ulimits = [
      `ulimit -v ${limits.memoryMb * 1024}`,  // Virtual memory (KB)
      `ulimit -u ${limits.maxProcesses}`,       // Max processes
      `ulimit -f ${limits.diskMb * 1024}`,      // Max file size (KB blocks)
    ].join(' && ');

    return spawn('sh', ['-c', `${ulimits} && exec ${command} ${args.join(' ')}`], opts);
  } else {
    // Linux: use cgroups (above)
    return spawn(command, args, opts);
  }
}
```

### Disk Limits

For disk, cgroups alone aren't enough (cgroups v2 IO controller limits bandwidth, not total usage). Options:

**Option A: tmpfs with size limit** (preferred for sandboxes)
```bash
mount -t tmpfs -o size=1024m tmpfs /path/to/sandbox/workspace
```
Fast, auto-cleaned on unmount, hard size limit. Requires root or user namespaces.

**Option B: Periodic check + kill**
```typescript
// Every 30 seconds, check workspace size
const checkDisk = setInterval(async () => {
  const size = await getDirSize(workspaceDir);
  if (size > limits.diskMb * 1024 * 1024) {
    log(`Sandbox ${id} exceeded disk limit (${size} bytes), killing`);
    await destroySandbox(id);
  }
}, 30_000);
```
Not airtight (30-second window) but simple and good enough for Phase 1.

### Configuration

Add to server config:

```typescript
interface SandboxResourceConfig {
  memoryMb?: number;      // Default: 512
  cpuPercent?: number;     // Default: 100
  diskMb?: number;         // Default: 1024
  maxProcesses?: number;   // Default: 64
}
```

Per-agent overrides in `.claude/settings.json`:

```json
{
  "resources": {
    "memoryMb": 1024,
    "cpuPercent": 200
  }
}
```

## OOM Handling

When a sandbox hits its memory limit, the kernel sends SIGKILL. The runner should:

1. Detect the exit code (137 = SIGKILL, likely OOM)
2. Mark the session as `paused` (not `ended` — it's resumable)
3. Log the OOM event with the sandbox ID and agent name
4. Clean up the workspace

```typescript
bridgeProcess.on('exit', (code, signal) => {
  if (signal === 'SIGKILL' || code === 137) {
    log(`Sandbox ${id} OOM killed`);
    db.updateSessionStatus(sessionId, 'paused');
  }
  cleanup(id);
});
```

## Priority

This is not optional for running untrusted agents. It's optional if you only run your own agents on your own machine. But it should be built before anyone else uses the system.
