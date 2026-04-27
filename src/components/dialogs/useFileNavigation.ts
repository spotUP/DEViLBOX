/**
 * useFileNavigation - Custom hook for file listing, directory navigation,
 * and file I/O operations in the FileBrowser dialog.
 */

import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
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
import { getSupportedExtensions } from '@/lib/import/ModuleLoader';
import { getSupportedMIDIExtensions } from '@/lib/import/MIDIImporter';

// Build comprehensive accept string for file inputs (400+ supported formats)
export const ACCEPTED_FILE_FORMATS = [
  '.json', '.dbx', '.dbox', '.xml',
  ...getSupportedExtensions(),
  ...getSupportedMIDIExtensions()
].join(',');

export interface FileItem {
  id: string;
  name: string;
  isDirectory: boolean;
  path: string;
  size?: number;
  modifiedAt?: Date;
  source: 'filesystem' | 'cloud';
  handle?: FileSystemFileHandle | FileSystemDirectoryHandle;
  cloudId?: string;
}

export type FileSource = 'demo' | 'cloud' | 'online' | 'modland' | 'hvsc';

// Helper to detect tracker module files (binary formats)
export const TRACKER_EXTENSIONS = [
  // Standard tracker formats (libopenmpt)
  '.mod', '.xm', '.it', '.s3m', '.fur', '.mptm', '.669', '.amf', '.ams', '.dbm',
  '.dmf', '.dsm', '.far', '.ftm', '.gdm', '.imf', '.mdl', '.med', '.mt2', '.mtm',
  '.okt', '.psm', '.ptm', '.sfx', '.stm', '.ult', '.umx',
  // HivelyTracker / AHX
  '.hvl', '.ahx',
  // Dedicated parsers
  '.mmd0', '.mmd1', '.mmd2', '.mmd3', '.digi',
  // Renoise (XRNS)
  '.xrns',
  // UADE exotic Amiga formats
  '.hip', '.hip7', '.hipc', '.hst', '.soc', '.sog', '.s7g', '.mcmd',
  '.tfmx', '.mdat', '.mdst',
  '.fc', '.fc13', '.fc14', '.fc2', '.fc3', '.fc4', '.sfc', '.smod', '.bfc', '.bsi',
  '.fred', '.gray',
  '.sid1', '.sid2', '.smn', '.bp', '.bp3', '.sndmon',
  '.bd', '.bds', '.dl', '.dln', '.dw', '.dwold', '.dh',
  '.rjp', '.rh', '.rho', '.mc', '.mcr', '.mco', '.jcb', '.jcbo',
  '.jp', '.jpn', '.jpnd', '.jt', '.jo', '.jmf', '.jpo', '.jpold',
  '.kim', '.kh', '.avp', '.mw', '.md', '.thm', '.tf', '.tmk',
  '.sb', '.wb', '.hn', '.tpu', '.hot', '.bye', '.ash', '.dz',
  '.scn', '.scr', '.snk', '.ps', '.pvp', '.pap', '.pat', '.dat',
  '.sa', '.sonic', '.jam', '.jc', '.ims', '.emod', '.qc',
  '.kris', '.puma', '.tcb', '.prt', '.synmod', '.ex', '.sg', '.mkii', '.mk2',
  '.lme', '.ma', '.ml',
  '.bss', '.dns', '.vss', '.sdr', '.osp', '.psa', '.sm', '.sc', '.sct',
  '.tw', '.spl', '.sfx13', '.sfx20', '.psf', '.sjs', '.mms', '.smus', '.snx',
  '.dm', '.dm1', '.dm2', '.dlm1', '.dlm2', '.dmu', '.dmu2', '.mug', '.mug2',
  '.mm4', '.mm8', '.sdata',
  '.aam', '.aon', '.aon4', '.aon8', '.adsc', '.core', '.cin',
  '.ea', '.mg', '.fw', '.glue', '.gm', '.gmc', '.dum', '.scumm',
  '.mok', '.riff', '.max', '.mon', '.dsr', '.dsc', '.dss',
  '.ems', '.emsv6', '.is', '.is20',
  '.mfp', '.ntp', '.mosh', '.npp', '.tits', '.alp', '.uds',
  '.sas', '.ss', '.fp', '.sun', '.trc', '.tro', '.tronic', '.dp',
  '.ufo', '.mus', '.abk', '.cust', '.custom', '.cm', '.rk',
  '.ast', '.aps', '.amc', '.mmdc', '.qpa', '.sqt', '.qts',
  '.jd', '.doda', '.ym', '.ymst', '.agi', '.mso',
  '.sng', '.tiny', '.one', '.two',
];

// Binary file formats that need ArrayBuffer loading (not JSON).
// Only .json, .xml, and .xt are text — everything else is binary.
// This avoids maintaining an ever-growing whitelist of 200+ format extensions.
const TEXT_EXTENSIONS = ['.json', '.xml', '.xt'];

export function isTrackerModule(filename: string): boolean {
  const lower = filename.toLowerCase();
  const ext = lower.slice(lower.lastIndexOf('.'));
  if (TRACKER_EXTENSIONS.includes(ext)) return true;
  // Also check Amiga prefix format: prefix.songname (e.g. "cm.viking_child")
  const dot = lower.indexOf('.');
  if (dot > 0) {
    const prefix = '.' + lower.slice(0, dot);
    if (TRACKER_EXTENSIONS.includes(prefix)) return true;
  }
  return false;
}

function isBinaryFile(filename: string): boolean {
  const ext = filename.toLowerCase().slice(filename.lastIndexOf('.'));
  return !TEXT_EXTENSIONS.includes(ext);
}

/** Companion file patterns: main prefix → companion prefix */
const COMPANION_PREFIXES: [string, string][] = [
  ['mdat.', 'smpl.'],  // TFMX
  ['smpl.', 'mdat.'],  // TFMX (reverse)
  ['mfp.',  'smp.'],   // MFP
  ['midi.', 'smpl.'],  // MIDI-Loriciel
];

/**
 * Auto-fetch companion files from the same server/static directory.
 * Returns a Map of filename → ArrayBuffer for any companions found.
 */
async function fetchCompanionFiles(
  filename: string,
  filePath: string | undefined,
): Promise<Map<string, ArrayBuffer>> {
  const companions = new Map<string, ArrayBuffer>();
  if (!filePath) return companions;

  const lower = filename.toLowerCase();
  for (const [mainPrefix, companionPrefix] of COMPANION_PREFIXES) {
    if (!lower.startsWith(mainPrefix)) continue;
    const songname = filename.slice(mainPrefix.length);
    const companionName = companionPrefix + songname;
    const dir = filePath.slice(0, filePath.lastIndexOf('/') + 1);
    const companionPath = dir + companionName;

    try {
      // Try static bundle first, then server API
      let buf: ArrayBuffer | null = null;
      if (isManifestAvailable()) {
        try { buf = await readStaticFile(companionPath); } catch { /* not in bundle */ }
      }
      if (!buf) {
        try { buf = await readServerFile(companionPath); } catch { /* not on server */ }
      }
      if (buf) {
        companions.set(companionName, buf);
      }
    } catch { /* companion not found — proceed without it */ }
    break;
  }
  return companions;
}

interface UseFileNavigationOptions {
  isOpen: boolean;
  fileSource: FileSource;
  onLoad: (data: object, filename: string) => void;
  onLoadTrackerModule?: (buffer: ArrayBuffer, filename: string, companionFiles?: Map<string, ArrayBuffer>) => Promise<void>;
  onClose: () => void;
  currentProjectData?: () => object;
  mode?: 'load' | 'save';
  suggestedFilename: string;
}

// Module-level cache so the dialog remembers its last state across open/close
const _lastState = {
  fileSource: 'demo' as FileSource,
  currentPath: '',
  electronDirectory: null as string | null,
  searchQuery: '',
};

/** Read the last file source the dialog was on. */
export function getLastFileSource(): FileSource {
  return _lastState.fileSource;
}

/** Persist the current dialog state so next open restores it. */
export function setLastFileSource(source: FileSource): void {
  _lastState.fileSource = source;
}

export function useFileNavigation({
  isOpen,
  fileSource,
  onLoad,
  onLoadTrackerModule,
  onClose,
  currentProjectData,
  suggestedFilename,
}: UseFileNavigationOptions) {
  const [rawFiles, setFiles] = useState<FileItem[]>([]);
  const [searchQuery, _setSearchQuery] = useState<string>(_lastState.searchQuery);
  const setSearchQuery = useCallback((q: string) => {
    _lastState.searchQuery = q;
    _setSearchQuery(q);
  }, []);
  const files = useMemo(() => {
    if (!searchQuery.trim()) return rawFiles;
    const q = searchQuery.toLowerCase();
    return rawFiles.filter(f => f.name.toLowerCase().includes(q));
  }, [rawFiles, searchQuery]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedFile, setSelectedFile] = useState<FileItem | null>(null);
  /* Mirror of `selectedFile` in a ref so `handleLoad` can be invoked in the
     same tick as `setSelectedFile` (e.g. double-clicking an unselected row)
     without reading a stale state value. */
  const selectedFileRef = useRef<FileItem | null>(null);
  useEffect(() => { selectedFileRef.current = selectedFile; }, [selectedFile]);
  const [saveFilename, setSaveFilename] = useState(suggestedFilename);
  const [hasFilesystemAccess, setHasFilesystemAccess] = useState(false);
  const [hasServerFS, setHasServerFS] = useState(false);
  const [currentPath, _setCurrentPath] = useState<string>(_lastState.currentPath);
  const [electronDirectory, _setElectronDirectory] = useState<string | null>(_lastState.electronDirectory);
  const [cloudFiles, setCloudFiles] = useState<ServerFile[]>([]);

  // Wrap setters to persist to module-level cache
  const setCurrentPath = useCallback((p: string) => {
    _lastState.currentPath = p;
    _setCurrentPath(p);
  }, []);
  const setElectronDirectory = useCallback((d: string | null) => {
    _lastState.electronDirectory = d;
    _setElectronDirectory(d);
  }, []);

  // Revision history state
  const [showRevisions, setShowRevisions] = useState(false);
  const [revisions, setRevisions] = useState<FileRevision[]>([]);
  const [revisionsLoading, setRevisionsLoading] = useState(false);
  const [revisionsFileId, setRevisionsFileId] = useState<string | null>(null);
  const [revisionsFilename, setRevisionsFilename] = useState<string>('');

  // Manual double-tap detection for touch devices (iOS)
  const lastClickRef = useRef<{ id: string; time: number }>({ id: '', time: 0 });

  // Quick-nav: press 0-9 or a-z to jump to matching file
  const fileListRef = useRef<HTMLDivElement>(null);
  const jumpRef = useRef<{ key: string; index: number; time: number }>({ key: '', index: -1, time: 0 });

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

  // Quick-nav keyboard handler: 0-9, a-z jump to matching file
  useEffect(() => {
    if (!isOpen || fileSource === 'modland' || fileSource === 'hvsc' || fileSource === 'online') return;

    const handleKeyDown = (e: KeyboardEvent) => {
      // Skip if an input/select/textarea is focused
      const tag = (e.target as HTMLElement)?.tagName;
      if (tag === 'INPUT' || tag === 'SELECT' || tag === 'TEXTAREA') return;

      const key = e.key.toLowerCase();
      if (!/^[a-z0-9]$/.test(key)) return;

      e.preventDefault();

      // Find all files matching this key
      const matches: number[] = [];
      files.forEach((file, i) => {
        if (file.name.toLowerCase().startsWith(key)) {
          matches.push(i);
        }
      });
      if (matches.length === 0) return;

      const now = Date.now();
      let targetIndex: number;

      // If same key pressed within 1s, cycle to next match
      if (jumpRef.current.key === key && now - jumpRef.current.time < 1000) {
        const currentPos = matches.indexOf(jumpRef.current.index);
        const nextPos = currentPos >= 0 ? (currentPos + 1) % matches.length : 0;
        targetIndex = matches[nextPos];
      } else {
        targetIndex = matches[0];
      }

      jumpRef.current = { key, index: targetIndex, time: now };

      // Select the file
      const file = files[targetIndex];
      if (file && !file.isDirectory) {
        setSelectedFile(file);
      }

      // Scroll into view — account for the "..(back)" row offset
      const hasBackRow = currentPath !== '' && fileSource === 'demo';
      const rowIndex = hasBackRow ? targetIndex + 1 : targetIndex;
      const container = fileListRef.current;
      if (container) {
        const rows = container.querySelectorAll('[data-file-row]');
        const row = rows[rowIndex];
        if (row) {
          row.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
        }
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, fileSource, files, currentPath]);

  // Load files based on view mode
  const loadFiles = useCallback(async () => {
    // Modland and HVSC tabs handle their own data loading
    if (fileSource === 'modland' || fileSource === 'hvsc' || fileSource === 'online') return;

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
      if (hasElectronFS() && window.electron?.fs) {
        if (!electronDirectory) {
          setIsLoading(false);
          return;
        }

        const targetPath = electronDirectory || currentPath;
        if (targetPath) {
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

          items.sort((a, b) => {
            if (a.isDirectory && !b.isDirectory) return -1;
            if (!a.isDirectory && b.isDirectory) return 1;
            return a.name.localeCompare(b.name);
          });
        }
      } else {
        // Start with the build-time manifest (bundled static files — works everywhere including iOS)
        if (isManifestAvailable()) {
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

        // Supplement with server API entries (adds files not in the static bundle)
        if (hasServerFS) {
          try {
            const targetPath = currentPath || 'songs';
            const entries = await listServerDirectory(targetPath);
            const existingIds = new Set(items.map(i => i.id));
            for (const e of entries) {
              if (!existingIds.has(e.path)) {
                items.push({
                  id: e.path,
                  name: e.name,
                  isDirectory: e.isDirectory,
                  path: e.path,
                  size: e.size,
                  modifiedAt: e.modifiedAt ? new Date(e.modifiedAt) : undefined,
                  source: 'filesystem' as const,
                });
              }
            }
          } catch {
            // Server not available — manifest entries are enough
          }
        }

        items.sort((a, b) => {
          if (a.isDirectory && !b.isDirectory) return -1;
          if (!a.isDirectory && b.isDirectory) return 1;
          return a.name.localeCompare(b.name);
        });

        if (items.length === 0) {
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
        const handles = await pickFiles({
          multiple: false,
          types: [
            {
              description: 'All Supported Files',
              accept: {
                'application/octet-stream': ['.dbx', '.dbox', '.mod', '.xm', '.it', '.s3m', '.fur', '.mptm', '.dmf', '.ftm', '.sqs', '.seq', '.mid', '.midi', '.xrns'],
              },
            },
          ],
        });
        if (handles.length > 0) {
          const file = await handles[0].getFile();
          const filename = file.name;
          
          if (isBinaryFile(filename)) {
            if (onLoadTrackerModule) {
              const buffer = await file.arrayBuffer();
              await onLoadTrackerModule(buffer, filename);
              onClose();
            } else {
              throw new Error('Binary file loading not supported');
            }
          } else {
            const content = await file.text();
            const data = JSON.parse(content);
            onLoad(data, filename);
            onClose();
          }
        }
      } else {
        const input = document.createElement('input');
        input.type = 'file';
        input.accept = ACCEPTED_FILE_FORMATS;
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
  /**
   * Load either the currently-selected file OR an explicit `fileOverride`.
   *
   * The override exists because `handleLoad` is a closure that captures
   * `selectedFile` at render time. When the user double-clicks an unselected
   * row the caller runs `setSelectedFile(file); handleLoad();` back-to-back;
   * the `setSelectedFile` call schedules a state update but React hasn't
   * re-rendered yet, so `selectedFile` in this closure is still stale
   * (either `null` → silent return, or the previously-selected file → loads
   * the wrong song). Passing `fileOverride` lets the double-click path pass
   * the fresh `FileItem` directly and side-step the stale closure entirely.
   * The "Load" button in the footer still calls `handleLoad()` with no args
   * and falls through to `selectedFile` the normal way.
   */
  const handleLoad = async (fileOverride?: FileItem) => {
    const selectedFile = fileOverride ?? selectedFileRef.current;
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

        let buffer!: ArrayBuffer;

        if (selectedFile.source === 'filesystem') {
          if (hasElectronFS() && window.electron?.fs && selectedFile.path) {
            buffer = await window.electron.fs.readFile(selectedFile.path);
          } else if (selectedFile.path) {
            // Try static file first (bundled in deploy, works on all platforms including iOS),
            // then fall back to server API for files only available on the backend.
            let loaded = false;
            if (isManifestAvailable()) {
              try {
                buffer = await readStaticFile(selectedFile.path);
                loaded = true;
              } catch {
                /* not in static bundle */
              }
            }
            if (!loaded && hasServerFS) {
              try {
                buffer = await readServerFile(selectedFile.path);
                loaded = true;
                console.log('[FileNav] Server file loaded:', buffer.byteLength, 'bytes');
              } catch (e) {
                console.warn('[FileNav] Server file failed:', e instanceof Error ? e.message : e);
              }
            }
            if (!loaded && selectedFile.handle) {
              const file = await (selectedFile.handle as FileSystemFileHandle).getFile();
              buffer = await file.arrayBuffer();
              loaded = true;
            }
            if (!loaded) {
              throw new Error('Cannot read tracker module');
            }
          } else if (selectedFile.handle) {
            const file = await (selectedFile.handle as FileSystemFileHandle).getFile();
            buffer = await file.arrayBuffer();
          } else {
            throw new Error('Cannot read tracker module');
          }
        } else {
          throw new Error('Cannot read tracker module');
        }

        // Auto-discover companion files (e.g. mdat.* → smpl.*, mfp.* → smp.*)
        const companions = await fetchCompanionFiles(selectedFile.name, selectedFile.path);
        await onLoadTrackerModule(buffer, selectedFile.name, companions.size > 0 ? companions : undefined);
        onClose();
        return;
      }

      // Load file content
      let data: object | string;
      const isXmlFile = selectedFile.name.toLowerCase().endsWith('.xml');

      if (hasElectronFS() && window.electron?.fs && selectedFile.path) {
        const buffer = await window.electron.fs.readFile(selectedFile.path);
        const text = new TextDecoder().decode(buffer);
        data = isXmlFile ? text : JSON.parse(text);
      } else if (selectedFile.path) {
        // Try static first, then server API (same priority as binary files)
        let buffer: ArrayBuffer | null = null;
        if (isManifestAvailable()) {
          try { buffer = await readStaticFile(selectedFile.path); } catch { /* not in static bundle */ }
        }
        if (!buffer && hasServerFS) {
          try { buffer = await readServerFile(selectedFile.path); } catch { /* server doesn't have it */ }
        }
        if (!buffer) throw new Error('Cannot read file');
        const text = new TextDecoder().decode(buffer);
        data = isXmlFile ? text : JSON.parse(text);
      } else if (selectedFile.handle) {
        const content = await readFile(selectedFile.handle as FileSystemFileHandle);
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

      // Compress project data using DVBZ format
      const { compressProject } = await import('@/lib/projectCompression');
      const compressed = compressProject(JSON.stringify(data));

      if (fileSource === 'cloud' && isAuthenticated()) {
        await saveCloudFile(filename, data, 'songs');
        loadFiles();
        onClose();
        return;
      }

      if (hasElectronFS() && window.electron?.fs) {
        const targetPath = electronDirectory || currentPath;
        const fullPath = `${targetPath}/${filename}`;
        await window.electron.fs.writeFile(fullPath, compressed);
      } else if (hasServerFS) {
        const targetPath = currentPath ? `${currentPath}/${filename}` : `songs/${filename}`;
        await writeServerFile(targetPath, compressed);
      } else {
        const dirHandle = getCurrentDirectory();
        if (dirHandle) {
          await createFile(filename, compressed, dirHandle);
        } else {
          const handle = await pickSaveLocation(filename);
          if (handle) {
            await writeFile(handle, compressed);
          }
        }
      }

      loadFiles();
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

  const closeRevisions = useCallback(() => {
    setShowRevisions(false);
    setRevisions([]);
    setRevisionsFileId(null);
  }, []);

  return {
    // State
    files,
    searchQuery,
    setSearchQuery,
    isLoading,
    error,
    setError,
    selectedFile,
    setSelectedFile,
    saveFilename,
    setSaveFilename,
    hasFilesystemAccess,
    hasServerFS,
    currentPath,
    setCurrentPath,
    electronDirectory,
    setElectronDirectory,
    cloudFiles,

    // Revision state
    showRevisions,
    revisions,
    revisionsLoading,
    revisionsFilename,

    // Auth state (forwarded for convenience)
    user,
    isServerAvailable,

    // Handlers
    loadFiles,
    handleLoad,
    handleSave,
    handleDelete,
    handleBrowseFiles,
    handleRequestFilesystemAccess,
    loadRevisions,
    handleRestoreRevision,
    closeRevisions,

    // Refs
    fileListRef,
    lastClickRef,
  };
}
