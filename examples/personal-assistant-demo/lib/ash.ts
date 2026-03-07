import { AshClient } from '@ash-ai/sdk';

// Point at any Ash server — local, EC2, GCP, etc.
// Set ASH_SERVER_URL in .env.local (see .env.example)
const serverUrl = process.env.ASH_SERVER_URL || 'http://localhost:4100';
const apiKey = process.env.ASH_API_KEY || undefined;

export const ashClient = new AshClient({ serverUrl, apiKey });
