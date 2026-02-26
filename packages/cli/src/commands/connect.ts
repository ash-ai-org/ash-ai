import { Command } from 'commander';
import { loadConfig, saveConfig } from '../config.js';

export function connectCommand(): Command {
  return new Command('connect')
    .description('Connect to a remote Ash server')
    .argument('<url>', 'Server URL (e.g. http://my-server:4100)')
    .option('--api-key <key>', 'API key for the remote server')
    .action(async (url: string, opts: { apiKey?: string }) => {
      // Normalize: strip trailing slash
      url = url.replace(/\/+$/, '');

      // Validate URL format
      try {
        new URL(url);
      } catch {
        console.error(`Invalid URL: ${url}`);
        process.exit(1);
      }

      // Test connectivity
      try {
        const res = await fetch(`${url}/health`);
        if (!res.ok) {
          console.error(`Server at ${url} returned status ${res.status}`);
          process.exit(1);
        }
        const health = await res.json() as { status: string };
        if (health.status !== 'ok') {
          console.error(`Server at ${url} is not healthy: ${JSON.stringify(health)}`);
          process.exit(1);
        }
      } catch (err: unknown) {
        console.error(`Cannot reach server at ${url}: ${err instanceof Error ? err.message : err}`);
        process.exit(1);
      }

      // Save to config
      const config = loadConfig();
      config.server_url = url;
      if (opts.apiKey) {
        config.api_key = opts.apiKey;
      }
      saveConfig(config);

      console.log(`Connected to ${url}`);
      if (opts.apiKey) {
        console.log(`API key saved to ~/.ash/config.json`);
      }
      console.log(`Saved to ~/.ash/config.json`);
      console.log(`\nAll CLI commands will now target this server.`);
      console.log(`Override with ASH_SERVER_URL env var, or run \`ash disconnect\` to reset.`);
    });
}

export function disconnectCommand(): Command {
  return new Command('disconnect')
    .description('Disconnect from remote server (reset to localhost)')
    .action(() => {
      const config = loadConfig();
      const previous = config.server_url;
      delete config.server_url;
      saveConfig(config);

      if (previous) {
        console.log(`Disconnected from ${previous}`);
      } else {
        console.log('No remote server was configured.');
      }
      console.log('CLI will now target http://localhost:4100');
    });
}
