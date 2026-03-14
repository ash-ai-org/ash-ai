'use client'

import { Suspense, useState, useEffect } from 'react'
import { useSearchParams } from 'next/navigation'
import Link from 'next/link'
import { useEvalRunResults } from '@/lib/hooks'
import { getClient } from '@/lib/client'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { EmptyState } from '@/components/ui/empty-state'
import { ShimmerBlock } from '@/components/ui/shimmer'
import { formatRelativeTime, truncateId } from '@/lib/utils'
import {
  ArrowLeft,
  BarChart3,
  CheckCircle2,
  XCircle,
  Clock,
  Loader2,
  AlertTriangle,
  ChevronDown,
  ChevronRight,
} from 'lucide-react'

function statusVariant(status: string): 'success' | 'info' | 'error' | 'warning' | 'default' {
  switch (status) {
    case 'completed': return 'success'
    case 'running': return 'info'
    case 'error': return 'error'
    case 'pending': return 'warning'
    default: return 'default'
  }
}

function scoreColor(score: number | null): string {
  if (score === null) return 'text-white/30'
  if (score >= 0.8) return 'text-green-400'
  if (score >= 0.5) return 'text-yellow-400'
  return 'text-red-400'
}

function EvalRunDetailContent() {
  const searchParams = useSearchParams()
  const name = searchParams.get('name')
  const runId = searchParams.get('runId')
  const { results, loading, refresh } = useEvalRunResults(name, runId)
  const [run, setRun] = useState<any>(null)
  const [runLoading, setRunLoading] = useState(true)
  const [expandedResult, setExpandedResult] = useState<string | null>(null)

  // Fetch the run metadata
  useEffect(() => {
    if (!name || !runId) {
      setRunLoading(false)
      return
    }
    async function fetchRun() {
      try {
        const data = await getClient().getEvalRun(name!, runId!)
        setRun(data)
      } catch (e) {
        console.error('Failed to fetch eval run:', e)
      } finally {
        setRunLoading(false)
      }
    }
    fetchRun()
  }, [name, runId])

  // Auto-refresh for in-progress runs
  useEffect(() => {
    if (!run) return
    const isInProgress = run.status === 'running' || run.status === 'pending'
    if (!isInProgress) return
    const interval = setInterval(() => {
      refresh()
      // Re-fetch run metadata too
      if (name && runId) {
        getClient().getEvalRun(name, runId).then(setRun).catch(() => {})
      }
    }, 5000)
    return () => clearInterval(interval)
  }, [run, refresh, name, runId])

  if (!name || !runId) {
    return (
      <div className="text-center py-16">
        <p className="text-white/50">Missing agent name or run ID.</p>
        <Link href="/agents" className="text-indigo-400 hover:text-indigo-300 text-sm mt-2 inline-block">
          Back to agents
        </Link>
      </div>
    )
  }

  if (runLoading || loading) {
    return (
      <div className="space-y-6">
        <ShimmerBlock height={120} />
        <div className="space-y-3">
          {[1, 2, 3].map((i) => (
            <ShimmerBlock key={i} height={70} />
          ))}
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* Back link */}
      <Link
        href={`/agents/eval-runs?name=${encodeURIComponent(name)}`}
        className="inline-flex items-center gap-1.5 text-sm text-white/50 hover:text-white transition-colors"
      >
        <ArrowLeft className="h-4 w-4" />
        Back to eval runs
      </Link>

      {/* Run Summary */}
      <Card>
        <CardContent>
          <div className="flex items-center justify-between mb-4">
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-xl font-bold text-white">
                  Run {truncateId(runId)}
                </h1>
                {run && (
                  <Badge variant={statusVariant(run.status)}>
                    {run.status === 'running' && <Loader2 className="h-3 w-3 mr-1 animate-spin" />}
                    {run.status}
                  </Badge>
                )}
                {run?.versionNumber !== null && run?.versionNumber !== undefined && (
                  <Badge variant="default">v{run.versionNumber}</Badge>
                )}
              </div>
              {run && (
                <p className="text-xs text-white/30 mt-1">
                  Started {formatRelativeTime(run.createdAt)}
                  {run.completedAt && ` | Completed ${formatRelativeTime(run.completedAt)}`}
                </p>
              )}
            </div>
            {run && (
              <div className="text-sm text-white/50">
                {run.completedCases}/{run.totalCases} cases completed
              </div>
            )}
          </div>

          {/* Summary metrics */}
          {run?.summary && (
            <div className="grid grid-cols-2 sm:grid-cols-5 gap-4 mt-4 pt-4 border-t border-white/5">
              <MetricCard
                label="Pass Rate"
                value={`${(run.summary.passRate * 100).toFixed(0)}%`}
                color={run.summary.passRate >= 0.8 ? 'text-green-400' : run.summary.passRate >= 0.5 ? 'text-yellow-400' : 'text-red-400'}
              />
              <MetricCard
                label="Avg Topic Score"
                value={run.summary.avgTopicScore.toFixed(2)}
                color={scoreColor(run.summary.avgTopicScore)}
              />
              <MetricCard
                label="Avg Safety Score"
                value={run.summary.avgSafetyScore.toFixed(2)}
                color={scoreColor(run.summary.avgSafetyScore)}
              />
              {run.summary.avgLlmJudgeScore !== null && (
                <MetricCard
                  label="LLM Judge Score"
                  value={run.summary.avgLlmJudgeScore.toFixed(2)}
                  color={scoreColor(run.summary.avgLlmJudgeScore)}
                />
              )}
              <MetricCard
                label="Avg Latency"
                value={`${run.summary.avgLatencyMs.toFixed(0)}ms`}
                color="text-white"
              />
            </div>
          )}
        </CardContent>
      </Card>

      {/* Results Table */}
      <div>
        <h2 className="text-lg font-semibold text-white mb-3">Results</h2>
        {results.length === 0 ? (
          <EmptyState
            icon={<BarChart3 className="h-12 w-12" />}
            title="No results yet"
            description={run?.status === 'pending' || run?.status === 'running'
              ? 'Results will appear as the eval run progresses.'
              : 'No results were recorded for this run.'}
          />
        ) : (
          <div className="space-y-2">
            {results.map((result: any) => {
              const isExpanded = expandedResult === result.id
              return (
                <Card key={result.id}>
                  <CardContent className="!py-3">
                    <div className="flex items-center justify-between">
                      <button
                        onClick={() => setExpandedResult(isExpanded ? null : result.id)}
                        className="flex items-center gap-2 min-w-0 flex-1 text-left"
                      >
                        {isExpanded ? (
                          <ChevronDown className="h-4 w-4 text-white/40 flex-shrink-0" />
                        ) : (
                          <ChevronRight className="h-4 w-4 text-white/40 flex-shrink-0" />
                        )}
                        {result.status === 'completed' ? (
                          <CheckCircle2 className="h-4 w-4 text-green-400 flex-shrink-0" />
                        ) : result.status === 'error' ? (
                          <XCircle className="h-4 w-4 text-red-400 flex-shrink-0" />
                        ) : result.status === 'running' ? (
                          <Loader2 className="h-4 w-4 text-blue-400 animate-spin flex-shrink-0" />
                        ) : (
                          <Clock className="h-4 w-4 text-yellow-400 flex-shrink-0" />
                        )}
                        <span className="text-sm text-white truncate">
                          Case {truncateId(result.evalCaseId)}
                        </span>
                      </button>
                      <div className="flex items-center gap-3 flex-shrink-0 ml-2">
                        <Badge variant={statusVariant(result.status)}>{result.status}</Badge>
                        {result.topicScore !== null && (
                          <div className="text-right">
                            <div className="text-[10px] text-white/30">Topic</div>
                            <div className={`text-xs font-semibold ${scoreColor(result.topicScore)}`}>
                              {result.topicScore.toFixed(2)}
                            </div>
                          </div>
                        )}
                        {result.safetyScore !== null && (
                          <div className="text-right">
                            <div className="text-[10px] text-white/30">Safety</div>
                            <div className={`text-xs font-semibold ${scoreColor(result.safetyScore)}`}>
                              {result.safetyScore.toFixed(2)}
                            </div>
                          </div>
                        )}
                        {result.latencyMs !== null && (
                          <div className="text-right">
                            <div className="text-[10px] text-white/30">Latency</div>
                            <div className="text-xs font-semibold text-white">
                              {result.latencyMs.toFixed(0)}ms
                            </div>
                          </div>
                        )}
                      </div>
                    </div>
                    {isExpanded && (
                      <div className="mt-3 pt-3 border-t border-white/5 space-y-3">
                        {result.agentResponse && (
                          <div>
                            <div className="text-xs font-medium text-white/40 mb-1">Agent Response</div>
                            <div className="text-sm text-white/70 bg-black/20 rounded-lg p-3 whitespace-pre-wrap max-h-48 overflow-y-auto">
                              {result.agentResponse}
                            </div>
                          </div>
                        )}
                        {result.error && (
                          <div>
                            <div className="text-xs font-medium text-red-400 mb-1">Error</div>
                            <div className="text-sm text-red-300 bg-red-500/10 rounded-lg p-3">
                              {result.error}
                            </div>
                          </div>
                        )}
                        {result.llmJudgeScore !== null && (
                          <div className="flex items-center gap-2">
                            <span className="text-xs text-white/40">LLM Judge Score:</span>
                            <span className={`text-sm font-semibold ${scoreColor(result.llmJudgeScore)}`}>
                              {result.llmJudgeScore.toFixed(2)}
                            </span>
                          </div>
                        )}
                        {result.humanScore !== null && (
                          <div className="flex items-center gap-2">
                            <span className="text-xs text-white/40">Human Score:</span>
                            <span className="text-sm font-semibold text-white">
                              {result.humanScore}
                            </span>
                            {result.humanNotes && (
                              <span className="text-xs text-white/50">- {result.humanNotes}</span>
                            )}
                          </div>
                        )}
                      </div>
                    )}
                  </CardContent>
                </Card>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}

function MetricCard({
  label,
  value,
  color,
}: {
  label: string
  value: string
  color: string
}) {
  return (
    <div className="text-center">
      <div className="text-xs text-white/40 mb-1">{label}</div>
      <div className={`text-lg font-bold ${color}`}>{value}</div>
    </div>
  )
}

export default function EvalRunPage() {
  return (
    <Suspense fallback={<ShimmerBlock height={200} />}>
      <EvalRunDetailContent />
    </Suspense>
  )
}
