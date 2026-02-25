import { useEffect, useState, useCallback } from 'react';
import type { AshClient, FileEntry } from '@ash-ai/sdk';

export interface UseFileBrowserOptions {
  client: AshClient;
  sessionId: string;
}

export interface UseFileBrowserReturn {
  files: FileEntry[];
  source: string | null;
  loading: boolean;
  selectedPath: string | null;
  fileContent: string | null;
  fileLoading: boolean;
  fileError: string | null;
  expandedDirs: Set<string>;
  filter: string;
  setFilter: (filter: string) => void;
  selectFile: (path: string) => void;
  toggleDir: (path: string) => void;
  refresh: () => void;
}

export function useFileBrowser({
  client,
  sessionId,
}: UseFileBrowserOptions): UseFileBrowserReturn {
  const [files, setFiles] = useState<FileEntry[]>([]);
  const [source, setSource] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [selectedPath, setSelectedPath] = useState<string | null>(null);
  const [fileContent, setFileContent] = useState<string | null>(null);
  const [fileLoading, setFileLoading] = useState(false);
  const [fileError, setFileError] = useState<string | null>(null);
  const [expandedDirs, setExpandedDirs] = useState<Set<string>>(new Set());
  const [filter, setFilter] = useState('');

  const fetchFiles = useCallback(async () => {
    setLoading(true);
    try {
      const data = await client.getSessionFiles(sessionId);
      setFiles(data.files || []);
      setSource(data.source || null);
      // Auto-expand top-level directories
      const topDirs = new Set<string>();
      for (const f of data.files || []) {
        const first = f.path.split('/')[0];
        if (f.path.includes('/')) topDirs.add(first);
      }
      setExpandedDirs(topDirs);
    } catch {
      // Silently fail
    } finally {
      setLoading(false);
    }
  }, [client, sessionId]);

  useEffect(() => {
    fetchFiles();
  }, [fetchFiles]);

  const selectFile = useCallback(async (path: string) => {
    setSelectedPath(path);
    setFileContent(null);
    setFileError(null);

    const ext = path.split('.').pop()?.toLowerCase();
    const imageExts = new Set(['png', 'jpg', 'jpeg', 'gif', 'svg', 'webp', 'ico']);
    if (imageExts.has(ext || '')) return;

    setFileLoading(true);
    try {
      const data = await client.getSessionFile(sessionId, path);
      setFileContent(data.content || '');
    } catch (err) {
      setFileError('Failed to load file content');
    } finally {
      setFileLoading(false);
    }
  }, [client, sessionId]);

  const toggleDir = useCallback((path: string) => {
    setExpandedDirs((prev) => {
      const next = new Set(prev);
      if (next.has(path)) next.delete(path);
      else next.add(path);
      return next;
    });
  }, []);

  return {
    files,
    source,
    loading,
    selectedPath,
    fileContent,
    fileLoading,
    fileError,
    expandedDirs,
    filter,
    setFilter,
    selectFile,
    toggleDir,
    refresh: fetchFiles,
  };
}
