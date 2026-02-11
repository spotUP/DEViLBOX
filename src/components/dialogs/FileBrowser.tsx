/**
 * FileBrowser - Unified file browser for DEViLBOX
 * Combines:
 * - File System Access API (direct filesystem access in Chrome/Edge)
 * - Electron IPC (native OS filesystem access)
 * - Server API (jailed to data/ directory)
 */

import React, { useState, useEffect, useCallback } from 'react';
import { X, Folder, FolderOpen, FileAudio, ArrowLeft, Trash2, File } from 'lucide-react';
import { FileManager as _FileManager } from '@cubone/react-file-manager';
import '@cubone/react-file-manager/dist/style.css';
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
import { hasElectronFS } from '@utils/electron';
import {
  isServerFSAvailable,
  isManifestAvailable,
  listServerDirectory,
  listManifestDirectory,
  readServerFile,
  readStaticFile,
  writeServerFile,
  type ServerFileEntry,
} from '@/lib/serverFS';

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

interface FileItem {
  id: string;
  name: string;
  isDirectory: boolean;
  path: string;
  size?: number;
  modifiedAt?: Date;
  source: 'filesystem';
  handle?: FileSystemFileHandle | FileSystemDirectoryHandle;
}

// Helper to detect tracker module files (binary formats)
const TRACKER_EXTENSIONS = ['.mod', '.xm', '.it', '.s3m', '.fur', '.mptm', '.669', '.amf', '.ams', '.dbm', '.dmf', '.dsm', '.far', '.ftm', '.gdm', '.imf', '.mdl', '.med', '.mt2', '.mtm', '.okt', '.psm', '.ptm', '.sfx', '.stm', '.ult', '.umx'];

// Binary file formats that need ArrayBuffer loading (not JSON)
const BINARY_EXTENSIONS = [...TRACKER_EXTENSIONS, '.sqs', '.seq'];

function isTrackerModule(filename: string): boolean {
  const ext = filename.toLowerCase().slice(filename.lastIndexOf('.'));
  return TRACKER_EXTENSIONS.includes(ext);
}

function isBinaryFile(filename: string): boolean {
  const ext = filename.toLowerCase().slice(filename.lastIndexOf('.'));
  return BINARY_EXTENSIONS.includes(ext);
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
  const [files, setFiles] = useState<FileItem[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedFile, setSelectedFile] = useState<FileItem | null>(null);
  const [saveFilename, setSaveFilename] = useState(suggestedFilename);
  const [hasFilesystemAccess, setHasFilesystemAccess] = useState(false);
  const [hasServerFS, setHasServerFS] = useState(false);
  const [currentPath, setCurrentPath] = useState<string>('');
  const [electronDirectory, setElectronDirectory] = useState<string | null>(null);

  // Check filesystem access on mount
  useEffect(() => {
    const checkAccess = () => {
      const hasElectron = hasElectronFS();
      const hasWebFS = isFileSystemAccessSupported() && !!getCurrentDirectory();
      
      setHasFilesystemAccess(hasElectron || hasWebFS);
      // Don't check server FS on mount - will be checked when loading files
    };
    
    if (isOpen) {
      checkAccess();
    }
  }, [isOpen]);

  // Load files based on view mode
  const loadFiles = useCallback(async () => {
    setIsLoading(true);
    setError(null);

    try {
      let items: FileItem[] = [];

      // Check if Electron FS is available
      if (hasElectronFS() && window.electron?.fs) {
        // Use Electron native file system
        if (!electronDirectory) {
          // Need to pick a directory first
          setIsLoading(false);
          return;
        }
        
        const targetPath = electronDirectory || currentPath;
        if (targetPath) {
          // Get all entries, not just filtered ones (user can navigate all folders)
          const entries = await window.electron.fs.readdir(targetPath, []);
          items = entries.map((e) => ({
            id: e.path,
            name: e.name,
            isDirectory: e.isDirectory,
            path: e.path,
            size: e.size,
            modifiedAt: e.modifiedAt ? new Date(e.modifiedAt) : undefined,
            source: 'filesystem' as const,
          }));
          
          // Sort: directories first, then files
          items.sort((a, b) => {
            if (a.isDirectory && !b.isDirectory) return -1;
            if (!a.isDirectory && b.isDirectory) return 1;
            return a.name.localeCompare(b.name);
          });
        }
      } else {
        // Check if server FS is available (lazy check to avoid console errors on startup)
        if (!hasServerFS) {
          const serverFS = await isServerFSAvailable();
          setHasServerFS(serverFS);
        }
        
        if (hasServerFS) {
          // Use server file system (jailed to data/)
          try {
            const targetPath = currentPath || 'songs';
            const entries = await listServerDirectory(targetPath);
            items = entries.map((e: ServerFileEntry) => ({
            id: e.path,
            name: e.name,
            isDirectory: e.isDirectory,
            path: e.path,
            size: e.size,
            modifiedAt: e.modifiedAt ? new Date(e.modifiedAt) : undefined,
            source: 'filesystem' as const,
          }));

          // Sort: directories first, then files
          items.sort((a, b) => {
            if (a.isDirectory && !b.isDirectory) return -1;
            if (!a.isDirectory && b.isDirectory) return 1;
            return a.name.localeCompare(b.name);
          });
        } catch (err) {
          // Server may not be available, fall through to manifest
          setHasServerFS(false);
        }
        }

        // Fallback: use build-time file manifest (works on GitHub Pages)
        if (items.length === 0 && isManifestAvailable()) {
          const targetPath = currentPath || '';
          const entries = listManifestDirectory(targetPath);
          items = entries.map((e: ServerFileEntry) => ({
            id: e.path,
            name: e.name,
            isDirectory: e.isDirectory,
            path: e.path,
            source: 'filesystem' as const,
          }));
        }

        if (items.length === 0) {
          // Last resort: Web File System Access API
          const dirHandle = getCurrentDirectory();
          if (dirHandle) {
            const entries = await listDirectory(dirHandle, []);
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
        }
      }
      

      setFiles(items);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load files');
    } finally {
      setIsLoading(false);
    }
  }, [currentPath, electronDirectory, hasServerFS]);

  useEffect(() => {
    if (isOpen) {
      loadFiles();
    }
  }, [isOpen, loadFiles]);

  // Request filesystem access
  const handleRequestFilesystemAccess = async () => {
    const handle = await requestDirectoryAccess();
    if (handle) {
      setHasFilesystemAccess(true);
    }
  };

  // Load selected file
  const handleLoad = async () => {
    if (!selectedFile) return;
    setIsLoading(true);
    setError(null);

    try {
      // Check if this is a binary file (tracker module, .sqs/.seq, etc.)
      if (isBinaryFile(selectedFile.name)) {
        if (!onLoadTrackerModule) {
          throw new Error('Binary file loading not supported');
        }

        let buffer: ArrayBuffer;

        if (selectedFile.source === 'filesystem') {
          // Check if Electron or Web FS API or Server FS or static manifest
          if (hasElectronFS() && window.electron?.fs && selectedFile.path) {
            buffer = await window.electron.fs.readFile(selectedFile.path);
          } else if (hasServerFS && selectedFile.path) {
            buffer = await readServerFile(selectedFile.path);
          } else if (selectedFile.handle) {
            const file = await (selectedFile.handle as FileSystemFileHandle).getFile();
            buffer = await file.arrayBuffer();
          } else if (selectedFile.path && isManifestAvailable()) {
            buffer = await readStaticFile(selectedFile.path);
          } else {
            throw new Error('Cannot read tracker module');
          }
        } else {
          throw new Error('Cannot read tracker module');
        }

        await onLoadTrackerModule(buffer, selectedFile.name);
        onClose();
        return;
      }

      // Load file content
      let data: any;
      const isXmlFile = selectedFile.name.toLowerCase().endsWith('.xml');

      // Check if Electron or Web FS API or Server FS or static manifest
      if (hasElectronFS() && window.electron?.fs && selectedFile.path) {
        const buffer = await window.electron.fs.readFile(selectedFile.path);
        const text = new TextDecoder().decode(buffer);
        data = isXmlFile ? text : JSON.parse(text);
      } else if (hasServerFS && selectedFile.path) {
        const buffer = await readServerFile(selectedFile.path);
        const text = new TextDecoder().decode(buffer);
        data = isXmlFile ? text : JSON.parse(text);
      } else if (selectedFile.handle) {
        const content = await readFile(selectedFile.handle as FileSystemFileHandle);
        // XML files are passed as raw text, others are parsed as JSON
        data = isXmlFile ? content : JSON.parse(content);
      } else if (selectedFile.path && isManifestAvailable()) {
        const buffer = await readStaticFile(selectedFile.path);
        const text = new TextDecoder().decode(buffer);
        data = isXmlFile ? text : JSON.parse(text);
      } else {
        throw new Error('Cannot read file');
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

      // Check which filesystem to use
      if (hasElectronFS() && window.electron?.fs) {
        // Save via Electron
        const targetPath = electronDirectory || currentPath;
        const fullPath = `${targetPath}/${filename}`;
        const jsonData = JSON.stringify(data, null, 2);
        const buffer = new TextEncoder().encode(jsonData);
        await window.electron.fs.writeFile(fullPath, buffer);
      } else if (hasServerFS) {
        // Save to server filesystem (jailed to data/)
        const targetPath = currentPath ? `${currentPath}/${filename}` : `songs/${filename}`;
        const jsonData = JSON.stringify(data, null, 2);
        const buffer = new TextEncoder().encode(jsonData);
        await writeServerFile(targetPath, buffer);
      } else {
        // Use Web FS API
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
      const dirHandle = getCurrentDirectory();
      if (dirHandle) {
        await deleteFile(file.name, dirHandle);
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
            className="text-text-muted hover:text-text-primary"
            aria-label="Close"
          >
            <X size={18} />
          </button>
        </div>

        {/* View Mode Tabs */}
        <div className="flex border-b border-dark-border">
          <button
            onClick={() => hasFilesystemAccess ? null : handleRequestFilesystemAccess()}
            className={`px-4 py-2 text-sm font-medium ${
              hasFilesystemAccess
                ? 'text-accent-primary border-b-2 border-accent-primary'
                : 'text-text-muted hover:text-text-primary'
            }`}
          >
            {hasFilesystemAccess ? 'Filesystem' : 'Open Folder...'}
          </button>
        </div>

        {/* Breadcrumb / Current Path */}
        {currentPath && (
          <div className="px-4 py-2 bg-dark-bgTertiary border-b border-dark-border">
            <div className="flex items-center gap-1.5 text-xs text-text-muted font-mono truncate">
              <FolderOpen size={14} /> {currentPath}
            </div>
          </div>
        )}

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
              {!hasElectronFS() && !hasServerFS && !hasFilesystemAccess && (
                <button
                  onClick={handleRequestFilesystemAccess}
                  className="px-4 py-2 bg-accent-primary text-white rounded hover:bg-accent-hover"
                >
                  Open Folder
                </button>
              )}
              {hasElectronFS() && !electronDirectory && (
                <button
                  onClick={async () => {
                    if (window.electron?.fs) {
                      const dir = await window.electron.fs.openDirectory();
                      if (dir) {
                        setElectronDirectory(dir);
                        setCurrentPath(dir);
                        loadFiles();
                      }
                    }
                  }}
                  className="px-4 py-2 bg-accent-primary text-white rounded hover:bg-accent-hover"
                >
                  Select Folder
                </button>
              )}
            </div>
          ) : (
            <div className="grid grid-cols-1 gap-2">
              {/* Back button when in subdirectory */}
              {currentPath !== '' && (hasElectronFS() || hasServerFS) && (
                <div
                  onClick={() => {
                    if (hasElectronFS() && currentPath) {
                      // Navigate to parent directory in Electron
                      const parentPath = currentPath.split('/').slice(0, -1).join('/') || '/';
                      setCurrentPath(parentPath);
                      setElectronDirectory(parentPath);
                    } else if (hasServerFS && currentPath) {
                      // Navigate to parent directory on server
                      const parentPath = currentPath.split('/').slice(0, -1).join('/') || 'songs';
                      setCurrentPath(parentPath);
                    }
                    setSelectedFile(null);
                  }}
                  className="flex items-center gap-3 p-3 rounded cursor-pointer transition-colors bg-dark-bgSecondary hover:bg-dark-bgHover border border-dark-border"
                >
                  <ArrowLeft size={18} className="text-text-muted" />
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
                      // Navigate into directory
                      if (hasElectronFS()) {
                        // Navigate into directory in Electron
                        setCurrentPath(file.path);
                        setElectronDirectory(file.path);
                        setSelectedFile(null);
                      } else if (hasServerFS) {
                        // Navigate into directory on server
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
                  <div className="text-text-muted flex-shrink-0">
                    {file.isDirectory
                      ? <Folder size={18} />
                      : isTrackerModule(file.name)
                        ? <FileAudio size={18} />
                        : <File size={18} />}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="font-medium text-text-primary truncate">{file.name}</div>
                    <div className="text-xs text-text-muted">
                      {file.size ? `${(file.size / 1024).toFixed(1)} KB` : ''}
                      {file.modifiedAt && ` • ${file.modifiedAt.toLocaleDateString()}`}
                    </div>
                  </div>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      handleDelete(file);
                    }}
                    className="text-text-muted hover:text-red-400 p-1"
                    title="Delete"
                    aria-label="Delete"
                  >
                    <Trash2 size={14} />
                  </button>
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
