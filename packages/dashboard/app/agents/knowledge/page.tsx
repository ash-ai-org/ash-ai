'use client'

import { Suspense, useState, useRef, useCallback } from 'react'
import { useSearchParams } from 'next/navigation'
import Link from 'next/link'
import { useAgentFiles } from '@/lib/hooks'
import { getClient } from '@/lib/client'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { EmptyState } from '@/components/ui/empty-state'
import { ShimmerBlock } from '@/components/ui/shimmer'
import { formatRelativeTime } from '@/lib/utils'
import {
  ArrowLeft,
  BookOpen,
  Upload,
  Trash2,
  FileText,
  ChevronDown,
  ChevronRight,
  X,
  Loader2,
} from 'lucide-react'

function KnowledgeContent() {
  const searchParams = useSearchParams()
  const name = searchParams.get('name')
  const { files, loading, refresh } = useAgentFiles(name)
  const [expandedFile, setExpandedFile] = useState<string | null>(null)
  const [deleting, setDeleting] = useState<string | null>(null)
  const [uploading, setUploading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const handleUpload = useCallback(async (fileList: FileList) => {
    if (!name) return
    setUploading(true)
    setError(null)
    try {
      const filesToUpload: Array<{ path: string; content: string }> = []
      for (const file of Array.from(fileList)) {
        const text = await file.text()
        filesToUpload.push({ path: file.name, content: text })
      }
      await getClient().uploadAgentFiles(name, filesToUpload)
      refresh()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to upload files')
    } finally {
      setUploading(false)
    }
  }, [name, refresh])

  async function handleDelete(filePath: string) {
    if (!name) return
    setDeleting(filePath)
    setError(null)
    try {
      await getClient().deleteAgentFile(name, filePath)
      setExpandedFile(null)
      refresh()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to delete file')
    } finally {
      setDeleting(null)
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
          <h1 className="text-2xl font-bold text-white">Knowledge Base</h1>
          <p className="mt-1 text-sm text-white/50">
            Files for <span className="text-white/70">{name}</span>
          </p>
        </div>
        <Button onClick={() => fileInputRef.current?.click()} disabled={uploading}>
          {uploading ? (
            <Loader2 className="h-4 w-4 mr-2 animate-spin" />
          ) : (
            <Upload className="h-4 w-4 mr-2" />
          )}
          {uploading ? 'Uploading...' : 'Upload Files'}
        </Button>
        <input
          ref={fileInputRef}
          type="file"
          multiple
          className="hidden"
          onChange={(e) => {
            if (e.target.files && e.target.files.length > 0) {
              handleUpload(e.target.files)
              e.target.value = ''
            }
          }}
        />
      </div>

      {error && (
        <div className="text-sm text-red-400 bg-red-500/10 border border-red-500/20 rounded-lg px-4 py-2">
          {error}
        </div>
      )}

      {loading ? (
        <div className="space-y-3">
          {[1, 2, 3].map((i) => (
            <ShimmerBlock key={i} height={60} />
          ))}
        </div>
      ) : files.length === 0 ? (
        <EmptyState
          icon={<BookOpen className="h-12 w-12" />}
          title="No files yet"
          description="Upload knowledge base files for your agent. These files will be available in the agent's working directory."
          action={
            <Button onClick={() => fileInputRef.current?.click()}>
              <Upload className="h-4 w-4 mr-2" />
              Upload Files
            </Button>
          }
        />
      ) : (
        <div className="space-y-2">
          {files.map((file: any) => {
            const filePath = typeof file === 'string' ? file : file.path || file.name
            const isExpanded = expandedFile === filePath
            return (
              <Card key={filePath}>
                <CardContent className="!py-3">
                  <div className="flex items-center justify-between">
                    <button
                      onClick={() => setExpandedFile(isExpanded ? null : filePath)}
                      className="flex items-center gap-2 min-w-0 flex-1 text-left"
                    >
                      {isExpanded ? (
                        <ChevronDown className="h-4 w-4 text-white/40 flex-shrink-0" />
                      ) : (
                        <ChevronRight className="h-4 w-4 text-white/40 flex-shrink-0" />
                      )}
                      <FileText className="h-4 w-4 text-indigo-400 flex-shrink-0" />
                      <span className="text-sm text-white truncate">{filePath}</span>
                    </button>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => handleDelete(filePath)}
                      disabled={deleting === filePath}
                      className="text-white/30 hover:text-red-400 flex-shrink-0 ml-2"
                    >
                      {deleting === filePath ? (
                        <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      ) : (
                        <Trash2 className="h-3.5 w-3.5" />
                      )}
                    </Button>
                  </div>
                  {isExpanded && typeof file === 'object' && file.content && (
                    <div className="mt-3 pt-3 border-t border-white/5">
                      <pre className="text-xs text-white/60 bg-black/20 rounded-lg p-3 overflow-x-auto max-h-64 overflow-y-auto whitespace-pre-wrap">
                        {file.content}
                      </pre>
                    </div>
                  )}
                </CardContent>
              </Card>
            )
          })}
        </div>
      )}
    </div>
  )
}

export default function KnowledgePage() {
  return (
    <Suspense fallback={<ShimmerBlock height={200} />}>
      <KnowledgeContent />
    </Suspense>
  )
}
