'use client'

import { useState, useEffect } from 'react'
import { useAgents, useSessions } from '@/lib/hooks'
import { getClient } from '@/lib/client'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { ShimmerBlock } from '@/components/ui/shimmer'
import { formatNumber, formatDuration } from '@/lib/utils'
import { Activity, Clock, Cpu, Zap } from 'lucide-react'

type Period = '7d' | '30d' | '90d'

function getAfterDate(period: Period): string {
  const now = new Date()
  const days = period === '7d' ? 7 : period === '30d' ? 30 : 90
  now.setDate(now.getDate() - days)
  return now.toISOString()
}

interface AgentStats {
  name: string
  sessions: number
  inputTokens: number
  outputTokens: number
  toolCalls: number
  computeSeconds: number
}

export default function AnalyticsPage() {
  const [period, setPeriod] = useState<Period>('7d')
  const { agents } = useAgents()
  const { sessions } = useSessions({ autoRefresh: false })
  const [agentStats, setAgentStats] = useState<AgentStats[]>([])
  const [loading, setLoading] = useState(true)
  const [totals, setTotals] = useState({
    sessions: 0,
    tokens: 0,
    toolCalls: 0,
    computeSeconds: 0,
  })

  useEffect(() => {
    async function fetchStats() {
      setLoading(true)
      const after = getAfterDate(period)
      const client = getClient()

      try {
        // Get overall stats
        const overall = await client.getUsageStats({}).catch(() => null)
        if (overall) {
          setTotals({
            sessions: sessions.length,
            tokens: (overall.totalInputTokens || 0) + (overall.totalOutputTokens || 0),
            toolCalls: overall.totalToolCalls || 0,
            computeSeconds: overall.totalComputeSeconds || 0,
          })
        }

        // Get per-agent stats
        const stats: AgentStats[] = []
        for (const agent of agents.slice(0, 10)) {
          try {
            const s = await client.getUsageStats({
              agentName: agent.name,
            })
            const agentSessions = sessions.filter(
              (sess) => sess.agentName === agent.name
            )
            stats.push({
              name: agent.name,
              sessions: agentSessions.length,
              inputTokens: s?.totalInputTokens || 0,
              outputTokens: s?.totalOutputTokens || 0,
              toolCalls: s?.totalToolCalls || 0,
              computeSeconds: s?.totalComputeSeconds || 0,
            })
          } catch {
            stats.push({
              name: agent.name,
              sessions: 0,
              inputTokens: 0,
              outputTokens: 0,
              toolCalls: 0,
              computeSeconds: 0,
            })
          }
        }

        stats.sort((a, b) => b.sessions - a.sessions)
        setAgentStats(stats)
      } catch {
        // ignore
      } finally {
        setLoading(false)
      }
    }

    if (agents.length > 0) {
      fetchStats()
    } else {
      setLoading(false)
    }
  }, [period, agents, sessions])

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white">Analytics</h1>
          <p className="mt-1 text-sm text-white/50">Usage and performance metrics</p>
        </div>
        <div className="flex gap-1 p-1 bg-white/5 rounded-lg">
          {(['7d', '30d', '90d'] as Period[]).map((p) => (
            <button
              key={p}
              onClick={() => setPeriod(p)}
              className={`px-3 py-1.5 text-sm font-medium rounded-md transition-colors ${
                period === p
                  ? 'bg-white/10 text-white'
                  : 'text-white/40 hover:text-white/70'
              }`}
            >
              {p}
            </button>
          ))}
        </div>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <SummaryCard
          icon={<Activity className="h-5 w-5" />}
          label="Sessions"
          value={loading ? '-' : totals.sessions.toString()}
        />
        <SummaryCard
          icon={<Zap className="h-5 w-5" />}
          label="Total Tokens"
          value={loading ? '-' : formatNumber(totals.tokens)}
        />
        <SummaryCard
          icon={<Cpu className="h-5 w-5" />}
          label="Tool Calls"
          value={loading ? '-' : formatNumber(totals.toolCalls)}
        />
        <SummaryCard
          icon={<Clock className="h-5 w-5" />}
          label="Compute Time"
          value={loading ? '-' : formatDuration(totals.computeSeconds)}
        />
      </div>

      {/* Top agents table */}
      <Card>
        <CardHeader>
          <CardTitle>Top Agents</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {loading ? (
            <div className="p-4 space-y-2">
              {[1, 2, 3].map((i) => (
                <ShimmerBlock key={i} height={40} />
              ))}
            </div>
          ) : agentStats.length === 0 ? (
            <p className="text-sm text-white/40 text-center py-8">
              No usage data for this period
            </p>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-white/10">
                  <th className="text-left px-6 py-3 text-xs font-medium text-white/40 uppercase">Agent</th>
                  <th className="text-right px-6 py-3 text-xs font-medium text-white/40 uppercase">Sessions</th>
                  <th className="text-right px-6 py-3 text-xs font-medium text-white/40 uppercase">Tokens</th>
                  <th className="text-right px-6 py-3 text-xs font-medium text-white/40 uppercase">Tool Calls</th>
                  <th className="text-right px-6 py-3 text-xs font-medium text-white/40 uppercase">Compute</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/5">
                {agentStats.map((stat) => (
                  <tr key={stat.name} className="hover:bg-white/[0.02]">
                    <td className="px-6 py-3 text-white/80 font-medium">{stat.name}</td>
                    <td className="px-6 py-3 text-right text-white/60">{stat.sessions}</td>
                    <td className="px-6 py-3 text-right text-white/60">
                      {formatNumber(stat.inputTokens + stat.outputTokens)}
                    </td>
                    <td className="px-6 py-3 text-right text-white/60">{stat.toolCalls}</td>
                    <td className="px-6 py-3 text-right text-white/60">
                      {formatDuration(stat.computeSeconds)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </CardContent>
      </Card>
    </div>
  )
}

function SummaryCard({
  icon,
  label,
  value,
}: {
  icon: React.ReactNode
  label: string
  value: string
}) {
  return (
    <Card>
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
}
