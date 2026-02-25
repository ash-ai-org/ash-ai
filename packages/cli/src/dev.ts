#!/usr/bin/env node

// Separate entry point for ash-dev — sets the flag before index.ts evaluates
(globalThis as Record<string, unknown>).__ASH_DEV_MODE__ = true;

await import('./index.js');
