'use client'

import { useState, useEffect, useCallback, useRef, Suspense } from 'react'
import { useSearchParams } from 'next/navigation'
import { useAgents, useSessions } from '@/lib/hooks'
import { getClient } from '@/lib/client'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge, StatusBadge } from '@/components/ui/badge'
import { EmptyState } from '@/components/ui/empty-state'
import { Select } from '@/components/ui/select'
import { ShimmerBlock } from '@/components/ui/shimmer'
import { cn, formatRelativeTime, truncateId } from '@/lib/utils'
import {
  Activity,
  ChevronDown,
  ChevronRight,
  Copy,
  Download,
  FileText,
  MessageSquare,
  Pause,
  Play,
  Square,
  Terminal,
} from 'lucide-react'
import type { Session, Message, SessionEvent } from '@ash-ai/shared'

export default function SessionsPage() {
  return (
    <Suspense fallback={<div className="text-sm text-white/40">Loading...</div>}>
      <SessionsPageInner />
    </Suspense>
  )
}

function SessionsPageInner() {
  const searchParams = useSearchParams()
  const initialId = searchParams.get('id')

  const { agents } = useAgents()
  const [agentFilter, setAgentFilter] = useState<string>('')
  const [statusFilter, setStatusFilter] = useState<string>('')
  const { sessions, loading, refetch } = useSessions({
    agent: agentFilter || undefined,
    autoRefresh: true,
  })
  const [selectedId, setSelectedId] = useState<string | null>(initialId)

  // Auto-select first session
  useEffect(() => {
    if (!selectedId && sessions.length > 0) {
      setSelectedId(sessions[0].id)
    }
  }, [sessions, selectedId])

  const filteredSessions = sessions.filter((s) => {
    if (statusFilter && s.status !== statusFilter) return false
    return true
  })

  const selectedSession = sessions.find((s) => s.id === selectedId)

  const agentOptions = [
    { value: '', label: 'All Agents' },
    ...agents.map((a) => ({ value: a.name, label: a.name })),
  ]

  const statusOptions = [
    { value: '', label: 'All Statuses' },
    { value: 'active', label: 'Active' },
    { value: 'paused', label: 'Paused' },
    { value: 'ended', label: 'Ended' },
    { value: 'error', label: 'Error' },
  ]

  return (
    <div className="flex h-[calc(100vh-5rem)] gap-4">
      {/* Left: Session List */}
      <div className="w-80 shrink-0 flex flex-col">
        <div className="mb-4">
          <h1 className="text-2xl font-bold text-white">Sessions</h1>
        </div>
        <div className="flex gap-2 mb-3">
          <Select
            options={agentOptions}
            value={agentFilter}
            onChange={(e) => setAgentFilter(e.target.value)}
            className="flex-1 h-8 text-xs"
          />
          <Select
            options={statusOptions}
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="flex-1 h-8 text-xs"
          />
        </div>
        <div className="flex-1 overflow-auto space-y-1 scrollbar-thin">
          {loading ? (
            <div className="space-y-2">
              {[1, 2, 3, 4, 5].map((i) => (
                <ShimmerBlock key={i} height={64} />
              ))}
            </div>
          ) : filteredSessions.length === 0 ? (
            <p className="text-sm text-white/40 text-center py-8">
              No sessions found
            </p>
          ) : (
            filteredSessions.map((session) => (
              <button
                key={session.id}
                onClick={() => setSelectedId(session.id)}
                className={cn(
                  'w-full text-left rounded-lg border px-3 py-2.5 transition-colors',
                  selectedId === session.id
                    ? 'bg-indigo-500/10 border-indigo-500/30'
                    : 'border-transparent hover:bg-white/5'
                )}
              >
                <div className="flex items-center justify-between">
                  <span className="text-sm font-medium text-white truncate">
                    {session.agentName}
                  </span>
                  <StatusBadge status={session.status} />
                </div>
                <div className="flex items-center justify-between mt-1">
                  <span className="text-xs text-white/30 font-mono">
                    {truncateId(session.id)}
                  </span>
                  <span className="text-xs text-white/30">
                    {formatRelativeTime(session.createdAt)}
                  </span>
                </div>
              </button>
            ))
          )}
        </div>
      </div>

      {/* Right: Detail */}
      <div className="flex-1 min-w-0">
        {selectedSession ? (
          <SessionDetail session={selectedSession} />
        ) : (
          <EmptyState
            icon={<Activity className="h-12 w-12" />}
            title="Select a session"
            description="Choose a session from the list to view details"
          />
        )}
      </div>
    </div>
  )
}

// ─── Session Detail ───

function SessionDetail({ session }: { session: Session }) {
  const [tab, setTab] = useState<'messages' | 'events' | 'terminal'>('messages')
  const [messages, setMessages] = useState<Message[]>([])
  const [events, setEvents] = useState<SessionEvent[]>([])
  const [logs, setLogs] = useState<string[]>([])
  const [loadingData, setLoadingData] = useState(true)

  const fetchData = useCallback(async () => {
    setLoadingData(true)
    try {
      const client = getClient()
      const [msgs, evts] = await Promise.all([
        client.listMessages(session.id).catch(() => []),
        client.listSessionEvents(session.id).catch(() => []),
      ])
      setMessages(msgs)
      setEvents(evts)
    } catch {
      // Silently handle errors
    } finally {
      setLoadingData(false)
    }
  }, [session.id])

  useEffect(() => {
    fetchData()
  }, [fetchData])

  // Auto-refresh for active sessions
  useEffect(() => {
    if (session.status !== 'active') return
    const interval = setInterval(fetchData, 5000)
    return () => clearInterval(interval)
  }, [session.status, fetchData])

  // Fetch logs when terminal tab is selected
  useEffect(() => {
    if (tab !== 'terminal') return
    const fetchLogs = async () => {
      try {
        const result = await getClient().getSessionLogs(session.id)
        if (result?.logs) {
          setLogs(result.logs.map((l) => l.text))
        }
      } catch {
        setLogs(['Failed to load logs'])
      }
    }
    fetchLogs()
    if (session.status === 'active') {
      const interval = setInterval(fetchLogs, 2000)
      return () => clearInterval(interval)
    }
  }, [tab, session.id, session.status])

  async function handleAction(action: 'pause' | 'resume' | 'stop' | 'end') {
    const client = getClient()
    try {
      if (action === 'pause') await client.pauseSession(session.id)
      else if (action === 'resume') await client.resumeSession(session.id)
      else if (action === 'stop') await client.stopSession(session.id)
      else if (action === 'end') await client.endSession(session.id)
    } catch (e) {
      console.error(`Failed to ${action} session:`, e)
    }
  }

  return (
    <Card className="h-full flex flex-col">
      {/* Header */}
      <div className="flex items-center justify-between px-6 py-4 border-b border-white/10">
        <div>
          <div className="flex items-center gap-3">
            <h2 className="text-lg font-semibold text-white">{session.agentName}</h2>
            <StatusBadge status={session.status} />
          </div>
          <div className="flex items-center gap-4 mt-1">
            <span className="text-xs text-white/30 font-mono">{session.id}</span>
            <span className="text-xs text-white/30">
              {formatRelativeTime(session.createdAt)}
            </span>
            {session.model && <Badge variant="info">{session.model}</Badge>}
          </div>
        </div>
        <div className="flex items-center gap-2">
          {session.status === 'active' && (
            <>
              <Button size="sm" variant="ghost" onClick={() => handleAction('pause')} title="Pause">
                <Pause className="h-4 w-4" />
              </Button>
              <Button size="sm" variant="ghost" onClick={() => handleAction('stop')} title="Stop">
                <Square className="h-4 w-4" />
              </Button>
            </>
          )}
          {(session.status === 'paused' || session.status === 'stopped') && (
            <Button size="sm" variant="ghost" onClick={() => handleAction('resume')} title="Resume">
              <Play className="h-4 w-4" />
            </Button>
          )}
          <Button
            size="sm"
            variant="ghost"
            onClick={() => navigator.clipboard.writeText(session.id)}
            title="Copy ID"
          >
            <Copy className="h-4 w-4" />
          </Button>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 px-6 py-2 border-b border-white/10">
        {[
          { key: 'messages', label: 'Messages', icon: MessageSquare, count: messages.length },
          { key: 'events', label: 'Events', icon: Activity, count: events.length },
          { key: 'terminal', label: 'Terminal', icon: Terminal },
        ].map(({ key, label, icon: Icon, count }) => (
          <button
            key={key}
            onClick={() => setTab(key as typeof tab)}
            className={cn(
              'flex items-center gap-2 px-3 py-1.5 text-sm font-medium rounded-md transition-colors',
              tab === key
                ? 'bg-white/10 text-white'
                : 'text-white/40 hover:text-white/70'
            )}
          >
            <Icon className="h-3.5 w-3.5" />
            {label}
            {count !== undefined && count > 0 && (
              <span className="text-xs text-white/30">{count}</span>
            )}
          </button>
        ))}
      </div>

      {/* Tab Content */}
      <div className="flex-1 overflow-auto p-6 scrollbar-thin">
        {loadingData ? (
          <div className="space-y-3">
            {[1, 2, 3].map((i) => (
              <ShimmerBlock key={i} height={60} />
            ))}
          </div>
        ) : tab === 'messages' ? (
          <MessagesTab messages={messages} />
        ) : tab === 'events' ? (
          <EventsTab events={events} />
        ) : (
          <TerminalTab logs={logs} />
        )}
      </div>
    </Card>
  )
}

// ─── Messages Tab ───

function MessagesTab({ messages }: { messages: Message[] }) {
  const bottomRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages.length])

  if (messages.length === 0) {
    return (
      <p className="text-sm text-white/40 text-center py-8">
        No messages yet
      </p>
    )
  }

  return (
    <div className="space-y-4">
      {messages.map((msg, i) => (
        <MessageBlock key={msg.id || i} message={msg} />
      ))}
      <div ref={bottomRef} />
    </div>
  )
}

function MessageBlock({ message }: { message: Message }) {
  const isUser = message.role === 'user'
  const [expanded, setExpanded] = useState(false)

  let displayContent = ''
  let toolCalls: Array<{ id?: string; name: string; input?: unknown }> = []

  try {
    const parsed = JSON.parse(message.content)
    if (Array.isArray(parsed)) {
      const textBlocks = parsed.filter(
        (b: Record<string, unknown>) => b.type === 'text'
      )
      toolCalls = parsed.filter(
        (b: Record<string, unknown>) => b.type === 'tool_use'
      ) as typeof toolCalls
      displayContent = textBlocks
        .map((b: Record<string, unknown>) => String(b.text || ''))
        .join('\n')
    } else if (typeof parsed === 'string') {
      displayContent = parsed
    } else if (parsed && typeof parsed === 'object') {
      // SDK result/assistant messages: extract text from content array or result field
      const obj = parsed as Record<string, unknown>
      if (Array.isArray(obj.content)) {
        const textBlocks = (obj.content as Record<string, unknown>[]).filter(
          (b) => b.type === 'text'
        )
        toolCalls = (obj.content as Record<string, unknown>[]).filter(
          (b) => b.type === 'tool_use'
        ) as typeof toolCalls
        displayContent = textBlocks
          .map((b) => String(b.text || ''))
          .join('\n')
      } else if (typeof obj.result === 'string') {
        displayContent = obj.result
      } else if (typeof obj.text === 'string') {
        displayContent = obj.text
      }
    } else {
      displayContent = message.content
    }
  } catch {
    displayContent = message.content
  }

  return (
    <div className={cn('rounded-lg border p-4', isUser ? 'border-blue-500/20 bg-blue-500/5' : 'border-white/5 bg-white/[0.02]')}>
      <div className="flex items-center gap-2 mb-2">
        <Badge variant={isUser ? 'info' : 'default'}>
          {isUser ? 'User' : 'Assistant'}
        </Badge>
        {message.createdAt && (
          <span className="text-xs text-white/30">
            {formatRelativeTime(message.createdAt)}
          </span>
        )}
      </div>
      {displayContent && (
        <div className="text-sm text-white/80 whitespace-pre-wrap">{displayContent}</div>
      )}
      {toolCalls.length > 0 && (
        <div className="mt-3 space-y-2">
          {toolCalls.map((tc, idx) => (
            <ToolCallDisplay key={tc.id || idx} toolCall={tc} />
          ))}
        </div>
      )}
    </div>
  )
}

function ToolCallDisplay({ toolCall }: { toolCall: { id?: string; name: string; input?: unknown } }) {
  const [expanded, setExpanded] = useState(false)

  return (
    <div className="rounded-md border border-white/10 bg-black/20 overflow-hidden">
      <button
        onClick={() => setExpanded(!expanded)}
        aria-expanded={expanded}
        className="flex items-center gap-2 w-full px-3 py-2 text-sm text-white/60 hover:text-white/80 transition-colors"
      >
        {expanded ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
        <span className="font-mono text-indigo-400">{toolCall.name}</span>
      </button>
      {expanded && (
        <div className="px-3 pb-3">
          <div className="text-xs text-white/40 mb-1">Input:</div>
          <pre className="text-xs text-white/60 overflow-auto max-h-48 bg-black/30 rounded p-2">
            {JSON.stringify(toolCall.input, null, 2)}
          </pre>
        </div>
      )}
    </div>
  )
}

// ─── Events Tab ───

function EventsTab({ events }: { events: SessionEvent[] }) {
  if (events.length === 0) {
    return (
      <p className="text-sm text-white/40 text-center py-8">
        No events recorded
      </p>
    )
  }

  const eventTypeColors: Record<string, string> = {
    text: 'text-blue-400',
    tool_start: 'text-purple-400',
    tool_result: 'text-purple-400',
    reasoning: 'text-amber-400',
    error: 'text-red-400',
    turn_complete: 'text-green-400',
    lifecycle: 'text-zinc-400',
  }

  return (
    <div className="space-y-1">
      {events.map((event, i) => (
        <EventRow key={event.id || i} event={event} typeColors={eventTypeColors} />
      ))}
    </div>
  )
}

function EventRow({
  event,
  typeColors,
}: {
  event: SessionEvent
  typeColors: Record<string, string>
}) {
  const [expanded, setExpanded] = useState(false)
  const color = typeColors[event.type] || 'text-white/40'

  let summary = ''
  try {
    const data =
      typeof event.data === 'string' ? JSON.parse(event.data) : event.data
    if (data && typeof data === 'object') {
      const d = data as Record<string, unknown>
      if (typeof d.text === 'string') summary = d.text.slice(0, 100)
      else if (typeof d.name === 'string') summary = d.name
      else if (typeof d.error === 'string') summary = d.error.slice(0, 100)
    }
  } catch {
    // event.data is not valid JSON — ignore
  }

  return (
    <div className="rounded-md border border-white/5 bg-white/[0.01]">
      <button
        onClick={() => setExpanded(!expanded)}
        aria-expanded={expanded}
        className="flex items-center gap-3 w-full px-3 py-2 text-sm hover:bg-white/[0.02] transition-colors"
      >
        {expanded ? <ChevronDown className="h-3 w-3 text-white/30" /> : <ChevronRight className="h-3 w-3 text-white/30" />}
        <span className="text-xs text-white/20 font-mono w-8">#{event.sequence}</span>
        <Badge className={color}>{event.type}</Badge>
        <span className="text-xs text-white/40 truncate flex-1 text-left">{summary}</span>
        <span className="text-xs text-white/20">
          {event.createdAt ? formatRelativeTime(event.createdAt) : ''}
        </span>
      </button>
      {expanded && (
        <div className="px-3 pb-3 pt-1">
          <pre className="text-xs text-white/50 overflow-auto max-h-64 bg-black/30 rounded p-2">
            {typeof event.data === 'string' ? event.data : JSON.stringify(event.data, null, 2)}
          </pre>
        </div>
      )}
    </div>
  )
}

// ─── Terminal Tab ───

function TerminalTab({ logs }: { logs: string[] }) {
  const bottomRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [logs.length])

  if (logs.length === 0) {
    return (
      <p className="text-sm text-white/40 text-center py-8">
        No terminal output
      </p>
    )
  }

  return (
    <div className="bg-black/40 rounded-lg p-4 font-mono text-xs">
      {logs.map((line, i) => (
        <div key={i} className="text-white/60 whitespace-pre-wrap">
          {line}
        </div>
      ))}
      <div ref={bottomRef} />
    </div>
  )
}
