/**
 * FileBrowser - Unified file browser for DEViLBOX
 * Combines:
 * - File System Access API (direct filesystem access in Chrome/Edge)
 * - Electron IPC (native OS filesystem access)
 * - Server API (jailed to data/ directory)
 */

import React, { useState, useEffect, useCallback, useRef } from 'react';
import { X, Folder, FolderOpen, FileAudio, ArrowLeft, Trash2, File, Cloud, HardDrive, History, RotateCcw, Globe, Search, Loader2, Download, AlertCircle } from 'lucide-react';
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
  pickFiles,
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
import { useAuthStore } from '@stores/useAuthStore';
import {
  isAuthenticated,
  listUserFiles,
  getFile as getCloudFile,
  saveFile as saveCloudFile,
  deleteFile as deleteCloudFile,
  listRevisions,
  restoreRevision,
  type ServerFile,
  type FileRevision,
} from '@/lib/serverFilesApi';
import {
  searchModland,
  getModlandFormats,
  downloadModlandFile,
  getModlandStatus,
  type ModlandFile,
  type ModlandFormat,
  type ModlandStatus,
} from '@/lib/modlandApi';

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
  source: 'filesystem' | 'cloud';
  handle?: FileSystemFileHandle | FileSystemDirectoryHandle;
  cloudId?: string; // For cloud files
}

// Helper to detect tracker module files (binary formats)
const TRACKER_EXTENSIONS = ['.mod', '.xm', '.it', '.s3m', '.fur', '.mptm', '.669', '.amf', '.ams', '.dbm', '.dmf', '.dsm', '.far', '.ftm', '.gdm', '.imf', '.mdl', '.med', '.mt2', '.mtm', '.okt', '.psm', '.ptm', '.sfx', '.stm', '.ult', '.umx'];

// Binary file formats that need ArrayBuffer loading (not JSON)
const BINARY_EXTENSIONS = [...TRACKER_EXTENSIONS, '.sqs', '.seq', '.mid', '.midi'];

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
  const [fileSource, setFileSource] = useState<'demo' | 'cloud' | 'modland'>('demo');
  const [cloudFiles, setCloudFiles] = useState<ServerFile[]>([]);

  // Modland state
  const [modlandQuery, setModlandQuery] = useState('');
  const [modlandFormat, setModlandFormat] = useState('');
  const [modlandResults, setModlandResults] = useState<ModlandFile[]>([]);
  const [modlandFormats, setModlandFormats] = useState<ModlandFormat[]>([]);
  const [modlandStatus, setModlandStatus] = useState<ModlandStatus | null>(null);
  const [modlandLoading, setModlandLoading] = useState(false);
  const [modlandError, setModlandError] = useState<string | null>(null);
  const [modlandOffset, setModlandOffset] = useState(0);
  const [modlandHasMore, setModlandHasMore] = useState(false);
  const [modlandDownloading, setModlandDownloading] = useState<Set<string>>(new Set());
  const modlandSearchTimer = useRef<ReturnType<typeof setTimeout>>(null);
  const modlandSearchRef = useRef<HTMLInputElement>(null);
  const MODLAND_LIMIT = 50;

  // Revision history state
  const [showRevisions, setShowRevisions] = useState(false);
  const [revisions, setRevisions] = useState<FileRevision[]>([]);
  const [revisionsLoading, setRevisionsLoading] = useState(false);
  const [revisionsFileId, setRevisionsFileId] = useState<string | null>(null);
  const [revisionsFilename, setRevisionsFilename] = useState<string>('');

  // Manual double-tap detection for touch devices (iOS)
  const lastClickRef = useRef<{ id: string; time: number }>({ id: '', time: 0 });

  // Auth state
  const user = useAuthStore((state) => state.user);
  const isServerAvailable = useAuthStore((state) => state.isServerAvailable);

  // Check filesystem access on mount
  useEffect(() => {
    const checkAccess = async () => {
      const hasElectron = hasElectronFS();
      const hasWebFS = isFileSystemAccessSupported() && !!getCurrentDirectory();

      setHasFilesystemAccess(hasElectron || hasWebFS);

      // Check server FS availability once on open (not in loadFiles to avoid loops)
      if (!hasElectron && !hasWebFS) {
        const serverFS = await isServerFSAvailable();
        setHasServerFS(serverFS);
      }
    };

    if (isOpen) {
      checkAccess();
    }
  }, [isOpen]);

  // Load files based on view mode
  const loadFiles = useCallback(async () => {
    // Modland tab handles its own data loading
    if (fileSource === 'modland') return;

    setIsLoading(true);
    setError(null);

    try {
      let items: FileItem[] = [];

      // If viewing cloud files
      if (fileSource === 'cloud' && isAuthenticated()) {
        const files = await listUserFiles('songs');
        setCloudFiles(files);
        items = files.map((f: ServerFile) => ({
          id: f.id,
          name: f.filename,
          isDirectory: false,
          path: f.filename,
          modifiedAt: new Date(f.updatedAt),
          source: 'cloud' as const,
          cloudId: f.id,
        }));
        items.sort((a, b) => a.name.localeCompare(b.name));
        setFiles(items);
        setIsLoading(false);
        return;
      }

      // Demo files / filesystem mode
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
        // Try server FS first if we think it's available
        if (hasServerFS) {
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
          } catch {
            // Server not available, fall through to manifest
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
  }, [currentPath, electronDirectory, hasServerFS, fileSource]);

  useEffect(() => {
    if (isOpen) {
      loadFiles();
    }
  }, [isOpen, loadFiles, fileSource]);

  // Load revisions for a cloud file
  const loadRevisions = useCallback(async (fileId: string, filename: string) => {
    setRevisionsLoading(true);
    setRevisionsFileId(fileId);
    setRevisionsFilename(filename);
    setShowRevisions(true);
    try {
      const result = await listRevisions(fileId);
      setRevisions(result.revisions);
    } catch (err) {
      console.error('Failed to load revisions:', err);
      setRevisions([]);
    } finally {
      setRevisionsLoading(false);
    }
  }, []);

  // Restore a revision
  const handleRestoreRevision = useCallback(async (revisionNumber: number) => {
    if (!revisionsFileId) return;
    setRevisionsLoading(true);
    try {
      await restoreRevision(revisionsFileId, revisionNumber);
      // Reload files to show updated timestamp
      await loadFiles();
      setShowRevisions(false);
      setRevisions([]);
      setRevisionsFileId(null);
    } catch (err) {
      console.error('Failed to restore revision:', err);
      setError(err instanceof Error ? err.message : 'Failed to restore revision');
    } finally {
      setRevisionsLoading(false);
    }
  }, [revisionsFileId, loadFiles]);

  // Request filesystem access
  const handleRequestFilesystemAccess = async () => {
    const handle = await requestDirectoryAccess();
    if (handle) {
      setHasFilesystemAccess(true);
    }
  };

  // Browse files using native file picker
  const handleBrowseFiles = async () => {
    setIsLoading(true);
    setError(null);

    try {
      if (isFileSystemAccessSupported()) {
        // Use File System Access API native picker
        const handles = await pickFiles({
          multiple: false,
          types: [
            {
              description: 'All Supported Files',
              accept: {
                'application/octet-stream': ['.dbx', '.dbox', '.mod', '.xm', '.it', '.s3m', '.fur', '.mptm', '.dmf', '.ftm', '.sqs', '.seq', '.mid', '.midi'],
              },
            },
          ],
        });
        if (handles.length > 0) {
          const file = await handles[0].getFile();
          const filename = file.name;
          
          // Check if this is a binary file
          if (isBinaryFile(filename)) {
            if (onLoadTrackerModule) {
              const buffer = await file.arrayBuffer();
              await onLoadTrackerModule(buffer, filename);
              onClose();
            } else {
              throw new Error('Binary file loading not supported');
            }
          } else {
            // JSON project file
            const content = await file.text();
            const data = JSON.parse(content);
            onLoad(data, filename);
            onClose();
          }
        }
      } else {
        // Fallback to input element for browsers without File System Access API
        const input = document.createElement('input');
        input.type = 'file';
        input.accept = '.dbx,.dbox,.mod,.xm,.it,.s3m,.fur,.mptm,.dmf,.ftm,.sqs,.seq,.mid,.midi,.xml';
        input.onchange = async (e) => {
          const file = (e.target as HTMLInputElement).files?.[0];
          if (file) {
            const filename = file.name;
            if (isBinaryFile(filename)) {
              if (onLoadTrackerModule) {
                const buffer = await file.arrayBuffer();
                await onLoadTrackerModule(buffer, filename);
                onClose();
              }
            } else {
              const content = await file.text();
              const data = JSON.parse(content);
              onLoad(data, filename);
              onClose();
            }
          }
        };
        input.click();
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load file');
    } finally {
      setIsLoading(false);
    }
  };

  // Load selected file
  const handleLoad = async () => {
    if (!selectedFile) return;
    setIsLoading(true);
    setError(null);

    try {
      // Handle cloud file loading
      if (selectedFile.source === 'cloud' && selectedFile.cloudId) {
        const cloudFile = await getCloudFile(selectedFile.cloudId);
        onLoad(cloudFile.data, cloudFile.filename);
        onClose();
        return;
      }

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
      let data: object | string;
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

      onLoad(data as object, selectedFile.name);
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

      // Save to cloud if viewing cloud files and authenticated
      if (fileSource === 'cloud' && isAuthenticated()) {
        await saveCloudFile(filename, data, 'songs');
        loadFiles(); // Refresh file list
        onClose();
        return;
      }

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
      // Delete from cloud if it's a cloud file
      if (file.source === 'cloud' && file.cloudId) {
        await deleteCloudFile(file.cloudId);
        loadFiles();
        return;
      }

      const dirHandle = getCurrentDirectory();
      if (dirHandle) {
        await deleteFile(file.name, dirHandle);
      }
      loadFiles();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to delete file');
    }
  };

  // ── Modland search ──────────────────────────────────────────────────────

  // Fetch modland status + formats when tab activates
  useEffect(() => {
    if (!isOpen || fileSource !== 'modland') return;
    getModlandStatus().then(setModlandStatus).catch(() => {});
    getModlandFormats().then(setModlandFormats).catch(() => {});
    setTimeout(() => modlandSearchRef.current?.focus(), 100);
  }, [isOpen, fileSource]);

  const doModlandSearch = useCallback(
    async (q: string, fmt: string, newOffset: number, append: boolean) => {
      if (!q && !fmt) {
        if (!append) setModlandResults([]);
        return;
      }
      setModlandLoading(true);
      setModlandError(null);
      try {
        const data = await searchModland({
          q: q || undefined,
          format: fmt || undefined,
          limit: MODLAND_LIMIT,
          offset: newOffset,
        });
        if (append) {
          setModlandResults((prev) => [...prev, ...data.results]);
        } else {
          setModlandResults(data.results);
        }
        setModlandHasMore(data.results.length === MODLAND_LIMIT);
        setModlandOffset(newOffset);
      } catch (err) {
        setModlandError(err instanceof Error ? err.message : 'Search failed');
      } finally {
        setModlandLoading(false);
      }
    },
    [],
  );

  // Debounced search trigger
  useEffect(() => {
    if (fileSource !== 'modland') return;
    if (modlandSearchTimer.current) clearTimeout(modlandSearchTimer.current);
    modlandSearchTimer.current = setTimeout(() => {
      doModlandSearch(modlandQuery, modlandFormat, 0, false);
    }, 300);
    return () => {
      if (modlandSearchTimer.current) clearTimeout(modlandSearchTimer.current);
    };
  }, [modlandQuery, modlandFormat, doModlandSearch, fileSource]);

  const modlandLoadMore = useCallback(() => {
    doModlandSearch(modlandQuery, modlandFormat, modlandOffset + MODLAND_LIMIT, true);
  }, [modlandQuery, modlandFormat, modlandOffset, doModlandSearch]);

  const handleModlandLoad = useCallback(
    async (file: ModlandFile) => {
      if (!onLoadTrackerModule) return;
      setModlandDownloading((prev) => new Set(prev).add(file.full_path));
      setModlandError(null);
      try {
        const buffer = await downloadModlandFile(file.full_path);
        await onLoadTrackerModule(buffer, file.filename);
        onClose();
      } catch (err) {
        setModlandError(err instanceof Error ? err.message : 'Failed to download');
      } finally {
        setModlandDownloading((prev) => {
          const next = new Set(prev);
          next.delete(file.full_path);
          return next;
        });
      }
    },
    [onLoadTrackerModule, onClose],
  );

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
        <div className="flex border-b border-dark-border bg-dark-bgTertiary">
          {/* Demo Files Tab */}
          <button
            onClick={() => {
              setFileSource('demo');
              setSelectedFile(null);
            }}
            className={`flex items-center gap-2 px-4 py-2 text-sm font-medium transition-colors ${
              fileSource === 'demo'
                ? 'text-accent-primary border-b-2 border-accent-primary bg-dark-bgSecondary'
                : 'text-text-muted hover:text-text-primary'
            }`}
          >
            <HardDrive size={14} />
            Demo Files
          </button>

          {/* Cloud Files Tab - only shown when logged in */}
          {user && isServerAvailable && (
            <button
              onClick={() => {
                setFileSource('cloud');
                setSelectedFile(null);
                setCurrentPath('');
              }}
              className={`flex items-center gap-2 px-4 py-2 text-sm font-medium transition-colors ${
                fileSource === 'cloud'
                  ? 'text-accent-primary border-b-2 border-accent-primary bg-dark-bgSecondary'
                  : 'text-text-muted hover:text-text-primary'
              }`}
            >
              <Cloud size={14} />
              My Files
            </button>
          )}

          {/* Modland Tab - only in load mode */}
          {mode === 'load' && onLoadTrackerModule && (
            <button
              onClick={() => {
                setFileSource('modland');
                setSelectedFile(null);
              }}
              className={`flex items-center gap-2 px-4 py-2 text-sm font-medium transition-colors ${
                fileSource === 'modland'
                  ? 'text-green-400 border-b-2 border-green-400 bg-dark-bgSecondary'
                  : 'text-text-muted hover:text-text-primary'
              }`}
            >
              <Globe size={14} />
              Modland
            </button>
          )}

          {/* Spacer */}
          <div className="flex-1" />

          {/* Browse Files button - opens native file picker */}
          {mode === 'load' && (
            <button
              onClick={handleBrowseFiles}
              className="px-4 py-2 text-sm font-medium text-text-muted hover:text-text-primary transition-colors"
            >
              Browse Files...
            </button>
          )}
          
          {/* Open Folder button (when Web FS API available) */}
          {!hasElectronFS() && fileSource === 'demo' && (
            <button
              onClick={handleRequestFilesystemAccess}
              className="px-4 py-2 text-sm font-medium text-text-muted hover:text-text-primary transition-colors"
            >
              {hasFilesystemAccess ? 'Filesystem' : 'Open Folder...'}
            </button>
          )}
        </div>

        {/* Breadcrumb / Current Path */}
        {currentPath && fileSource === 'demo' && (
          <div className="px-4 py-2 bg-dark-bgTertiary border-b border-dark-border">
            <div className="flex items-center gap-1.5 text-xs text-text-muted font-mono truncate">
              <FolderOpen size={14} /> {currentPath}
            </div>
          </div>
        )}

        {/* Cloud Files Info */}
        {fileSource === 'cloud' && user && (
          <div className="px-4 py-2 bg-accent-primary/10 border-b border-dark-border">
            <div className="flex items-center gap-1.5 text-xs text-accent-primary">
              <Cloud size={14} /> Your saved files ({cloudFiles.length})
            </div>
          </div>
        )}

        {/* Modland search bar */}
        {fileSource === 'modland' && (
          <div className="px-4 py-2 bg-dark-bgTertiary border-b border-dark-border flex gap-2 items-center">
            <div className="flex items-center gap-2 text-xs text-text-muted font-mono">
              {modlandStatus?.status === 'ready' && (
                <span>{modlandStatus.totalFiles.toLocaleString()} files</span>
              )}
              {modlandStatus?.status === 'indexing' && (
                <span className="text-amber-400 flex items-center gap-1">
                  <Loader2 size={10} className="animate-spin" /> Indexing...
                </span>
              )}
            </div>
            <div className="flex-1 relative">
              <Search size={12} className="absolute left-2 top-1/2 -translate-y-1/2 text-text-muted" />
              <input
                ref={modlandSearchRef}
                value={modlandQuery}
                onChange={(e) => setModlandQuery(e.target.value)}
                placeholder="Search modules..."
                className="w-full pl-7 pr-2 py-1.5 text-xs font-mono bg-dark-bg border border-dark-borderLight
                           rounded text-text-primary placeholder:text-text-muted/40
                           focus:border-green-600 focus:outline-none transition-colors"
              />
            </div>
            <select
              value={modlandFormat}
              onChange={(e) => setModlandFormat(e.target.value)}
              className="px-2 py-1.5 text-[11px] font-mono bg-dark-bg border border-dark-borderLight
                         rounded text-text-secondary cursor-pointer hover:bg-dark-bgHover transition-colors"
            >
              <option value="">All formats</option>
              {modlandFormats.map((f) => (
                <option key={f.format} value={f.format}>
                  {f.format} ({f.count.toLocaleString()})
                </option>
              ))}
            </select>
          </div>
        )}

        {/* File List */}
        <div className="flex-1 overflow-auto p-4">
          {error && (
            <div className="bg-red-900/30 border border-red-500 text-red-300 px-4 py-2 rounded mb-4 select-text">
              {error}
            </div>
          )}

          {/* Modland results */}
          {fileSource === 'modland' ? (
            <div className="flex flex-col gap-1">
              {modlandError && (
                <div className="flex items-center gap-1.5 text-red-400 text-xs font-mono px-3 py-2 mb-2 bg-red-900/20 rounded border border-red-900/30">
                  <AlertCircle size={12} />
                  {modlandError}
                </div>
              )}

              {modlandResults.length === 0 && !modlandLoading ? (
                <div className="flex flex-col items-center justify-center py-16 text-text-muted">
                  <Globe size={32} className="mb-3 opacity-40" />
                  <p className="text-sm font-mono">
                    {modlandQuery || modlandFormat ? 'No results found' : 'Search the modland archive'}
                  </p>
                  <p className="text-xs text-text-muted/60 mt-1">
                    165K+ tracker modules from ftp.modland.com
                  </p>
                </div>
              ) : (
                <>
                  {modlandResults.map((file) => (
                    <div
                      key={file.full_path}
                      className="flex items-center gap-3 px-3 py-2 bg-dark-bgTertiary rounded border border-transparent
                                 hover:bg-dark-bgHover hover:border-dark-border transition-colors group"
                    >
                      <FileAudio size={16} className="text-text-muted flex-shrink-0" />
                      <div className="flex-1 min-w-0">
                        <div className="text-text-primary text-sm font-mono truncate">
                          {file.filename}
                        </div>
                        <div className="flex gap-3 text-xs text-text-muted">
                          <span className="text-green-400/70">{file.format}</span>
                          <span>{file.author}</span>
                        </div>
                      </div>

                      {modlandDownloading.has(file.full_path) ? (
                        <Loader2 size={14} className="animate-spin text-green-400 flex-shrink-0" />
                      ) : (
                        <button
                          onClick={() => handleModlandLoad(file)}
                          className="flex items-center gap-1 px-3 py-1.5 text-xs font-medium rounded
                                     bg-green-900/30 text-green-400 border border-green-800/50
                                     hover:bg-green-800/40 hover:text-green-300 transition-colors
                                     opacity-0 group-hover:opacity-100 flex-shrink-0"
                        >
                          <Download size={12} />
                          Load
                        </button>
                      )}
                    </div>
                  ))}

                  {modlandHasMore && (
                    <button
                      onClick={modlandLoadMore}
                      disabled={modlandLoading}
                      className="mt-2 py-2 text-xs font-mono text-text-secondary bg-dark-bgTertiary
                                 border border-dark-borderLight rounded hover:bg-dark-bgHover
                                 hover:text-text-primary transition-colors disabled:opacity-50"
                    >
                      {modlandLoading ? (
                        <span className="flex items-center justify-center gap-1">
                          <Loader2 size={12} className="animate-spin" /> Loading...
                        </span>
                      ) : (
                        'Load more results'
                      )}
                    </button>
                  )}
                </>
              )}

              {modlandLoading && modlandResults.length === 0 && (
                <div className="flex items-center justify-center py-16">
                  <Loader2 size={20} className="animate-spin text-green-400" />
                </div>
              )}
            </div>
          ) : isLoading ? (
            <div className="flex items-center justify-center h-full text-text-muted">
              Loading...
            </div>
          ) : fileSource === 'cloud' && !user ? (
            // Cloud mode but not logged in
            <div className="flex flex-col items-center justify-center h-full text-text-muted">
              <Cloud size={48} className="mb-4 text-text-muted/50" />
              <p className="mb-2 text-lg font-medium">Sign in to save files</p>
              <p className="mb-4 text-sm text-center max-w-md">
                Create a free account to save your songs to the cloud and access them from any device.
              </p>
              <button
                onClick={() => setFileSource('demo')}
                className="px-4 py-2 text-text-muted hover:text-text-primary"
              >
                View Demo Files Instead
              </button>
            </div>
          ) : files.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full text-text-muted">
              {fileSource === 'cloud' ? (
                <>
                  <Cloud size={48} className="mb-4 text-text-muted/50" />
                  <p className="mb-2">No saved files yet</p>
                  <p className="text-sm text-center max-w-md">
                    {mode === 'save' 
                      ? 'Enter a filename below and click Save to save your first file.'
                      : 'Save a project first to see it here.'}
                  </p>
                </>
              ) : (
                <>
                  <p className="mb-4">No files found</p>
                  {!hasElectronFS() && !hasServerFS && !hasFilesystemAccess && (
                    <button
                      onClick={handleRequestFilesystemAccess}
                      className="px-4 py-2 bg-accent-primary text-white rounded hover:bg-accent-hover"
                    >
                      Open Folder
                    </button>
                  )}
                </>
              )}
              {hasElectronFS() && !electronDirectory && fileSource === 'demo' && (
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
              {/* Back button when in subdirectory (not for cloud files) */}
              {currentPath !== '' && fileSource === 'demo' && (
                <div
                  onClick={() => {
                    if (hasElectronFS() && currentPath) {
                      // Navigate to parent directory in Electron
                      const parentPath = currentPath.split('/').slice(0, -1).join('/') || '/';
                      setCurrentPath(parentPath);
                      setElectronDirectory(parentPath);
                    } else if (currentPath) {
                      // Navigate to parent directory (server or manifest)
                      const parentPath = currentPath.split('/').slice(0, -1).join('/') || '';
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
                  onClick={() => {
                    // Directories: open on single tap (standard file browser behavior)
                    if (file.isDirectory) {
                      if (hasElectronFS()) {
                        setCurrentPath(file.path);
                        setElectronDirectory(file.path);
                      } else {
                        setCurrentPath(file.path);
                      }
                      setSelectedFile(null);
                      return;
                    }

                    // Files: select on single tap, load on double tap
                    const now = Date.now();
                    const isDoubleTap = lastClickRef.current.id === file.id && (now - lastClickRef.current.time) < 500;
                    
                    if (isDoubleTap) {
                      // Double tap on file: load it
                      setSelectedFile(file);
                      if (mode === 'load') handleLoad();
                      // Reset to prevent triple-tap
                      lastClickRef.current = { id: '', time: 0 };
                      return;
                    }

                    // Single tap on file: select it
                    lastClickRef.current = { id: file.id, time: now };
                    setSelectedFile(file);
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
                  {/* Version history button for cloud files */}
                  {file.source === 'cloud' && file.cloudId && (
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        loadRevisions(file.cloudId!, file.name);
                      }}
                      className="text-text-muted hover:text-accent-primary p-1"
                      title="Version History"
                      aria-label="Version History"
                    >
                      <History size={14} />
                    </button>
                  )}
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
          {mode === 'save' && fileSource !== 'modland' && (
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
            {fileSource === 'modland' ? 'Close' : 'Cancel'}
          </button>
          {fileSource !== 'modland' && (
            <button
              onClick={mode === 'load' ? handleLoad : handleSave}
              disabled={mode === 'load' && (!selectedFile || selectedFile.isDirectory)}
              className={`flex items-center gap-2 px-6 py-2 rounded font-medium ${
                (mode === 'load' && (!selectedFile || selectedFile.isDirectory))
                  ? 'bg-dark-bgTertiary text-text-muted cursor-not-allowed'
                  : 'bg-accent-primary text-white hover:bg-accent-primaryHover'
              }`}
            >
              {fileSource === 'cloud' && <Cloud size={16} />}
              {mode === 'load' ? 'Load' : (fileSource === 'cloud' ? 'Save to Cloud' : 'Save')}
            </button>
          )}
        </div>
      </div>

      {/* Version History Modal */}
      {showRevisions && (
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-[60]">
          <div className="bg-dark-bgPrimary border border-dark-border rounded-lg w-[400px] max-h-[500px] flex flex-col">
            {/* Header */}
            <div className="flex items-center justify-between px-4 py-3 border-b border-dark-border">
              <div className="flex items-center gap-2">
                <History size={18} className="text-accent-primary" />
                <span className="font-semibold text-text-primary">Version History</span>
              </div>
              <button
                onClick={() => {
                  setShowRevisions(false);
                  setRevisions([]);
                  setRevisionsFileId(null);
                }}
                className="text-text-muted hover:text-text-primary"
              >
                <X size={18} />
              </button>
            </div>

            {/* File info */}
            <div className="px-4 py-2 bg-dark-bgSecondary border-b border-dark-border">
              <span className="text-sm text-text-muted">File: </span>
              <span className="text-sm text-text-primary font-medium">{revisionsFilename}</span>
            </div>

            {/* Revision list */}
            <div className="flex-1 overflow-y-auto p-4">
              {revisionsLoading ? (
                <div className="flex items-center justify-center py-8">
                  <div className="animate-spin w-6 h-6 border-2 border-accent-primary border-t-transparent rounded-full" />
                </div>
              ) : revisions.length === 0 ? (
                <div className="text-center py-8 text-text-muted">
                  No previous versions available.
                  <br />
                  <span className="text-sm">Versions are saved when you update a file.</span>
                </div>
              ) : (
                <div className="space-y-2">
                  {revisions.map((rev) => (
                    <div
                      key={rev.id}
                      className="flex items-center justify-between p-3 bg-dark-bgTertiary rounded border border-dark-border"
                    >
                      <div>
                        <div className="text-text-primary font-medium">
                          Version {rev.revisionNumber}
                        </div>
                        <div className="text-xs text-text-muted">
                          {new Date(rev.createdAt).toLocaleString()}
                        </div>
                      </div>
                      <button
                        onClick={() => handleRestoreRevision(rev.revisionNumber)}
                        disabled={revisionsLoading}
                        className="flex items-center gap-1 px-3 py-1.5 bg-accent-primary/20 text-accent-primary hover:bg-accent-primary/30 rounded text-sm font-medium disabled:opacity-50"
                      >
                        <RotateCcw size={14} />
                        Restore
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Footer */}
            <div className="px-4 py-3 border-t border-dark-border text-xs text-text-muted">
              Up to 10 versions are kept. Restoring creates a backup of the current version.
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default FileBrowser;
