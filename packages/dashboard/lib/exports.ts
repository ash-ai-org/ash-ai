/**
 * @ash-ai/dashboard public API
 *
 * This barrel exports components, hooks, and utilities for use by consumers
 * like the ash-cloud-platform. Pages are exported as named components so they
 * can be wrapped with auth / context by the consuming app.
 *
 * NOTE: All page components are React Client Components ('use client').
 * They rely on the AshProvider context or getClient() for data fetching.
 */

// ─── Page Components ─────────────────────────────────────────────────────────
export { default as DashboardHomePage } from '@/app/page'
export { default as AgentsPage } from '@/app/agents/page'
export { default as SessionsPage } from '@/app/sessions/page'
export { default as PlaygroundPage } from '@/app/playground/page'
export { default as LogsPage } from '@/app/logs/page'
export { default as AnalyticsPage } from '@/app/analytics/page'
export { default as ApiKeysPage } from '@/app/settings/api-keys/page'
export { default as CredentialsPage } from '@/app/settings/credentials/page'
export { default as QueuePage } from '@/app/queue/page'

// ─── Navigation ──────────────────────────────────────────────────────────────
export { DashboardNav } from '@/components/nav'
export type { NavItem } from '@/components/nav'

// ─── UI Primitives ───────────────────────────────────────────────────────────
export { Badge, StatusBadge } from '@/components/ui/badge'
export type { BadgeProps } from '@/components/ui/badge'
export { Button } from '@/components/ui/button'
export { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card'
export { EmptyState } from '@/components/ui/empty-state'
export { Input } from '@/components/ui/input'
export { Select } from '@/components/ui/select'
export { ShimmerBlock } from '@/components/ui/shimmer'

// ─── Data Layer ──────────────────────────────────────────────────────────────
export { AshProvider, useAshClient } from '@/components/providers'
export { getClient, getAuthHeaders, resetClient } from '@/lib/client'
export {
  useAgents,
  useSessions,
  useHealth,
  useCredentials,
  useUsageStats,
} from '@/lib/hooks'

// ─── Utilities ───────────────────────────────────────────────────────────────
export {
  cn,
  formatRelativeTime,
  formatNumber,
  formatDuration,
  truncateId,
} from '@/lib/utils'
