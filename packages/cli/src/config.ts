import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { homedir } from 'node:os';

const CONFIG_PATH = join(homedir(), '.ash', 'config.json');

export interface AshConfig {
  server_url?: string;
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
  mkdirSync(join(homedir(), '.ash'), { recursive: true });
  writeFileSync(CONFIG_PATH, JSON.stringify(config, null, 2) + '\n');
}

export function getServerUrl(): string {
  // Priority: env var > config file > default
  if (process.env.ASH_SERVER_URL) {
    return process.env.ASH_SERVER_URL;
  }
  const config = loadConfig();
  if (config.server_url) {
    return config.server_url;
  }
  return 'http://localhost:4100';
}
