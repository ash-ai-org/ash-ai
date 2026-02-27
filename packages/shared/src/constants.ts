export const DEFAULT_PORT = 4100;
export const DEFAULT_HOST = '0.0.0.0';
export const DEFAULT_DATA_DIR = 'data';

// Sandbox
export const SANDBOX_CONNECT_TIMEOUT_MS = 10_000;
export const SANDBOX_SHUTDOWN_TIMEOUT_MS = 5_000;

// Bridge
export const BRIDGE_READY_TIMEOUT_MS = 10_000;

// Agent setup
export const INSTALL_SCRIPT_TIMEOUT_MS = 120_000; // 2 min

// Resource limits
export const DEFAULT_SANDBOX_LIMITS = {
  memoryMb: 2048,
  cpuPercent: 100,
  diskMb: 1024,
  maxProcesses: 64,
} as const;

export const DISK_CHECK_INTERVAL_MS = 30_000;

// Backpressure
export const SSE_WRITE_TIMEOUT_MS = 30_000;

// Docker sandbox image
export const SANDBOX_DOCKER_IMAGE = 'node:20-slim';

// Docker lifecycle (ash start/stop)
export const ASH_CONTAINER_NAME = 'ash-server';
export const ASH_DOCKER_IMAGE = 'ghcr.io/ash-ai-org/ash';
export const ASH_DATA_DIR_CONTAINER = '/data';
export const ASH_AGENTS_SUBDIR = 'agents';
export const ASH_HEALTH_POLL_INTERVAL_MS = 500;
export const ASH_HEALTH_POLL_TIMEOUT_MS = 30_000;

// Sandbox pool
export const DEFAULT_MAX_SANDBOXES = 1000;
export const DEFAULT_IDLE_TIMEOUT_MS = 30 * 60 * 1000;  // 30 min
export const IDLE_SWEEP_INTERVAL_MS = 60_000;            // 1 min
export const COLD_CLEANUP_TTL_MS = 2 * 60 * 60 * 1000;  // 2 hours
export const COLD_CLEANUP_INTERVAL_MS = 5 * 60 * 1000;   // 5 min

// Runner (multi-machine mode)
export const DEFAULT_RUNNER_PORT = 4200;
export const RUNNER_HEARTBEAT_INTERVAL_MS = 10_000;
export const RUNNER_LIVENESS_TIMEOUT_MS = 30_000;

// Env vars allowed into sandbox processes (allowlist — nothing else leaks)
export const SANDBOX_ENV_ALLOWLIST = [
  'PATH',
  'NODE_PATH',
  'HOME',
  'LANG',
  'TERM',
  'ANTHROPIC_API_KEY',
  'ANTHROPIC_BASE_URL',
  'ANTHROPIC_CUSTOM_HEADERS',
  'ASH_DEBUG_TIMING',
  'ASH_REAL_SDK',
  'ASH_PERMISSION_MODE',
  'CLAUDE_CODE_EXECUTABLE',
] as const;
