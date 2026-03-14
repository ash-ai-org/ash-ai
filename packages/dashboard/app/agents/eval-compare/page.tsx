'use client'

import { Suspense, useState, useEffect } from 'react'
import { useSearchParams } from 'next/navigation'
import Link from 'next/link'
import { getClient } from '@/lib/client'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { ShimmerBlock } from '@/components/ui/shimmer'
import { formatRelativeTime, truncateId } from '@/lib/utils'
import {
  ArrowLeft,
  ArrowUpRight,
  ArrowDownRight,
  Minus,
  ChevronDown,
  ChevronRight,
} from 'lucide-react'
import type { EvalRunComparison } from '@ash-ai/shared'

function scoreColor(score: number | null): string {
  if (score === null) return 'text-white/30'
  if (score >= 0.8) return 'text-green-400'
  if (score >= 0.5) return 'text-yellow-400'
  return 'text-red-400'
}

function DiffIndicator({ a, b }: { a: number | null; b: number | null }) {
  if (a === null || b === null) return <Minus className="h-3 w-3 text-white/20" />
  const diff = b - a
  if (Math.abs(diff) < 0.01) return <Minus className="h-3 w-3 text-white/30" />
  if (diff > 0) return <ArrowUpRight className="h-3 w-3 text-green-400" />
  return <ArrowDownRight className="h-3 w-3 text-red-400" />
}

function diffValue(a: number | null, b: number | null): string {
  if (a === null || b === null) return '--'
  const diff = b - a
  const sign = diff >= 0 ? '+' : ''
  return `${sign}${diff.toFixed(2)}`
}

function diffColor(a: number | null, b: number | null): string {
  if (a === null || b === null) return 'text-white/30'
  const diff = b - a
  if (Math.abs(diff) < 0.01) return 'text-white/30'
  return diff > 0 ? 'text-green-400' : 'text-red-400'
}

function EvalCompareContent() {
  const searchParams = useSearchParams()
  const name = searchParams.get('name')
  const runA = searchParams.get('runA')
  const runB = searchParams.get('runB')

  const [comparison, setComparison] = useState<EvalRunComparison | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [expandedCase, setExpandedCase] = useState<string | null>(null)

  useEffect(() => {
    if (!name || !runA || !runB) {
      setLoading(false)
      return
    }
    async function fetchComparison() {
      try {
        const data = await getClient().compareEvalRuns(name!, runA!, runB!)
        setComparison(data)
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Failed to load comparison')
      } finally {
        setLoading(false)
      }
    }
    fetchComparison()
  }, [name, runA, runB])

  if (!name || !runA || !runB) {
    return (
      <div className="text-center py-16">
        <p className="text-white/50">Missing comparison parameters.</p>
        <Link href="/agents" className="text-indigo-400 hover:text-indigo-300 text-sm mt-2 inline-block">
          Back to agents
        </Link>
      </div>
    )
  }

  if (loading) {
    return (
      <div className="space-y-6">
        <ShimmerBlock height={120} />
        <ShimmerBlock height={200} />
      </div>
    )
  }

  if (error || !comparison) {
    return (
      <div className="text-center py-16">
        <p className="text-red-400">{error || 'Failed to load comparison'}</p>
        <Link
          href={`/agents/eval-runs?name=${encodeURIComponent(name)}`}
          className="text-indigo-400 hover:text-indigo-300 text-sm mt-2 inline-block"
        >
          Back to eval runs
        </Link>
      </div>
    )
  }

  const { runA: metaA, runB: metaB, results } = comparison

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

      <h1 className="text-2xl font-bold text-white">Run Comparison</h1>

      {/* Summary Comparison */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        {/* Run A */}
        <Card>
          <CardContent>
            <div className="text-xs text-white/40 mb-2">Run A</div>
            <div className="flex items-center gap-2 mb-2">
              <span className="text-sm font-semibold text-white">{truncateId(metaA.id)}</span>
              {metaA.versionNumber !== null && metaA.versionNumber !== undefined && (
                <Badge variant="default">v{metaA.versionNumber}</Badge>
              )}
            </div>
            <div className="text-xs text-white/30">{formatRelativeTime(metaA.createdAt)}</div>
            {metaA.summary && (
              <div className="mt-3 pt-3 border-t border-white/5 space-y-1">
                <div className="flex justify-between">
                  <span className="text-xs text-white/40">Pass Rate</span>
                  <span className={`text-xs font-semibold ${scoreColor(metaA.summary.passRate)}`}>
                    {(metaA.summary.passRate * 100).toFixed(0)}%
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-xs text-white/40">Topic</span>
                  <span className={`text-xs font-semibold ${scoreColor(metaA.summary.avgTopicScore)}`}>
                    {metaA.summary.avgTopicScore.toFixed(2)}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-xs text-white/40">Safety</span>
                  <span className={`text-xs font-semibold ${scoreColor(metaA.summary.avgSafetyScore)}`}>
                    {metaA.summary.avgSafetyScore.toFixed(2)}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-xs text-white/40">Latency</span>
                  <span className="text-xs font-semibold text-white">
                    {metaA.summary.avgLatencyMs.toFixed(0)}ms
                  </span>
                </div>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Diff */}
        <Card className="bg-white/[0.02]">
          <CardContent>
            <div className="text-xs text-white/40 mb-2">Difference (B - A)</div>
            {metaA.summary && metaB.summary ? (
              <div className="space-y-3 mt-3">
                <DiffRow
                  label="Pass Rate"
                  a={metaA.summary.passRate}
                  b={metaB.summary.passRate}
                  format={(v) => `${(v * 100).toFixed(0)}%`}
                  formatDiff={(d) => `${(d * 100).toFixed(1)}pp`}
                />
                <DiffRow
                  label="Topic Score"
                  a={metaA.summary.avgTopicScore}
                  b={metaB.summary.avgTopicScore}
                />
                <DiffRow
                  label="Safety Score"
                  a={metaA.summary.avgSafetyScore}
                  b={metaB.summary.avgSafetyScore}
                />
                <DiffRow
                  label="Latency"
                  a={metaA.summary.avgLatencyMs}
                  b={metaB.summary.avgLatencyMs}
                  format={(v) => `${v.toFixed(0)}ms`}
                  formatDiff={(d) => `${d > 0 ? '+' : ''}${d.toFixed(0)}ms`}
                  invertColor
                />
              </div>
            ) : (
              <p className="text-xs text-white/30 mt-4">
                Summary data not available for both runs.
              </p>
            )}
          </CardContent>
        </Card>

        {/* Run B */}
        <Card>
          <CardContent>
            <div className="text-xs text-white/40 mb-2">Run B</div>
            <div className="flex items-center gap-2 mb-2">
              <span className="text-sm font-semibold text-white">{truncateId(metaB.id)}</span>
              {metaB.versionNumber !== null && metaB.versionNumber !== undefined && (
                <Badge variant="default">v{metaB.versionNumber}</Badge>
              )}
            </div>
            <div className="text-xs text-white/30">{formatRelativeTime(metaB.createdAt)}</div>
            {metaB.summary && (
              <div className="mt-3 pt-3 border-t border-white/5 space-y-1">
                <div className="flex justify-between">
                  <span className="text-xs text-white/40">Pass Rate</span>
                  <span className={`text-xs font-semibold ${scoreColor(metaB.summary.passRate)}`}>
                    {(metaB.summary.passRate * 100).toFixed(0)}%
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-xs text-white/40">Topic</span>
                  <span className={`text-xs font-semibold ${scoreColor(metaB.summary.avgTopicScore)}`}>
                    {metaB.summary.avgTopicScore.toFixed(2)}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-xs text-white/40">Safety</span>
                  <span className={`text-xs font-semibold ${scoreColor(metaB.summary.avgSafetyScore)}`}>
                    {metaB.summary.avgSafetyScore.toFixed(2)}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-xs text-white/40">Latency</span>
                  <span className="text-xs font-semibold text-white">
                    {metaB.summary.avgLatencyMs.toFixed(0)}ms
                  </span>
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Per-case comparison */}
      <div>
        <h2 className="text-lg font-semibold text-white mb-3">Per-Case Comparison</h2>
        {results.length === 0 ? (
          <p className="text-sm text-white/40">No per-case results available.</p>
        ) : (
          <div className="space-y-2">
            {results.map((item) => {
              const isExpanded = expandedCase === item.caseId
              return (
                <Card key={item.caseId}>
                  <CardContent className="!py-3">
                    <button
                      onClick={() => setExpandedCase(isExpanded ? null : item.caseId)}
                      className="flex items-center justify-between w-full text-left"
                    >
                      <div className="flex items-center gap-2 min-w-0 flex-1">
                        {isExpanded ? (
                          <ChevronDown className="h-4 w-4 text-white/40 flex-shrink-0" />
                        ) : (
                          <ChevronRight className="h-4 w-4 text-white/40 flex-shrink-0" />
                        )}
                        <span className="text-sm text-white truncate">{item.question}</span>
                      </div>
                      <div className="flex items-center gap-4 flex-shrink-0 ml-2">
                        {/* Topic score comparison */}
                        <div className="flex items-center gap-1">
                          <span className={`text-xs ${scoreColor(item.resultA?.topicScore ?? null)}`}>
                            {item.resultA?.topicScore?.toFixed(2) ?? '--'}
                          </span>
                          <DiffIndicator
                            a={item.resultA?.topicScore ?? null}
                            b={item.resultB?.topicScore ?? null}
                          />
                          <span className={`text-xs ${scoreColor(item.resultB?.topicScore ?? null)}`}>
                            {item.resultB?.topicScore?.toFixed(2) ?? '--'}
                          </span>
                        </div>
                        {/* Safety score comparison */}
                        <div className="flex items-center gap-1">
                          <span className={`text-xs ${scoreColor(item.resultA?.safetyScore ?? null)}`}>
                            {item.resultA?.safetyScore?.toFixed(2) ?? '--'}
                          </span>
                          <DiffIndicator
                            a={item.resultA?.safetyScore ?? null}
                            b={item.resultB?.safetyScore ?? null}
                          />
                          <span className={`text-xs ${scoreColor(item.resultB?.safetyScore ?? null)}`}>
                            {item.resultB?.safetyScore?.toFixed(2) ?? '--'}
                          </span>
                        </div>
                      </div>
                    </button>
                    {isExpanded && (
                      <div className="mt-3 pt-3 border-t border-white/5">
                        <div className="grid grid-cols-2 gap-4">
                          {/* Run A response */}
                          <div>
                            <div className="text-xs font-medium text-white/40 mb-1">
                              Run A Response
                            </div>
                            {item.resultA?.agentResponse ? (
                              <div className="text-xs text-white/60 bg-black/20 rounded-lg p-3 whitespace-pre-wrap max-h-40 overflow-y-auto">
                                {item.resultA.agentResponse}
                              </div>
                            ) : (
                              <p className="text-xs text-white/20 italic">No response</p>
                            )}
                            {item.resultA && (
                              <div className="flex gap-3 mt-2">
                                {item.resultA.topicScore !== null && (
                                  <span className={`text-xs ${scoreColor(item.resultA.topicScore)}`}>
                                    Topic: {item.resultA.topicScore.toFixed(2)}
                                  </span>
                                )}
                                {item.resultA.safetyScore !== null && (
                                  <span className={`text-xs ${scoreColor(item.resultA.safetyScore)}`}>
                                    Safety: {item.resultA.safetyScore.toFixed(2)}
                                  </span>
                                )}
                                {item.resultA.latencyMs !== null && (
                                  <span className="text-xs text-white/30">
                                    {item.resultA.latencyMs.toFixed(0)}ms
                                  </span>
                                )}
                              </div>
                            )}
                          </div>
                          {/* Run B response */}
                          <div>
                            <div className="text-xs font-medium text-white/40 mb-1">
                              Run B Response
                            </div>
                            {item.resultB?.agentResponse ? (
                              <div className="text-xs text-white/60 bg-black/20 rounded-lg p-3 whitespace-pre-wrap max-h-40 overflow-y-auto">
                                {item.resultB.agentResponse}
                              </div>
                            ) : (
                              <p className="text-xs text-white/20 italic">No response</p>
                            )}
                            {item.resultB && (
                              <div className="flex gap-3 mt-2">
                                {item.resultB.topicScore !== null && (
                                  <span className={`text-xs ${scoreColor(item.resultB.topicScore)}`}>
                                    Topic: {item.resultB.topicScore.toFixed(2)}
                                  </span>
                                )}
                                {item.resultB.safetyScore !== null && (
                                  <span className={`text-xs ${scoreColor(item.resultB.safetyScore)}`}>
                                    Safety: {item.resultB.safetyScore.toFixed(2)}
                                  </span>
                                )}
                                {item.resultB.latencyMs !== null && (
                                  <span className="text-xs text-white/30">
                                    {item.resultB.latencyMs.toFixed(0)}ms
                                  </span>
                                )}
                              </div>
                            )}
                          </div>
                        </div>
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

function DiffRow({
  label,
  a,
  b,
  format = (v) => v.toFixed(2),
  formatDiff,
  invertColor = false,
}: {
  label: string
  a: number
  b: number
  format?: (v: number) => string
  formatDiff?: (d: number) => string
  invertColor?: boolean
}) {
  const diff = b - a
  const absDiff = Math.abs(diff)
  const isPositive = diff > 0
  const isNeutral = absDiff < 0.01

  let colorClass = 'text-white/30'
  if (!isNeutral) {
    if (invertColor) {
      colorClass = isPositive ? 'text-red-400' : 'text-green-400'
    } else {
      colorClass = isPositive ? 'text-green-400' : 'text-red-400'
    }
  }

  const diffStr = formatDiff
    ? formatDiff(diff)
    : `${diff >= 0 ? '+' : ''}${diff.toFixed(2)}`

  return (
    <div className="flex items-center justify-between">
      <span className="text-xs text-white/50">{label}</span>
      <div className="flex items-center gap-2">
        {!isNeutral && (
          isPositive === !invertColor ? (
            <ArrowUpRight className={`h-3 w-3 ${colorClass}`} />
          ) : (
            <ArrowDownRight className={`h-3 w-3 ${colorClass}`} />
          )
        )}
        <span className={`text-xs font-semibold ${colorClass}`}>{diffStr}</span>
      </div>
    </div>
  )
}

export default function EvalComparePage() {
  return (
    <Suspense fallback={<ShimmerBlock height={200} />}>
      <EvalCompareContent />
    </Suspense>
  )
}
