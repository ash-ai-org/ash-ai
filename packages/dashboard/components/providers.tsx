'use client'

import { createContext, useContext } from 'react'
import type { AshClient } from '@ash-ai/sdk'
import { getClient } from '@/lib/client'

const AshContext = createContext<AshClient | null>(null)

export function AshProvider({ children }: { children: React.ReactNode }) {
  const client = getClient()
  return <AshContext.Provider value={client}>{children}</AshContext.Provider>
}

export function useAshClient(): AshClient {
  const client = useContext(AshContext)
  if (!client) throw new Error('useAshClient must be used within AshProvider')
  return client
}
