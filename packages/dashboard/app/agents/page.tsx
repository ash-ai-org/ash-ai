'use client'

import { useState, useRef, useCallback } from 'react'
import { useAgents } from '@/lib/hooks'
import { getClient } from '@/lib/client'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge, StatusBadge } from '@/components/ui/badge'
import { EmptyState } from '@/components/ui/empty-state'
import { ShimmerBlock } from '@/components/ui/shimmer'
import { formatRelativeTime } from '@/lib/utils'
import {
  Bot,
  BookOpen,
  Code2,
  Copy,
  FlaskConical,
  GitBranch,
  MoreVertical,
  Plus,
  Settings,
  Terminal,
  Trash2,
  Upload,
  X,
} from 'lucide-react'
import Link from 'next/link'
import type { Agent } from '@ash-ai/shared'

export default function AgentsPage() {
  const { agents, loading, refetch } = useAgents()
  const [showCreate, setShowCreate] = useState(false)
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  async function handleDelete(name: string) {
    setError(null)
    try {
      await getClient().deleteAgent(name)
      setDeleteConfirm(null)
      refetch()
    } catch (e) {
      const message = e instanceof Error ? e.message : 'Failed to delete agent'
      setError(message)
      setDeleteConfirm(null)
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white">Agents</h1>
          <p className="mt-1 text-sm text-white/50">
            Deploy and manage your AI agents
          </p>
        </div>
        <Button onClick={() => setShowCreate(true)}>
          <Plus className="h-4 w-4 mr-2" />
          Create Agent
        </Button>
      </div>

      {error && (
        <div className="text-sm text-red-400 bg-red-500/10 border border-red-500/20 rounded-lg px-4 py-2">
          {error}
        </div>
      )}

      {loading ? (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {[1, 2, 3].map((i) => (
            <ShimmerBlock key={i} height={160} />
          ))}
        </div>
      ) : agents.length === 0 ? (
        <EmptyState
          icon={<Bot className="h-12 w-12" />}
          title="No agents yet"
          description="Create your first agent to get started. You can upload files or deploy from the CLI."
          action={
            <Button onClick={() => setShowCreate(true)}>
              <Plus className="h-4 w-4 mr-2" />
              Create Agent
            </Button>
          }
        />
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {agents.map((agent) => (
            <AgentCard
              key={agent.id || agent.name}
              agent={agent}
              onDelete={() => setDeleteConfirm(agent.name)}
            />
          ))}
        </div>
      )}

      {/* Create Modal */}
      {showCreate && (
        <CreateAgentModal
          onClose={() => setShowCreate(false)}
          onCreated={() => {
            setShowCreate(false)
            refetch()
          }}
        />
      )}

      {/* Delete Confirmation */}
      {deleteConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
          <Card className="w-full max-w-md">
            <CardContent>
              <h3 className="text-lg font-semibold text-white mb-2">Delete Agent</h3>
              <p className="text-sm text-white/60 mb-6">
                Are you sure you want to delete <span className="text-white font-medium">{deleteConfirm}</span>?
                This action cannot be undone.
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

// ─── Agent Card ───

function AgentCard({
  agent,
  onDelete,
}: {
  agent: Agent
  onDelete: () => void
}) {
  const [showMenu, setShowMenu] = useState(false)

  return (
    <Card className="relative group">
      <CardContent>
        <div className="flex items-start justify-between">
          <div className="min-w-0 flex-1">
            <Link href={`/agents/detail?name=${encodeURIComponent(agent.name)}`}>
              <h3 className="text-sm font-semibold text-white truncate hover:text-indigo-400 transition-colors cursor-pointer">
                {agent.name}
              </h3>
            </Link>
            {agent.description && (
              <p className="text-xs text-white/40 mt-1 line-clamp-2">
                {agent.description}
              </p>
            )}
          </div>
          <div className="relative">
            <button
              onClick={() => setShowMenu(!showMenu)}
              className="p-1 text-white/30 hover:text-white/70 transition-colors rounded"
            >
              <MoreVertical className="h-4 w-4" />
            </button>
            {showMenu && (
              <>
                <div className="fixed inset-0" onClick={() => setShowMenu(false)} />
                <div className="absolute right-0 mt-1 w-44 rounded-lg border border-white/10 bg-[#1c2129] shadow-xl z-10 py-1">
                  <Link
                    href={`/agents/config?name=${encodeURIComponent(agent.name)}`}
                    onClick={() => setShowMenu(false)}
                    className="flex w-full items-center gap-2 px-3 py-2 text-sm text-white/70 hover:bg-white/5"
                  >
                    <Settings className="h-3.5 w-3.5" /> Config
                  </Link>
                  <Link
                    href={`/agents/versions?name=${encodeURIComponent(agent.name)}`}
                    onClick={() => setShowMenu(false)}
                    className="flex w-full items-center gap-2 px-3 py-2 text-sm text-white/70 hover:bg-white/5"
                  >
                    <GitBranch className="h-3.5 w-3.5" /> Versions
                  </Link>
                  <Link
                    href={`/agents/knowledge?name=${encodeURIComponent(agent.name)}`}
                    onClick={() => setShowMenu(false)}
                    className="flex w-full items-center gap-2 px-3 py-2 text-sm text-white/70 hover:bg-white/5"
                  >
                    <BookOpen className="h-3.5 w-3.5" /> Knowledge
                  </Link>
                  <Link
                    href={`/agents/evals?name=${encodeURIComponent(agent.name)}`}
                    onClick={() => setShowMenu(false)}
                    className="flex w-full items-center gap-2 px-3 py-2 text-sm text-white/70 hover:bg-white/5"
                  >
                    <FlaskConical className="h-3.5 w-3.5" /> Evals
                  </Link>
                  <div className="my-1 border-t border-white/5" />
                  <button
                    onClick={() => {
                      navigator.clipboard.writeText(agent.name)
                      setShowMenu(false)
                    }}
                    className="flex w-full items-center gap-2 px-3 py-2 text-sm text-white/70 hover:bg-white/5"
                  >
                    <Copy className="h-3.5 w-3.5" /> Copy Name
                  </button>
                  <button
                    onClick={() => {
                      setShowMenu(false)
                      onDelete()
                    }}
                    className="flex w-full items-center gap-2 px-3 py-2 text-sm text-red-400 hover:bg-red-500/10"
                  >
                    <Trash2 className="h-3.5 w-3.5" /> Delete
                  </button>
                </div>
              </>
            )}
          </div>
        </div>

        <div className="flex items-center gap-2 mt-3">
          {agent.model && <Badge variant="info">{agent.model}</Badge>}
          {agent.status && <StatusBadge status={agent.status} />}
        </div>

        <div className="flex items-center justify-between mt-4 pt-3 border-t border-white/5">
          <span className="text-xs text-white/30">
            {agent.createdAt ? formatRelativeTime(agent.createdAt) : 'Unknown'}
          </span>
          <div className="flex items-center gap-2">
            <Link
              href={`/playground?agent=${agent.slug || agent.name}`}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg bg-indigo-500/10 text-indigo-400 hover:bg-indigo-500/20 transition-colors"
            >
              <Code2 className="h-3 w-3" />
              Try
            </Link>
          </div>
        </div>
      </CardContent>
    </Card>
  )
}

// ─── Create Agent Modal ───

function CreateAgentModal({
  onClose,
  onCreated,
}: {
  onClose: () => void
  onCreated: () => void
}) {
  const [tab, setTab] = useState<'upload' | 'cli'>('upload')
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [systemPrompt, setSystemPrompt] = useState('')
  const [files, setFiles] = useState<Array<{ path: string; content: string }>>([])
  const [creating, setCreating] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const handleFileSelect = useCallback(async (fileList: FileList) => {
    const newFiles: Array<{ path: string; content: string }> = []
    const skipPrefixes = ['node_modules/', '.git/', '__pycache__/', '.venv/', '.DS_Store']

    for (const file of Array.from(fileList)) {
      const path = (file as File & { webkitRelativePath?: string }).webkitRelativePath || file.name
      if (skipPrefixes.some((p) => path.includes(p))) continue

      const text = await file.text()
      newFiles.push({ path, content: text })
    }
    setFiles(newFiles)
  }, [])

  async function handleCreate() {
    if (!name.trim()) {
      setError('Agent name is required')
      return
    }

    setCreating(true)
    setError(null)

    try {
      await getClient().createAgent(name.trim(), {
        systemPrompt: systemPrompt || undefined,
        files: files.length > 0 ? files : undefined,
      })
      onCreated()
    } catch (e) {
      const message = e instanceof Error ? e.message : 'Failed to create agent'
      setError(message)
    } finally {
      setCreating(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
      <Card className="w-full max-w-lg max-h-[90vh] overflow-auto">
        <CardContent>
          <div className="flex items-center justify-between mb-6">
            <h2 className="text-lg font-semibold text-white">Create Agent</h2>
            <button onClick={onClose} className="text-white/40 hover:text-white">
              <X className="h-5 w-5" />
            </button>
          </div>

          {/* Tabs */}
          <div className="flex gap-1 p-1 bg-white/5 rounded-lg mb-6">
            <button
              onClick={() => setTab('upload')}
              className={`flex-1 flex items-center justify-center gap-2 px-3 py-2 text-sm font-medium rounded-md transition-colors ${
                tab === 'upload'
                  ? 'bg-white/10 text-white'
                  : 'text-white/50 hover:text-white'
              }`}
            >
              <Upload className="h-4 w-4" /> Upload
            </button>
            <button
              onClick={() => setTab('cli')}
              className={`flex-1 flex items-center justify-center gap-2 px-3 py-2 text-sm font-medium rounded-md transition-colors ${
                tab === 'cli'
                  ? 'bg-white/10 text-white'
                  : 'text-white/50 hover:text-white'
              }`}
            >
              <Terminal className="h-4 w-4" /> CLI
            </button>
          </div>

          {tab === 'upload' ? (
            <div className="space-y-4">
              <Input
                label="Name"
                placeholder="my-agent"
                value={name}
                onChange={(e) => setName(e.target.value)}
              />
              <div className="space-y-1.5">
                <label className="block text-sm font-medium text-white/70">
                  System Prompt (optional)
                </label>
                <textarea
                  value={systemPrompt}
                  onChange={(e) => setSystemPrompt(e.target.value)}
                  rows={3}
                  placeholder="You are a helpful assistant..."
                  className="flex w-full rounded-xl border px-3 py-2 text-sm bg-white/5 border-white/10 text-white placeholder:text-white/40 focus-visible:outline-none focus-visible:border-indigo-500/50 resize-none"
                />
              </div>

              {/* File upload zone */}
              <div className="space-y-1.5">
                <label className="block text-sm font-medium text-white/70">
                  Agent Files (optional)
                </label>
                <div
                  onClick={() => fileInputRef.current?.click()}
                  onDragOver={(e) => {
                    e.preventDefault()
                    e.stopPropagation()
                  }}
                  onDrop={(e) => {
                    e.preventDefault()
                    e.stopPropagation()
                    if (e.dataTransfer.files.length > 0) {
                      handleFileSelect(e.dataTransfer.files)
                    }
                  }}
                  className="flex flex-col items-center justify-center rounded-xl border-2 border-dashed border-white/10 py-8 cursor-pointer hover:border-white/20 hover:bg-white/[0.02] transition-colors"
                >
                  <Upload className="h-8 w-8 text-white/20 mb-2" />
                  <p className="text-sm text-white/40">
                    Drop files or click to upload
                  </p>
                  <p className="text-xs text-white/20 mt-1">
                    CLAUDE.md, tools, and agent source files
                  </p>
                </div>
                <input
                  ref={fileInputRef}
                  type="file"
                  multiple
                  className="hidden"
                  onChange={(e) => {
                    if (e.target.files) handleFileSelect(e.target.files)
                  }}
                />
                {files.length > 0 && (
                  <p className="text-xs text-white/50">
                    {files.length} file{files.length !== 1 ? 's' : ''} selected
                  </p>
                )}
              </div>

              {error && (
                <p className="text-sm text-red-400">{error}</p>
              )}

              <div className="flex justify-end gap-3 pt-2">
                <Button variant="ghost" onClick={onClose}>
                  Cancel
                </Button>
                <Button onClick={handleCreate} disabled={creating}>
                  {creating ? 'Creating...' : 'Create Agent'}
                </Button>
              </div>
            </div>
          ) : (
            <div className="space-y-4">
              <p className="text-sm text-white/60">
                Deploy an agent from your local machine using the Ash CLI:
              </p>
              <div className="rounded-lg bg-black/30 p-4 font-mono text-sm text-white/80">
                <div className="text-white/40 mb-2"># Install the CLI</div>
                <div>npm install -g @ash-ai/cli</div>
                <div className="text-white/40 mt-4 mb-2"># Deploy an agent</div>
                <div>ash deploy ./my-agent --name my-agent</div>
              </div>
              <div className="flex justify-end pt-2">
                <Button variant="ghost" onClick={onClose}>
                  Close
                </Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
