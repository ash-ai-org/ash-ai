'use client'

import { Suspense, useState, useEffect } from 'react'
import { useSearchParams } from 'next/navigation'
import Link from 'next/link'
import { useEvalRuns, useAgentVersions } from '@/lib/hooks'
import { getClient } from '@/lib/client'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Select } from '@/components/ui/select'
import { Badge } from '@/components/ui/badge'
import { EmptyState } from '@/components/ui/empty-state'
import { ShimmerBlock } from '@/components/ui/shimmer'
import { formatRelativeTime, truncateId } from '@/lib/utils'
import {
  ArrowLeft,
  Play,
  BarChart3,
  Loader2,
  GitCompare,
  CheckCircle2,
  XCircle,
  Clock,
  AlertTriangle,
  X,
} from 'lucide-react'

function statusIcon(status: string) {
  switch (status) {
    case 'completed':
      return <CheckCircle2 className="h-4 w-4 text-green-400" />
    case 'running':
      return <Loader2 className="h-4 w-4 text-blue-400 animate-spin" />
    case 'failed':
      return <XCircle className="h-4 w-4 text-red-400" />
    case 'pending':
      return <Clock className="h-4 w-4 text-yellow-400" />
    default:
      return <AlertTriangle className="h-4 w-4 text-white/40" />
  }
}

function statusVariant(status: string): 'success' | 'info' | 'error' | 'warning' | 'default' {
  switch (status) {
    case 'completed': return 'success'
    case 'running': return 'info'
    case 'failed': return 'error'
    case 'pending': return 'warning'
    default: return 'default'
  }
}

function EvalRunsContent() {
  const searchParams = useSearchParams()
  const name = searchParams.get('name')
  const { runs, loading, refresh } = useEvalRuns(name)
  const { versions } = useAgentVersions(name)
  const [showRunModal, setShowRunModal] = useState(false)
  const [compareMode, setCompareMode] = useState(false)
  const [selectedRuns, setSelectedRuns] = useState<string[]>([])
  const [error, setError] = useState<string | null>(null)

  // Auto-refresh when there are running runs
  useEffect(() => {
    const hasRunning = runs.some((r: any) => r.status === 'running' || r.status === 'pending')
    if (!hasRunning) return
    const interval = setInterval(() => refresh(), 5000)
    return () => clearInterval(interval)
  }, [runs, refresh])

  function toggleRunSelection(runId: string) {
    setSelectedRuns((prev) => {
      if (prev.includes(runId)) return prev.filter((id) => id !== runId)
      if (prev.length >= 2) return [prev[1], runId]
      return [...prev, runId]
    })
  }

  if (!name) {
    return (
      <div className="text-center py-16">
        <p className="text-white/50">No agent name specified.</p>
        <Link href="/agents" className="text-indigo-400 hover:text-indigo-300 text-sm mt-2 inline-block">
          Back to agents
        </Link>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* Back link */}
      <Link
        href={`/agents/evals?name=${encodeURIComponent(name)}`}
        className="inline-flex items-center gap-1.5 text-sm text-white/50 hover:text-white transition-colors"
      >
        <ArrowLeft className="h-4 w-4" />
        Back to eval cases
      </Link>

      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white">Eval Runs</h1>
          <p className="mt-1 text-sm text-white/50">
            Run history for <span className="text-white/70">{name}</span>
          </p>
        </div>
        <div className="flex items-center gap-2">
          {runs.length >= 2 && (
            <Button
              variant={compareMode ? 'primary' : 'secondary'}
              onClick={() => {
                setCompareMode(!compareMode)
                setSelectedRuns([])
              }}
            >
              <GitCompare className="h-4 w-4 mr-2" />
              {compareMode ? 'Cancel Compare' : 'Compare'}
            </Button>
          )}
          {compareMode && selectedRuns.length === 2 && (
            <Link
              href={`/agents/eval-compare?name=${encodeURIComponent(name)}&runA=${selectedRuns[0]}&runB=${selectedRuns[1]}`}
            >
              <Button>
                <BarChart3 className="h-4 w-4 mr-2" />
                Compare Selected
              </Button>
            </Link>
          )}
          {!compareMode && (
            <Button onClick={() => setShowRunModal(true)}>
              <Play className="h-4 w-4 mr-2" />
              Run Evals
            </Button>
          )}
        </div>
      </div>

      {error && (
        <div className="text-sm text-red-400 bg-red-500/10 border border-red-500/20 rounded-lg px-4 py-2">
          {error}
        </div>
      )}

      {compareMode && (
        <div className="text-sm text-white/50 bg-indigo-500/5 border border-indigo-500/20 rounded-lg px-4 py-2">
          Select 2 runs to compare. Selected: {selectedRuns.length}/2
        </div>
      )}

      {loading ? (
        <div className="space-y-3">
          {[1, 2, 3].map((i) => (
            <ShimmerBlock key={i} height={80} />
          ))}
        </div>
      ) : runs.length === 0 ? (
        <EmptyState
          icon={<BarChart3 className="h-12 w-12" />}
          title="No eval runs yet"
          description="Start an eval run to test your agent against the defined eval cases."
          action={
            <Button onClick={() => setShowRunModal(true)}>
              <Play className="h-4 w-4 mr-2" />
              Run Evals
            </Button>
          }
        />
      ) : (
        <div className="space-y-3">
          {runs.map((run: any) => {
            const isSelected = selectedRuns.includes(run.id)
            return (
              <Card
                key={run.id}
                className={compareMode && isSelected ? 'border-indigo-500/50 bg-indigo-500/5' : ''}
              >
                <CardContent>
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3 min-w-0 flex-1">
                      {compareMode && (
                        <button
                          onClick={() => toggleRunSelection(run.id)}
                          className={`flex-shrink-0 h-5 w-5 rounded border-2 transition-colors ${
                            isSelected
                              ? 'bg-indigo-500 border-indigo-500'
                              : 'border-white/20 hover:border-white/40'
                          }`}
                        >
                          {isSelected && <CheckCircle2 className="h-4 w-4 text-white" />}
                        </button>
                      )}
                      {statusIcon(run.status)}
                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          {!compareMode ? (
                            <Link
                              href={`/agents/eval-run?name=${encodeURIComponent(name)}&runId=${run.id}`}
                              className="text-sm font-semibold text-white hover:text-indigo-400 transition-colors"
                            >
                              Run {truncateId(run.id)}
                            </Link>
                          ) : (
                            <span className="text-sm font-semibold text-white">
                              Run {truncateId(run.id)}
                            </span>
                          )}
                          <Badge variant={statusVariant(run.status)}>{run.status}</Badge>
                          {run.versionNumber !== null && run.versionNumber !== undefined && (
                            <Badge variant="default">v{run.versionNumber}</Badge>
                          )}
                        </div>
                        <div className="flex items-center gap-3 mt-1">
                          <span className="text-xs text-white/30">
                            {formatRelativeTime(run.createdAt)}
                          </span>
                          <span className="text-xs text-white/30">
                            {run.completedCases}/{run.totalCases} cases
                          </span>
                        </div>
                      </div>
                    </div>
                    {run.summary && (
                      <div className="flex items-center gap-4 flex-shrink-0">
                        <div className="text-right">
                          <div className="text-xs text-white/40">Pass Rate</div>
                          <div className={`text-sm font-semibold ${
                            run.summary.passRate >= 0.8
                              ? 'text-green-400'
                              : run.summary.passRate >= 0.5
                                ? 'text-yellow-400'
                                : 'text-red-400'
                          }`}>
                            {(run.summary.passRate * 100).toFixed(0)}%
                          </div>
                        </div>
                        <div className="text-right">
                          <div className="text-xs text-white/40">Topic</div>
                          <div className="text-sm font-semibold text-white">
                            {run.summary.avgTopicScore.toFixed(2)}
                          </div>
                        </div>
                        <div className="text-right">
                          <div className="text-xs text-white/40">Safety</div>
                          <div className="text-sm font-semibold text-white">
                            {run.summary.avgSafetyScore.toFixed(2)}
                          </div>
                        </div>
                        <div className="text-right">
                          <div className="text-xs text-white/40">Latency</div>
                          <div className="text-sm font-semibold text-white">
                            {run.summary.avgLatencyMs.toFixed(0)}ms
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                </CardContent>
              </Card>
            )
          })}
        </div>
      )}

      {/* Run Evals Modal */}
      {showRunModal && (
        <RunEvalsModal
          agentName={name}
          versions={versions}
          onClose={() => setShowRunModal(false)}
          onStarted={() => {
            setShowRunModal(false)
            refresh()
          }}
        />
      )}
    </div>
  )
}

// ─── Run Evals Modal ───

function RunEvalsModal({
  agentName,
  versions,
  onClose,
  onStarted,
}: {
  agentName: string
  versions: any[]
  onClose: () => void
  onStarted: () => void
}) {
  const [versionNumber, setVersionNumber] = useState<string>('')
  const [starting, setStarting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleStart() {
    setStarting(true)
    setError(null)
    try {
      await getClient().startEvalRun(agentName, {
        versionNumber: versionNumber ? Number(versionNumber) : undefined,
      })
      onStarted()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to start eval run')
    } finally {
      setStarting(false)
    }
  }

  const versionOptions = versions.map((v: any) => ({
    value: String(v.versionNumber),
    label: `v${v.versionNumber}${v.name ? ` - ${v.name}` : ''}${v.isActive ? ' (active)' : ''}`,
  }))

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
      <Card className="w-full max-w-md">
        <CardContent>
          <div className="flex items-center justify-between mb-6">
            <h2 className="text-lg font-semibold text-white">Run Evals</h2>
            <button onClick={onClose} className="text-white/40 hover:text-white">
              <X className="h-5 w-5" />
            </button>
          </div>

          <div className="space-y-4">
            <Select
              label="Version (optional)"
              placeholder="Use active version"
              options={versionOptions}
              value={versionNumber}
              onChange={(e) => setVersionNumber(e.target.value)}
            />

            <p className="text-xs text-white/40">
              This will run all active eval cases against the selected version of the agent.
            </p>

            {error && <p className="text-sm text-red-400">{error}</p>}

            <div className="flex justify-end gap-3 pt-2">
              <Button variant="ghost" onClick={onClose}>
                Cancel
              </Button>
              <Button onClick={handleStart} disabled={starting}>
                {starting ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    Starting...
                  </>
                ) : (
                  <>
                    <Play className="h-4 w-4 mr-2" />
                    Start Run
                  </>
                )}
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}

export default function EvalRunsPage() {
  return (
    <Suspense fallback={<ShimmerBlock height={200} />}>
      <EvalRunsContent />
    </Suspense>
  )
}
