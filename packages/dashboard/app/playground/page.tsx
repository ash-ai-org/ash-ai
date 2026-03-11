'use client'

import { Suspense } from 'react'
import { useSearchParams } from 'next/navigation'
import { getClient } from '@/lib/client'

// Dynamic import to avoid SSR issues with @ash-ai/ui
import dynamic from 'next/dynamic'

const Playground = dynamic(
  () => import('@ash-ai/ui').then((mod) => ({ default: mod.Playground })),
  { ssr: false, loading: () => <PlaygroundSkeleton /> }
)

function PlaygroundSkeleton() {
  return (
    <div className="flex h-full items-center justify-center">
      <div className="text-sm text-white/40">Loading playground...</div>
    </div>
  )
}

function PlaygroundInner() {
  const searchParams = useSearchParams()
  const initialAgent = searchParams.get('agent') || undefined
  const client = getClient()

  return (
    <div className="h-[calc(100vh-5rem)]">
      <Playground
        client={client}
        {...(initialAgent ? { initialAgent } : {})}
      />
    </div>
  )
}

export default function PlaygroundPage() {
  return (
    <Suspense fallback={<PlaygroundSkeleton />}>
      <PlaygroundInner />
    </Suspense>
  )
}
