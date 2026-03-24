/**
 * GlobalDragDropHandler - Handles drag and drop for all supported file formats
 * Supports:
 * - .dbx files (DEViLBOX projects)
 * - .xml files (DB303 patterns/presets)
 * - .sqs/.seq files (Behringer TD-3 patterns)
 * - Tracker modules (.mod, .xm, .it, .s3m, .fur, .mptm, etc.)
 * - MIDI files (.mid, .midi)
 * - Audio samples (.wav, .mp3, .ogg, .flac)
 */

import React, { useState, useEffect, useRef } from 'react';
import { Upload } from 'lucide-react';
import { getFormatExtensions, isSupportedFormat } from '@lib/import/FormatRegistry';

interface GlobalDragDropHandlerProps {
  onFileLoaded: (file: File) => Promise<void>;
  onFolderLoaded?: (mainFile: File, companions: File[]) => Promise<void>;
  children: React.ReactNode;
}

/**
 * Map of filename prefix patterns that require companion files.
 * key = main file prefix (lowercase), value = companion prefix.
 */
const COMPANION_PREFIX_MAP: Record<string, string> = {
  'mdat.': 'smpl.',   // TFMX: mdat.songname → smpl.songname
  'mfp.':  'smp.',    // MFP:  mfp.songname  → smp.songname
  'midi.': 'smpl.',   // MIDI-Loriciel: MIDI.songname → SMPL.songname
};

/**
 * Map of filename extension patterns that require companion files.
 * key = main file extension (lowercase, with dot), value = companion extensions.
 * Used when both files share the same base name but differ in extension.
 */
const COMPANION_EXT_MAP: Record<string, string[]> = {
  '.dat':   ['.ssd'],                   // Paul Robotham: songname.dat → songname.ssd
  '.sdata': ['.ip', '.ip.n', '.ip.l'],  // MusicMaker V8 Old: sdata + ip files
  '.dum':   ['.ins'],                   // Infogrames: songname.dum → songname.ins
};

/**
 * Check if a filename matches a known multi-file pattern and return the
 * expected companion filenames, or null if no companion is needed.
 */
function getExpectedCompanionNames(filename: string): string[] | null {
  const basename = (filename.split('/').pop() ?? filename).split('\\').pop() ?? filename;
  const lower = basename.toLowerCase();

  // Prefix-based companions (e.g. mdat.song → smpl.song)
  for (const [prefix, companionPrefix] of Object.entries(COMPANION_PREFIX_MAP)) {
    if (lower.startsWith(prefix)) {
      return [companionPrefix + basename.slice(prefix.length)];
    }
  }

  // Extension-based companions (e.g. song.dat → song.ssd)
  for (const [ext, companionExts] of Object.entries(COMPANION_EXT_MAP)) {
    if (lower.endsWith(ext)) {
      const base = basename.slice(0, basename.length - ext.length);
      return companionExts.map(cext => base + cext);
    }
  }

  return null;
}


// All supported file extensions — module formats from ModuleLoader + app-specific
const SUPPORTED_EXTENSIONS = new Set([
  // DEViLBOX projects
  '.dbx',
  // DEViLBOX instruments
  '.dbi',
  // SunVox patches and projects
  '.sunsynth', '.sunvox',
  // DB303 patterns/presets
  '.xml',
  // Behringer TD-3 patterns
  '.sqs', '.seq',
  // MIDI
  '.mid', '.midi',
  // Audio samples
  '.wav', '.mp3', '.ogg', '.flac', '.aiff', '.aif', '.m4a', '.iff', '.8svx',
  // All tracker/module formats (MOD, XM, IT, S3M, Furnace, HVL, UADE exotic, etc.)
  ...getFormatExtensions(),
]);

function isSupportedFile(filename: string): boolean {
  const lower = filename.toLowerCase();
  const ext = lower.slice(lower.lastIndexOf('.'));
  if (SUPPORTED_EXTENSIONS.has(ext)) return true;
  // Also check prefix-based formats (e.g. sog.*, mcmd.*, hip.*)
  return isSupportedFormat(lower);
}

async function readFilesFromEntry(entry: FileSystemEntry): Promise<File[]> {
  if (entry.isFile) {
    return new Promise<File[]>((resolve, reject) => {
      (entry as FileSystemFileEntry).file((f) => resolve([f]), reject);
    });
  } else if (entry.isDirectory) {
    const reader = (entry as FileSystemDirectoryEntry).createReader();
    const allEntries: FileSystemEntry[] = [];
    await new Promise<void>((resolve, reject) => {
      const read = () => {
        reader.readEntries((batch) => {
          if (batch.length === 0) resolve();
          else { allEntries.push(...batch); read(); }
        }, reject);
      };
      read();
    });
    const nested = await Promise.all(allEntries.map(readFilesFromEntry));
    return nested.flat();
  }
  return [];
}

export const GlobalDragDropHandler: React.FC<GlobalDragDropHandlerProps> = ({
  onFileLoaded,
  onFolderLoaded,
  children,
}) => {
  const [isDragging, setIsDragging] = useState(false);
  // Keep refs so window event handlers always call the latest versions
  // without needing to re-register listeners on every render.
  const onFileLoadedRef = useRef(onFileLoaded);
  useEffect(() => { onFileLoadedRef.current = onFileLoaded; }, [onFileLoaded]);
  const onFolderLoadedRef = useRef(onFolderLoaded);
  useEffect(() => { onFolderLoadedRef.current = onFolderLoaded; }, [onFolderLoaded]);

  useEffect(() => {
    const handleDragEnter = (e: DragEvent) => {
      e.preventDefault();
      if (!e.dataTransfer || e.dataTransfer.items.length === 0) return;
      const hasFiles = Array.from(e.dataTransfer.items).some(item => item.kind === 'file');
      if (hasFiles) setIsDragging(true);
    };

    const handleDragLeave = (e: DragEvent) => {
      // relatedTarget is null only when the drag leaves the browser window entirely.
      // Moving between elements on the page keeps relatedTarget non-null, so we
      // ignore those transitions and avoid flickering the overlay off.
      if (e.relatedTarget === null) setIsDragging(false);
    };

    const handleDragOver = (e: DragEvent) => { e.preventDefault(); };

    const handleDrop = async (e: DragEvent) => {
      e.preventDefault();
      setIsDragging(false);

      // If a child component (e.g. SampleEditor, DJ deck) has its own drop handler and
      // already processed this file, skip the app-level handler to avoid double-handling.
      const target = e.target as HTMLElement;
      if (target.closest('[data-sample-drop-zone]') || target.closest('[data-dj-deck-drop]')) return;

      // Check if any item is a directory OR multiple items were dropped
      const items = e.dataTransfer ? Array.from(e.dataTransfer.items) : [];
      const fileItems = items.filter(item => item.kind === 'file');
      const entries = fileItems
        .map(item => item.webkitGetAsEntry?.() ?? null)
        .filter((entry): entry is FileSystemEntry => entry !== null);

      const hasFolder = entries.some(entry => entry.isDirectory);
      const isMultiFile = fileItems.length > 1;

      if ((hasFolder || isMultiFile) && onFolderLoadedRef.current) {
        const allFiles: File[] = (await Promise.all(entries.map(readFilesFromEntry))).flat();
        const mainFile = allFiles.find(f => isSupportedFile(f.name));
        if (mainFile) {
          const companions = allFiles.filter(f => f !== mainFile);
          try {
            await onFolderLoadedRef.current(mainFile, companions);
          } catch (err) {
            console.error('[DragDrop] Failed to load folder:', err);
          }
          return;
        }
      }

      const files = e.dataTransfer ? Array.from(e.dataTransfer.files) : [];
      if (files.length === 0) return;

      const file = files.find(f => isSupportedFile(f.name));
      if (!file) {
        console.warn('[DragDrop] No supported files found');
        return;
      }

      // For multi-file formats (e.g. TFMX mdat.* + smpl.*), try to auto-load
      // the companion(s) from the same directory using the File System Access API.
      // This avoids prompting the user with a manual file picker.
      const expectedCompanions = getExpectedCompanionNames(file.name);
      if (expectedCompanions && expectedCompanions.length > 0 && onFolderLoadedRef.current) {
        // Try File System Access API (Chrome 86+) to get the parent directory
        const fileItem = fileItems.find(item => {
          const f = item.getAsFile();
          return f && f.name === file.name;
        });
        const handle = fileItem && 'getAsFileSystemHandle' in fileItem
          ? await (fileItem as DataTransferItem & { getAsFileSystemHandle(): Promise<FileSystemHandle> }).getAsFileSystemHandle().catch(() => null)
          : null;

        if (handle) {
          try {
            // showDirectoryPicker with startIn opens at the same directory as the dropped file.
            // The user just confirms the folder — no hunting for files needed.
            const dirHandle = await (window as unknown as { showDirectoryPicker(opts?: Record<string, unknown>): Promise<FileSystemDirectoryHandle> })
              .showDirectoryPicker({ startIn: handle, mode: 'read' });

            // Build case-insensitive directory index once
            const dirEntries: Record<string, FileSystemFileHandle> = {};
            for await (const [entryName, entryHandle] of dirHandle as unknown as AsyncIterable<[string, FileSystemHandle]>) {
              if (entryHandle.kind === 'file') dirEntries[entryName.toLowerCase()] = entryHandle as FileSystemFileHandle;
            }

            // Find each expected companion (case-insensitive)
            const companionFiles: File[] = [];
            for (const name of expectedCompanions) {
              const h = dirEntries[name.toLowerCase()];
              if (h) companionFiles.push(await h.getFile());
            }

            if (companionFiles.length > 0) {
              await onFolderLoadedRef.current(file, companionFiles);
              return;
            }
          } catch {
            // User cancelled directory picker or API not fully supported — fall through
          }
        }

        // Fallback: proceed without companion (UADE will try to find it in MEMFS
        // or fail gracefully with native parser fallback)
      }

      try {
        await onFileLoadedRef.current(file);
      } catch (error) {
        console.error('[DragDrop] Failed to load file:', error);
      }
    };

    // Use window-level listeners so drops work everywhere — including on PixiDOMOverlay
    // divs that are appended to document.body outside the React tree of this component.
    window.addEventListener('dragenter', handleDragEnter);
    window.addEventListener('dragleave', handleDragLeave);
    window.addEventListener('dragover', handleDragOver);
    window.addEventListener('drop', handleDrop);

    return () => {
      window.removeEventListener('dragenter', handleDragEnter);
      window.removeEventListener('dragleave', handleDragLeave);
      window.removeEventListener('dragover', handleDragOver);
      window.removeEventListener('drop', handleDrop);
    };
  }, []); // Empty — event handlers use refs, no deps needed

  return (
    <div className="relative w-full h-full">
      {children}
      
      {/* Drag overlay */}
      {isDragging && (
        <div className="fixed inset-0 z-[99990] bg-black/80 flex items-center justify-center pointer-events-none animate-fade-in">
          <div className="bg-dark-bgPrimary border-2 border-accent-primary border-dashed rounded-xl p-12 flex flex-col items-center gap-4 shadow-2xl">
            <Upload size={64} className="text-accent-primary animate-bounce" />
            <div className="text-center">
              <p className="text-2xl font-bold text-text-primary mb-2">
                Drop a file or folder here
              </p>
              <p className="text-text-muted text-sm">
                Supports .dbx, .dbi, .xml, .mod, .xm, .it, .s3m, .fur, .mid, and more
              </p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
