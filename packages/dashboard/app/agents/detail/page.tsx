'use client'

import { Suspense, useState, useEffect } from 'react'
import { useSearchParams } from 'next/navigation'
import Link from 'next/link'
import { getClient } from '@/lib/client'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { ShimmerBlock } from '@/components/ui/shimmer'
import { formatRelativeTime } from '@/lib/utils'
import {
  ArrowLeft,
  Bot,
  GitBranch,
  BookOpen,
  FlaskConical,
  FolderOpen,
  Clock,
  Settings,
} from 'lucide-react'
import type { Agent } from '@ash-ai/shared'

function AgentDetailContent() {
  const searchParams = useSearchParams()
  const name = searchParams.get('name')
  const [agent, setAgent] = useState<Agent | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!name) {
      setLoading(false)
      return
    }
    async function fetchAgent() {
      try {
        const agents = await getClient().listAgents()
        const found = agents.find((a) => a.name === name)
        if (found) {
          setAgent(found)
        } else {
          setError(`Agent "${name}" not found`)
        }
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Failed to fetch agent')
      } finally {
        setLoading(false)
      }
    }
    fetchAgent()
  }, [name])

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

  if (loading) {
    return (
      <div className="space-y-6">
        <ShimmerBlock height={80} />
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          {[1, 2, 3].map((i) => (
            <ShimmerBlock key={i} height={120} />
          ))}
        </div>
      </div>
    )
  }

  if (error || !agent) {
    return (
      <div className="text-center py-16">
        <p className="text-red-400">{error || 'Agent not found'}</p>
        <Link href="/agents" className="text-indigo-400 hover:text-indigo-300 text-sm mt-2 inline-block">
          Back to agents
        </Link>
      </div>
    )
  }

  const tabs = [
    {
      label: 'Config',
      href: `/agents/config?name=${encodeURIComponent(agent.name)}`,
      icon: Settings,
      description: 'View and edit agent configuration',
    },
    {
      label: 'Versions',
      href: `/agents/versions?name=${encodeURIComponent(agent.name)}`,
      icon: GitBranch,
      description: 'Manage agent versions and system prompts',
    },
    {
      label: 'Knowledge',
      href: `/agents/knowledge?name=${encodeURIComponent(agent.name)}`,
      icon: BookOpen,
      description: 'Upload and manage knowledge base files',
    },
    {
      label: 'Evals',
      href: `/agents/evals?name=${encodeURIComponent(agent.name)}`,
      icon: FlaskConical,
      description: 'Define and run evaluation test cases',
    },
  ]

  return (
    <div className="space-y-6">
      {/* Back link */}
      <Link
        href="/agents"
        className="inline-flex items-center gap-1.5 text-sm text-white/50 hover:text-white transition-colors"
      >
        <ArrowLeft className="h-4 w-4" />
        Back to agents
      </Link>

      {/* Agent header */}
      <Card>
        <CardContent>
          <div className="flex items-start gap-4">
            <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-indigo-500/10">
              <Bot className="h-6 w-6 text-indigo-400" />
            </div>
            <div className="min-w-0 flex-1">
              <h1 className="text-xl font-bold text-white">{agent.name}</h1>
              {agent.description && (
                <p className="mt-1 text-sm text-white/50">{agent.description}</p>
              )}
              <div className="flex flex-wrap items-center gap-3 mt-3">
                {agent.model && <Badge variant="info">{agent.model}</Badge>}
                {agent.status && (
                  <Badge variant={agent.status === 'active' ? 'success' : 'default'}>
                    {agent.status}
                  </Badge>
                )}
                {agent.path && (
                  <span className="inline-flex items-center gap-1 text-xs text-white/30">
                    <FolderOpen className="h-3 w-3" />
                    {agent.path}
                  </span>
                )}
                {agent.createdAt && (
                  <span className="inline-flex items-center gap-1 text-xs text-white/30">
                    <Clock className="h-3 w-3" />
                    Created {formatRelativeTime(agent.createdAt)}
                  </span>
                )}
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Tab cards */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {tabs.map((tab) => (
          <Link key={tab.label} href={tab.href}>
            <Card className="hover:border-white/20 hover:bg-white/[0.02] transition-all cursor-pointer h-full">
              <CardContent>
                <div className="flex items-center gap-3 mb-2">
                  <tab.icon className="h-5 w-5 text-indigo-400" />
                  <h3 className="text-sm font-semibold text-white">{tab.label}</h3>
                </div>
                <p className="text-xs text-white/40">{tab.description}</p>
              </CardContent>
            </Card>
          </Link>
        ))}
      </div>
    </div>
  )
}

export default function AgentDetailPage() {
  return (
    <Suspense fallback={<ShimmerBlock height={200} />}>
      <AgentDetailContent />
    </Suspense>
  )
}
