'use client'

import { useState } from 'react'
import { useCredentials } from '@/lib/hooks'
import { getClient } from '@/lib/client'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Select } from '@/components/ui/select'
import { Badge } from '@/components/ui/badge'
import { EmptyState } from '@/components/ui/empty-state'
import { ShimmerBlock } from '@/components/ui/shimmer'
import { formatRelativeTime } from '@/lib/utils'
import { Lock, Plus, Trash2, X } from 'lucide-react'

const CREDENTIAL_TYPES = [
  { value: 'anthropic', label: 'Anthropic' },
  { value: 'openai', label: 'OpenAI' },
  { value: 'bedrock', label: 'AWS Bedrock' },
  { value: 'custom', label: 'Custom' },
]

export default function CredentialsPage() {
  const { credentials, loading, refetch } = useCredentials()
  const [showCreate, setShowCreate] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleDelete(id: string) {
    setError(null)
    try {
      await getClient().deleteCredential(id)
      refetch()
    } catch (e) {
      const message = e instanceof Error ? e.message : 'Failed to delete credential'
      setError(message)
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white">Credentials</h1>
          <p className="mt-1 text-sm text-white/50">
            Store API keys for LLM providers. Encrypted at rest.
          </p>
        </div>
        <Button onClick={() => setShowCreate(true)}>
          <Plus className="h-4 w-4 mr-2" />
          Add Credential
        </Button>
      </div>

      {error && (
        <div className="text-sm text-red-400 bg-red-500/10 border border-red-500/20 rounded-lg px-4 py-2">
          {error}
        </div>
      )}

      <Card>
        <CardContent className="p-0">
          {loading ? (
            <div className="p-4 space-y-2">
              {[1, 2, 3].map((i) => (
                <ShimmerBlock key={i} height={48} />
              ))}
            </div>
          ) : credentials.length === 0 ? (
            <EmptyState
              icon={<Lock className="h-12 w-12" />}
              title="No credentials stored"
              description="Add API keys for LLM providers to use with your agents."
              action={
                <Button onClick={() => setShowCreate(true)}>
                  <Plus className="h-4 w-4 mr-2" />
                  Add Credential
                </Button>
              }
            />
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-white/10">
                  <th className="text-left px-6 py-3 text-xs font-medium text-white/40 uppercase">Provider</th>
                  <th className="text-left px-6 py-3 text-xs font-medium text-white/40 uppercase">Label</th>
                  <th className="text-left px-6 py-3 text-xs font-medium text-white/40 uppercase">Status</th>
                  <th className="text-left px-6 py-3 text-xs font-medium text-white/40 uppercase">Last Used</th>
                  <th className="text-right px-6 py-3 text-xs font-medium text-white/40 uppercase">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/5">
                {credentials.map((cred) => (
                  <tr key={cred.id} className="hover:bg-white/[0.02]">
                    <td className="px-6 py-3">
                      <Badge variant="info">{cred.type}</Badge>
                    </td>
                    <td className="px-6 py-3 text-white/80">{cred.label || '-'}</td>
                    <td className="px-6 py-3">
                      <Badge variant={cred.active ? 'success' : 'default'}>
                        {cred.active ? 'Active' : 'Inactive'}
                      </Badge>
                    </td>
                    <td className="px-6 py-3 text-white/40">
                      {cred.lastUsedAt ? formatRelativeTime(cred.lastUsedAt) : 'Never'}
                    </td>
                    <td className="px-6 py-3 text-right">
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => handleDelete(cred.id)}
                        className="text-red-400 hover:text-red-300"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </CardContent>
      </Card>

      {showCreate && (
        <CreateCredentialModal
          onClose={() => setShowCreate(false)}
          onCreated={() => {
            setShowCreate(false)
            refetch()
          }}
        />
      )}
    </div>
  )
}

function CreateCredentialModal({
  onClose,
  onCreated,
}: {
  onClose: () => void
  onCreated: () => void
}) {
  const [type, setType] = useState('anthropic')
  const [label, setLabel] = useState('')
  const [apiKey, setApiKey] = useState('')
  const [accessKeyId, setAccessKeyId] = useState('')
  const [secretKey, setSecretKey] = useState('')
  const [region, setRegion] = useState('us-east-1')
  const [creating, setCreating] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleCreate() {
    setCreating(true)
    setError(null)

    try {
      const client = getClient()
      if (type === 'bedrock') {
        await client.storeBedrockCredential({
          accessKeyId,
          secretAccessKey: secretKey,
          region,
          label: label || undefined,
        })
      } else {
        await client.storeCredential(type, apiKey, label || undefined)
      }
      onCreated()
    } catch (e) {
      const message = e instanceof Error ? e.message : 'Failed to store credential'
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
            <h2 className="text-lg font-semibold text-white">Add Credential</h2>
            <button onClick={onClose} className="text-white/40 hover:text-white">
              <X className="h-5 w-5" />
            </button>
          </div>

          <div className="space-y-4">
            <Select
              label="Provider"
              options={CREDENTIAL_TYPES}
              value={type}
              onChange={(e) => setType(e.target.value)}
            />

            <Input
              label="Label (optional)"
              placeholder="e.g. production"
              value={label}
              onChange={(e) => setLabel(e.target.value)}
            />

            {type === 'bedrock' ? (
              <>
                <Input
                  label="Access Key ID"
                  placeholder="AKIA..."
                  value={accessKeyId}
                  onChange={(e) => setAccessKeyId(e.target.value)}
                />
                <Input
                  label="Secret Access Key"
                  type="password"
                  value={secretKey}
                  onChange={(e) => setSecretKey(e.target.value)}
                />
                <Input
                  label="Region"
                  placeholder="us-east-1"
                  value={region}
                  onChange={(e) => setRegion(e.target.value)}
                />
              </>
            ) : (
              <Input
                label="API Key"
                type="password"
                placeholder={type === 'anthropic' ? 'sk-ant-...' : 'sk-...'}
                value={apiKey}
                onChange={(e) => setApiKey(e.target.value)}
              />
            )}

            {error && <p className="text-sm text-red-400">{error}</p>}

            <div className="flex justify-end gap-3 pt-2">
              <Button variant="ghost" onClick={onClose}>
                Cancel
              </Button>
              <Button onClick={handleCreate} disabled={creating}>
                {creating ? 'Saving...' : 'Save'}
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
