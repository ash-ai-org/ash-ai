import { useState, useEffect, useCallback } from 'react';
import type { AshClient } from '@ash-ai/sdk';
import { cn } from '../utils.js';
import { Save, Loader2, RefreshCw } from '../icons.js';

export interface AgentConfigEditorProps {
  client: AshClient;
  agentName: string;
  className?: string;
  onSaved?: (config: Record<string, unknown>) => void;
}

const CONFIG_FIELDS: Array<{
  key: string;
  label: string;
  type: 'text' | 'textarea' | 'number' | 'select';
  placeholder: string;
  options?: string[];
}> = [
  { key: 'description', label: 'Description', type: 'text', placeholder: 'A brief description of this agent' },
  { key: 'model', label: 'Model', type: 'text', placeholder: 'e.g. claude-sonnet-4-5-20250514' },
  { key: 'systemPrompt', label: 'System Prompt', type: 'textarea', placeholder: 'System prompt for the agent...' },
  { key: 'max_turns', label: 'Max Turns', type: 'number', placeholder: 'e.g. 10' },
  { key: 'permission_mode', label: 'Permission Mode', type: 'select', placeholder: 'Select permission mode', options: ['default', 'plan', 'bypassPermissions'] },
];

export function AgentConfigEditor({ client, agentName, className, onSaved }: AgentConfigEditorProps) {
  const [config, setConfig] = useState<Record<string, unknown>>({});
  const [original, setOriginal] = useState<Record<string, unknown>>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  const fetchConfig = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await client.getAgentConfig(agentName);
      setConfig(data);
      setOriginal(data);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to fetch config');
    } finally {
      setLoading(false);
    }
  }, [client, agentName]);

  useEffect(() => { fetchConfig(); }, [fetchConfig]);

  const handleSave = async () => {
    setSaving(true);
    setError(null);
    setSuccess(false);
    try {
      const changes: Record<string, unknown> = {};
      for (const field of CONFIG_FIELDS) {
        if (config[field.key] !== original[field.key]) {
          changes[field.key] = config[field.key];
        }
      }
      if (Object.keys(changes).length === 0) {
        setSuccess(true);
        return;
      }
      const updatedAgent = await client.updateAgentConfig(agentName, changes);
      const data = (updatedAgent && typeof updatedAgent === 'object' && 'config' in updatedAgent && updatedAgent.config)
        ? updatedAgent.config as Record<string, unknown>
        : { ...original, ...changes };
      setConfig(data);
      setOriginal(data);
      setSuccess(true);
      onSaved?.(data);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to save config');
    } finally {
      setSaving(false);
    }
  };

  const handleReset = () => {
    setConfig({ ...original });
    setError(null);
    setSuccess(false);
  };

  const updateField = (key: string, value: unknown) => {
    setConfig((prev) => ({ ...prev, [key]: value }));
    setSuccess(false);
  };

  const hasChanges = JSON.stringify(config) !== JSON.stringify(original);

  if (loading) {
    return (
      <div className={cn('flex items-center justify-center py-12', className)}>
        <Loader2 className="mr-2 h-4 w-4 animate-spin text-white/40" />
        <span className="text-sm text-white/50">Loading config...</span>
      </div>
    );
  }

  return (
    <div className={cn('space-y-4', className)}>
      {/* Toolbar */}
      <div className="flex items-center justify-end gap-2">
        {hasChanges && (
          <button
            onClick={handleReset}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg text-white/70 hover:text-white hover:bg-white/10 transition-colors"
          >
            <RefreshCw className="h-3.5 w-3.5" /> Reset
          </button>
        )}
        <button
          onClick={handleSave}
          disabled={saving || !hasChanges}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg bg-indigo-500 text-white hover:bg-indigo-400 disabled:opacity-50 disabled:pointer-events-none transition-colors"
        >
          {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />}
          Save
        </button>
      </div>

      {error && (
        <div className="text-sm text-red-400 bg-red-500/10 border border-red-500/20 rounded-lg px-4 py-2">{error}</div>
      )}
      {success && (
        <div className="text-sm text-green-400 bg-green-500/10 border border-green-500/20 rounded-lg px-4 py-2">
          Configuration saved.
        </div>
      )}

      {/* Fields */}
      <div className="space-y-4 rounded-xl border border-white/10 bg-white/[0.02] p-4">
        {CONFIG_FIELDS.map((field) => {
          const value = config[field.key] ?? '';

          if (field.type === 'textarea') {
            return (
              <div key={field.key} className="space-y-1.5">
                <label className="block text-sm font-medium text-white/70">{field.label}</label>
                <textarea
                  value={String(value)}
                  onChange={(e) => updateField(field.key, e.target.value || undefined)}
                  rows={5}
                  placeholder={field.placeholder}
                  className="flex w-full rounded-lg border px-3 py-2 text-sm bg-white/5 border-white/10 text-white placeholder:text-white/40 focus-visible:outline-none focus-visible:border-indigo-500/50 resize-none"
                />
              </div>
            );
          }

          if (field.type === 'select') {
            return (
              <div key={field.key} className="space-y-1.5">
                <label className="block text-sm font-medium text-white/70">{field.label}</label>
                <select
                  value={String(value)}
                  onChange={(e) => updateField(field.key, e.target.value || undefined)}
                  className="flex w-full rounded-lg border px-3 py-2 text-sm bg-white/5 border-white/10 text-white focus-visible:outline-none focus-visible:border-indigo-500/50"
                >
                  <option value="" style={{ background: '#1c2129' }}>Not set</option>
                  {field.options?.map((opt) => (
                    <option key={opt} value={opt} style={{ background: '#1c2129' }}>{opt}</option>
                  ))}
                </select>
              </div>
            );
          }

          if (field.type === 'number') {
            return (
              <div key={field.key} className="space-y-1.5">
                <label className="block text-sm font-medium text-white/70">{field.label}</label>
                <input
                  type="number"
                  value={value === undefined || value === '' ? '' : Number(value)}
                  onChange={(e) => updateField(field.key, e.target.value ? Number(e.target.value) : undefined)}
                  placeholder={field.placeholder}
                  className="flex w-full rounded-lg border px-3 py-2 text-sm bg-white/5 border-white/10 text-white placeholder:text-white/40 focus-visible:outline-none focus-visible:border-indigo-500/50"
                />
              </div>
            );
          }

          return (
            <div key={field.key} className="space-y-1.5">
              <label className="block text-sm font-medium text-white/70">{field.label}</label>
              <input
                type="text"
                value={String(value)}
                onChange={(e) => updateField(field.key, e.target.value || undefined)}
                placeholder={field.placeholder}
                className="flex w-full rounded-lg border px-3 py-2 text-sm bg-white/5 border-white/10 text-white placeholder:text-white/40 focus-visible:outline-none focus-visible:border-indigo-500/50"
              />
            </div>
          );
        })}
      </div>
    </div>
  );
}
