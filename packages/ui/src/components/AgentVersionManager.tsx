import { useState, useEffect, useCallback } from 'react';
import type { AshClient, AgentVersion } from '@ash-ai/sdk';
import { cn, formatTime } from '../utils.js';
import { GitBranch, Plus, CheckCircle2, Loader2, X } from '../icons.js';

export interface AgentVersionManagerProps {
  client: AshClient;
  agentName: string;
  className?: string;
  onActivated?: (version: AgentVersion) => void;
}

export function AgentVersionManager({ client, agentName, className, onActivated }: AgentVersionManagerProps) {
  const [versions, setVersions] = useState<AgentVersion[]>([]);
  const [loading, setLoading] = useState(true);
  const [activating, setActivating] = useState<number | null>(null);
  const [showCreate, setShowCreate] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    try {
      setLoading(true);
      const data = await client.listAgentVersions(agentName);
      setVersions(data);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to fetch versions');
    } finally {
      setLoading(false);
    }
  }, [client, agentName]);

  useEffect(() => { refresh(); }, [refresh]);

  const handleActivate = async (v: AgentVersion) => {
    setActivating(v.versionNumber);
    setError(null);
    try {
      await client.activateAgentVersion(agentName, v.versionNumber);
      await refresh();
      onActivated?.(v);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to activate version');
    } finally {
      setActivating(null);
    }
  };

  if (loading) {
    return (
      <div className={cn('flex items-center justify-center py-12', className)}>
        <Loader2 className="mr-2 h-4 w-4 animate-spin text-white/40" />
        <span className="text-sm text-white/50">Loading versions...</span>
      </div>
    );
  }

  return (
    <div className={cn('space-y-4', className)}>
      <div className="flex items-center justify-between">
        <span className="text-sm text-white/50">{versions.length} version{versions.length !== 1 ? 's' : ''}</span>
        <button
          onClick={() => setShowCreate(true)}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg bg-indigo-500 text-white hover:bg-indigo-400 transition-colors"
        >
          <Plus className="h-3.5 w-3.5" /> Create Version
        </button>
      </div>

      {error && (
        <div className="text-sm text-red-400 bg-red-500/10 border border-red-500/20 rounded-lg px-4 py-2">{error}</div>
      )}

      {versions.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-12 text-center">
          <GitBranch className="mb-3 h-10 w-10 text-white/20" />
          <p className="text-sm font-medium text-white/50">No versions yet</p>
          <p className="mt-1 text-xs text-white/40">Create your first version to snapshot the agent config.</p>
        </div>
      ) : (
        <div className="space-y-2">
          {versions.map((v) => (
            <div key={v.id} className="flex items-center justify-between rounded-xl border border-white/10 bg-white/[0.02] px-4 py-3">
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-semibold text-white">v{v.versionNumber}</span>
                  {v.name && <span className="text-sm text-white/50">{v.name}</span>}
                  {v.isActive && (
                    <span className="inline-flex items-center gap-1 rounded-full bg-green-500/10 px-2 py-0.5 text-xs font-medium text-green-400">
                      <CheckCircle2 className="h-3 w-3" /> Active
                    </span>
                  )}
                </div>
                {v.releaseNotes && <p className="text-xs text-white/40 mt-1">{v.releaseNotes}</p>}
                <div className="flex items-center gap-3 mt-1">
                  <span className="text-xs text-white/30">{formatTime(v.createdAt)}</span>
                  {v.systemPrompt && <span className="text-xs text-white/30">Has system prompt</span>}
                  {v.knowledgeFiles && v.knowledgeFiles.length > 0 && (
                    <span className="text-xs text-white/30">
                      {v.knowledgeFiles.length} file{v.knowledgeFiles.length !== 1 ? 's' : ''}
                    </span>
                  )}
                </div>
              </div>
              {!v.isActive && (
                <button
                  onClick={() => handleActivate(v)}
                  disabled={activating === v.versionNumber}
                  className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-medium rounded-lg border border-white/20 bg-white/5 text-white hover:bg-white/10 disabled:opacity-50 transition-colors"
                >
                  {activating === v.versionNumber ? (
                    <Loader2 className="h-3 w-3 animate-spin" />
                  ) : (
                    <CheckCircle2 className="h-3 w-3" />
                  )}
                  Activate
                </button>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Create Version Modal */}
      {showCreate && (
        <CreateVersionModal
          client={client}
          agentName={agentName}
          onClose={() => setShowCreate(false)}
          onCreated={() => { setShowCreate(false); refresh(); }}
        />
      )}
    </div>
  );
}

function CreateVersionModal({
  client,
  agentName,
  onClose,
  onCreated,
}: {
  client: AshClient;
  agentName: string;
  onClose: () => void;
  onCreated: () => void;
}) {
  const [name, setName] = useState('');
  const [systemPrompt, setSystemPrompt] = useState('');
  const [releaseNotes, setReleaseNotes] = useState('');
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleCreate = async () => {
    setCreating(true);
    setError(null);
    try {
      await client.createAgentVersion(agentName, {
        name: name || undefined,
        systemPrompt: systemPrompt || undefined,
        releaseNotes: releaseNotes || undefined,
      });
      onCreated();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to create version');
    } finally {
      setCreating(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
      <div className="w-full max-w-lg max-h-[90vh] overflow-auto rounded-xl border border-white/10 bg-[#1c2129] p-6">
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-lg font-semibold text-white">Create Version</h2>
          <button onClick={onClose} className="text-white/40 hover:text-white"><X className="h-5 w-5" /></button>
        </div>
        <div className="space-y-4">
          <div className="space-y-1.5">
            <label className="block text-sm font-medium text-white/70">Version Name (optional)</label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. v2 - improved grounding"
              className="flex w-full rounded-lg border px-3 py-2 text-sm bg-white/5 border-white/10 text-white placeholder:text-white/40 focus-visible:outline-none focus-visible:border-indigo-500/50"
            />
          </div>
          <div className="space-y-1.5">
            <label className="block text-sm font-medium text-white/70">System Prompt (optional)</label>
            <textarea
              value={systemPrompt}
              onChange={(e) => setSystemPrompt(e.target.value)}
              rows={4}
              placeholder="System prompt for this version..."
              className="flex w-full rounded-lg border px-3 py-2 text-sm bg-white/5 border-white/10 text-white placeholder:text-white/40 focus-visible:outline-none focus-visible:border-indigo-500/50 resize-none"
            />
          </div>
          <div className="space-y-1.5">
            <label className="block text-sm font-medium text-white/70">Release Notes (optional)</label>
            <textarea
              value={releaseNotes}
              onChange={(e) => setReleaseNotes(e.target.value)}
              rows={2}
              placeholder="What changed in this version..."
              className="flex w-full rounded-lg border px-3 py-2 text-sm bg-white/5 border-white/10 text-white placeholder:text-white/40 focus-visible:outline-none focus-visible:border-indigo-500/50 resize-none"
            />
          </div>
          {error && <p className="text-sm text-red-400">{error}</p>}
          <div className="flex justify-end gap-3 pt-2">
            <button onClick={onClose} className="px-3 py-1.5 text-sm text-white/70 hover:text-white hover:bg-white/10 rounded-lg transition-colors">Cancel</button>
            <button
              onClick={handleCreate}
              disabled={creating}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium rounded-lg bg-indigo-500 text-white hover:bg-indigo-400 disabled:opacity-50 transition-colors"
            >
              {creating ? 'Creating...' : 'Create Version'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
