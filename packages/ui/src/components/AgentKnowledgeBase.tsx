import { useState, useEffect, useCallback, useRef } from 'react';
import type { AshClient } from '@ash-ai/sdk';
import { cn, formatBytes } from '../utils.js';
import { BookOpen, Upload, Trash2, FileText, Loader2, RefreshCw, ChevronDown, ChevronRight } from '../icons.js';

export interface AgentKnowledgeBaseProps {
  client: AshClient;
  agentName: string;
  className?: string;
}

interface FileEntry {
  path: string;
  size: number;
  modifiedAt: string;
}

export function AgentKnowledgeBase({ client, agentName, className }: AgentKnowledgeBaseProps) {
  const [files, setFiles] = useState<FileEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState<Record<string, string | null>>({});
  const [loadingFile, setLoadingFile] = useState<string | null>(null);
  const [deleting, setDeleting] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const refresh = useCallback(async () => {
    try {
      setLoading(true);
      const data = await client.listAgentFiles(agentName);
      setFiles(data.files);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to fetch files');
    } finally {
      setLoading(false);
    }
  }, [client, agentName]);

  useEffect(() => { refresh(); }, [refresh]);

  const handlePreview = async (path: string) => {
    if (expanded[path] !== undefined) {
      setExpanded((prev) => { const next = { ...prev }; delete next[path]; return next; });
      return;
    }
    setLoadingFile(path);
    try {
      const data = await client.getAgentFile(agentName, path);
      setExpanded((prev) => ({ ...prev, [path]: data.content }));
    } catch {
      setExpanded((prev) => ({ ...prev, [path]: '(Failed to load)' }));
    } finally {
      setLoadingFile(null);
    }
  };

  const handleDelete = async (path: string) => {
    setDeleting(path);
    setError(null);
    try {
      await client.deleteAgentFile(agentName, path);
      refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to delete file');
    } finally {
      setDeleting(null);
    }
  };

  const handleUpload = async (fileList: FileList) => {
    setUploading(true);
    setError(null);
    try {
      const uploadFiles: Array<{ path: string; content: string }> = [];
      for (const file of Array.from(fileList)) {
        const buffer = await file.arrayBuffer();
        const base64 = btoa(String.fromCharCode(...new Uint8Array(buffer)));
        uploadFiles.push({ path: file.name, content: base64 });
      }
      await client.uploadAgentFiles(agentName, uploadFiles);
      refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to upload files');
    } finally {
      setUploading(false);
    }
  };

  if (loading) {
    return (
      <div className={cn('flex items-center justify-center py-12', className)}>
        <Loader2 className="mr-2 h-4 w-4 animate-spin text-white/40" />
        <span className="text-sm text-white/50">Loading files...</span>
      </div>
    );
  }

  return (
    <div className={cn('space-y-4', className)}>
      <div className="flex items-center justify-between">
        <span className="text-sm text-white/50">{files.length} file{files.length !== 1 ? 's' : ''}</span>
        <div className="flex items-center gap-2">
          <button onClick={refresh} className="p-1.5 text-white/40 hover:text-white rounded transition-colors">
            <RefreshCw className="h-4 w-4" />
          </button>
          <button
            onClick={() => fileInputRef.current?.click()}
            disabled={uploading}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg bg-indigo-500 text-white hover:bg-indigo-400 disabled:opacity-50 transition-colors"
          >
            {uploading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Upload className="h-3.5 w-3.5" />}
            Upload
          </button>
          <input
            ref={fileInputRef}
            type="file"
            multiple
            className="hidden"
            onChange={(e) => { if (e.target.files) handleUpload(e.target.files); }}
          />
        </div>
      </div>

      {error && (
        <div className="text-sm text-red-400 bg-red-500/10 border border-red-500/20 rounded-lg px-4 py-2">{error}</div>
      )}

      {files.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-12 text-center">
          <BookOpen className="mb-3 h-10 w-10 text-white/20" />
          <p className="text-sm font-medium text-white/50">No knowledge files</p>
          <p className="mt-1 text-xs text-white/40">Upload files for this agent&apos;s knowledge base.</p>
        </div>
      ) : (
        <div className="space-y-1">
          {files.map((file) => (
            <div key={file.path}>
              <div className="flex items-center justify-between rounded-lg border border-white/10 bg-white/[0.02] px-3 py-2">
                <button
                  onClick={() => handlePreview(file.path)}
                  className="flex items-center gap-2 min-w-0 flex-1 text-left"
                >
                  {loadingFile === file.path ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin text-white/40 shrink-0" />
                  ) : expanded[file.path] !== undefined ? (
                    <ChevronDown className="h-3.5 w-3.5 text-white/40 shrink-0" />
                  ) : (
                    <ChevronRight className="h-3.5 w-3.5 text-white/40 shrink-0" />
                  )}
                  <FileText className="h-3.5 w-3.5 text-white/40 shrink-0" />
                  <span className="text-sm text-white truncate">{file.path}</span>
                  <span className="text-xs text-white/30 shrink-0">{formatBytes(file.size)}</span>
                </button>
                <button
                  onClick={() => handleDelete(file.path)}
                  disabled={deleting === file.path}
                  className="p-1 text-white/30 hover:text-red-400 transition-colors shrink-0 ml-2"
                >
                  {deleting === file.path ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  ) : (
                    <Trash2 className="h-3.5 w-3.5" />
                  )}
                </button>
              </div>
              {expanded[file.path] !== undefined && (
                <div className="ml-4 mt-1 mb-2 rounded-lg border border-white/5 bg-black/20 p-3">
                  <pre className="text-xs text-white/70 whitespace-pre-wrap break-words max-h-60 overflow-auto">
                    {expanded[file.path]}
                  </pre>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
