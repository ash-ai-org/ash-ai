import { AshClient } from '@ash-ai/sdk'

let client: AshClient | null = null
let cachedApiKey: string | undefined

declare global {
  interface Window {
    __ASH_CONFIG__?: { apiKey?: string; serverVersion?: string; serverUrl?: string }
  }
}

export function getClient(): AshClient {
  if (!client) {
    // In the browser, prefer the server URL from config (points directly to the Ash server,
    // bypassing the Next.js dev proxy which can break SSE streams).
    // Falls back to window.location.origin (works when served by the Ash server itself).
    const serverUrl =
      typeof window !== 'undefined'
        ? window.__ASH_CONFIG__?.serverUrl || window.location.origin
        : process.env.NEXT_PUBLIC_ASH_API_URL || 'http://localhost:4100'

    cachedApiKey =
      typeof window !== 'undefined'
        ? window.__ASH_CONFIG__?.apiKey
        : process.env.ASH_API_KEY

    client = new AshClient({ serverUrl, apiKey: cachedApiKey })
  }
  return client
}

/** Return auth headers matching the SDK client's config. */
export function getAuthHeaders(): Record<string, string> {
  getClient() // ensure cachedApiKey is set
  return cachedApiKey ? { Authorization: `Bearer ${cachedApiKey}` } : {}
}

export function resetClient(): void {
  client = null
  cachedApiKey = undefined
}
