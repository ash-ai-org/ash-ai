import { useState, useEffect, useCallback, useRef } from 'react';
import type { AshClient, EvalCase, EvalRun, EvalResult } from '@ash-ai/sdk';
import { cn, formatTime } from '../utils.js';
import { FlaskConical, Plus, Play, Loader2, X, CheckCircle2, XCircle, Star, ChevronDown, ChevronRight } from '../icons.js';

export interface AgentEvalRunnerProps {
  client: AshClient;
  agentName: string;
  className?: string;
}

export function AgentEvalRunner({ client, agentName, className }: AgentEvalRunnerProps) {
  const [tab, setTab] = useState<'cases' | 'runs'>('cases');
  const [cases, setCases] = useState<EvalCase[]>([]);
  const [runs, setRuns] = useState<EvalRun[]>([]);
  const [loadingCases, setLoadingCases] = useState(true);
  const [loadingRuns, setLoadingRuns] = useState(true);
  const [showAddCase, setShowAddCase] = useState(false);
  const [showRunModal, setShowRunModal] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refreshCases = useCallback(async () => {
    try {
      setLoadingCases(true);
      const data = await client.listEvalCases(agentName);
      setCases(data);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to fetch eval cases');
    } finally {
      setLoadingCases(false);
    }
  }, [client, agentName]);

  const refreshRuns = useCallback(async () => {
    try {
      setLoadingRuns(true);
      const data = await client.listEvalRuns(agentName);
      setRuns(data);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to fetch eval runs');
    } finally {
      setLoadingRuns(false);
    }
  }, [client, agentName]);

  useEffect(() => { refreshCases(); refreshRuns(); }, [refreshCases, refreshRuns]);

  // Auto-refresh runs if any are pending/running
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  useEffect(() => {
    const hasActive = runs.some((r) => r.status === 'pending' || r.status === 'running');
    if (hasActive) {
      intervalRef.current = setInterval(refreshRuns, 5000);
    }
    return () => { if (intervalRef.current) clearInterval(intervalRef.current); };
  }, [runs, refreshRuns]);

  const handleDeleteCase = async (id: string) => {
    setError(null);
    try {
      await client.deleteEvalCase(agentName, id);
      refreshCases();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to delete case');
    }
  };

  return (
    <div className={cn('space-y-4', className)}>
      {/* Tab switcher */}
      <div className="flex items-center gap-1 p-1 bg-white/5 rounded-lg w-fit">
        <button
          onClick={() => setTab('cases')}
          className={cn(
            'px-3 py-1.5 text-xs font-medium rounded-md transition-colors',
            tab === 'cases' ? 'bg-white/10 text-white' : 'text-white/50 hover:text-white'
          )}
        >
          Cases ({cases.length})
        </button>
        <button
          onClick={() => setTab('runs')}
          className={cn(
            'px-3 py-1.5 text-xs font-medium rounded-md transition-colors',
            tab === 'runs' ? 'bg-white/10 text-white' : 'text-white/50 hover:text-white'
          )}
        >
          Runs ({runs.length})
        </button>
      </div>

      {error && (
        <div className="text-sm text-red-400 bg-red-500/10 border border-red-500/20 rounded-lg px-4 py-2">{error}</div>
      )}

      {tab === 'cases' ? (
        <CasesTab
          cases={cases}
          loading={loadingCases}
          onAdd={() => setShowAddCase(true)}
          onDelete={handleDeleteCase}
        />
      ) : (
        <RunsTab
          client={client}
          agentName={agentName}
          runs={runs}
          loading={loadingRuns}
          onRun={() => setShowRunModal(true)}
        />
      )}

      {showAddCase && (
        <AddCaseModal
          client={client}
          agentName={agentName}
          onClose={() => setShowAddCase(false)}
          onCreated={() => { setShowAddCase(false); refreshCases(); }}
        />
      )}

      {showRunModal && (
        <RunEvalModal
          client={client}
          agentName={agentName}
          onClose={() => setShowRunModal(false)}
          onStarted={() => { setShowRunModal(false); refreshRuns(); }}
        />
      )}
    </div>
  );
}

// ─── Cases Tab ───

function CasesTab({
  cases,
  loading,
  onAdd,
  onDelete,
}: {
  cases: EvalCase[];
  loading: boolean;
  onAdd: () => void;
  onDelete: (id: string) => void;
}) {
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="mr-2 h-4 w-4 animate-spin text-white/40" />
        <span className="text-sm text-white/50">Loading cases...</span>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-end">
        <button
          onClick={onAdd}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg bg-indigo-500 text-white hover:bg-indigo-400 transition-colors"
        >
          <Plus className="h-3.5 w-3.5" /> Add Case
        </button>
      </div>

      {cases.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-12 text-center">
          <FlaskConical className="mb-3 h-10 w-10 text-white/20" />
          <p className="text-sm font-medium text-white/50">No eval cases</p>
          <p className="mt-1 text-xs text-white/40">Add test cases to evaluate your agent.</p>
        </div>
      ) : (
        <div className="space-y-1">
          {cases.map((c) => {
            const isExpanded = expanded.has(c.id);
            return (
              <div key={c.id}>
                <div className="flex items-center justify-between rounded-lg border border-white/10 bg-white/[0.02] px-3 py-2">
                  <button
                    onClick={() => setExpanded((prev) => {
                      const next = new Set(prev);
                      isExpanded ? next.delete(c.id) : next.add(c.id);
                      return next;
                    })}
                    className="flex items-center gap-2 min-w-0 flex-1 text-left"
                  >
                    {isExpanded ? <ChevronDown className="h-3.5 w-3.5 text-white/40 shrink-0" /> : <ChevronRight className="h-3.5 w-3.5 text-white/40 shrink-0" />}
                    <span className="text-sm text-white truncate">{c.question}</span>
                    {c.category && <span className="text-xs text-white/30 shrink-0">{c.category}</span>}
                  </button>
                  <button
                    onClick={() => onDelete(c.id)}
                    className="p-1 text-white/30 hover:text-red-400 transition-colors shrink-0 ml-2"
                  >
                    <X className="h-3.5 w-3.5" />
                  </button>
                </div>
                {isExpanded && (
                  <div className="ml-4 mt-1 mb-2 rounded-lg border border-white/5 bg-black/20 p-3 space-y-2">
                    {c.expectedTopics && c.expectedTopics.length > 0 && (
                      <div>
                        <span className="text-xs text-white/40">Expected topics: </span>
                        <span className="text-xs text-white/60">{c.expectedTopics.join(', ')}</span>
                      </div>
                    )}
                    {c.referenceAnswer && (
                      <div>
                        <span className="text-xs text-white/40">Reference: </span>
                        <span className="text-xs text-white/60">{c.referenceAnswer}</span>
                      </div>
                    )}
                    {c.tags && c.tags.length > 0 && (
                      <div className="flex gap-1">
                        {c.tags.map((t) => (
                          <span key={t} className="text-xs bg-white/5 text-white/50 px-1.5 py-0.5 rounded">{t}</span>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ─── Runs Tab ───

function RunsTab({
  client,
  agentName,
  runs,
  loading,
  onRun,
}: {
  client: AshClient;
  agentName: string;
  runs: EvalRun[];
  loading: boolean;
  onRun: () => void;
}) {
  const [expandedRun, setExpandedRun] = useState<string | null>(null);
  const [results, setResults] = useState<EvalResult[]>([]);
  const [loadingResults, setLoadingResults] = useState(false);

  const handleExpand = async (runId: string) => {
    if (expandedRun === runId) {
      setExpandedRun(null);
      return;
    }
    setExpandedRun(runId);
    setLoadingResults(true);
    try {
      const data = await client.getEvalRunResults(agentName, runId);
      setResults(data);
    } catch {
      setResults([]);
    } finally {
      setLoadingResults(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="mr-2 h-4 w-4 animate-spin text-white/40" />
        <span className="text-sm text-white/50">Loading runs...</span>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-end">
        <button
          onClick={onRun}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg bg-indigo-500 text-white hover:bg-indigo-400 transition-colors"
        >
          <Play className="h-3.5 w-3.5" /> Run Evals
        </button>
      </div>

      {runs.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-12 text-center">
          <FlaskConical className="mb-3 h-10 w-10 text-white/20" />
          <p className="text-sm font-medium text-white/50">No eval runs yet</p>
          <p className="mt-1 text-xs text-white/40">Start a run to evaluate your agent.</p>
        </div>
      ) : (
        <div className="space-y-2">
          {runs.map((run) => {
            const statusColor = run.status === 'completed' ? 'text-green-400' : run.status === 'failed' ? 'text-red-400' : run.status === 'running' ? 'text-yellow-400' : 'text-white/50';
            const StatusIcon = run.status === 'completed' ? CheckCircle2 : run.status === 'failed' ? XCircle : run.status === 'running' ? Loader2 : FlaskConical;
            const isExpanded = expandedRun === run.id;

            return (
              <div key={run.id}>
                <button
                  onClick={() => handleExpand(run.id)}
                  className="flex items-center justify-between w-full rounded-xl border border-white/10 bg-white/[0.02] px-4 py-3 text-left hover:bg-white/[0.04] transition-colors"
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <StatusIcon className={cn('h-4 w-4 shrink-0', statusColor, run.status === 'running' && 'animate-spin')} />
                    <div>
                      <span className="text-sm font-medium text-white">
                        {run.status} {run.versionNumber != null && `(v${run.versionNumber})`}
                      </span>
                      <div className="flex items-center gap-2 mt-0.5">
                        <span className="text-xs text-white/30">{formatTime(run.createdAt)}</span>
                        <span className="text-xs text-white/30">{run.completedCases ?? 0}/{run.totalCases ?? 0} cases</span>
                      </div>
                    </div>
                  </div>
                  {isExpanded ? <ChevronDown className="h-4 w-4 text-white/30" /> : <ChevronRight className="h-4 w-4 text-white/30" />}
                </button>

                {isExpanded && (
                  <div className="ml-4 mt-1 mb-2 space-y-1">
                    {loadingResults ? (
                      <div className="flex items-center gap-2 py-4 justify-center">
                        <Loader2 className="h-3 w-3 animate-spin text-white/40" />
                        <span className="text-xs text-white/40">Loading results...</span>
                      </div>
                    ) : results.length === 0 ? (
                      <p className="text-xs text-white/40 py-4 text-center">No results yet.</p>
                    ) : (
                      results.map((r) => (
                        <div key={r.id} className="rounded-lg border border-white/5 bg-black/20 px-3 py-2">
                          <div className="flex items-center justify-between">
                            <span className={cn('text-xs font-medium', r.status === 'completed' ? 'text-green-400' : r.status === 'error' ? 'text-red-400' : 'text-white/50')}>
                              {r.status}
                            </span>
                            <div className="flex items-center gap-2">
                              {r.topicScore != null && <span className="text-xs text-white/40">topic: {(r.topicScore * 100).toFixed(0)}%</span>}
                              {r.safetyScore != null && <span className="text-xs text-white/40">safety: {(r.safetyScore * 100).toFixed(0)}%</span>}
                              {r.humanScore != null && (
                                <span className="inline-flex items-center gap-0.5 text-xs text-yellow-400">
                                  <Star className="h-3 w-3" /> {r.humanScore}
                                </span>
                              )}
                              {r.latencyMs != null && <span className="text-xs text-white/30">{r.latencyMs}ms</span>}
                            </div>
                          </div>
                          {r.agentResponse && (
                            <p className="text-xs text-white/50 mt-1 line-clamp-2">{r.agentResponse}</p>
                          )}
                          {r.error && (
                            <p className="text-xs text-red-400/70 mt-1">{r.error}</p>
                          )}
                        </div>
                      ))
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ─── Add Case Modal ───

function AddCaseModal({
  client,
  agentName,
  onClose,
  onCreated,
}: {
  client: AshClient;
  agentName: string;
  onClose: () => void;
  onCreated: () => void;
}) {
  const [question, setQuestion] = useState('');
  const [expectedTopics, setExpectedTopics] = useState('');
  const [referenceAnswer, setReferenceAnswer] = useState('');
  const [category, setCategory] = useState('');
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleCreate = async () => {
    if (!question.trim()) { setError('Question is required'); return; }
    setCreating(true);
    setError(null);
    try {
      await client.createEvalCase(agentName, {
        question: question.trim(),
        expectedTopics: expectedTopics ? expectedTopics.split(',').map((t) => t.trim()).filter(Boolean) : undefined,
        referenceAnswer: referenceAnswer || undefined,
        category: category || undefined,
      });
      onCreated();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to create case');
    } finally {
      setCreating(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
      <div className="w-full max-w-lg max-h-[90vh] overflow-auto rounded-xl border border-white/10 bg-[#1c2129] p-6">
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-lg font-semibold text-white">Add Eval Case</h2>
          <button onClick={onClose} className="text-white/40 hover:text-white"><X className="h-5 w-5" /></button>
        </div>
        <div className="space-y-4">
          <div className="space-y-1.5">
            <label className="block text-sm font-medium text-white/70">Question *</label>
            <textarea
              value={question}
              onChange={(e) => setQuestion(e.target.value)}
              rows={3}
              placeholder="What question should the agent answer?"
              className="flex w-full rounded-lg border px-3 py-2 text-sm bg-white/5 border-white/10 text-white placeholder:text-white/40 focus-visible:outline-none focus-visible:border-indigo-500/50 resize-none"
            />
          </div>
          <div className="space-y-1.5">
            <label className="block text-sm font-medium text-white/70">Expected Topics (comma-separated)</label>
            <input
              type="text"
              value={expectedTopics}
              onChange={(e) => setExpectedTopics(e.target.value)}
              placeholder="e.g. pricing, features, support"
              className="flex w-full rounded-lg border px-3 py-2 text-sm bg-white/5 border-white/10 text-white placeholder:text-white/40 focus-visible:outline-none focus-visible:border-indigo-500/50"
            />
          </div>
          <div className="space-y-1.5">
            <label className="block text-sm font-medium text-white/70">Reference Answer (optional)</label>
            <textarea
              value={referenceAnswer}
              onChange={(e) => setReferenceAnswer(e.target.value)}
              rows={2}
              placeholder="Ideal answer for comparison..."
              className="flex w-full rounded-lg border px-3 py-2 text-sm bg-white/5 border-white/10 text-white placeholder:text-white/40 focus-visible:outline-none focus-visible:border-indigo-500/50 resize-none"
            />
          </div>
          <div className="space-y-1.5">
            <label className="block text-sm font-medium text-white/70">Category (optional)</label>
            <input
              type="text"
              value={category}
              onChange={(e) => setCategory(e.target.value)}
              placeholder="e.g. general, technical, safety"
              className="flex w-full rounded-lg border px-3 py-2 text-sm bg-white/5 border-white/10 text-white placeholder:text-white/40 focus-visible:outline-none focus-visible:border-indigo-500/50"
            />
          </div>
          {error && <p className="text-sm text-red-400">{error}</p>}
          <div className="flex justify-end gap-3 pt-2">
            <button onClick={onClose} className="px-3 py-1.5 text-sm text-white/70 hover:text-white hover:bg-white/10 rounded-lg transition-colors">Cancel</button>
            <button
              onClick={handleCreate}
              disabled={creating}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium rounded-lg bg-indigo-500 text-white hover:bg-indigo-400 disabled:opacity-50 transition-colors"
            >
              {creating ? 'Adding...' : 'Add Case'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Run Eval Modal ───

function RunEvalModal({
  client,
  agentName,
  onClose,
  onStarted,
}: {
  client: AshClient;
  agentName: string;
  onClose: () => void;
  onStarted: () => void;
}) {
  const [versionNumber, setVersionNumber] = useState('');
  const [starting, setStarting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleStart = async () => {
    setStarting(true);
    setError(null);
    try {
      await client.startEvalRun(agentName, {
        versionNumber: versionNumber ? Number(versionNumber) : undefined,
      });
      onStarted();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to start eval run');
    } finally {
      setStarting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
      <div className="w-full max-w-md rounded-xl border border-white/10 bg-[#1c2129] p-6">
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-lg font-semibold text-white">Run Evals</h2>
          <button onClick={onClose} className="text-white/40 hover:text-white"><X className="h-5 w-5" /></button>
        </div>
        <div className="space-y-4">
          <div className="space-y-1.5">
            <label className="block text-sm font-medium text-white/70">Version Number (optional)</label>
            <input
              type="number"
              value={versionNumber}
              onChange={(e) => setVersionNumber(e.target.value)}
              placeholder="Leave empty for active version"
              className="flex w-full rounded-lg border px-3 py-2 text-sm bg-white/5 border-white/10 text-white placeholder:text-white/40 focus-visible:outline-none focus-visible:border-indigo-500/50"
            />
          </div>
          {error && <p className="text-sm text-red-400">{error}</p>}
          <div className="flex justify-end gap-3 pt-2">
            <button onClick={onClose} className="px-3 py-1.5 text-sm text-white/70 hover:text-white hover:bg-white/10 rounded-lg transition-colors">Cancel</button>
            <button
              onClick={handleStart}
              disabled={starting}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium rounded-lg bg-indigo-500 text-white hover:bg-indigo-400 disabled:opacity-50 transition-colors"
            >
              {starting ? (
                <><Loader2 className="h-3.5 w-3.5 animate-spin" /> Starting...</>
              ) : (
                <><Play className="h-3.5 w-3.5" /> Start Run</>
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
