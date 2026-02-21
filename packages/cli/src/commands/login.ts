import { createServer } from 'node:http';
import { writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { homedir } from 'node:os';
import { Command } from 'commander';

const DEFAULT_CLOUD_URL = 'https://ash-cloud.ai';
const CREDENTIALS_PATH = join(homedir(), '.ash', 'credentials.json');

export interface AshCredentials {
  api_key: string;
  cloud_url: string;
  email: string;
}

export function getCredentials(): AshCredentials | null {
  try {
    const { readFileSync } = require('node:fs');
    const raw = readFileSync(CREDENTIALS_PATH, 'utf-8');
    return JSON.parse(raw) as AshCredentials;
  } catch {
    return null;
  }
}

export function loginCommand(): Command {
  return new Command('login')
    .description('Authenticate with Ash Cloud')
    .option('--cloud-url <url>', 'Ash Cloud URL', DEFAULT_CLOUD_URL)
    .action(async (opts: { cloudUrl: string }) => {
      const cloudUrl = opts.cloudUrl.replace(/\/$/, '');

      // Start a temporary local server to receive the callback
      const server = createServer((req, res) => {
        const url = new URL(req.url!, `http://localhost`);

        if (url.pathname === '/callback') {
          const apiKey = url.searchParams.get('api_key');
          const email = url.searchParams.get('email');
          const error = url.searchParams.get('error');

          if (error) {
            res.writeHead(200, { 'Content-Type': 'text/html' });
            res.end('<html><body><h2>Login failed</h2><p>You can close this tab.</p></body></html>');
            console.error(`Login failed: ${error}`);
            server.close();
            process.exit(1);
            return;
          }

          if (!apiKey || !email) {
            res.writeHead(400, { 'Content-Type': 'text/html' });
            res.end('<html><body><h2>Missing data</h2><p>You can close this tab.</p></body></html>');
            server.close();
            process.exit(1);
            return;
          }

          // Save credentials
          const credentials: AshCredentials = {
            api_key: apiKey,
            cloud_url: cloudUrl,
            email,
          };

          mkdirSync(join(homedir(), '.ash'), { recursive: true });
          writeFileSync(CREDENTIALS_PATH, JSON.stringify(credentials, null, 2) + '\n');

          res.writeHead(200, { 'Content-Type': 'text/html' });
          res.end(`<html><body style="font-family:system-ui;display:flex;align-items:center;justify-content:center;height:100vh;margin:0"><div style="text-align:center"><h2>Logged in!</h2><p>You can close this tab and return to your terminal.</p></div></body></html>`);

          console.log(`\nLogged in as ${email}`);
          console.log(`Credentials saved to ${CREDENTIALS_PATH}`);
          server.close();
          process.exit(0);
        } else {
          res.writeHead(404);
          res.end();
        }
      });

      // Listen on a random port
      server.listen(0, '127.0.0.1', () => {
        const addr = server.address();
        if (!addr || typeof addr === 'string') {
          console.error('Failed to start callback server');
          process.exit(1);
        }

        const callbackUrl = `http://127.0.0.1:${addr.port}/callback`;
        const loginUrl = `${cloudUrl}/auth/cli?callback=${encodeURIComponent(callbackUrl)}`;

        console.log(`Opening browser to ${cloudUrl}...`);

        // Open browser
        const open = process.platform === 'darwin' ? 'open'
          : process.platform === 'win32' ? 'start'
          : 'xdg-open';

        try {
          require('node:child_process').execSync(`${open} "${loginUrl}"`, { stdio: 'ignore' });
        } catch {
          console.log(`\nCould not open browser. Visit this URL manually:\n  ${loginUrl}\n`);
        }

        console.log('Waiting for authentication...');
      });

      // Timeout after 5 minutes
      setTimeout(() => {
        console.error('\nLogin timed out. Please try again.');
        server.close();
        process.exit(1);
      }, 5 * 60 * 1000);
    });
}

export function logoutCommand(): Command {
  return new Command('logout')
    .description('Remove saved Ash Cloud credentials')
    .action(() => {
      try {
        require('node:fs').unlinkSync(CREDENTIALS_PATH);
        console.log('Logged out. Credentials removed.');
      } catch {
        console.log('No credentials found.');
      }
    });
}
