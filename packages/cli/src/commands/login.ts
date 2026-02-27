import { createServer, type Server } from 'node:http';
import { createInterface } from 'node:readline';
import { writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { homedir } from 'node:os';
import { Command } from 'commander';

const DEFAULT_CLOUD_URL = 'https://ash-cloud.ai';
const CREDENTIALS_PATH = join(homedir(), '.ash', 'credentials.json');

export interface AshCredentials {
  api_key: string;
  cloud_url: string;
  email?: string;
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

function saveCredentials(credentials: AshCredentials): void {
  mkdirSync(join(homedir(), '.ash'), { recursive: true });
  writeFileSync(CREDENTIALS_PATH, JSON.stringify(credentials, null, 2) + '\n');
}

function startPastePrompt(cloudUrl: string, loginUrl: string, server: Server): void {
  console.log(`\nIf the browser didn't open, visit:\n  ${loginUrl}\n`);
  console.log('Or paste your API key below:');

  const rl = createInterface({ input: process.stdin, output: process.stdout });
  rl.question('> ', (apiKey) => {
    rl.close();
    const trimmed = apiKey.trim();
    if (!trimmed) {
      console.error('No API key provided.');
      server.close();
      process.exit(1);
    }

    saveCredentials({ api_key: trimmed, cloud_url: cloudUrl });
    console.log(`\nLogged in.`);
    console.log(`Credentials saved to ${CREDENTIALS_PATH}`);
    server.close();
    process.exit(0);
  });
}

export function loginCommand(): Command {
  return new Command('login')
    .description('Authenticate with Ash Cloud')
    .option('--cloud-url <url>', 'Ash Cloud URL', DEFAULT_CLOUD_URL)
    .action(async (opts: { cloudUrl: string }) => {
      const cloudUrl = opts.cloudUrl.replace(/\/$/, '');
      let completed = false;

      // Start a temporary local server to receive the callback
      const server = createServer((req, res) => {
        const url = new URL(req.url!, `http://localhost`);

        if (url.pathname === '/callback') {
          if (completed) return;
          completed = true;

          const apiKey = url.searchParams.get('api_key');
          const email = url.searchParams.get('email');
          const error = url.searchParams.get('error');

          if (error) {
            res.writeHead(200, { 'Content-Type': 'text/html' });
            res.end('<html><body><h2>Login failed</h2><p>You can close this tab.</p></body></html>');
            console.error(`\nLogin failed: ${error}`);
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

          saveCredentials({ api_key: apiKey, cloud_url: cloudUrl, email });

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

        let browserOpened = false;
        try {
          require('node:child_process').execSync(`${open} "${loginUrl}"`, { stdio: 'ignore' });
          browserOpened = true;
        } catch {
          // Browser failed to open — fall through to paste prompt immediately
        }

        if (browserOpened) {
          console.log('Waiting for authentication...');
          // Show paste fallback after 5 seconds if callback hasn't fired
          setTimeout(() => {
            if (!completed) {
              startPastePrompt(cloudUrl, loginUrl, server);
            }
          }, 5000);
        } else {
          startPastePrompt(cloudUrl, loginUrl, server);
        }
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
