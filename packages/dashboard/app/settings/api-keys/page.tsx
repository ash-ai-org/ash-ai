'use client'

import { useState, useEffect } from 'react'
import { getAuthHeaders } from '@/lib/client'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { ShimmerBlock } from '@/components/ui/shimmer'
import { formatRelativeTime } from '@/lib/utils'
import { Copy, Key, Plus, Trash2 } from 'lucide-react'

interface ApiKey {
  id: string
  label: string
  keyPrefix?: string
  createdAt: string
}

export default function ApiKeysPage() {
  const [keys, setKeys] = useState<ApiKey[]>([])
  const [loading, setLoading] = useState(true)
  const [newKeyName, setNewKeyName] = useState('')
  const [createdKey, setCreatedKey] = useState<string | null>(null)
  const [creating, setCreating] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function fetchKeys() {
    try {
      const res = await fetch('/api/api-keys', {
        headers: getAuthHeaders(),
      })
      if (res.ok) {
        const data = await res.json()
        setKeys(data.keys || data || [])
      }
    } catch {
      // Endpoint may not exist yet
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchKeys()
  }, [])

  async function handleCreate() {
    if (!newKeyName.trim()) {
      setError('Key name is required')
      return
    }

    setCreating(true)
    setError(null)

    try {
      const res = await fetch('/api/api-keys', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...getAuthHeaders(),
        },
        body: JSON.stringify({ label: newKeyName.trim() }),
      })

      if (!res.ok) throw new Error('Failed to create key')

      const data = await res.json()
      setCreatedKey(data.key)
      setNewKeyName('')
      fetchKeys()
    } catch (e) {
      const message = e instanceof Error ? e.message : 'Failed to create key'
      setError(message)
    } finally {
      setCreating(false)
    }
  }

  async function handleRevoke(id: string) {
    try {
      const res = await fetch(`/api/api-keys/${id}`, {
        method: 'DELETE',
        headers: getAuthHeaders(),
      })
      if (!res.ok) throw new Error('Failed to revoke key')
      fetchKeys()
    } catch (e) {
      const message = e instanceof Error ? e.message : 'Failed to revoke key'
      setError(message)
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-white">API Keys</h1>
        <p className="mt-1 text-sm text-white/50">
          Create API keys to authenticate with the Ash server
        </p>
      </div>

      {/* Create key */}
      <Card>
        <CardContent>
          <div className="flex gap-3">
            <Input
              placeholder="Key name (e.g. production)"
              value={newKeyName}
              onChange={(e) => setNewKeyName(e.target.value)}
              className="flex-1"
              onKeyDown={(e) => e.key === 'Enter' && handleCreate()}
            />
            <Button onClick={handleCreate} disabled={creating}>
              <Plus className="h-4 w-4 mr-2" />
              {creating ? 'Creating...' : 'Create Key'}
            </Button>
          </div>
          {error && <p className="text-sm text-red-400 mt-2">{error}</p>}
        </CardContent>
      </Card>

      {/* Newly created key */}
      {createdKey && (
        <Card className="border-green-500/30">
          <CardContent>
            <div className="flex items-center gap-2 mb-2">
              <Key className="h-4 w-4 text-green-400" />
              <p className="text-sm font-medium text-green-400">
                Key created! Copy it now — it won&apos;t be shown again.
              </p>
            </div>
            <div className="flex items-center gap-2 bg-black/30 rounded-lg px-4 py-3">
              <code className="flex-1 text-sm text-white font-mono break-all">
                {createdKey}
              </code>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => {
                  navigator.clipboard.writeText(createdKey)
                }}
              >
                <Copy className="h-4 w-4" />
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Getting started */}
      <Card>
        <CardHeader>
          <CardTitle>Getting Started</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="rounded-lg bg-black/30 p-4 font-mono text-sm text-white/80 space-y-1">
            <div className="text-white/40"># Set your API key</div>
            <div>export ASH_API_KEY=ash_sk_...</div>
            <div className="text-white/40 mt-3"># Deploy an agent</div>
            <div>ash deploy ./my-agent --name my-agent</div>
          </div>
        </CardContent>
      </Card>

      {/* Key list */}
      <Card>
        <CardHeader>
          <CardTitle>Active Keys</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {loading ? (
            <div className="p-4 space-y-2">
              {[1, 2, 3].map((i) => (
                <ShimmerBlock key={i} height={40} />
              ))}
            </div>
          ) : keys.length === 0 ? (
            <p className="text-sm text-white/40 text-center py-8">
              No API keys yet
            </p>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-white/10">
                  <th className="text-left px-6 py-3 text-xs font-medium text-white/40 uppercase">Name</th>
                  <th className="text-left px-6 py-3 text-xs font-medium text-white/40 uppercase">Key</th>
                  <th className="text-left px-6 py-3 text-xs font-medium text-white/40 uppercase">Created</th>
                  <th className="text-right px-6 py-3 text-xs font-medium text-white/40 uppercase">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/5">
                {keys.map((key) => (
                  <tr key={key.id} className="hover:bg-white/[0.02]">
                    <td className="px-6 py-3 text-white/80 font-medium">
                      {key.label}
                      {key.id === 'env' && (
                        <span className="ml-2 text-xs text-amber-400/60">env</span>
                      )}
                    </td>
                    <td className="px-6 py-3 text-white/40 font-mono text-xs">
                      {key.keyPrefix || '••••••••'}
                    </td>
                    <td className="px-6 py-3 text-white/40">
                      {key.createdAt ? formatRelativeTime(key.createdAt) : '—'}
                    </td>
                    <td className="px-6 py-3 text-right">
                      {key.id !== 'env' && (
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => handleRevoke(key.id)}
                          className="text-red-400 hover:text-red-300"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
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
    </div>
  )
}
