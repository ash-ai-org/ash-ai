import { useRef } from 'react';
import { cn } from '../utils.js';
import { formatBytes, isImageFile, buildFileTree } from '../utils.js';
import type { TreeNode } from '../types.js';
import { FileTree } from './FileTree.js';
import { FolderOpen, FileText, Search, RefreshCw, Download, Loader2, X } from '../icons.js';

export interface FileBrowserProps {
  files: Array<{ path: string; size: number; modifiedAt: string }>;
  source?: string | null;
  loading: boolean;
  selectedPath: string | null;
  fileContent: string | null;
  fileLoading: boolean;
  fileError: string | null;
  expandedDirs: Set<string>;
  filter: string;
  onFilterChange: (filter: string) => void;
  onSelectFile: (path: string) => void;
  onToggleDir: (path: string) => void;
  onRefresh: () => void;
  /** Base URL for file downloads/images. Will append `/${path}` */
  fileBaseUrl?: string;
  className?: string;
}

export function FileBrowser({
  files,
  source,
  loading,
  selectedPath,
  fileContent,
  fileLoading,
  fileError,
  expandedDirs,
  filter,
  onFilterChange,
  onSelectFile,
  onToggleDir,
  onRefresh,
  fileBaseUrl,
  className,
}: FileBrowserProps) {
  const contentRef = useRef<HTMLPreElement>(null);

  if (loading) {
    return (
      <div className={cn('flex items-center justify-center py-12', className)}>
        <Loader2 className="mr-2 h-4 w-4 animate-spin text-white/40" />
        <span className="text-sm text-white/50">Loading files...</span>
      </div>
    );
  }

  if (files.length === 0) {
    return (
      <div className={cn('flex flex-col items-center justify-center py-12 text-center', className)}>
        <FolderOpen className="mb-3 h-10 w-10 text-white/20" />
        <p className="text-sm font-medium text-white/50">No files in workspace</p>
        <p className="mt-1 text-xs text-white/40">
          Files created by the agent will appear here
        </p>
      </div>
    );
  }

  const filteredFiles = filter
    ? files.filter((f) => f.path.toLowerCase().includes(filter.toLowerCase()))
    : files;

  const tree = buildFileTree(filteredFiles);
  const selectedFile = files.find((f) => f.path === selectedPath);
  const downloadUrl = fileBaseUrl && selectedPath ? `${fileBaseUrl}/${selectedPath}` : undefined;

  return (
    <div className={cn('flex flex-col h-full', className)}>
      {/* Toolbar */}
      <div className="flex items-center gap-2 border-b border-white/10 px-3 py-2 shrink-0">
        {source && (
          <span className={cn(
            'rounded-full px-2 py-0.5 text-[10px] font-medium border',
            source === 'sandbox'
              ? 'bg-green-500/10 text-green-400 border-green-500/20'
              : 'bg-white/5 text-white/40 border-white/10'
          )}>
            {source}
          </span>
        )}
        <span className="text-xs text-white/40">{files.length} files</span>
        <div className="flex-1" />
        <div className="relative">
          <Search className="absolute left-2 top-1/2 h-3 w-3 -translate-y-1/2 text-white/30" />
          <input
            type="text"
            value={filter}
            onChange={(e) => onFilterChange(e.target.value)}
            placeholder="Filter..."
            className="w-40 rounded-md border border-white/10 bg-white/5 pl-7 pr-2 py-1 text-xs text-white placeholder:text-white/30 focus:border-accent/50 focus:outline-none"
          />
          {filter && (
            <button
              onClick={() => onFilterChange('')}
              className="absolute right-1.5 top-1/2 -translate-y-1/2 text-white/30 hover:text-white"
            >
              <X className="h-3 w-3" />
            </button>
          )}
        </div>
        <button
          onClick={onRefresh}
          className="rounded-md p-1 text-white/40 hover:bg-white/5 hover:text-white transition-colors"
          title="Refresh"
        >
          <RefreshCw className="h-3.5 w-3.5" />
        </button>
      </div>

      {/* Two-panel layout */}
      <div className="flex flex-1 min-h-0">
        {/* File tree */}
        <div className="w-64 shrink-0 border-r border-white/10 overflow-y-auto scrollbar-thin">
          <FileTree
            nodes={tree}
            selectedPath={selectedPath}
            expandedDirs={expandedDirs}
            onSelectFile={onSelectFile}
            onToggleDir={onToggleDir}
          />
        </div>

        {/* File content viewer */}
        <div className="flex-1 min-w-0 flex flex-col overflow-hidden">
          {!selectedPath ? (
            <div className="flex flex-1 items-center justify-center text-center">
              <div>
                <FileText className="mx-auto mb-2 h-8 w-8 text-white/15" />
                <p className="text-xs text-white/30">Select a file to view its contents</p>
              </div>
            </div>
          ) : (
            <>
              {/* File header */}
              <div className="flex items-center justify-between border-b border-white/10 px-4 py-2 shrink-0">
                <div className="flex items-center gap-2 min-w-0">
                  <span className="font-mono text-xs text-white/60 truncate">{selectedPath}</span>
                  {selectedFile && (
                    <span className="text-[10px] text-white/30 shrink-0">
                      {formatBytes(selectedFile.size)}
                    </span>
                  )}
                </div>
                {downloadUrl && (
                  <a
                    href={downloadUrl}
                    download
                    className="rounded-md p-1.5 text-white/40 hover:bg-white/5 hover:text-white transition-colors shrink-0"
                    title="Download"
                  >
                    <Download className="h-3.5 w-3.5" />
                  </a>
                )}
              </div>

              {/* Content */}
              <div className="flex-1 overflow-auto bg-[#0d1117]">
                {fileLoading ? (
                  <div className="flex items-center justify-center py-12">
                    <Loader2 className="mr-2 h-4 w-4 animate-spin text-white/40" />
                    <span className="text-xs text-white/50">Loading...</span>
                  </div>
                ) : fileError ? (
                  <div className="flex flex-col items-center justify-center py-12 text-center px-4">
                    <p className="text-xs text-white/40">{fileError}</p>
                    {downloadUrl && (
                      <a
                        href={downloadUrl}
                        download
                        className="mt-2 text-xs text-accent hover:underline"
                      >
                        Download file
                      </a>
                    )}
                  </div>
                ) : isImageFile(selectedPath) ? (
                  <div className="flex items-center justify-center p-4">
                    {downloadUrl && (
                      <img
                        src={downloadUrl}
                        alt={selectedPath}
                        className="max-w-full max-h-[60vh] object-contain rounded"
                      />
                    )}
                  </div>
                ) : (
                  <pre
                    ref={contentRef}
                    className="p-4 text-xs font-mono text-white/70 leading-relaxed whitespace-pre-wrap break-words"
                  >
                    {fileContent}
                  </pre>
                )}
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
