import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { homedir } from 'node:os';

const CONFIG_PATH = join(homedir(), '.ash', 'config.json');

export interface AshConfig {
  server_url?: string;
  api_key?: string;
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
  // Priority: env var > config file > credentials file (from `ash login`) > default
  if (process.env.ASH_SERVER_URL) {
    return process.env.ASH_SERVER_URL;
  }
  const config = loadConfig();
  if (config.server_url) {
    return config.server_url;
  }
  try {
    const raw = readFileSync(join(homedir(), '.ash', 'credentials.json'), 'utf-8');
    const creds = JSON.parse(raw) as { cloud_url?: string };
    if (creds.cloud_url) {
      return creds.cloud_url;
    }
  } catch {
    // no credentials file
  }
  return 'http://localhost:4100';
}

export function getApiKey(): string | undefined {
  // Priority: env var > config file > credentials file (from `ash login`)
  if (process.env.ASH_API_KEY) {
    return process.env.ASH_API_KEY;
  }
  const config = loadConfig();
  if (config.api_key) {
    return config.api_key;
  }
  try {
    const raw = readFileSync(join(homedir(), '.ash', 'credentials.json'), 'utf-8');
    const creds = JSON.parse(raw) as { api_key?: string };
    return creds.api_key;
  } catch {
    return undefined;
  }
}
