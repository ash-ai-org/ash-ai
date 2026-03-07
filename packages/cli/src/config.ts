import { readFileSync, writeFileSync, mkdirSync, chmodSync } from 'node:fs';
import { join } from 'node:path';
import { homedir } from 'node:os';

const CONFIG_PATH = join(homedir(), '.ash', 'config.json');

export interface AshConfig {
  server_url?: string;
  api_key?: string;
  /** Stashed local API key — saved by `ash link`, restored by `ash unlink`. */
  local_api_key?: string;
}

export function loadConfig(): AshConfig {
  try {
    const raw = readFileSync(CONFIG_PATH, 'utf-8');
    return JSON.parse(raw) as AshConfig;
  } catch {
    return {};
  }
}

export function saveConfig(config: AshConfig): void {
  const dir = join(homedir(), '.ash');
  mkdirSync(dir, { recursive: true, mode: 0o700 });
  chmodSync(dir, 0o700);
  writeFileSync(CONFIG_PATH, JSON.stringify(config, null, 2) + '\n', { mode: 0o600 });
}

export function getServerUrl(): string {
  // Priority: env var > config file (set by `ash link`) > default
  if (process.env.ASH_SERVER_URL) {
    return process.env.ASH_SERVER_URL;
  }
  const config = loadConfig();
  if (config.server_url) {
    return config.server_url;
  }
  return 'http://localhost:4100';
}

export function getApiKey(): string | undefined {
  // Priority: env var > config file (set by `ash link`)
  if (process.env.ASH_API_KEY) {
    return process.env.ASH_API_KEY;
  }
  const config = loadConfig();
  if (config.api_key) {
    return config.api_key;
  }
  return undefined;
}
