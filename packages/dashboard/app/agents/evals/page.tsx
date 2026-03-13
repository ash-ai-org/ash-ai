'use client'

import { Suspense, useState } from 'react'
import { useSearchParams } from 'next/navigation'
import Link from 'next/link'
import { useEvalCases } from '@/lib/hooks'
import { getClient } from '@/lib/client'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { EmptyState } from '@/components/ui/empty-state'
import { ShimmerBlock } from '@/components/ui/shimmer'
import {
  ArrowLeft,
  FlaskConical,
  Plus,
  Trash2,
  Pencil,
  Download,
  Upload,
  Play,
  X,
  Loader2,
  ChevronDown,
  ChevronRight,
} from 'lucide-react'

function EvalsContent() {
  const searchParams = useSearchParams()
  const name = searchParams.get('name')
  const { cases, loading, refresh } = useEvalCases(name)
  const [showCreate, setShowCreate] = useState(false)
  const [editCase, setEditCase] = useState<any | null>(null)
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null)
  const [expandedCase, setExpandedCase] = useState<string | null>(null)
  const [importing, setImporting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleDelete(caseId: string) {
    if (!name) return
    setError(null)
    try {
      await getClient().deleteEvalCase(name, caseId)
      setDeleteConfirm(null)
      refresh()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to delete eval case')
      setDeleteConfirm(null)
    }
  }

  async function handleExport() {
    if (!name) return
    setError(null)
    try {
      const data = await getClient().exportEvalCases(name)
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `${name}-eval-cases.json`
      a.click()
      URL.revokeObjectURL(url)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to export eval cases')
    }
  }

  async function handleImport(fileList: FileList) {
    if (!name || fileList.length === 0) return
    setImporting(true)
    setError(null)
    try {
      const text = await fileList[0].text()
      const parsed = JSON.parse(text)
      const casesToImport = Array.isArray(parsed) ? parsed : parsed.cases || []
      await getClient().importEvalCases(name, casesToImport)
      refresh()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to import eval cases')
    } finally {
      setImporting(false)
    }
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
        href={`/agents/detail?name=${encodeURIComponent(name)}`}
        className="inline-flex items-center gap-1.5 text-sm text-white/50 hover:text-white transition-colors"
      >
        <ArrowLeft className="h-4 w-4" />
        Back to {name}
      </Link>

      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white">Eval Cases</h1>
          <p className="mt-1 text-sm text-white/50">
            Test cases for <span className="text-white/70">{name}</span>
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Link href={`/agents/eval-runs?name=${encodeURIComponent(name)}`}>
            <Button variant="secondary">
              <Play className="h-4 w-4 mr-2" />
              Eval Runs
            </Button>
          </Link>
          <Button variant="secondary" onClick={handleExport}>
            <Download className="h-4 w-4 mr-2" />
            Export
          </Button>
          <label className="cursor-pointer">
            <span className="inline-flex items-center justify-center font-medium transition-all duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500/50 disabled:pointer-events-none disabled:opacity-50 border border-white/20 bg-white/5 text-white hover:bg-white/10 hover:border-white/30 h-9 px-4 text-sm rounded-xl">
              <Upload className="h-4 w-4 mr-2" />
              {importing ? 'Importing...' : 'Import'}
            </span>
            <input
              type="file"
              accept=".json"
              className="hidden"
              onChange={(e) => {
                if (e.target.files) {
                  handleImport(e.target.files)
                  e.target.value = ''
                }
              }}
            />
          </label>
          <Button onClick={() => setShowCreate(true)}>
            <Plus className="h-4 w-4 mr-2" />
            Add Case
          </Button>
        </div>
      </div>

      {error && (
        <div className="text-sm text-red-400 bg-red-500/10 border border-red-500/20 rounded-lg px-4 py-2">
          {error}
        </div>
      )}

      {loading ? (
        <div className="space-y-3">
          {[1, 2, 3].map((i) => (
            <ShimmerBlock key={i} height={70} />
          ))}
        </div>
      ) : cases.length === 0 ? (
        <EmptyState
          icon={<FlaskConical className="h-12 w-12" />}
          title="No eval cases yet"
          description="Create test cases to evaluate your agent's responses. Define questions, expected topics, and reference answers."
          action={
            <Button onClick={() => setShowCreate(true)}>
              <Plus className="h-4 w-4 mr-2" />
              Add Eval Case
            </Button>
          }
        />
      ) : (
        <div className="space-y-2">
          {cases.map((evalCase: any) => {
            const isExpanded = expandedCase === evalCase.id
            return (
              <Card key={evalCase.id}>
                <CardContent className="!py-3">
                  <div className="flex items-center justify-between">
                    <button
                      onClick={() => setExpandedCase(isExpanded ? null : evalCase.id)}
                      className="flex items-center gap-2 min-w-0 flex-1 text-left"
                    >
                      {isExpanded ? (
                        <ChevronDown className="h-4 w-4 text-white/40 flex-shrink-0" />
                      ) : (
                        <ChevronRight className="h-4 w-4 text-white/40 flex-shrink-0" />
                      )}
                      <span className="text-sm text-white truncate">{evalCase.question}</span>
                    </button>
                    <div className="flex items-center gap-2 flex-shrink-0 ml-2">
                      {evalCase.category && (
                        <Badge variant="info">{evalCase.category}</Badge>
                      )}
                      {!evalCase.isActive && (
                        <Badge variant="warning">Inactive</Badge>
                      )}
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => setEditCase(evalCase)}
                        className="text-white/30 hover:text-white"
                      >
                        <Pencil className="h-3.5 w-3.5" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => setDeleteConfirm(evalCase.id)}
                        className="text-white/30 hover:text-red-400"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  </div>
                  {isExpanded && (
                    <div className="mt-3 pt-3 border-t border-white/5 space-y-2">
                      {evalCase.expectedTopics && evalCase.expectedTopics.length > 0 && (
                        <div>
                          <span className="text-xs font-medium text-white/40">Expected topics: </span>
                          <span className="text-xs text-white/60">
                            {evalCase.expectedTopics.join(', ')}
                          </span>
                        </div>
                      )}
                      {evalCase.expectedNotTopics && evalCase.expectedNotTopics.length > 0 && (
                        <div>
                          <span className="text-xs font-medium text-white/40">Should NOT mention: </span>
                          <span className="text-xs text-white/60">
                            {evalCase.expectedNotTopics.join(', ')}
                          </span>
                        </div>
                      )}
                      {evalCase.referenceAnswer && (
                        <div>
                          <span className="text-xs font-medium text-white/40">Reference answer: </span>
                          <p className="text-xs text-white/60 mt-0.5">{evalCase.referenceAnswer}</p>
                        </div>
                      )}
                      {evalCase.tags && evalCase.tags.length > 0 && (
                        <div className="flex items-center gap-1 mt-1">
                          {evalCase.tags.map((tag: string) => (
                            <Badge key={tag} variant="default">{tag}</Badge>
                          ))}
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

      {/* Create / Edit Modal */}
      {(showCreate || editCase) && (
        <EvalCaseModal
          agentName={name}
          evalCase={editCase}
          onClose={() => {
            setShowCreate(false)
            setEditCase(null)
          }}
          onSaved={() => {
            setShowCreate(false)
            setEditCase(null)
            refresh()
          }}
        />
      )}

      {/* Delete Confirmation */}
      {deleteConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
          <Card className="w-full max-w-md">
            <CardContent>
              <h3 className="text-lg font-semibold text-white mb-2">Delete Eval Case</h3>
              <p className="text-sm text-white/60 mb-6">
                Are you sure you want to delete this eval case? This action cannot be undone.
              </p>
              <div className="flex justify-end gap-3">
                <Button variant="ghost" onClick={() => setDeleteConfirm(null)}>
                  Cancel
                </Button>
                <Button variant="danger" onClick={() => handleDelete(deleteConfirm)}>
                  Delete
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  )
}

// ─── Eval Case Create/Edit Modal ───

function EvalCaseModal({
  agentName,
  evalCase,
  onClose,
  onSaved,
}: {
  agentName: string
  evalCase: any | null
  onClose: () => void
  onSaved: () => void
}) {
  const isEdit = !!evalCase
  const [question, setQuestion] = useState(evalCase?.question || '')
  const [expectedTopics, setExpectedTopics] = useState(
    evalCase?.expectedTopics?.join(', ') || ''
  )
  const [expectedNotTopics, setExpectedNotTopics] = useState(
    evalCase?.expectedNotTopics?.join(', ') || ''
  )
  const [referenceAnswer, setReferenceAnswer] = useState(evalCase?.referenceAnswer || '')
  const [category, setCategory] = useState(evalCase?.category || '')
  const [tags, setTags] = useState(evalCase?.tags?.join(', ') || '')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  function parseList(s: string): string[] {
    return s
      .split(',')
      .map((t) => t.trim())
      .filter(Boolean)
  }

  async function handleSave() {
    if (!question.trim()) {
      setError('Question is required')
      return
    }
    setSaving(true)
    setError(null)
    try {
      const data = {
        question: question.trim(),
        expectedTopics: expectedTopics ? parseList(expectedTopics) : undefined,
        expectedNotTopics: expectedNotTopics ? parseList(expectedNotTopics) : undefined,
        referenceAnswer: referenceAnswer || undefined,
        category: category || undefined,
        tags: tags ? parseList(tags) : undefined,
      }
      if (isEdit) {
        await getClient().updateEvalCase(agentName, evalCase.id, data)
      } else {
        await getClient().createEvalCase(agentName, data)
      }
      onSaved()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to save eval case')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
      <Card className="w-full max-w-lg max-h-[90vh] overflow-auto">
        <CardContent>
          <div className="flex items-center justify-between mb-6">
            <h2 className="text-lg font-semibold text-white">
              {isEdit ? 'Edit Eval Case' : 'Add Eval Case'}
            </h2>
            <button onClick={onClose} className="text-white/40 hover:text-white">
              <X className="h-5 w-5" />
            </button>
          </div>

          <div className="space-y-4">
            <div className="space-y-1.5">
              <label className="block text-sm font-medium text-white/70">Question</label>
              <textarea
                value={question}
                onChange={(e) => setQuestion(e.target.value)}
                rows={3}
                placeholder="What question should the agent answer?"
                className="flex w-full rounded-xl border px-3 py-2 text-sm bg-white/5 border-white/10 text-white placeholder:text-white/40 focus-visible:outline-none focus-visible:border-indigo-500/50 resize-none"
              />
            </div>
            <Input
              label="Expected Topics (comma-separated)"
              placeholder="e.g. pricing, features, support"
              value={expectedTopics}
              onChange={(e) => setExpectedTopics(e.target.value)}
            />
            <Input
              label="Should NOT Mention (comma-separated)"
              placeholder="e.g. competitor names, internal details"
              value={expectedNotTopics}
              onChange={(e) => setExpectedNotTopics(e.target.value)}
            />
            <div className="space-y-1.5">
              <label className="block text-sm font-medium text-white/70">
                Reference Answer (optional)
              </label>
              <textarea
                value={referenceAnswer}
                onChange={(e) => setReferenceAnswer(e.target.value)}
                rows={3}
                placeholder="The ideal answer for comparison..."
                className="flex w-full rounded-xl border px-3 py-2 text-sm bg-white/5 border-white/10 text-white placeholder:text-white/40 focus-visible:outline-none focus-visible:border-indigo-500/50 resize-none"
              />
            </div>
            <Input
              label="Category"
              placeholder="e.g. accuracy, safety, edge_case"
              value={category}
              onChange={(e) => setCategory(e.target.value)}
            />
            <Input
              label="Tags (comma-separated)"
              placeholder="e.g. regression, critical"
              value={tags}
              onChange={(e) => setTags(e.target.value)}
            />

            {error && <p className="text-sm text-red-400">{error}</p>}

            <div className="flex justify-end gap-3 pt-2">
              <Button variant="ghost" onClick={onClose}>
                Cancel
              </Button>
              <Button onClick={handleSave} disabled={saving}>
                {saving ? 'Saving...' : isEdit ? 'Update' : 'Create'}
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}

export default function EvalsPage() {
  return (
    <Suspense fallback={<ShimmerBlock height={200} />}>
      <EvalsContent />
    </Suspense>
  )
}
