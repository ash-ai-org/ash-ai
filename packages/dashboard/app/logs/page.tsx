'use client'

import { useState, useCallback } from 'react'
import { useAgents, useSessions } from '@/lib/hooks'
import { getClient } from '@/lib/client'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge, StatusBadge } from '@/components/ui/badge'
import { Select } from '@/components/ui/select'
import { Input } from '@/components/ui/input'
import { ShimmerBlock } from '@/components/ui/shimmer'
import { cn, formatRelativeTime, truncateId } from '@/lib/utils'
import { ChevronDown, ChevronRight, Download, RefreshCw, Search } from 'lucide-react'
import type { Session, SessionEvent } from '@ash-ai/shared'

export default function LogsPage() {
  const { agents } = useAgents()
  const [agentFilter, setAgentFilter] = useState('')
  const [statusFilter, setStatusFilter] = useState('')
  const [search, setSearch] = useState('')
  const [autoRefresh, setAutoRefresh] = useState(true)

  const { sessions, loading, refetch } = useSessions({
    agent: agentFilter || undefined,
    autoRefresh,
  })

  const filtered = sessions.filter((s) => {
    if (statusFilter && s.status !== statusFilter) return false
    if (search) {
      const q = search.toLowerCase()
      return (
        s.id.toLowerCase().includes(q) ||
        s.agentName.toLowerCase().includes(q) ||
        s.status.toLowerCase().includes(q)
      )
    }
    return true
  })

  function exportCSV() {
    const rows = [
      ['Session ID', 'Agent', 'Status', 'Created'].join(','),
      ...filtered.map((s) =>
        [s.id, s.agentName, s.status, s.createdAt].join(',')
      ),
    ]
    const blob = new Blob([rows.join('\n')], { type: 'text/csv' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = 'sessions.csv'
    a.click()
    URL.revokeObjectURL(url)
  }

  function exportJSON() {
    const blob = new Blob([JSON.stringify(filtered, null, 2)], {
      type: 'application/json',
    })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = 'sessions.json'
    a.click()
    URL.revokeObjectURL(url)
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white">Logs</h1>
          <p className="mt-1 text-sm text-white/50">
            Session activity and event explorer
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="ghost" size="sm" onClick={exportCSV}>
            <Download className="h-4 w-4 mr-1" /> CSV
          </Button>
          <Button variant="ghost" size="sm" onClick={exportJSON}>
            <Download className="h-4 w-4 mr-1" /> JSON
          </Button>
          <Button
            variant={autoRefresh ? 'secondary' : 'ghost'}
            size="sm"
            onClick={() => setAutoRefresh(!autoRefresh)}
          >
            <RefreshCw className={cn('h-4 w-4', autoRefresh && 'animate-spin')} />
          </Button>
        </div>
      </div>

      {/* Filters */}
      <div className="flex gap-3">
        <div className="flex-1 relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-white/30" />
          <input
            type="text"
            placeholder="Search sessions..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full h-9 pl-9 pr-3 rounded-xl border bg-white/5 border-white/10 text-sm text-white placeholder:text-white/40 focus-visible:outline-none focus-visible:border-indigo-500/50"
          />
        </div>
        <Select
          options={[
            { value: '', label: 'All Agents' },
            ...agents.map((a) => ({ value: a.name, label: a.name })),
          ]}
          value={agentFilter}
          onChange={(e) => setAgentFilter(e.target.value)}
          className="w-40 h-9 text-xs"
        />
        <Select
          options={[
            { value: '', label: 'All Statuses' },
            { value: 'active', label: 'Active' },
            { value: 'paused', label: 'Paused' },
            { value: 'ended', label: 'Ended' },
            { value: 'error', label: 'Error' },
          ]}
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          className="w-36 h-9 text-xs"
        />
      </div>

      {/* Table */}
      <Card>
        <CardContent className="p-0">
          {loading ? (
            <div className="p-4 space-y-2">
              {[1, 2, 3, 4, 5].map((i) => (
                <ShimmerBlock key={i} height={40} />
              ))}
            </div>
          ) : filtered.length === 0 ? (
            <p className="text-sm text-white/40 text-center py-12">
              No sessions found
            </p>
          ) : (
            <div className="divide-y divide-white/5">
              {filtered.map((session) => (
                <SessionRow key={session.id} session={session} />
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}

function SessionRow({ session }: { session: Session }) {
  const [expanded, setExpanded] = useState(false)
  const [events, setEvents] = useState<SessionEvent[]>([])
  const [loadingEvents, setLoadingEvents] = useState(false)

  async function toggleExpand() {
    if (!expanded && events.length === 0) {
      setLoadingEvents(true)
      try {
        const result = await getClient().listSessionEvents(session.id, { limit: 50 })
        setEvents(result)
      } catch {
        // ignore
      } finally {
        setLoadingEvents(false)
      }
    }
    setExpanded(!expanded)
  }

  return (
    <div>
      <button
        onClick={toggleExpand}
        aria-expanded={expanded}
        className="flex items-center gap-4 w-full px-4 py-3 text-sm hover:bg-white/[0.02] transition-colors"
      >
        {expanded ? (
          <ChevronDown className="h-4 w-4 text-white/30 shrink-0" />
        ) : (
          <ChevronRight className="h-4 w-4 text-white/30 shrink-0" />
        )}
        <span className="text-xs text-white/30 w-24">
          {formatRelativeTime(session.createdAt)}
        </span>
        <span className="text-xs font-mono text-white/50 w-20">
          {truncateId(session.id)}
        </span>
        <span className="text-sm text-white/70 flex-1 text-left truncate">
          {session.agentName}
        </span>
        <StatusBadge status={session.status} />
      </button>
      {expanded && (
        <div className="pl-12 pr-4 pb-4">
          {loadingEvents ? (
            <div className="space-y-1">
              {[1, 2, 3].map((i) => (
                <ShimmerBlock key={i} height={24} />
              ))}
            </div>
          ) : events.length === 0 ? (
            <p className="text-xs text-white/30 py-2">No events</p>
          ) : (
            <div className="space-y-0.5 max-h-64 overflow-auto scrollbar-thin">
              {events.map((e, i) => {
                let summary = ''
                try {
                  const data = typeof e.data === 'string' ? JSON.parse(e.data) : e.data
                  summary = data?.text?.slice(0, 80) || data?.name || data?.error?.slice(0, 80) || ''
                } catch {
                  // ignore
                }
                return (
                  <div key={e.id || i} className="flex items-center gap-3 text-xs py-1">
                    <span className="text-white/20 font-mono w-6">#{e.sequence}</span>
                    <Badge>{e.type}</Badge>
                    <span className="text-white/40 truncate">{summary}</span>
                  </div>
                )
              })}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
