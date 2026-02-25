import { cn } from '../utils.js';
import type { TreeNode } from '../types.js';
import { FolderOpen, Folder, ChevronDown, ChevronRight, getFileIcon } from '../icons.js';

export interface FileTreeProps {
  nodes: TreeNode[];
  selectedPath: string | null;
  expandedDirs: Set<string>;
  onSelectFile: (path: string) => void;
  onToggleDir: (path: string) => void;
}

function TreeItem({
  node,
  depth,
  selectedPath,
  expandedDirs,
  onSelectFile,
  onToggleDir,
}: {
  node: TreeNode;
  depth: number;
  selectedPath: string | null;
  expandedDirs: Set<string>;
  onSelectFile: (path: string) => void;
  onToggleDir: (path: string) => void;
}) {
  const isExpanded = expandedDirs.has(node.path);
  const isSelected = selectedPath === node.path;
  const Icon = node.isDir ? (isExpanded ? FolderOpen : Folder) : getFileIcon(node.name);

  return (
    <>
      <button
        onClick={() => node.isDir ? onToggleDir(node.path) : onSelectFile(node.path)}
        className={cn(
          'flex items-center gap-1.5 w-full text-left py-1 pr-2 text-xs transition-colors hover:bg-white/5',
          isSelected && !node.isDir && 'bg-accent/10 text-accent',
          !isSelected && 'text-white/60'
        )}
        style={{ paddingLeft: `${depth * 16 + 8}px` }}
      >
        {node.isDir ? (
          isExpanded ? (
            <ChevronDown className="h-3 w-3 shrink-0 text-white/30" />
          ) : (
            <ChevronRight className="h-3 w-3 shrink-0 text-white/30" />
          )
        ) : (
          <span className="w-3" />
        )}
        <Icon className={cn(
          'h-3.5 w-3.5 shrink-0',
          node.isDir ? 'text-accent' : 'text-white/40'
        )} />
        <span className="truncate">{node.name}</span>
        {node.isDir && node.children.length > 0 && (
          <span className="ml-auto text-[10px] text-white/20 shrink-0">{node.children.length}</span>
        )}
      </button>
      {node.isDir && isExpanded && node.children.map((child) => (
        <TreeItem
          key={child.path}
          node={child}
          depth={depth + 1}
          selectedPath={selectedPath}
          expandedDirs={expandedDirs}
          onSelectFile={onSelectFile}
          onToggleDir={onToggleDir}
        />
      ))}
    </>
  );
}

export function FileTree({ nodes, selectedPath, expandedDirs, onSelectFile, onToggleDir }: FileTreeProps) {
  return (
    <div className="overflow-y-auto scrollbar-thin">
      {nodes.map((node) => (
        <TreeItem
          key={node.path}
          node={node}
          depth={0}
          selectedPath={selectedPath}
          expandedDirs={expandedDirs}
          onSelectFile={onSelectFile}
          onToggleDir={onToggleDir}
        />
      ))}
    </div>
  );
}
