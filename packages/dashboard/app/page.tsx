'use client'

import { useAgents } from '@/lib/hooks'
import { useSessions } from '@/lib/hooks'
import { useHealth } from '@/lib/hooks'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { StatusBadge } from '@/components/ui/badge'
import { ShimmerBlock } from '@/components/ui/shimmer'
import { formatRelativeTime } from '@/lib/utils'
import { Activity, Bot, Cpu, Zap } from 'lucide-react'
import Link from 'next/link'

export default function DashboardHome() {
  const { agents, loading: agentsLoading } = useAgents()
  const { sessions, loading: sessionsLoading } = useSessions({ limit: 5 })
  const { health } = useHealth()

  const activeSessions = sessions.filter((s) => s.status === 'active')

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-bold text-white">Dashboard</h1>
        <p className="mt-1 text-sm text-white/50">
          Overview of your Ash server
        </p>
      </div>

      {/* Stat cards */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard
          icon={<Bot className="h-5 w-5" />}
          label="Agents"
          value={agentsLoading ? '-' : agents.length.toString()}
          href="/agents"
        />
        <StatCard
          icon={<Activity className="h-5 w-5" />}
          label="Active Sessions"
          value={sessionsLoading ? '-' : activeSessions.length.toString()}
          href="/sessions"
        />
        <StatCard
          icon={<Zap className="h-5 w-5" />}
          label="Total Sessions"
          value={sessionsLoading ? '-' : sessions.length.toString()}
          href="/sessions"
        />
        <StatCard
          icon={<Cpu className="h-5 w-5" />}
          label="Sandboxes"
          value={health?.activeSandboxes?.toString() ?? '-'}
        />
      </div>

      {/* Recent Sessions */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle>Recent Sessions</CardTitle>
            <Link
              href="/sessions"
              className="text-sm text-indigo-400 hover:text-indigo-300 transition-colors"
            >
              View all
            </Link>
          </div>
        </CardHeader>
        <CardContent>
          {sessionsLoading ? (
            <div className="space-y-3">
              {[1, 2, 3].map((i) => (
                <ShimmerBlock key={i} height={48} />
              ))}
            </div>
          ) : sessions.length === 0 ? (
            <p className="text-sm text-white/40 py-8 text-center">
              No sessions yet. Create an agent and start a session in the Playground.
            </p>
          ) : (
            <div className="space-y-2">
              {sessions.slice(0, 5).map((session) => (
                <Link
                  key={session.id}
                  href={`/sessions?id=${session.id}`}
                  className="flex items-center justify-between rounded-lg border border-white/5 bg-white/[0.02] px-4 py-3 hover:bg-white/5 transition-colors"
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-white truncate">
                        {session.agentName}
                      </p>
                      <p className="text-xs text-white/40 font-mono">
                        {session.id.slice(0, 8)}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    <StatusBadge status={session.status} />
                    <span className="text-xs text-white/30">
                      {formatRelativeTime(session.createdAt)}
                    </span>
                  </div>
                </Link>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}

function StatCard({
  icon,
  label,
  value,
  href,
}: {
  icon: React.ReactNode
  label: string
  value: string
  href?: string
}) {
  const content = (
    <Card className={href ? 'hover:border-white/20 cursor-pointer' : ''}>
      <CardContent>
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm text-white/50">{label}</p>
            <p className="text-2xl font-bold text-white mt-1">{value}</p>
          </div>
          <div className="text-white/20">{icon}</div>
        </div>
      </CardContent>
    </Card>
  )
  if (href) return <Link href={href}>{content}</Link>
  return content
}
