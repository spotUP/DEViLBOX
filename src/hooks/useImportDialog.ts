/**
 * useImportDialog — Shared hook for module import dialogs (DOM and GL/Pixi)
 *
 * Consolidates ALL import logic so both UI implementations share the same code.
 * This is the single source of truth for:
 * - File loading and format detection
 * - Preview playback (libopenmpt, MusicLine, Hively, UADE)
 * - Import handling
 * - Companion file management
 *
 * Both ImportModuleDialog (DOM) and PixiImportModuleDialog (GL) use this hook.
 */

import { useState, useRef, useCallback, useEffect } from 'react';
import {
  loadModuleFile,
  isSupportedModule,
  type ModuleInfo,
} from '@/lib/import/ModuleLoader';
import { isUADEFormat } from '@/lib/import/formats/UADEParser';
import { getNativeFormatMetadata, getNativeFormatExtendedMetadata } from '@/lib/import/NativeFormatMetadata';
import { detectFormat, type FormatDefinition } from '@/lib/import/FormatRegistry';
import type { UADEMetadata } from '@/engine/uade/UADEEngine';
import { computeSongDBHash, lookupSongDB, type SongDBResult } from '@/lib/songdb';
import { parseSIDHeader, type SIDHeaderInfo } from '@/lib/sid/SIDHeaderParser';
import { getFormatCapabilities, type FormatCapabilityInfo } from '@/lib/import/FormatCapabilities';
import type { ImportOptions } from '@/components/dialogs/ImportModuleDialog';

// ── Format detection helpers ─────────────────────────────────────────────────

/** Detect a format with a native parser (non-libopenmpt, non-UADE-only). */
export function detectNativeFormat(filename: string): FormatDefinition | null {
  const fmt = detectFormat(filename);
  if (!fmt) return null;
  if (fmt.nativeParser || fmt.family === 'furnace' || fmt.family === 'chip-dump' || fmt.family === 'c64-chip') return fmt;
  return null;
}

/** Furnace / DefleMask — always use native parser, no libopenmpt or UADE option. */
export const isFurnaceFormat = (filename: string): boolean => {
  const fmt = detectFormat(filename);
  return fmt?.family === 'furnace';
};

/** Chip-dump formats with dedicated native parsers — no UADE mode selector needed. */
export const isChipDumpFormat = (filename: string): boolean => {
  const fmt = detectFormat(filename);
  return fmt?.family === 'chip-dump' || fmt?.family === 'c64-chip';
};

/**
 * For two-file Amiga formats, derive the expected companion filename from the main file.
 */
export function getExpectedCompanion(filename: string): { expectedPrefix: string; description: string } | null {
  const basename = (filename.split('/').pop() ?? filename).split('\\').pop() ?? filename;
  const lower = basename.toLowerCase();
  if (lower.startsWith('mdat.')) {
    const songname = basename.slice(5);
    return { expectedPrefix: `smpl.${songname}`, description: 'TFMX sample data' };
  }
  if (lower.startsWith('mfp.')) {
    const songname = basename.slice(4);
    return { expectedPrefix: `smp.${songname}`, description: 'MFP sample data' };
  }
  return null;
}

// ── Hook State Types ─────────────────────────────────────────────────────────

export interface ImportDialogState {
  moduleInfo: ModuleInfo | null;
  loadedFileName: string;
  isLoading: boolean;
  error: string | null;
  uadeMetadata: UADEMetadata | null;
  songDBInfo: SongDBResult | null;
  sidHeader: SIDHeaderInfo | null;
  selectedSubsong: number;
  activeCompanions: File[];
  formatCapabilities: FormatCapabilityInfo | null;

  // Derived state
  nativeFmt: FormatDefinition | null;
  isNativeOnly: boolean;
}

export interface ImportDialogActions {
  handleFileSelect: (file: File, overrideCompanions?: File[]) => Promise<void>;
  handleImport: (onImport: (info: ModuleInfo, options: ImportOptions) => void, onClose: () => void) => Promise<void>;
  handleClose: (onClose: () => void) => void;
  setSelectedSubsong: (subsong: number) => void;
  reset: () => void;
}

// ── The Hook ─────────────────────────────────────────────────────────────────

export function useImportDialog(
  isOpen: boolean,
  initialFile?: File | null,
  companionFiles?: File[],
) {
  // ── State ──────────────────────────────────────────────────────────────────
  const [moduleInfo, setModuleInfo] = useState<ModuleInfo | null>(null);
  const [loadedFileName, setLoadedFileName] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [uadeMetadata, setUadeMetadata] = useState<UADEMetadata | null>(null);
  const [songDBInfo, setSongDBInfo] = useState<SongDBResult | null>(null);
  const [sidHeader, setSidHeader] = useState<SIDHeaderInfo | null>(null);
  const [selectedSubsong, setSelectedSubsong] = useState(0);
  const [activeCompanions, setActiveCompanions] = useState<File[]>([]);
  const [formatCapabilities, setFormatCapabilities] = useState<FormatCapabilityInfo | null>(null);

  const companionFilesRef = useRef<File[]>([]);
  const uadeScanActiveRef = useRef(false);

  // Keep companion files ref in sync
  useEffect(() => {
    companionFilesRef.current = companionFiles ?? [];
  }, [companionFiles]);

  // ── Derived state ──────────────────────────────────────────────────────────
  const nativeFmt = detectNativeFormat(loadedFileName);
  const isNativeOnly = !!(nativeFmt?.nativeOnly);

  // ── File select handler ────────────────────────────────────────────────────
  const handleFileSelect = useCallback(async (file: File, overrideCompanions?: File[]) => {
    if (!isSupportedModule(file.name)) {
      setError(`Unsupported file format.`);
      return;
    }

    const companions = overrideCompanions ?? companionFilesRef.current;
    setActiveCompanions(companions);

    const fname = file.name.toLowerCase();
    const nativeFmtForFile = detectNativeFormat(fname);
    const isFurnace = isFurnaceFormat(fname);
    const isChipDumpFile = isChipDumpFormat(fname);
    const isUADEExclusive = !nativeFmtForFile && !isFurnace && !isChipDumpFile && isUADEFormat(fname);

    setIsLoading(true);
    setError(null);
    setModuleInfo(null);
    setUadeMetadata(null);
    setSongDBInfo(null);
    setSidHeader(null);
    setSelectedSubsong(0);
    setLoadedFileName(fname);

    // Get format capabilities for display (requires format label, filename, and optional family)
    const formatLabel = nativeFmtForFile?.label || 'Unknown';
    const caps = getFormatCapabilities(formatLabel, fname, nativeFmtForFile?.family);
    setFormatCapabilities(caps);

    // ── UADE-exclusive path ──────────────────────────────────────────────────
    if (isUADEExclusive) {
      try {
        const buf = await file.arrayBuffer();
        lookupSongDB(computeSongDBHash(buf)).then(setSongDBInfo);
        
        const { UADEEngine } = await import('@engine/uade/UADEEngine');
        const engine = UADEEngine.getInstance();
        await engine.ready();
        uadeScanActiveRef.current = true;
        
        // Register companion files
        for (const companion of companions) {
          const companionBuf = await companion.arrayBuffer();
          await engine.addCompanionFile(companion.name, companionBuf);
        }
        
        engine.enableTickSnapshots(true);
        engine.resetTickSnapshots();
        const uadeMeta = await engine.load(buf, file.name);
        setUadeMetadata(uadeMeta);
        
        setModuleInfo({
          metadata: {
            title: file.name.replace(/\.[^/.]+$/, ''),
            type: uadeMeta.formatName || 'UADE',
            channels: 4,
            patterns: 1,
            orders: uadeMeta.subsongCount,
            instruments: 0,
            samples: 0,
            duration: 0,
          },
          arrayBuffer: buf,
          file,
        });
      } catch (err) {
        if (!(err instanceof Error && err.message === 'Scan cancelled')) {
          setError(err instanceof Error ? err.message : 'Failed to load UADE format');
        }
      } finally {
        uadeScanActiveRef.current = false;
        setIsLoading(false);
      }
      return;
    }

    // ── Native-parser path (nativeFmt || isFurnace) ──────────────────────────
    if (nativeFmtForFile || isFurnace) {
      try {
        const buf = await file.arrayBuffer();
        lookupSongDB(computeSongDBHash(buf)).then(setSongDBInfo);

        // SID-specific header extraction
        const sidInfo = parseSIDHeader(new Uint8Array(buf));
        if (sidInfo) {
          setSidHeader(sidInfo);
          setSelectedSubsong(sidInfo.defaultSubsong);
        }

        // Only call loadModuleFile for formats libopenmpt can handle
        const canUseLibopenmpt = nativeFmtForFile?.nativeParser &&
          (nativeFmtForFile.libopenmptFallback || nativeFmtForFile.libopenmptPlayable);
        if (canUseLibopenmpt) {
          const info = await loadModuleFile(file);
          setModuleInfo(info);
        } else {
          // Furnace and other native formats without nativeParser
          const meta = nativeFmtForFile
            ? getNativeFormatMetadata(nativeFmtForFile.key, buf)
            : { channels: -1, patterns: -1, orders: -1, instruments: -1, samples: -1 };

          const extMeta = nativeFmtForFile
            ? getNativeFormatExtendedMetadata(nativeFmtForFile.key, buf)
            : null;

          let displayTitle = sidInfo?.title || extMeta?.title || file.name.replace(/\.[^/.]+$/, '');
          if (extMeta?.composer) displayTitle += ` — ${extMeta.composer}`;

          setModuleInfo({
            metadata: {
              title: displayTitle,
              type: isFurnace ? 'Furnace' : nativeFmtForFile!.label,
              channels: meta.channels,
              patterns: meta.patterns,
              orders: meta.orders,
              instruments: meta.instruments,
              samples: meta.samples,
              duration: 0,
              message: extMeta?.year ? `Year: ${extMeta.year}` : undefined,
            },
            arrayBuffer: buf,
            file,
          });
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to read file');
      } finally {
        setIsLoading(false);
      }
      return;
    }

    // ── Standard libopenmpt path ─────────────────────────────────────────────
    try {
      file.arrayBuffer().then(buf => lookupSongDB(computeSongDBHash(buf)).then(setSongDBInfo));
      const info = await loadModuleFile(file);
      setModuleInfo(info);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load module');
    } finally {
      setIsLoading(false);
    }
  }, []);

  // ── Import handler ─────────────────────────────────────────────────────────
  const handleImport = useCallback(async (
    onImport: (info: ModuleInfo, options: ImportOptions) => void,
    onClose: () => void
  ) => {
    if (!moduleInfo) return;

    // Build companion file map
    let companionMap: Map<string, ArrayBuffer> | undefined;
    if (activeCompanions.length > 0) {
      companionMap = new Map();
      for (const f of activeCompanions) {
        companionMap.set(f.name, await f.arrayBuffer());
      }
    }

    // useLibopenmpt is always true from dialog, but UnifiedFileLoader will
    // override based on format (nativeOnly formats won't use libopenmpt)
    onImport(moduleInfo, {
      useLibopenmpt: true,
      subsong: selectedSubsong,
      uadeMetadata: uadeMetadata ?? undefined,
      companionFiles: companionMap,
    });
    onClose();
  }, [moduleInfo, selectedSubsong, uadeMetadata, activeCompanions]);

  // ── Close handler ──────────────────────────────────────────────────────────
  const handleClose = useCallback((onClose: () => void) => {
    // Cancel any in-flight UADE scan
    if (uadeScanActiveRef.current) {
      import('@engine/uade/UADEEngine').then(({ UADEEngine }) => {
        if (UADEEngine.hasInstance()) UADEEngine.getInstance().cancelLoad();
      }).catch(() => {});
    }
    
    setModuleInfo(null);
    setLoadedFileName('');
    setError(null);
    setUadeMetadata(null);
    setSidHeader(null);
    setSelectedSubsong(0);
    setActiveCompanions([]);
    setFormatCapabilities(null);
    onClose();
  }, []);

  // ── Reset state ────────────────────────────────────────────────────────────
  const reset = useCallback(() => {
    setModuleInfo(null);
    setLoadedFileName('');
    setError(null);
    setUadeMetadata(null);
    setSongDBInfo(null);
    setSidHeader(null);
    setSelectedSubsong(0);
    setActiveCompanions([]);
    setFormatCapabilities(null);
  }, []);

  // ── Auto-load initial file ─────────────────────────────────────────────────
  useEffect(() => {
    if (initialFile && isOpen) {
      handleFileSelect(initialFile);
    }
  }, [initialFile, isOpen, handleFileSelect]);

  // ── Return state and actions ───────────────────────────────────────────────
  const state: ImportDialogState = {
    moduleInfo,
    loadedFileName,
    isLoading,
    error,
    uadeMetadata,
    songDBInfo,
    sidHeader,
    selectedSubsong,
    activeCompanions,
    formatCapabilities,
    nativeFmt,
    isNativeOnly,
  };

  const actions: ImportDialogActions = {
    handleFileSelect,
    handleImport,
    handleClose,
    setSelectedSubsong,
    reset,
  };

  return { state, actions };
}

// Re-export types for convenience
export type { ModuleInfo, ImportOptions, FormatDefinition, UADEMetadata, SongDBResult, SIDHeaderInfo, FormatCapabilityInfo };
