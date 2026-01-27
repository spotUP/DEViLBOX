/**
 * FileBrowser - Song browser for DEViLBOX
 * Loads demo songs from data/songs/
 */

import React, { useState, useEffect, useCallback, useRef } from 'react';
import { Music, Upload } from 'lucide-react';

// Supported file extensions
const TRACKER_EXTENSIONS = ['.mod', '.xm', '.it', '.s3m', '.fur', '.dmf'];

// Check if file is a tracker module (needs conversion)
const isTrackerModule = (filename: string): boolean => {
  const ext = '.' + filename.split('.').pop()?.toLowerCase();
  return TRACKER_EXTENSIONS.includes(ext);
};

interface FileBrowserProps {
  isOpen: boolean;
  onClose: () => void;
  onLoad: (data: object, filename: string) => void;
  onLoadTrackerModule?: (buffer: ArrayBuffer, filename: string) => Promise<void>;
}

interface FileItem {
  id: string;
  name: string;
  path: string;
}

export const FileBrowser: React.FC<FileBrowserProps> = ({
  isOpen,
  onClose,
  onLoad,
  onLoadTrackerModule,
}) => {
  const [files, setFiles] = useState<FileItem[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedFile, setSelectedFile] = useState<FileItem | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Load songs from data/songs/
  const loadFiles = useCallback(async () => {
    setIsLoading(true);
    setError(null);

    try {
      const basePath = import.meta.env.BASE_URL || '/';
      const response = await fetch(`${basePath}data/songs/index.json`);
      if (response.ok) {
        const songs = await response.json();
        const items = songs.map((m: { file: string; name: string }) => ({
          id: m.file,
          name: m.name,
          path: `data/songs/${m.file}`,
        }));
        setFiles(items);
      } else {
        setError('Could not load songs index');
      }
    } catch {
      setError('Could not load songs index');
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    if (isOpen) {
      loadFiles();
    }
  }, [isOpen, loadFiles]);

  // Load selected file
  const handleLoad = async () => {
    if (!selectedFile) return;
    setIsLoading(true);
    setError(null);

    try {
      const isTracker = isTrackerModule(selectedFile.name);
      const basePath = import.meta.env.BASE_URL || '/';

      // Handle tracker modules (mod/xm/it/s3m) - need binary loading and conversion
      if (isTracker && onLoadTrackerModule) {
        const response = await fetch(`${basePath}${selectedFile.path}`);
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        const buffer = await response.arrayBuffer();
        await onLoadTrackerModule(buffer, selectedFile.name);
        onClose();
        return;
      }

      // Handle .dbox files (JSON format)
      const response = await fetch(`${basePath}${selectedFile.path}`);
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const data = await response.json();

      onLoad(data, selectedFile.name);
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load file');
    } finally {
      setIsLoading(false);
    }
  };

  // Handle local file selection (from file picker or drag-and-drop)
  const handleFileSelect = async (file: File) => {
    setIsLoading(true);
    setError(null);

    try {
      const filename = file.name;
      const isTracker = isTrackerModule(filename);

      // Handle tracker modules (mod/xm/it/s3m) - need binary loading and conversion
      if (isTracker && onLoadTrackerModule) {
        const buffer = await file.arrayBuffer();
        await onLoadTrackerModule(buffer, filename);
        onClose();
        return;
      }

      // Handle .dbox/.json files (JSON format)
      const text = await file.text();
      const data = JSON.parse(text);
      onLoad(data, filename);
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load file');
    } finally {
      setIsLoading(false);
    }
  };

  const handleLocalFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) handleFileSelect(file);
    // Reset input so same file can be selected again
    if (e.target) e.target.value = '';
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    const file = e.dataTransfer.files[0];
    if (file) handleFileSelect(file);
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50" onClick={onClose}>
      <div
        className="bg-dark-bgSecondary border border-dark-border rounded-lg shadow-xl w-[800px] max-w-[90vw] h-[600px] max-h-[80vh] flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-dark-border">
          <h2 className="text-lg font-bold text-text-primary">Load Song</h2>
          <button
            onClick={onClose}
            className="text-text-muted hover:text-text-primary text-xl leading-none"
          >
            x
          </button>
        </div>

        {/* File List with Drag-and-Drop */}
        <div
          className={`flex-1 overflow-auto p-4 transition-colors ${
            isDragging ? 'bg-accent-primary/10 border-2 border-dashed border-accent-primary' : ''
          }`}
          onDrop={handleDrop}
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
        >
          {error && (
            <div className="bg-red-900/30 border border-red-500 text-red-300 px-4 py-2 rounded mb-4">
              {error}
            </div>
          )}

          {isDragging ? (
            <div className="flex flex-col items-center justify-center h-full text-accent-primary">
              <Upload size={48} className="mb-4" />
              <p className="text-lg font-medium">Drop file to load</p>
              <p className="text-sm text-text-muted">.dbox, .json, .mod, .xm, .it, .s3m, .fur, .dmf</p>
            </div>
          ) : isLoading ? (
            <div className="flex items-center justify-center h-full text-text-muted">
              Loading...
            </div>
          ) : files.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full text-text-muted">
              <p>No songs found</p>
              <p className="text-sm mt-2">Drag a file here or use "Load from Computer"</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 gap-2">
              {files.map((file) => (
                <div
                  key={file.id}
                  onClick={() => setSelectedFile(file)}
                  onDoubleClick={() => {
                    setSelectedFile(file);
                    handleLoad();
                  }}
                  className={`flex items-center gap-3 p-3 rounded cursor-pointer transition-colors ${
                    selectedFile?.id === file.id
                      ? 'bg-accent-primary/20 border border-accent-primary'
                      : 'bg-dark-bgTertiary hover:bg-dark-bgHover border border-transparent'
                  }`}
                >
                  <Music size={20} className="text-accent-primary flex-shrink-0" />
                  <div className="flex-1 min-w-0">
                    <div className="font-medium text-text-primary truncate">{file.name}</div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Hidden file input */}
        <input
          ref={fileInputRef}
          type="file"
          accept=".dbox,.json,.mod,.xm,.it,.s3m,.fur,.dmf"
          onChange={handleLocalFileChange}
          className="hidden"
        />

        {/* Footer */}
        <div className="flex items-center gap-4 px-4 py-3 border-t border-dark-border">
          <button
            onClick={() => fileInputRef.current?.click()}
            className="flex items-center gap-2 px-4 py-2 bg-dark-bgTertiary hover:bg-dark-bgHover text-text-primary rounded transition-colors"
          >
            <Upload size={16} />
            Load from Computer
          </button>
          <div className="flex-1" />
          <button
            onClick={onClose}
            className="px-4 py-2 text-text-muted hover:text-text-primary"
          >
            Cancel
          </button>
          <button
            onClick={handleLoad}
            disabled={!selectedFile}
            className={`px-6 py-2 rounded font-medium ${
              !selectedFile
                ? 'bg-dark-bgTertiary text-text-muted cursor-not-allowed'
                : 'bg-accent-primary text-white hover:bg-accent-primaryHover'
            }`}
          >
            Load
          </button>
        </div>
      </div>
    </div>
  );
};

export default FileBrowser;
