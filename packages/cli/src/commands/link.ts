import { Command } from 'commander';
import { loadConfig, saveConfig } from '../config.js';
import { getCredentials } from './login.js';

export function linkCommand(): Command {
  return new Command('link')
    .description('Link CLI to a remote Ash server (e.g. Ash Cloud)')
    .argument('[url]', 'Server URL — omit to use Ash Cloud (requires `ash login` first)')
    .option('--api-key <key>', 'API key for the remote server')
    .action(async (url: string | undefined, opts: { apiKey?: string }) => {
      // If no URL provided, use cloud credentials from `ash login`
      if (!url) {
        const creds = getCredentials();
        if (!creds?.server_url) {
          console.error('No URL provided and no Ash Cloud credentials found.');
          console.error('Run `ash login` first, or provide a URL: ash link <url>');
          process.exit(1);
        }
        url = creds.server_url;
        if (!opts.apiKey) {
          opts.apiKey = creds.api_key;
        }
        console.log(`Using Ash Cloud: ${url}`);
      }

      // Normalize: strip trailing slash
      url = url.replace(/\/+$/, '');

      // Validate URL format
      try {
        new URL(url);
      } catch {
        console.error(`Invalid URL: ${url}`);
        process.exit(1);
      }

      // Stash the current local API key before overwriting
      const config = loadConfig();
      if (config.api_key && !config.server_url) {
        // Current key is for the local server — stash it
        config.local_api_key = config.api_key;
      }

      config.server_url = url;
      if (opts.apiKey) {
        config.api_key = opts.apiKey;
      }
      saveConfig(config);

      console.log(`Linked to ${url}`);
      console.log(`All CLI commands will now target this server.`);
      console.log(`Run \`ash unlink\` to reset to localhost.`);
    });
}

export function unlinkCommand(): Command {
  return new Command('unlink')
    .description('Unlink from remote server (reset to localhost)')
    .action(() => {
      const config = loadConfig();
      const previous = config.server_url;
      delete config.server_url;
      delete config.api_key;

      // Restore stashed local API key
      if (config.local_api_key) {
        config.api_key = config.local_api_key;
        delete config.local_api_key;
      }

      saveConfig(config);

      if (previous) {
        console.log(`Unlinked from ${previous}`);
      } else {
        console.log('No remote server was linked.');
      }
      console.log('CLI will now target http://localhost:4100');
    });
}
