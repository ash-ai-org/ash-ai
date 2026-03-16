'use client'

import { Suspense, useState, useEffect } from 'react'
import { useSearchParams } from 'next/navigation'
import Link from 'next/link'
import { getClient } from '@/lib/client'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { ShimmerBlock } from '@/components/ui/shimmer'
import {
  ArrowLeft,
  Save,
  Loader2,
  RotateCcw,
} from 'lucide-react'

const CONFIG_FIELDS = [
  { key: 'description', label: 'Description', type: 'text' as const, placeholder: 'A brief description of this agent' },
  { key: 'model', label: 'Model', type: 'text' as const, placeholder: 'e.g. claude-sonnet-4-5-20250514' },
  { key: 'systemPrompt', label: 'System Prompt', type: 'textarea' as const, placeholder: 'System prompt for the agent...' },
  { key: 'max_turns', label: 'Max Turns', type: 'number' as const, placeholder: 'e.g. 10' },
  { key: 'permission_mode', label: 'Permission Mode', type: 'select' as const, options: ['default', 'plan', 'bypassPermissions'] },
] as const

function ConfigContent() {
  const searchParams = useSearchParams()
  const name = searchParams.get('name')
  const [config, setConfig] = useState<Record<string, unknown>>({})
  const [original, setOriginal] = useState<Record<string, unknown>>({})
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState(false)

  useEffect(() => {
    if (!name) {
      setLoading(false)
      return
    }
    async function fetchConfig() {
      try {
        const data = await getClient().getAgentConfig(name!)
        setConfig(data)
        setOriginal(data)
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Failed to fetch config')
      } finally {
        setLoading(false)
      }
    }
    fetchConfig()
  }, [name])

  async function handleSave() {
    if (!name) return
    setSaving(true)
    setError(null)
    setSuccess(false)
    try {
      // Only send changed fields
      const changes: Record<string, unknown> = {}
      for (const field of CONFIG_FIELDS) {
        const val = config[field.key]
        if (val !== original[field.key]) {
          changes[field.key] = val
        }
      }
      if (Object.keys(changes).length === 0) {
        setSuccess(true)
        return
      }
      const updated = await getClient().updateAgentConfig(name, changes)
      setConfig(updated)
      setOriginal(updated)
      setSuccess(true)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to save config')
    } finally {
      setSaving(false)
    }
  }

  function handleReset() {
    setConfig({ ...original })
    setError(null)
    setSuccess(false)
  }

  function updateField(key: string, value: unknown) {
    setConfig((prev) => ({ ...prev, [key]: value }))
    setSuccess(false)
  }

  const hasChanges = JSON.stringify(config) !== JSON.stringify(original)

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
          <h1 className="text-2xl font-bold text-white">Configuration</h1>
          <p className="mt-1 text-sm text-white/50">
            Edit config for <span className="text-white/70">{name}</span>
          </p>
        </div>
        <div className="flex items-center gap-2">
          {hasChanges && (
            <Button variant="ghost" onClick={handleReset}>
              <RotateCcw className="h-4 w-4 mr-2" />
              Reset
            </Button>
          )}
          <Button onClick={handleSave} disabled={saving || !hasChanges}>
            {saving ? (
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
            ) : (
              <Save className="h-4 w-4 mr-2" />
            )}
            Save
          </Button>
        </div>
      </div>

      {error && (
        <div className="text-sm text-red-400 bg-red-500/10 border border-red-500/20 rounded-lg px-4 py-2">
          {error}
        </div>
      )}

      {success && (
        <div className="text-sm text-green-400 bg-green-500/10 border border-green-500/20 rounded-lg px-4 py-2">
          Configuration saved successfully.
        </div>
      )}

      {loading ? (
        <div className="space-y-4">
          {[1, 2, 3, 4].map((i) => (
            <ShimmerBlock key={i} height={60} />
          ))}
        </div>
      ) : (
        <Card>
          <CardContent>
            <div className="space-y-5">
              {CONFIG_FIELDS.map((field) => {
                const value = config[field.key] ?? ''

                if (field.type === 'textarea') {
                  return (
                    <div key={field.key} className="space-y-1.5">
                      <label className="block text-sm font-medium text-white/70">
                        {field.label}
                      </label>
                      <textarea
                        value={String(value)}
                        onChange={(e) => updateField(field.key, e.target.value || undefined)}
                        rows={5}
                        placeholder={field.placeholder}
                        className="flex w-full rounded-xl border px-3 py-2 text-sm bg-white/5 border-white/10 text-white placeholder:text-white/40 focus-visible:outline-none focus-visible:border-indigo-500/50 resize-none"
                      />
                    </div>
                  )
                }

                if (field.type === 'select') {
                  return (
                    <div key={field.key} className="space-y-1.5">
                      <label className="block text-sm font-medium text-white/70">
                        {field.label}
                      </label>
                      <select
                        value={String(value)}
                        onChange={(e) => updateField(field.key, e.target.value || undefined)}
                        className="flex w-full rounded-xl border px-3 py-2 text-sm bg-white/5 border-white/10 text-white focus-visible:outline-none focus-visible:border-indigo-500/50"
                      >
                        <option value="" className="bg-[#1c2129]">Not set</option>
                        {field.options.map((opt) => (
                          <option key={opt} value={opt} className="bg-[#1c2129]">
                            {opt}
                          </option>
                        ))}
                      </select>
                    </div>
                  )
                }

                if (field.type === 'number') {
                  return (
                    <div key={field.key} className="space-y-1.5">
                      <label className="block text-sm font-medium text-white/70">
                        {field.label}
                      </label>
                      <input
                        type="number"
                        value={value === undefined || value === '' ? '' : Number(value)}
                        onChange={(e) => updateField(field.key, e.target.value ? Number(e.target.value) : undefined)}
                        placeholder={field.placeholder}
                        className="flex w-full rounded-xl border px-3 py-2 text-sm bg-white/5 border-white/10 text-white placeholder:text-white/40 focus-visible:outline-none focus-visible:border-indigo-500/50"
                      />
                    </div>
                  )
                }

                return (
                  <Input
                    key={field.key}
                    label={field.label}
                    value={String(value)}
                    onChange={(e) => updateField(field.key, e.target.value || undefined)}
                    placeholder={field.placeholder}
                  />
                )
              })}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  )
}

export default function ConfigPage() {
  return (
    <Suspense fallback={<ShimmerBlock height={200} />}>
      <ConfigContent />
    </Suspense>
  )
}
