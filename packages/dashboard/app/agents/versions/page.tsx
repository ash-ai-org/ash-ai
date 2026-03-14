'use client'

import { Suspense, useState } from 'react'
import { useSearchParams } from 'next/navigation'
import Link from 'next/link'
import { useAgentVersions } from '@/lib/hooks'
import { getClient } from '@/lib/client'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { EmptyState } from '@/components/ui/empty-state'
import { ShimmerBlock } from '@/components/ui/shimmer'
import { formatRelativeTime } from '@/lib/utils'
import {
  ArrowLeft,
  GitBranch,
  Plus,
  CheckCircle2,
  Loader2,
  X,
} from 'lucide-react'

function VersionsContent() {
  const searchParams = useSearchParams()
  const name = searchParams.get('name')
  const { versions, loading, refresh } = useAgentVersions(name)
  const [showCreate, setShowCreate] = useState(false)
  const [activating, setActivating] = useState<number | null>(null)
  const [error, setError] = useState<string | null>(null)

  async function handleActivate(versionNumber: number) {
    if (!name) return
    setActivating(versionNumber)
    setError(null)
    try {
      await getClient().activateAgentVersion(name, versionNumber)
      refresh()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to activate version')
    } finally {
      setActivating(null)
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
          <h1 className="text-2xl font-bold text-white">Versions</h1>
          <p className="mt-1 text-sm text-white/50">
            Manage versions for <span className="text-white/70">{name}</span>
          </p>
        </div>
        <Button onClick={() => setShowCreate(true)}>
          <Plus className="h-4 w-4 mr-2" />
          Create Version
        </Button>
      </div>

      {error && (
        <div className="text-sm text-red-400 bg-red-500/10 border border-red-500/20 rounded-lg px-4 py-2">
          {error}
        </div>
      )}

      {loading ? (
        <div className="space-y-3">
          {[1, 2, 3].map((i) => (
            <ShimmerBlock key={i} height={80} />
          ))}
        </div>
      ) : versions.length === 0 ? (
        <EmptyState
          icon={<GitBranch className="h-12 w-12" />}
          title="No versions yet"
          description="Create your first version to snapshot the agent's configuration."
          action={
            <Button onClick={() => setShowCreate(true)}>
              <Plus className="h-4 w-4 mr-2" />
              Create Version
            </Button>
          }
        />
      ) : (
        <div className="space-y-3">
          {versions.map((version) => (
            <Card key={version.id}>
              <CardContent>
                <div className="flex items-center justify-between">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <h3 className="text-sm font-semibold text-white">
                        v{version.versionNumber}
                      </h3>
                      {version.name && (
                        <span className="text-sm text-white/50">{version.name}</span>
                      )}
                      {version.isActive && (
                        <Badge variant="success">
                          <CheckCircle2 className="h-3 w-3 mr-1" />
                          Active
                        </Badge>
                      )}
                    </div>
                    {version.releaseNotes && (
                      <p className="text-xs text-white/40 mt-1">{version.releaseNotes}</p>
                    )}
                    <div className="flex items-center gap-3 mt-2">
                      <span className="text-xs text-white/30">
                        {formatRelativeTime(version.createdAt)}
                      </span>
                      {version.systemPrompt && (
                        <span className="text-xs text-white/30">Has system prompt</span>
                      )}
                      {version.knowledgeFiles && version.knowledgeFiles.length > 0 && (
                        <span className="text-xs text-white/30">
                          {version.knowledgeFiles.length} knowledge file{version.knowledgeFiles.length !== 1 ? 's' : ''}
                        </span>
                      )}
                    </div>
                  </div>
                  {!version.isActive && (
                    <Button
                      variant="secondary"
                      size="sm"
                      onClick={() => handleActivate(version.versionNumber)}
                      disabled={activating === version.versionNumber}
                    >
                      {activating === version.versionNumber ? (
                        <Loader2 className="h-3 w-3 animate-spin mr-1" />
                      ) : (
                        <CheckCircle2 className="h-3 w-3 mr-1" />
                      )}
                      Activate
                    </Button>
                  )}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Create Version Modal */}
      {showCreate && (
        <CreateVersionModal
          agentName={name}
          onClose={() => setShowCreate(false)}
          onCreated={() => {
            setShowCreate(false)
            refresh()
          }}
        />
      )}
    </div>
  )
}

// ─── Create Version Modal ───

function CreateVersionModal({
  agentName,
  onClose,
  onCreated,
}: {
  agentName: string
  onClose: () => void
  onCreated: () => void
}) {
  const [versionName, setVersionName] = useState('')
  const [systemPrompt, setSystemPrompt] = useState('')
  const [releaseNotes, setReleaseNotes] = useState('')
  const [creating, setCreating] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleCreate() {
    setCreating(true)
    setError(null)
    try {
      await getClient().createAgentVersion(agentName, {
        name: versionName || undefined,
        systemPrompt: systemPrompt || undefined,
        releaseNotes: releaseNotes || undefined,
      })
      onCreated()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to create version')
    } finally {
      setCreating(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
      <Card className="w-full max-w-lg max-h-[90vh] overflow-auto">
        <CardContent>
          <div className="flex items-center justify-between mb-6">
            <h2 className="text-lg font-semibold text-white">Create Version</h2>
            <button onClick={onClose} className="text-white/40 hover:text-white">
              <X className="h-5 w-5" />
            </button>
          </div>

          <div className="space-y-4">
            <Input
              label="Version Name (optional)"
              placeholder="e.g. v2 - improved grounding"
              value={versionName}
              onChange={(e) => setVersionName(e.target.value)}
            />
            <div className="space-y-1.5">
              <label className="block text-sm font-medium text-white/70">
                System Prompt (optional)
              </label>
              <textarea
                value={systemPrompt}
                onChange={(e) => setSystemPrompt(e.target.value)}
                rows={4}
                placeholder="System prompt for this version..."
                className="flex w-full rounded-xl border px-3 py-2 text-sm bg-white/5 border-white/10 text-white placeholder:text-white/40 focus-visible:outline-none focus-visible:border-indigo-500/50 resize-none"
              />
            </div>
            <div className="space-y-1.5">
              <label className="block text-sm font-medium text-white/70">
                Release Notes (optional)
              </label>
              <textarea
                value={releaseNotes}
                onChange={(e) => setReleaseNotes(e.target.value)}
                rows={2}
                placeholder="What changed in this version..."
                className="flex w-full rounded-xl border px-3 py-2 text-sm bg-white/5 border-white/10 text-white placeholder:text-white/40 focus-visible:outline-none focus-visible:border-indigo-500/50 resize-none"
              />
            </div>

            {error && <p className="text-sm text-red-400">{error}</p>}

            <div className="flex justify-end gap-3 pt-2">
              <Button variant="ghost" onClick={onClose}>
                Cancel
              </Button>
              <Button onClick={handleCreate} disabled={creating}>
                {creating ? 'Creating...' : 'Create Version'}
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}

export default function VersionsPage() {
  return (
    <Suspense fallback={<ShimmerBlock height={200} />}>
      <VersionsContent />
    </Suspense>
  )
}
