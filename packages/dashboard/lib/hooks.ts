'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import { getClient } from './client'
import type { Agent, Session, Credential } from '@ash-ai/shared'

// ─── useInterval ───

function useInterval(callback: () => void, delay: number | null) {
  const savedCallback = useRef(callback)
  useEffect(() => {
    savedCallback.current = callback
  }, [callback])
  useEffect(() => {
    if (delay === null) return
    const id = setInterval(() => savedCallback.current(), delay)
    return () => clearInterval(id)
  }, [delay])
}

// ─── useAgents ───

function getCached<T>(key: string): T | null {
  try {
    const cached = sessionStorage.getItem(key)
    return cached ? JSON.parse(cached) : null
  } catch { return null }
}

function setCache(key: string, data: unknown): void {
  try { sessionStorage.setItem(key, JSON.stringify(data)) } catch {}
}

export function useAgents() {
  const cached = getCached<Agent[]>('ash:agents')
  const [agents, setAgents] = useState<Agent[]>(cached ?? [])
  const [loading, setLoading] = useState(!cached)
  const [error, setError] = useState<Error | null>(null)

  const refetch = useCallback(async () => {
    try {
      const result = await getClient().listAgents()
      setAgents(result)
      setCache('ash:agents', result)
      setError(null)
    } catch (e) {
      setError(e as Error)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    refetch()
  }, [refetch])

  return { agents, loading, error, refetch }
}

// ─── useSessions ───

export function useSessions(opts?: {
  agent?: string
  limit?: number
  autoRefresh?: boolean
}) {
  const cacheKey = `ash:sessions:${opts?.agent ?? 'all'}`
  const cached = getCached<Session[]>(cacheKey)
  const [sessions, setSessions] = useState<Session[]>(cached ?? [])
  const [loading, setLoading] = useState(!cached)
  const [error, setError] = useState<Error | null>(null)

  const refetch = useCallback(async () => {
    try {
      const result = await getClient().listSessions(opts?.agent)
      setSessions(result)
      setCache(cacheKey, result)
      setError(null)
    } catch (e) {
      setError(e as Error)
    } finally {
      setLoading(false)
    }
  }, [opts?.agent, cacheKey])

  useEffect(() => {
    refetch()
  }, [refetch])

  useInterval(
    () => refetch(),
    opts?.autoRefresh !== false ? 10_000 : null
  )

  return { sessions, loading, error, refetch }
}

// ─── useHealth ───

export interface HealthData {
  status: string
  version?: string
  activeSessions?: number
  activeSandboxes?: number
}

export function useHealth() {
  const [health, setHealth] = useState<HealthData | null>(() => getCached('ash:health'))
  const [error, setError] = useState<Error | null>(null)

  const refetch = useCallback(async () => {
    try {
      const result = await getClient().health()
      const data = result as HealthData
      setHealth(data)
      setError(null)
      setCache('ash:health', data)
    } catch (e) {
      setError(e as Error)
    }
  }, [])

  useEffect(() => {
    refetch()
  }, [refetch])

  useInterval(() => refetch(), 30_000)

  return { health, error, refetch }
}

// ─── useCredentials ───

export function useCredentials() {
  const [credentials, setCredentials] = useState<Credential[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<Error | null>(null)

  const refetch = useCallback(async () => {
    try {
      const result = await getClient().listCredentials()
      setCredentials(result)
      setError(null)
    } catch (e) {
      setError(e as Error)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    refetch()
  }, [refetch])

  return { credentials, loading, error, refetch }
}

// ─── useUsageStats ───

export type { UsageStats } from '@ash-ai/shared'

export function useUsageStats(opts?: {
  agentName?: string
  sessionId?: string
}) {
  const [stats, setStats] = useState<import('@ash-ai/shared').UsageStats | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<Error | null>(null)

  const refetch = useCallback(async () => {
    try {
      const result = await getClient().getUsageStats(opts)
      setStats(result)
      setError(null)
    } catch (e) {
      setError(e as Error)
    } finally {
      setLoading(false)
    }
  }, [opts?.agentName, opts?.sessionId])

  useEffect(() => {
    refetch()
  }, [refetch])

  return { stats, loading, error, refetch }
}

// ─── useAgentVersions ───

export function useAgentVersions(agentName: string | null) {
  const [versions, setVersions] = useState<any[]>([])
  const [loading, setLoading] = useState(true)

  const refresh = useCallback(async () => {
    if (!agentName) return
    try {
      setLoading(true)
      const data = await getClient().listAgentVersions(agentName)
      setVersions(data)
    } catch (err) {
      console.error('Failed to fetch versions:', err)
    } finally {
      setLoading(false)
    }
  }, [agentName])

  useEffect(() => { refresh() }, [refresh])

  return { versions, loading, refresh }
}

// ─── useAgentFiles ───

export function useAgentFiles(agentName: string | null) {
  const [files, setFiles] = useState<any[]>([])
  const [loading, setLoading] = useState(true)

  const refresh = useCallback(async () => {
    if (!agentName) return
    try {
      setLoading(true)
      const data = await getClient().listAgentFiles(agentName)
      setFiles(data.files)
    } catch (err) {
      console.error('Failed to fetch files:', err)
    } finally {
      setLoading(false)
    }
  }, [agentName])

  useEffect(() => { refresh() }, [refresh])

  return { files, loading, refresh }
}

// ─── useEvalCases ───

export function useEvalCases(agentName: string | null) {
  const [cases, setCases] = useState<any[]>([])
  const [loading, setLoading] = useState(true)

  const refresh = useCallback(async () => {
    if (!agentName) return
    try {
      setLoading(true)
      const data = await getClient().listEvalCases(agentName)
      setCases(data)
    } catch (err) {
      console.error('Failed to fetch eval cases:', err)
    } finally {
      setLoading(false)
    }
  }, [agentName])

  useEffect(() => { refresh() }, [refresh])

  return { cases, loading, refresh }
}

// ─── useEvalRuns ───

export function useEvalRuns(agentName: string | null) {
  const [runs, setRuns] = useState<any[]>([])
  const [loading, setLoading] = useState(true)

  const refresh = useCallback(async () => {
    if (!agentName) return
    try {
      setLoading(true)
      const data = await getClient().listEvalRuns(agentName)
      setRuns(data)
    } catch (err) {
      console.error('Failed to fetch eval runs:', err)
    } finally {
      setLoading(false)
    }
  }, [agentName])

  useEffect(() => { refresh() }, [refresh])

  return { runs, loading, refresh }
}

// ─── useEvalRunResults ───

export function useEvalRunResults(agentName: string | null, runId: string | null) {
  const [results, setResults] = useState<any[]>([])
  const [loading, setLoading] = useState(true)

  const refresh = useCallback(async () => {
    if (!agentName || !runId) return
    try {
      setLoading(true)
      const data = await getClient().getEvalRunResults(agentName, runId)
      setResults(data)
    } catch (err) {
      console.error('Failed to fetch eval results:', err)
    } finally {
      setLoading(false)
    }
  }, [agentName, runId])

  useEffect(() => { refresh() }, [refresh])

  return { results, loading, refresh }
}
