import { useCallback } from 'react';
import type { AshClient } from '@ash-ai/sdk';
import type { AttachedFile } from '../types.js';

export interface UseFileUploadOptions {
  client: AshClient;
  onFilesChange: React.Dispatch<React.SetStateAction<AttachedFile[]>>;
  onError?: (error: string) => void;
}

export interface UseFileUploadReturn {
  handleFileSelect: (e: React.ChangeEvent<HTMLInputElement>) => Promise<void>;
  removeFile: (fileId: string) => void;
}

export function useFileUpload({
  client,
  onFilesChange,
  onError,
}: UseFileUploadOptions): UseFileUploadReturn {
  const handleFileSelect = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    for (const file of Array.from(files)) {
      const tempId = `uploading-${Date.now()}-${Math.random().toString(36).slice(2)}`;
      onFilesChange((prev) => [...prev, { id: tempId, filename: file.name, url: '', uploading: true }]);

      try {
        // Read file as base64
        const base64 = await new Promise<string>((resolve, reject) => {
          const reader = new FileReader();
          reader.onload = () => {
            const result = reader.result as string;
            resolve(result.split(',')[1]);
          };
          reader.onerror = () => reject(new Error('Failed to read file'));
          reader.readAsDataURL(file);
        });

        // Upload via SDK
        const uploaded = await client.uploadFile({
          filename: file.name,
          content: base64,
          mimeType: file.type || undefined,
          ttl: '24h',
        });

        // Get download URL
        const url = await client.getFileUrl(uploaded.id);

        onFilesChange((prev) =>
          prev.map((f) => f.id === tempId ? { id: uploaded.id, filename: file.name, url, uploading: false } : f)
        );
      } catch {
        onFilesChange((prev) => prev.filter((f) => f.id !== tempId));
        onError?.(`Failed to upload ${file.name}`);
      }
    }

    // Reset input so the same file can be re-selected
    e.target.value = '';
  }, [client, onFilesChange, onError]);

  const removeFile = useCallback((fileId: string) => {
    onFilesChange((prev) => prev.filter((f) => f.id !== fileId));
  }, [onFilesChange]);

  return { handleFileSelect, removeFile };
}
