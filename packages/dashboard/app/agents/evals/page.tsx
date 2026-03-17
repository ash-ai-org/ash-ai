'use client'

import { Suspense } from 'react'
import { useSearchParams } from 'next/navigation'
import Link from 'next/link'
import dynamic from 'next/dynamic'
import { getClient } from '@/lib/client'
import { ShimmerBlock } from '@/components/ui/shimmer'
import { ArrowLeft } from 'lucide-react'

const AgentEvalRunner = dynamic(
  () => import('@ash-ai/ui').then((mod) => ({ default: mod.AgentEvalRunner })),
  { ssr: false, loading: () => <ShimmerBlock height={200} /> }
)

function EvalsContent() {
  const searchParams = useSearchParams()
  const name = searchParams.get('name')

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
      <Link
        href={`/agents/detail?name=${encodeURIComponent(name)}`}
        className="inline-flex items-center gap-1.5 text-sm text-white/50 hover:text-white transition-colors"
      >
        <ArrowLeft className="h-4 w-4" />
        Back to {name}
      </Link>

      <div>
        <h1 className="text-2xl font-bold text-white">Evaluations</h1>
        <p className="mt-1 text-sm text-white/50">
          Test cases and runs for <span className="text-white/70">{name}</span>
        </p>
      </div>

      <AgentEvalRunner client={getClient()} agentName={name} />
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
