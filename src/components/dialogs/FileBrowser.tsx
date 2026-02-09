/**
 * FileBrowser - Unified file browser for DEViLBOX
 * Combines:
 * - IndexedDB project library (persistent local storage)
 * - File System Access API (direct filesystem access in Chrome/Edge)
 * - Traditional file picker fallback
 */

import React, { useState, useEffect, useCallback } from 'react';
import { FileManager as _FileManager } from '@cubone/react-file-manager';
import '@cubone/react-file-manager/dist/style.css';
import { projectLibrary } from '@/lib/projectLibrary';
import type { ProjectMetadata } from '@/lib/projectLibrary';
import {
  isFileSystemAccessSupported,
  requestDirectoryAccess,
  getCurrentDirectory,
  listDirectory,
  readFile,
  writeFile,
  createFile,
  deleteFile,
  pickSaveLocation,
} from '@/lib/fileSystemAccess';
import type { FileEntry } from '@/lib/fileSystemAccess';

interface FileBrowserProps {
  isOpen: boolean;
  onClose: () => void;
  onLoad: (data: object, filename: string) => void;
  onLoadTrackerModule?: (buffer: ArrayBuffer, filename: string) => Promise<void>;
  onSave?: (getData: () => object) => void;
  mode?: 'load' | 'save';
  currentProjectData?: () => object;
  suggestedFilename?: string;
}

type ViewMode = 'filesystem' | 'bundled';

interface FileItem {
  id: string;
  name: string;
  isDirectory: boolean;
  path: string;
  size?: number;
  modifiedAt?: Date;
  source: 'library' | 'filesystem' | 'bundled';
  handle?: FileSystemFileHandle | FileSystemDirectoryHandle;
}

// Helper to detect tracker module files (binary formats)
const TRACKER_EXTENSIONS = ['.mod', '.xm', '.it', '.s3m', '.fur', '.mptm', '.669', '.amf', '.ams', '.dbm', '.dmf', '.dsm', '.far', '.ftm', '.gdm', '.imf', '.mdl', '.med', '.mt2', '.mtm', '.okt', '.psm', '.ptm', '.sfx', '.stm', '.ult', '.umx'];

function isTrackerModule(filename: string): boolean {
  const ext = filename.toLowerCase().slice(filename.lastIndexOf('.'));
  return TRACKER_EXTENSIONS.includes(ext);
}

export const FileBrowser: React.FC<FileBrowserProps> = ({
  isOpen,
  onClose,
  onLoad,
  onLoadTrackerModule,
  mode,
  currentProjectData,
  suggestedFilename = 'untitled.dbx',
}) => {
  const [viewMode, setViewMode] = useState<ViewMode>('bundled');
  const [files, setFiles] = useState<FileItem[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedFile, setSelectedFile] = useState<FileItem | null>(null);
  const [saveFilename, setSaveFilename] = useState(suggestedFilename);
  const [hasFilesystemAccess, setHasFilesystemAccess] = useState(false);
  const [currentPath, setCurrentPath] = useState<string>('');

  // Check filesystem access on mount
  useEffect(() => {
    setHasFilesystemAccess(isFileSystemAccessSupported() && !!getCurrentDirectory());
  }, [isOpen]);

  // Load files based on view mode
  const loadFiles = useCallback(async () => {
    setIsLoading(true);
    setError(null);

    try {
      let items: FileItem[] = [];

      if (viewMode === 'filesystem') {
        // Load from filesystem
        const dirHandle = getCurrentDirectory();
        if (dirHandle) {
          const entries = await listDirectory(dirHandle, ['.dbx', '.xml', ...TRACKER_EXTENSIONS]);
          items = entries.map((e: FileEntry) => ({
            id: e.path,
            name: e.name,
            isDirectory: e.isDirectory,
            path: e.path,
            size: e.size,
            modifiedAt: e.modifiedAt,
            source: 'filesystem' as const,
            handle: e.handle as FileSystemFileHandle,
          }));
        }
      } else if (viewMode === 'bundled') {
        // Load bundled data directory structure
        const basePath = import.meta.env.BASE_URL || '/';
        
        if (currentPath === '') {
          // Root level - show directories and library items
          items = [
            { id: 'data/songs', name: 'songs', isDirectory: true, path: 'data/songs', source: 'bundled' as const },
            { id: 'data/samples', name: 'samples', isDirectory: true, path: 'data/samples', source: 'bundled' as const },
            { id: 'data/instruments', name: 'instruments', isDirectory: true, path: 'data/instruments', source: 'bundled' as const },
          ];
          
          // Add library items at root level
          try {
            const projects = await projectLibrary.listProjects();
            items.push(...projects.map((p: ProjectMetadata) => ({
              id: p.id,
              name: p.name.endsWith('.dbx') ? p.name : `${p.name}.dbx`,
              isDirectory: false,
              path: `library/${p.name}`,
              size: p.size,
              modifiedAt: new Date(p.modifiedAt),
              source: 'library' as const,
            })));
          } catch {
            // Library not available
          }
        } else if (currentPath === 'data/songs') {
          // Inside songs directory - load and show songs
          try {
            const response = await fetch(`${basePath}data/songs/modules.json`);
            if (response.ok) {
              const data = await response.json();
              const categories = data.categories || {};
              const allModules: { file: string; name: string }[] = [];
              for (const mods of Object.values(categories)) {
                allModules.push(...(mods as { file: string; name: string }[]));
              }
              items = allModules.map((m) => ({
                id: `songs/${m.file}`,
                name: m.name,
                isDirectory: false,
                path: `data/songs/${m.file}`,
                source: 'bundled' as const,
              }));
            }
          } catch {
            // Fallback songs
            items = [
              { id: 'songs/phuture-acid-tracks.dbx', name: 'Phuture - Acid Tracks', isDirectory: false, path: 'data/songs/phuture-acid-tracks.dbx', source: 'bundled' as const },
              { id: 'songs/hardfloor-funalogue.dbx', name: 'Hardfloor - Funalogue', isDirectory: false, path: 'data/songs/hardfloor-funalogue.dbx', source: 'bundled' as const }
            ];
          }
        } else if (currentPath === 'data/samples') {
          // Inside samples directory - placeholder for now
          items = [];
        } else if (currentPath === 'data/instruments') {
          // Inside instruments directory - placeholder for now
          items = [];
        }
      }

      setFiles(items);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load files');
    } finally {
      setIsLoading(false);
    }
  }, [viewMode, currentPath]);

  useEffect(() => {
    if (isOpen) {
      loadFiles();
    }
  }, [isOpen, viewMode, loadFiles]);

  // Request filesystem access
  const handleRequestFilesystemAccess = async () => {
    const handle = await requestDirectoryAccess();
    if (handle) {
      setHasFilesystemAccess(true);
      setViewMode('filesystem');
    }
  };

  // Load selected file
  const handleLoad = async () => {
    if (!selectedFile) return;
    setIsLoading(true);
    setError(null);

    try {
      // Check if this is a tracker module
      if (isTrackerModule(selectedFile.name)) {
        if (!onLoadTrackerModule) {
          throw new Error('Tracker module loading not supported');
        }

        let buffer: ArrayBuffer;

        if (selectedFile.source === 'filesystem' && selectedFile.handle) {
          const file = await (selectedFile.handle as FileSystemFileHandle).getFile();
          buffer = await file.arrayBuffer();
        } else if (selectedFile.source === 'bundled') {
          const basePath = import.meta.env.BASE_URL || '/';
          const response = await fetch(`${basePath}${selectedFile.path}`);
          if (!response.ok) throw new Error(`HTTP ${response.status}`);
          buffer = await response.arrayBuffer();
        } else {
          throw new Error('Cannot load tracker module from this source');
        }

        await onLoadTrackerModule(buffer, selectedFile.name);
        onClose();
        return;
      }

      // Load file content
      let data: any;
      const isXmlFile = selectedFile.name.toLowerCase().endsWith('.xml');

      if (selectedFile.source === 'library') {
        const projectData = await projectLibrary.loadProject(selectedFile.id);
        if (!projectData) throw new Error('Project not found');
        data = projectData;
      } else if (selectedFile.source === 'filesystem' && selectedFile.handle) {
        const content = await readFile(selectedFile.handle as FileSystemFileHandle);
        // XML files are passed as raw text, others are parsed as JSON
        data = isXmlFile ? content : JSON.parse(content);
      } else if (selectedFile.source === 'bundled') {
        const basePath = import.meta.env.BASE_URL || '/';
        const fullPath = `${basePath}${selectedFile.path}`;
        console.log('Loading bundled file from:', fullPath);
        const response = await fetch(fullPath);
        if (!response.ok) throw new Error(`HTTP ${response.status}: ${fullPath}`);
        const contentType = response.headers.get('content-type');
        console.log('Response content-type:', contentType);
        // Check if we got HTML instead of expected content
        if (contentType?.includes('text/html')) {
          throw new Error(`Got HTML instead of file content. Path: ${fullPath}`);
        }
        // XML files are passed as raw text, others are parsed as JSON
        data = isXmlFile ? await response.text() : await response.json();
      } else {
        throw new Error('Cannot load file');
      }

      onLoad(data, selectedFile.name);
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load file');
    } finally {
      setIsLoading(false);
    }
  };

  // Save current project
  const handleSave = async () => {
    if (!currentProjectData) return;
    setIsLoading(true);
    setError(null);

    try {
      const data = currentProjectData();
      const filename = saveFilename.endsWith('.dbx') ? saveFilename : `${saveFilename}.dbx`;

      if (viewMode === 'bundled') {
        // Save to IndexedDB (project library)
        await projectLibrary.saveProject(filename, data);
      } else if (viewMode === 'filesystem') {
        // Save to filesystem
        const dirHandle = getCurrentDirectory();
        if (dirHandle) {
          await createFile(filename, JSON.stringify(data, null, 2), dirHandle);
        } else {
          // Use save picker
          const handle = await pickSaveLocation(filename);
          if (handle) {
            await writeFile(handle, JSON.stringify(data, null, 2));
          }
        }
      }

      loadFiles(); // Refresh file list
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save file');
    } finally {
      setIsLoading(false);
    }
  };

  // Delete file
  const handleDelete = async (file: FileItem) => {
    if (!confirm(`Delete "${file.name}"?`)) return;

    try {
      if (file.source === 'library') {
        await projectLibrary.deleteProject(file.id);
      } else if (file.source === 'filesystem') {
        const dirHandle = getCurrentDirectory();
        if (dirHandle) {
          await deleteFile(file.name, dirHandle);
        }
      }
      loadFiles();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to delete file');
    }
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
          <h2 className="text-lg font-bold text-text-primary">
            {mode === 'load' ? 'Load Module' : 'Save Module'}
          </h2>
          <button
            onClick={onClose}
            className="text-text-muted hover:text-text-primary text-xl leading-none"
          >
            x
          </button>
        </div>

        {/* View Mode Tabs */}
        <div className="flex border-b border-dark-border">
          {mode === 'load' && (
            <button
              onClick={() => setViewMode('bundled')}
              className={`px-4 py-2 text-sm font-medium ${
                viewMode === 'bundled'
                  ? 'text-accent-primary border-b-2 border-accent-primary'
                  : 'text-text-muted hover:text-text-primary'
              }`}
            >
              Files
            </button>
          )}
          <button
            onClick={() => hasFilesystemAccess ? setViewMode('filesystem') : handleRequestFilesystemAccess()}
            className={`px-4 py-2 text-sm font-medium ${
              viewMode === 'filesystem'
                ? 'text-accent-primary border-b-2 border-accent-primary'
                : 'text-text-muted hover:text-text-primary'
            }`}
          >
            {hasFilesystemAccess ? 'Folder' : 'Open Folder...'}
          </button>
        </div>

        {/* File List */}
        <div className="flex-1 overflow-auto p-4">
          {error && (
            <div className="bg-red-900/30 border border-red-500 text-red-300 px-4 py-2 rounded mb-4">
              {error}
            </div>
          )}

          {isLoading ? (
            <div className="flex items-center justify-center h-full text-text-muted">
              Loading...
            </div>
          ) : files.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full text-text-muted">
              <p className="mb-4">No files found</p>
              {viewMode === 'bundled' && mode === 'load' && (
                <p className="text-sm">Save a project to see it here</p>
              )}
            </div>
          ) : (
            <div className="grid grid-cols-1 gap-2">
              {/* Back button when in subdirectory */}
              {viewMode === 'bundled' && currentPath !== '' && (
                <div
                  onClick={() => {
                    setCurrentPath('');
                    setSelectedFile(null);
                  }}
                  className="flex items-center gap-3 p-3 rounded cursor-pointer transition-colors bg-dark-bgSecondary hover:bg-dark-bgHover border border-dark-border"
                >
                  <div className="text-2xl">⬅️</div>
                  <div className="flex-1">
                    <div className="font-medium text-text-primary">.. (back)</div>
                  </div>
                </div>
              )}
              {files.map((file) => (
                <div
                  key={file.id}
                  onClick={() => setSelectedFile(file)}
                  onDoubleClick={() => {
                    if (file.isDirectory) {
                      // Navigate into directory in bundled mode
                      if (viewMode === 'bundled') {
                        setCurrentPath(file.path);
                        setSelectedFile(null);
                      }
                      return;
                    }
                    setSelectedFile(file);
                    if (mode === 'load') handleLoad();
                  }}
                  className={`flex items-center gap-3 p-3 rounded cursor-pointer transition-colors ${
                    selectedFile?.id === file.id
                      ? 'bg-accent-primary/20 border border-accent-primary'
                      : 'bg-dark-bgTertiary hover:bg-dark-bgHover border border-transparent'
                  }`}
                >
                  <div className="text-2xl">
                    {file.isDirectory ? '📁' : '🎵'}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="font-medium text-text-primary truncate">{file.name}</div>
                    <div className="text-xs text-text-muted">
                      {file.size ? `${(file.size / 1024).toFixed(1)} KB` : ''}
                      {file.modifiedAt && ` • ${file.modifiedAt.toLocaleDateString()}`}
                    </div>
                  </div>
                  {(file.source === 'library' || file.source === 'filesystem') && (
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        handleDelete(file);
                      }}
                      className="text-text-muted hover:text-red-400 p-1"
                      title="Delete"
                    >
                      🗑️
                    </button>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center gap-4 px-4 py-3 border-t border-dark-border">
          {mode === 'save' && (
            <input
              type="text"
              value={saveFilename}
              onChange={(e) => setSaveFilename(e.target.value)}
              placeholder="Filename"
              className="flex-1 px-3 py-2 bg-dark-bgTertiary border border-dark-border rounded text-text-primary"
            />
          )}
          <div className="flex-1" />
          <button
            onClick={onClose}
            className="px-4 py-2 text-text-muted hover:text-text-primary"
          >
            Cancel
          </button>
          <button
            onClick={mode === 'load' ? handleLoad : handleSave}
            disabled={mode === 'load' && (!selectedFile || selectedFile.isDirectory)}
            className={`px-6 py-2 rounded font-medium ${
              (mode === 'load' && (!selectedFile || selectedFile.isDirectory))
                ? 'bg-dark-bgTertiary text-text-muted cursor-not-allowed'
                : 'bg-accent-primary text-white hover:bg-accent-primaryHover'
            }`}
          >
            {mode === 'load' ? 'Load' : 'Save'}
          </button>
        </div>
      </div>
    </div>
  );
};

export default FileBrowser;
