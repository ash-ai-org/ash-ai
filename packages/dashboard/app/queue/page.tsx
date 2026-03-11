'use client'

import { useState, useEffect, useCallback } from 'react'
import { useAgents } from '@/lib/hooks'
import { getClient } from '@/lib/client'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Select } from '@/components/ui/select'
import { Badge } from '@/components/ui/badge'
import { EmptyState } from '@/components/ui/empty-state'
import { ShimmerBlock } from '@/components/ui/shimmer'
import { cn, formatRelativeTime, truncateId } from '@/lib/utils'
import { ListOrdered, Plus, RefreshCw, X, XCircle } from 'lucide-react'
import type { Agent, QueueItem, QueueItemStatus } from '@ash-ai/shared'

const STATUS_COLORS: Record<string, string> = {
  pending: 'bg-yellow-500/20 text-yellow-400 border-yellow-500/30',
  processing: 'bg-blue-500/20 text-blue-400 border-blue-500/30',
  completed: 'bg-green-500/20 text-green-400 border-green-500/30',
  failed: 'bg-red-500/20 text-red-400 border-red-500/30',
  cancelled: 'bg-zinc-500/20 text-zinc-400 border-zinc-500/30',
}

interface QueueStats {
  pending: number
  processing: number
  completed: number
  failed: number
  cancelled: number
}

export default function QueuePage() {
  const { agents } = useAgents()
  const [items, setItems] = useState<QueueItem[]>([])
  const [stats, setStats] = useState<QueueStats | null>(null)
  const [loading, setLoading] = useState(true)
  const [statusFilter, setStatusFilter] = useState('')
  const [showEnqueue, setShowEnqueue] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const fetchData = useCallback(async () => {
    try {
      const client = getClient()
      const [itemsResult, statsResult] = await Promise.all([
        client.listQueueItems(statusFilter ? { status: statusFilter as QueueItemStatus } : {}),
        client.getQueueStats(),
      ])
      setItems(itemsResult)
      setStats(statsResult as QueueStats)
    } catch {
      // ignore
    } finally {
      setLoading(false)
    }
  }, [statusFilter])

  useEffect(() => {
    fetchData()
    const interval = setInterval(fetchData, 5000)
    return () => clearInterval(interval)
  }, [fetchData])

  async function handleCancel(id: string) {
    setError(null)
    try {
      await getClient().cancelQueueItem(id)
      fetchData()
    } catch (e) {
      const message = e instanceof Error ? e.message : 'Failed to cancel job'
      setError(message)
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white">Queue</h1>
          <p className="mt-1 text-sm text-white/50">Async job queue for agent tasks</p>
        </div>
        <Button onClick={() => setShowEnqueue(true)}>
          <Plus className="h-4 w-4 mr-2" />
          Enqueue Job
        </Button>
      </div>

      {error && (
        <div className="text-sm text-red-400 bg-red-500/10 border border-red-500/20 rounded-lg px-4 py-2">
          {error}
        </div>
      )}

      {/* Stats */}
      {stats && (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
          {(['pending', 'processing', 'completed', 'failed', 'cancelled'] as const).map(
            (status) => (
              <Card key={status}>
                <CardContent className="py-3">
                  <p className="text-xs text-white/40 capitalize">{status}</p>
                  <p className="text-xl font-bold text-white">{stats[status]}</p>
                </CardContent>
              </Card>
            )
          )}
        </div>
      )}

      {/* Filters */}
      <div className="flex gap-3">
        <Select
          options={[
            { value: '', label: 'All Statuses' },
            { value: 'pending', label: 'Pending' },
            { value: 'processing', label: 'Processing' },
            { value: 'completed', label: 'Completed' },
            { value: 'failed', label: 'Failed' },
          ]}
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          className="w-40"
        />
      </div>

      {/* Items */}
      <Card>
        <CardContent className="p-0">
          {loading ? (
            <div className="p-4 space-y-2">
              {[1, 2, 3].map((i) => (
                <ShimmerBlock key={i} height={48} />
              ))}
            </div>
          ) : items.length === 0 ? (
            <EmptyState
              icon={<ListOrdered className="h-12 w-12" />}
              title="Queue is empty"
              description="Enqueue a job to process it asynchronously."
              action={
                <Button onClick={() => setShowEnqueue(true)}>
                  <Plus className="h-4 w-4 mr-2" />
                  Enqueue Job
                </Button>
              }
            />
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-white/10">
                  <th className="text-left px-6 py-3 text-xs font-medium text-white/40 uppercase">ID</th>
                  <th className="text-left px-6 py-3 text-xs font-medium text-white/40 uppercase">Agent</th>
                  <th className="text-left px-6 py-3 text-xs font-medium text-white/40 uppercase">Prompt</th>
                  <th className="text-left px-6 py-3 text-xs font-medium text-white/40 uppercase">Status</th>
                  <th className="text-left px-6 py-3 text-xs font-medium text-white/40 uppercase">Age</th>
                  <th className="text-right px-6 py-3 text-xs font-medium text-white/40 uppercase">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/5">
                {items.map((item) => (
                  <tr key={item.id} className="hover:bg-white/[0.02]">
                    <td className="px-6 py-3 font-mono text-xs text-white/50">
                      {truncateId(item.id)}
                    </td>
                    <td className="px-6 py-3 text-white/80">{item.agentName}</td>
                    <td className="px-6 py-3 text-white/60 max-w-xs truncate">
                      {item.prompt}
                    </td>
                    <td className="px-6 py-3">
                      <span
                        className={cn(
                          'inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium border',
                          STATUS_COLORS[item.status] || STATUS_COLORS.pending
                        )}
                      >
                        {item.status}
                      </span>
                    </td>
                    <td className="px-6 py-3 text-white/40 text-xs">
                      {formatRelativeTime(item.createdAt)}
                    </td>
                    <td className="px-6 py-3 text-right">
                      {item.status === 'pending' && (
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => handleCancel(item.id)}
                          className="text-red-400"
                        >
                          <XCircle className="h-3.5 w-3.5" />
                        </Button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </CardContent>
      </Card>

      {showEnqueue && (
        <EnqueueModal
          agents={agents}
          onClose={() => setShowEnqueue(false)}
          onCreated={() => {
            setShowEnqueue(false)
            fetchData()
          }}
        />
      )}
    </div>
  )
}

function EnqueueModal({
  agents,
  onClose,
  onCreated,
}: {
  agents: Agent[]
  onClose: () => void
  onCreated: () => void
}) {
  const [agentName, setAgentName] = useState(agents[0]?.name || '')
  const [prompt, setPrompt] = useState('')
  const [creating, setCreating] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleEnqueue() {
    if (!agentName || !prompt.trim()) {
      setError('Agent and prompt are required')
      return
    }

    setCreating(true)
    setError(null)

    try {
      await getClient().enqueue(agentName, prompt.trim())
      onCreated()
    } catch (e) {
      const message = e instanceof Error ? e.message : 'Failed to enqueue'
      setError(message)
    } finally {
      setCreating(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
      <Card className="w-full max-w-md">
        <CardContent>
          <div className="flex items-center justify-between mb-6">
            <h2 className="text-lg font-semibold text-white">Enqueue Job</h2>
            <button onClick={onClose} className="text-white/40 hover:text-white">
              <X className="h-5 w-5" />
            </button>
          </div>

          <div className="space-y-4">
            <Select
              label="Agent"
              options={agents.map((a) => ({ value: a.name, label: a.name }))}
              value={agentName}
              onChange={(e) => setAgentName(e.target.value)}
            />

            <div className="space-y-1.5">
              <label className="block text-sm font-medium text-white/70">Prompt</label>
              <textarea
                value={prompt}
                onChange={(e) => setPrompt(e.target.value)}
                rows={4}
                placeholder="What should the agent do?"
                className="flex w-full rounded-xl border px-3 py-2 text-sm bg-white/5 border-white/10 text-white placeholder:text-white/40 focus-visible:outline-none focus-visible:border-indigo-500/50 resize-none"
              />
            </div>

            {error && <p className="text-sm text-red-400">{error}</p>}

            <div className="flex justify-end gap-3 pt-2">
              <Button variant="ghost" onClick={onClose}>
                Cancel
              </Button>
              <Button onClick={handleEnqueue} disabled={creating}>
                {creating ? 'Enqueuing...' : 'Enqueue'}
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
