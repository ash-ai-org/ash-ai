import { AshClient } from '@ash-ai/sdk';

// Point at the cloud platform — same SDK, different URL.
// Set ASH_CLOUD_URL in .env.local (defaults to production cloud platform)
const serverUrl = (process.env.ASH_CLOUD_URL || 'https://ash-cloud-platform.vercel.app').replace(/\/$/, '');
const apiKey = process.env.ASH_CLOUD_API_KEY || undefined;

export const ashClient = new AshClient({ serverUrl, apiKey });
