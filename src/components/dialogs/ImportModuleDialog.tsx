/**
 * ImportModuleDialog - Dialog for importing MOD/XM/IT/S3M tracker files
 * Uses chiptune3/libopenmpt for parsing and playback preview
 */

import React, { useState, useRef, useCallback, useEffect } from 'react';
import { X, Music, FileAudio, AlertCircle, Folder } from 'lucide-react';
import { Button } from '@components/ui/Button';
import { CustomSelect } from '@components/common/CustomSelect';
import {
  loadModuleFile,
  getSupportedExtensions,
  isSupportedModule,
  type ModuleInfo,
} from '@lib/import/ModuleLoader';
import { isUADEFormat } from '@lib/import/formats/UADEParser';
import { getNativeFormatMetadata, getNativeFormatExtendedMetadata } from '@lib/import/NativeFormatMetadata';
import { useSettingsStore, type FormatEnginePreferences } from '@/stores/useSettingsStore';
import { detectFormat, type FormatDefinition } from '@lib/import/FormatRegistry';
import type { UADEMetadata } from '@engine/uade/UADEEngine';
import { computeSongDBHash, lookupSongDB, type SongDBResult } from '@lib/songdb';
import { parseSIDHeader, type SIDHeaderInfo } from '@/lib/sid/SIDHeaderParser';
import { SIDInfoPanel } from './SIDInfoPanel';
import { getFormatCapabilities, type FormatCapabilityInfo } from '@lib/import/FormatCapabilities';
import { Info } from 'lucide-react';
import { useModalClose } from '@hooks/useDialogKeyboard';

export interface ImportOptions {
  useLibopenmpt: boolean;     // Use libopenmpt for sample-accurate playback
  subsong?: number;           // UADE subsong index (0-based)
  uadeMetadata?: UADEMetadata; // Pre-scanned UADE metadata (avoids double scan on import)
  companionFiles?: Map<string, ArrayBuffer>; // Companion files for multi-file formats (name → buffer)
  midiOptions?: {             // MIDI-specific import settings
    quantize?: number;
    velocityToVolume?: boolean;
    defaultPatternLength?: number;
  };
}

interface ImportModuleDialogProps {
  isOpen: boolean;
  onClose: () => void;
  onImport: (info: ModuleInfo, options: ImportOptions) => void | Promise<void>;
  initialFile?: File | null; // Pre-loaded file (from drag-drop)
  companionFiles?: File[];    // Additional files for multi-file formats (e.g. SMUS instruments)
}

// ── Format detection (backed by FormatRegistry) ──────────────────────────────

/** Detect a format with a native parser (non-libopenmpt, non-UADE-only). */
function detectNativeFormat(filename: string): FormatDefinition | null {
  const fmt = detectFormat(filename);
  if (!fmt) return null;
  // Only return formats that have native parsers or are furnace/chip-dump
  if (fmt.nativeParser || fmt.family === 'furnace' || fmt.family === 'chip-dump' || fmt.family === 'c64-chip') return fmt;
  return null;
}

/** Furnace / DefleMask — always use native parser, no libopenmpt or UADE option. */
const isFurnaceFormat = (filename: string): boolean => {
  const fmt = detectFormat(filename);
  return fmt?.family === 'furnace';
};

/** Chip-dump formats with dedicated native parsers — no UADE mode selector needed. */
const isChipDumpFormat = (filename: string): boolean => {
  const fmt = detectFormat(filename);
  return fmt?.family === 'chip-dump' || fmt?.family === 'c64-chip';
};

/**
 * Compute the companion file name relative to the main file's directory.
 * When files come from a directory picker (webkitRelativePath is set), we
 * preserve subdirectory structure (e.g. "Samples/electom" for ZoundMonitor).
 * When files come from a flat file picker, we fall back to just the filename.
 */
function companionRelativeName(mainFile: File, companion: File): string {
  const mainRel = (mainFile as any).webkitRelativePath as string | undefined;
  const compRel = (companion as any).webkitRelativePath as string | undefined;
  if (mainRel && compRel) {
    // Both have relative paths from directory picker.
    // Main: "Zoundmonitor/AJ/hittheroad.sng" → dir = "Zoundmonitor/AJ"
    // Companion: "Zoundmonitor/Samples/electom" → relative from main's dir = "Samples/electom"
    const mainDir = mainRel.substring(0, mainRel.lastIndexOf('/'));
    if (compRel.startsWith(mainDir + '/')) {
      return compRel.substring(mainDir.length + 1);
    }
    // Companion is in a different subtree — find common ancestor
    const mainParts = mainDir.split('/');
    const compParts = compRel.split('/');
    let common = 0;
    while (common < mainParts.length && common < compParts.length && mainParts[common] === compParts[common]) {
      common++;
    }
    return compParts.slice(common).join('/');
  }
  // Only companion has relative path (e.g. auto-prompted Samples/ folder for a single .sng)
  // webkitRelativePath: "Samples/electom" → use it as-is
  if (compRel && compRel.includes('/')) {
    return compRel;
  }
  return companion.name;
}

/**
 * For two-file Amiga formats, derive the expected companion filename from the main file.
 * TFMX: mdat.songname → smpl.songname, MFP: mfp.songname → smp.songname
 */
function getExpectedCompanion(filename: string): { expectedPrefix: string; description: string } | null {
  const basename = (filename.split('/').pop() ?? filename).split('\\').pop() ?? filename;
  const lower = basename.toLowerCase();
  if (lower.startsWith('mdat.')) {
    return { expectedPrefix: 'smpl.', description: 'TFMX sample data (smpl.*)' };
  }
  if (lower.startsWith('mfp.')) {
    return { expectedPrefix: 'smp.', description: 'MFP sample data (smp.*)' };
  }
  return null;
}

// ── Component ─────────────────────────────────────────────────────────────────

export const ImportModuleDialog: React.FC<ImportModuleDialogProps> = ({
  isOpen,
  onClose,
  onImport,
  initialFile,
  companionFiles,
}) => {
  const [moduleInfo, setModuleInfo]     = useState<ModuleInfo | null>(null);
  const [loadedFileName, setLoadedFileName] = useState('');
  const [isLoading, setIsLoading]       = useState(false);
  const [isImporting, setIsImporting]   = useState(false);
  const safeClose = useCallback(() => { if (!isImporting) onClose(); }, [isImporting, onClose]);
  useModalClose({ isOpen, onClose: safeClose });
  // Stable ref so the keydown handler always calls the latest handleImport
  // without needing it to be declared before the effect.
  const handleImportRef = useRef<() => Promise<void>>(async () => {});

  const [uadeInitProgress, setUadeInitProgress] = useState(0);
  const [uadeInitPhase, setUadeInitPhase] = useState('');
  const [error, setError]               = useState<string | null>(null);
  const [uadeMetadata, setUadeMetadata] = useState<UADEMetadata | null>(null);
  const [selectedSubsong, setSelectedSubsong] = useState(0);
  const [songDBInfo, setSongDBInfo] = useState<SongDBResult | null>(null);
  const [sidHeader, setSidHeader] = useState<SIDHeaderInfo | null>(null);
  // Track the companions used for the currently loaded file
  const [activeCompanions, setActiveCompanions] = useState<File[]>([]);
  // Track the main File object for computing companion relative paths
  const activeMainFileRef = useRef<File | null>(null);
  // Track whether a UADE scan is in-flight so handleClose can cancel it
  const uadeScanActiveRef = useRef(false);
  // Keep companion files fresh in callbacks without re-creating handleFileSelect
  const companionFilesRef = useRef<File[]>(companionFiles ?? []);
  useEffect(() => { companionFilesRef.current = companionFiles ?? []; }, [companionFiles]);

  const setFormatEngine = useSettingsStore((s) => s.setFormatEngine);

  // Derived format state
  const nativeFmt  = detectNativeFormat(loadedFileName);
  const isNativeOnly = !!(nativeFmt?.nativeOnly);

  // Format capability warnings
  const formatCapabilities: FormatCapabilityInfo | null = moduleInfo
    ? getFormatCapabilities(
        uadeMetadata ? (uadeMetadata.formatName || 'UADE') : moduleInfo.metadata.type,
        loadedFileName,
        nativeFmt?.family,
      )
    : null;

  // Formats that require companion files (e.g. external Instruments/ folder)
  // Shown as a warning when none were loaded alongside the module.
  const MULTI_FILE_FORMAT_KEYS = new Set<string>(['iffSmus', 'zoundMonitor']);
  const needsCompanionFiles =
    activeCompanions.length === 0 && (
      (nativeFmt !== null && MULTI_FILE_FORMAT_KEYS.has(nativeFmt.key)) ||
      getExpectedCompanion(loadedFileName) !== null
    );

  const handleFileSelect = useCallback(async (file: File, overrideCompanions?: File[]) => {
    if (!isSupportedModule(file.name)) {
      setError(`Unsupported file format. Supported: ${getSupportedExtensions().slice(0, 5).join(', ')}...`);
      return;
    }

    // Determine which companions apply: explicit overrides take precedence over prop companions
    const companions = overrideCompanions ?? companionFilesRef.current;
    setActiveCompanions(companions);
    activeMainFileRef.current = file;

    const fname = file.name.toLowerCase();
    const nativeFmtForFile = detectNativeFormat(fname);
    const isFurnace = isFurnaceFormat(fname);
    const isChipDumpFile = isChipDumpFormat(fname);
    // isUADEFormat only checks file extensions — prefix-named formats like
    // cust.songname / custom.songname are missed.  Also check the FormatRegistry
    // which understands prefix matching (family 'uade-only' or uadeFallback
    // without a native parser).
    const fmtForFile = detectFormat(fname);
    const isUADEByRegistry = !!fmtForFile && !fmtForFile.nativeParser &&
      (fmtForFile.family === 'uade-only' || (fmtForFile.uadeFallback && !fmtForFile.nativeOnly));
    const isUADEExclusive = !nativeFmtForFile && !isFurnace && !isChipDumpFile && (isUADEFormat(fname) || isUADEByRegistry);

    setIsLoading(true);
    setError(null);
    setModuleInfo(null);
    setUadeInitProgress(0);
    setUadeInitPhase('');
    setUadeMetadata(null);
    setSongDBInfo(null);
    setSidHeader(null);
    setSelectedSubsong(0);
    setLoadedFileName(fname);

    // Yield to React so the loading state renders before async work starts
    await new Promise(r => setTimeout(r, 10));

    if (isUADEExclusive) {
      // UADE-exclusive format: libopenmpt cannot parse it; use UADEEngine directly
      try {
        const buf = await file.arrayBuffer();
        // Fire-and-forget songdb lookup (non-blocking)
        lookupSongDB(computeSongDBHash(buf)).then(setSongDBInfo);

        // Skip pre-scan for synthetic/compiled 68k formats — the enhanced scan
        // corrupts UADE engine state, causing subsequent loads to fail.
        // Initialize UADE engine with progress reporting
        const { UADEEngine } = await import('@engine/uade/UADEEngine');
        const engine = UADEEngine.getInstance();
        const unsubProgress = engine.onInitProgress((progress, phase) => {
          setUadeInitProgress(progress);
          setUadeInitPhase(phase);
        });
        // First init or reinit after playback — progress bar shows during this
        await engine.ready();
        // Reinit if engine played a song before — this is the slow part (~50ms with pre-compiled module)
        await engine.reinitIfNeeded();
        unsubProgress();
        setUadeInitProgress(100);

        const isSynthFormat = /\.(sun|tsm)$/i.test(fname);
        if (isSynthFormat) {
          setModuleInfo({
            metadata: {
              title: fname.replace(/\.[^/.]+$/, ''),
              type: 'SunTronic/TSM',
              channels: 4,
              patterns: 1,
              orders: 1,
              instruments: 0,
              samples: 0,
              duration: 0,
            },
            arrayBuffer: buf,
            file,
          });
          uadeScanActiveRef.current = false;
        } else {
        uadeScanActiveRef.current = true;
        // Register all companion files into UADE's virtual FS before loading the module
        for (const companion of companions) {
          const companionBuf = await companion.arrayBuffer();
          const cfName = companionRelativeName(file, companion);
          await engine.addCompanionFile(cfName, companionBuf);
        }
        // Enable CIA tick snapshot capture so pattern reconstruction works
        // when parseUADEFile is called later with this preScannedMeta.
        engine.enableTickSnapshots(true);
        engine.resetTickSnapshots();
        const uadeMeta = await engine.load(buf, file.name);
        setUadeMetadata(uadeMeta);
        // Create a minimal ModuleInfo so the Import button is enabled
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
        } // close else (non-synth format)
      } catch (err) {
        // Don't show "Scan cancelled" as an error — that's expected from handleClose
        if (!(err instanceof Error && err.message === 'Scan cancelled')) {
          setError(err instanceof Error ? err.message : 'Failed to load UADE format');
        }
      } finally {
        uadeScanActiveRef.current = false;
        setIsLoading(false);
      }
      return;
    }

    // Native-parser formats + Furnace: skip libopenmpt (it can't parse these correctly).
    // Create a minimal ModuleInfo so the Import button is enabled; the actual parsing
    // happens via parseModuleToSong() in the handleModuleImport callback.
    // Extract what header counts we can without running a full simulation.
    if (nativeFmtForFile || isFurnace) {
      try {
        const buf = await file.arrayBuffer();
        // Fire-and-forget songdb lookup (non-blocking)
        lookupSongDB(computeSongDBHash(buf)).then(setSongDBInfo);

        // SID-specific: extract header metadata (title, author, chip, subsongs)
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
          // Furnace and other native formats without nativeParser - use header metadata only
          const meta = nativeFmtForFile
            ? getNativeFormatMetadata(nativeFmtForFile.key, buf)
            : { channels: -1, patterns: -1, orders: -1, instruments: -1, samples: -1 };

          // Extended metadata (title, composer, year) for formats that support it
          const extMeta = nativeFmtForFile
            ? getNativeFormatExtendedMetadata(nativeFmtForFile.key, buf)
            : null;

          // Build title: prefer extMeta title, then SID title, then filename
          let displayTitle = sidInfo?.title || extMeta?.title || file.name.replace(/\.[^/.]+$/, '');
          if (extMeta?.composer) displayTitle += ` — ${extMeta.composer}`;

          setModuleInfo({
            metadata: {
              title: displayTitle,
              type: isFurnace ? 'Furnace' : nativeFmtForFile!.label,
              channels:    meta.channels,
              patterns:    meta.patterns,
              orders:      meta.orders,
              instruments: meta.instruments,
              samples:     meta.samples,
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

    // Standard path: libopenmpt (MOD, XM, IT, S3M, etc.)
    try {
      // Fire-and-forget songdb lookup (non-blocking)
      file.arrayBuffer().then(buf => lookupSongDB(computeSongDBHash(buf)).then(setSongDBInfo));
      const info = await loadModuleFile(file);
      setModuleInfo(info);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load module');
    } finally {
      setIsLoading(false);
    }
  }, []);

  // Auto-load file if provided (from drag-drop)
  useEffect(() => {
    if (initialFile && isOpen) {
      handleFileSelect(initialFile);
    }
  }, [initialFile, isOpen, handleFileSelect]);

  const handleImport = useCallback(async () => {
    if (!moduleInfo) return;
    // Always use native parser when available; always use UADE enhanced (editable) mode.
    if (nativeFmt && !isNativeOnly) {
      setFormatEngine(nativeFmt.key as keyof FormatEnginePreferences, 'native');
    }
    setFormatEngine('uade', 'enhanced');
    // Convert companion File[] to Map<string, ArrayBuffer> for the import pipeline
    let companionMap: Map<string, ArrayBuffer> | undefined;
    if (activeCompanions.length > 0) {
      companionMap = new Map();
      const mainFile = activeMainFileRef.current ?? moduleInfo.file;
      for (const f of activeCompanions) {
        const cfName = companionRelativeName(mainFile, f);
        companionMap.set(cfName, await f.arrayBuffer());
      }
    }
    // Block the dialog until import completes so UADE engine is fully ready
    setIsImporting(true);
    try {
      await onImport(moduleInfo, { useLibopenmpt: true, subsong: selectedSubsong, uadeMetadata: uadeMetadata ?? undefined, companionFiles: companionMap });
    } finally {
      setIsImporting(false);
    }
    onClose();
  }, [moduleInfo, nativeFmt, isNativeOnly, setFormatEngine, onImport, onClose, selectedSubsong, activeCompanions]);

  // Keep ref in sync so the Enter key handler always calls the latest version
  useEffect(() => { handleImportRef.current = handleImport; }, [handleImport]);

  // Enter key submits the dialog. Always preventDefault so a focused Cancel
  // button doesn't close the dialog accidentally. Skip interception when an
  // input/select is focused (e.g. subsong number input).
  useEffect(() => {
    if (!isOpen) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key !== 'Enter') return;
      const tag = (e.target as HTMLElement).tagName;
      if (tag === 'INPUT' || tag === 'SELECT' || tag === 'TEXTAREA') return;
      e.preventDefault();
      if (moduleInfo && !isLoading && !isImporting) {
        void handleImportRef.current();
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [isOpen, moduleInfo, isLoading, isImporting]);

  const handleClose = useCallback(() => {
    // Cancel any in-flight UADE scan so it doesn't resolve after the dialog closes
    if (uadeScanActiveRef.current) {
      import('@engine/uade/UADEEngine').then(({ UADEEngine }) => {
        if (UADEEngine.hasInstance()) UADEEngine.getInstance().cancelLoad();
      }).catch((err) => console.warn('Failed to cancel UADE load:', err));
    }
    setModuleInfo(null);
    setLoadedFileName('');
    setError(null);
    setUadeMetadata(null);
    setSidHeader(null);
    setSelectedSubsong(0);
    setActiveCompanions([]);
    onClose();
  }, [onClose]);

  // Build accept string for the single-file picker inside the dialog
  const ACCEPTED_FORMATS = getSupportedExtensions().join(',');

  // Ref for the hidden companion file input so we can trigger it programmatically
  const companionInputRef = useRef<HTMLInputElement | null>(null);
  // Ref for the hidden samples folder input (ZoundMonitor Samples/ directory)
  const samplesFolderInputRef = useRef<HTMLInputElement | null>(null);
  // Stash the main file while waiting for companion selection
  const pendingMainFileRef = useRef<File | null>(null);

  const handleSingleFileInput = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files ? Array.from(e.target.files) : [];
    e.target.value = '';
    if (files.length === 0) return;
    const mainFile = files.find(f => isSupportedModule(f.name)) ?? files[0];
    const companions = files.filter(f => f !== mainFile);

    // If this file needs a companion and none were provided, auto-prompt for it
    const comp = getExpectedCompanion(mainFile.name);
    if (comp && companions.length === 0 && companionInputRef.current) {
      pendingMainFileRef.current = mainFile;
      companionInputRef.current.click();
      return;
    }

    // ZoundMonitor .sng files need a Samples/ directory — auto-prompt for folder
    const fmt = detectNativeFormat(mainFile.name.toLowerCase());
    if (fmt?.key === 'zoundMonitor' && companions.length === 0 && samplesFolderInputRef.current) {
      pendingMainFileRef.current = mainFile;
      samplesFolderInputRef.current.click();
      return;
    }

    handleFileSelect(mainFile, companions);
  }, [handleFileSelect]);

  const handleCompanionInput = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    const mainFile = pendingMainFileRef.current;
    pendingMainFileRef.current = null;
    if (mainFile) {
      handleFileSelect(mainFile, file ? [file] : []);
    }
  }, [handleFileSelect]);

  // Handler for Samples/ folder input (auto-prompted for ZoundMonitor .sng files)
  const handleSamplesFolderInput = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files ? Array.from(e.target.files) : [];
    e.target.value = '';
    const mainFile = pendingMainFileRef.current;
    pendingMainFileRef.current = null;
    if (mainFile) {
      // All files from the picked directory become companions.
      // The webkitRelativePath on each file preserves subdirectory structure.
      const companions = files.filter(f => !f.name.startsWith('.'));
      handleFileSelect(mainFile, companions);
    }
  }, [handleFileSelect]);

  const handleFolderInput = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files ? Array.from(e.target.files) : [];
    e.target.value = '';
    if (files.length === 0) return;
    const mainFile = files.find(f => isSupportedModule(f.name));
    if (!mainFile) return;
    const companions = files.filter(f => f !== mainFile);
    handleFileSelect(mainFile, companions);
  }, [handleFileSelect]);

  const handleInternalDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    const files = Array.from(e.dataTransfer.files);
    if (files.length === 0) return;
    const mainFile = files.find(f => isSupportedModule(f.name)) ?? files[0];
    const companions = files.filter(f => f !== mainFile);
    handleFileSelect(mainFile, companions);
  }, [handleFileSelect]);

  if (!isOpen) return null;

  // Companions to display in the badge: use activeCompanions (set when file was loaded)
  const displayedCompanions = activeCompanions;

  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-[99990]">
      {/* Hidden input for companion file (step 2 of two-part loader) */}
      <input
        ref={companionInputRef}
        type="file"
        className="hidden"
        onChange={handleCompanionInput}
      />
      {/* Hidden directory input for Samples/ folder (ZoundMonitor auto-prompt) */}
      <input
        ref={samplesFolderInputRef}
        type="file"
        className="hidden"
        {...({ webkitdirectory: '', directory: '' } as React.InputHTMLAttributes<HTMLInputElement>)}
        onChange={handleSamplesFolderInput}
      />
      <div className="bg-dark-bgSecondary border border-dark-border rounded-lg shadow-xl w-full max-w-[90vw] md:max-w-[480px] max-h-[80vh] overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-dark-border">
          <div className="flex items-center gap-2">
            <FileAudio size={18} className="text-accent-primary" />
            <h2 className="text-sm font-semibold text-text-primary">Import Tracker Module</h2>
          </div>
          <Button variant="icon" size="icon" onClick={handleClose} aria-label="Close dialog">
            <X size={16} />
          </Button>
        </div>

        {/* Body */}
        <div className="p-4 space-y-4 overflow-y-auto max-h-[calc(80vh-110px)]">
          {/* Drop zone / file pickers — shown before a file is loaded */}
          {!moduleInfo && !isLoading && !error && (
            <div
              className="border-2 border-dashed border-dark-border rounded-lg p-8 flex flex-col items-center gap-4 text-center"
              onDragOver={(e) => { e.preventDefault(); e.stopPropagation(); }}
              onDrop={handleInternalDrop}
            >
              <FileAudio size={32} className="text-text-muted" />
              <p className="text-sm text-text-muted">Drop a file or folder here</p>
              <div className="flex gap-2">
                <label className="cursor-pointer">
                  <input
                    type="file"
                    multiple
                    accept={ACCEPTED_FORMATS}
                    onChange={handleSingleFileInput}
                    className="hidden"
                  />
                  <span className="text-xs px-3 py-1.5 bg-dark-bg border border-dark-border rounded hover:border-dark-borderHover text-text-muted hover:text-text-primary transition-colors cursor-pointer">
                    Pick Files
                  </span>
                </label>
                <label className="cursor-pointer">
                  <input
                    type="file"
                    {...({ webkitdirectory: '', directory: '' } as React.InputHTMLAttributes<HTMLInputElement>)}
                    onChange={handleFolderInput}
                    className="hidden"
                  />
                  <span className="text-xs px-3 py-1.5 bg-dark-bg border border-dark-border rounded hover:border-dark-borderHover text-text-muted hover:text-text-primary transition-colors cursor-pointer">
                    Pick Folder
                  </span>
                </label>
              </div>
            </div>
          )}

          {/* Loading indicator with UADE init progress bar */}
          {isLoading && (
            <div className="flex flex-col gap-2">
              <div className="flex items-center gap-2">
                <div className="w-4 h-4 border-2 border-accent-primary border-t-transparent rounded-full animate-spin" />
                <span className="text-xs text-text-muted">
                  {uadeInitPhase === 'compiling' ? 'Compiling UADE engine…'
                    : uadeInitPhase === 'compiled' ? 'UADE compiled, instantiating…'
                    : uadeInitPhase === 'instantiating' ? 'Instantiating UADE…'
                    : uadeInitPhase === 'instantiated' ? 'Initializing UADE engine…'
                    : 'Analyzing module…'}
                </span>
              </div>
              <div className="w-full h-1.5 bg-dark-bgTertiary rounded-full overflow-hidden">
                <div
                  className="h-full bg-accent-primary rounded-full transition-all duration-300"
                  style={{ width: `${uadeInitProgress > 0 ? uadeInitProgress : 5}%` }}
                />
              </div>
            </div>
          )}

          {/* Error message */}
          {error && (
            <div className="flex items-center gap-2 p-3 bg-accent-error/10 border border-accent-error/30 rounded text-sm text-accent-error">
              <AlertCircle size={16} />
              {error}
            </div>
          )}

          {/* Module info */}
          {moduleInfo && (
            <div className="bg-dark-bg rounded-lg p-4 space-y-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Music size={16} className="text-accent-primary" />
                  <span className="font-medium text-text-primary">{moduleInfo.metadata.title}</span>
                </div>
                <span className="text-xs px-2 py-0.5 bg-accent-primary/20 text-accent-primary rounded">
                  {uadeMetadata ? (uadeMetadata.formatName || 'UADE') : moduleInfo.metadata.type}
                </span>
              </div>

              <div className="grid grid-cols-2 gap-2 text-xs">
                {uadeMetadata ? (
                  // UADE-specific metadata
                  <>
                    <div className="flex justify-between text-text-muted">
                      <span>Player:</span>
                      <span className="text-text-primary font-mono">{uadeMetadata.player || 'Unknown'}</span>
                    </div>
                    <div className="flex justify-between text-text-muted">
                      <span>Subsongs:</span>
                      <span className="text-text-primary font-mono">{uadeMetadata.subsongCount}</span>
                    </div>
                    <div className="flex justify-between text-text-muted">
                      <span>Channels:</span>
                      <span className="text-text-primary font-mono">4 (Paula)</span>
                    </div>
                    <div className="flex justify-between text-text-muted">
                      <span>Samples:</span>
                      <span className="text-text-primary font-mono">
                        {Object.keys(uadeMetadata.enhancedScan?.samples ?? {}).length}
                      </span>
                    </div>
                  </>
                ) : (
                  // Standard metadata — use local header extraction, fall back to songDB
                  <>
                    {/* Channels: local metadata, or songDB channels */}
                    <div className="flex justify-between text-text-muted">
                      <span>Channels:</span>
                      <span className="text-text-primary font-mono">
                        {moduleInfo.metadata.channels >= 0
                          ? moduleInfo.metadata.channels
                          : songDBInfo?.channels != null
                            ? songDBInfo.channels
                            : '--'}
                      </span>
                    </div>
                    {/* Format from songDB (when local label is generic) */}
                    {songDBInfo?.format && moduleInfo.metadata.type !== songDBInfo.format && (
                      <div className="flex justify-between text-text-muted">
                        <span>Engine:</span>
                        <span className="text-text-primary font-mono truncate ml-2">{songDBInfo.format}</span>
                      </div>
                    )}
                    {moduleInfo.metadata.patterns >= 0 && (
                      <div className="flex justify-between text-text-muted">
                        <span>Patterns:</span>
                        <span className="text-text-primary font-mono">{moduleInfo.metadata.patterns}</span>
                      </div>
                    )}
                    {moduleInfo.metadata.instruments >= 0 && (
                      <div className="flex justify-between text-text-muted">
                        <span>Instruments:</span>
                        <span className="text-text-primary font-mono">{moduleInfo.metadata.instruments}</span>
                      </div>
                    )}
                    {moduleInfo.metadata.samples >= 0 && (
                      <div className="flex justify-between text-text-muted">
                        <span>Samples:</span>
                        <span className="text-text-primary font-mono">{moduleInfo.metadata.samples}</span>
                      </div>
                    )}
                    {moduleInfo.metadata.orders >= 0 && (
                      <div className="flex justify-between text-text-muted">
                        <span>Orders:</span>
                        <span className="text-text-primary font-mono">{moduleInfo.metadata.orders}</span>
                      </div>
                    )}
                    {/* Subsong count from songDB */}
                    {songDBInfo && songDBInfo.subsongs.length > 1 && (
                      <div className="flex justify-between text-text-muted">
                        <span>Subsongs:</span>
                        <span className="text-text-primary font-mono">{songDBInfo.subsongs.length}</span>
                      </div>
                    )}
                    {/* Duration from songDB when no local duration */}
                    {moduleInfo.metadata.duration > 0 ? (
                      <div className="flex justify-between text-text-muted">
                        <span>Duration:</span>
                        <span className="text-text-primary font-mono">
                          {Math.floor(moduleInfo.metadata.duration / 60)}:{String(Math.floor(moduleInfo.metadata.duration % 60)).padStart(2, '0')}
                        </span>
                      </div>
                    ) : songDBInfo?.subsongs?.[0]?.duration_ms ? (
                      <div className="flex justify-between text-text-muted">
                        <span>Duration:</span>
                        <span className="text-text-primary font-mono">
                          {Math.floor(songDBInfo.subsongs[0].duration_ms / 60000)}:{String(Math.floor((songDBInfo.subsongs[0].duration_ms % 60000) / 1000)).padStart(2, '0')}
                        </span>
                      </div>
                    ) : null}
                  </>
                )}
              </div>

              {/* SID Info Panel — shown for C64 SID files with rich metadata */}
              {sidHeader && (
                <SIDInfoPanel
                  header={sidHeader}
                  songDBInfo={songDBInfo}
                  selectedSubsong={selectedSubsong}
                  onSubsongChange={setSelectedSubsong}
                />
              )}

              {/* SongDB metadata (author, album, year, group) — shown for non-SID formats */}
              {songDBInfo && !sidHeader && (
                <div className="grid grid-cols-2 gap-2 text-xs border-t border-dark-border pt-2 mt-1">
                  {songDBInfo.authors.length > 0 && (
                    <div className="flex justify-between text-text-muted col-span-2">
                      <span>Author:</span>
                      <span className="text-text-primary">{songDBInfo.authors.join(', ')}</span>
                    </div>
                  )}
                  {songDBInfo.album && (
                    <div className="flex justify-between text-text-muted col-span-2">
                      <span>Album:</span>
                      <span className="text-text-primary truncate ml-2">{songDBInfo.album}</span>
                    </div>
                  )}
                  {songDBInfo.year && (
                    <div className="flex justify-between text-text-muted">
                      <span>Year:</span>
                      <span className="text-text-primary">{songDBInfo.year}</span>
                    </div>
                  )}
                  {songDBInfo.publishers.length > 0 && (
                    <div className="flex justify-between text-text-muted col-span-2">
                      <span>Group:</span>
                      <span className="text-text-primary truncate ml-2">{songDBInfo.publishers.join(', ')}</span>
                    </div>
                  )}
                </div>
              )}

              {/* Subsong picker — shown when UADE pre-scan detected multiple subsongs */}
              {uadeMetadata && uadeMetadata.subsongCount > 1 && (
                <div className="flex items-center gap-3">
                  <label className="text-xs text-text-muted whitespace-nowrap">Import subsong:</label>
                  {uadeMetadata.subsongCount > 20 ? (
                    // Number input for formats with many subsongs (avoids rendering hundreds of options)
                    <div className="flex items-center gap-2 flex-1">
                      <input
                        type="number"
                        min={1}
                        max={uadeMetadata.subsongCount}
                        value={selectedSubsong + 1}
                        onChange={(e) => {
                          const v = Math.max(1, Math.min(uadeMetadata.subsongCount, Number(e.target.value)));
                          setSelectedSubsong(v - 1);
                        }}
                        className="w-20 text-xs bg-dark-bgSecondary border border-dark-border rounded px-2 py-1.5 text-text-primary"
                      />
                      <span className="text-xs text-text-muted">of {uadeMetadata.subsongCount}</span>
                    </div>
                  ) : (
                    <CustomSelect
                      value={String(selectedSubsong)}
                      onChange={(v) => setSelectedSubsong(Number(v))}
                      options={Array.from({ length: uadeMetadata.subsongCount }, (_, i) => ({
                        value: String(i),
                        label: `Subsong ${i + 1}${i === 0 ? ' (default)' : ''}`,
                      }))}
                      className="flex-1 text-xs bg-dark-bgSecondary border border-dark-border rounded px-2 py-1.5 text-text-primary"
                    />
                  )}
                </div>
              )}

              {/* Companion files badge */}
              {displayedCompanions.length > 0 && (
                <div className="flex items-center gap-2 p-2 bg-accent-success/10 border border-accent-success/30 rounded text-xs text-accent-success">
                  <Folder size={12} />
                  {displayedCompanions.length} companion file{displayedCompanions.length > 1 ? 's' : ''} loaded
                  <span className="text-text-muted ml-1 truncate">
                    ({displayedCompanions.map(f => f.name).join(', ')})
                  </span>
                </div>
              )}

              {/* Warning: multi-file format loaded without its companion files */}
              {needsCompanionFiles && (
                <div className="flex items-start gap-2 p-3 bg-amber-500/10 border border-amber-500/30 rounded text-xs text-amber-400">
                  <AlertCircle size={14} className="shrink-0 mt-0.5" />
                  <div className="flex flex-col gap-2">
                    {(() => {
                      const comp = getExpectedCompanion(loadedFileName);
                      if (comp) return (
                        <>
                          <span>
                            <span className="font-semibold">Missing {comp.description}</span>
                            {' '}({comp.expectedPrefix})
                          </span>
                          <button
                            type="button"
                            className="text-xs px-2 py-1 bg-amber-500/20 border border-amber-500/40 rounded hover:bg-amber-500/30 transition-colors cursor-pointer"
                            onClick={() => {
                              if (moduleInfo?.file && companionInputRef.current) {
                                pendingMainFileRef.current = moduleInfo.file;
                                companionInputRef.current.click();
                              }
                            }}
                          >
                            Select {comp.expectedPrefix.split('.')[0]}.* file
                          </button>
                        </>
                      );
                      return (
                        <span>
                          <span className="font-semibold">Audio requires companion files.</span>
                          {' '}Samples live in a{' '}
                          <span className="font-mono bg-dark-bg px-1 rounded">
                            {nativeFmt?.key === 'zoundMonitor' ? 'Samples/' : 'Instruments/'}
                          </span>
                          {' '}folder next to this module.
                          <button
                            type="button"
                            className="ml-2 text-xs px-2 py-1 bg-amber-500/20 border border-amber-500/40 rounded hover:bg-amber-500/30 transition-colors cursor-pointer"
                            onClick={() => {
                              if (moduleInfo?.file && samplesFolderInputRef.current) {
                                pendingMainFileRef.current = moduleInfo.file;
                                samplesFolderInputRef.current.click();
                              }
                            }}
                          >
                            Select {nativeFmt?.key === 'zoundMonitor' ? 'Samples' : 'Instruments'} Folder
                          </button>
                        </span>
                      );
                    })()}
                  </div>
                </div>
              )}

              {/* Format capability warnings */}
              {formatCapabilities && !formatCapabilities.isEditable && (
                <div className="flex items-start gap-2 p-3 bg-accent-error/10 border border-accent-error/30 rounded text-xs text-accent-error">
                  <AlertCircle size={14} className="shrink-0 mt-0.5" />
                  <div>
                    <span className="font-semibold">Playback only — not editable.</span>
                    {' '}This format will play back via a dedicated engine but cannot be edited in the pattern editor.
                    {formatCapabilities.furnaceAlternative && (
                      <>
                        {' '}To create editable music for this platform, use{' '}
                        <span className="font-semibold text-accent-primary">{formatCapabilities.furnaceAlternative.chipName}</span>
                        {' '}in a new Furnace project.
                      </>
                    )}
                  </div>
                </div>
              )}

              {formatCapabilities && formatCapabilities.isEditable && formatCapabilities.isNativeExportable && (
                <div className="flex items-start gap-2 p-3 bg-accent-success/10 border border-accent-success/30 rounded text-xs text-accent-success">
                  <Info size={14} className="shrink-0 mt-0.5" />
                  <div>
                    <span className="font-semibold">Editable and exportable.</span>
                    {' '}Pattern edits play back in real-time and can be exported to native format.
                  </div>
                </div>
              )}

              {formatCapabilities && formatCapabilities.isEditable && !formatCapabilities.isNativeExportable && (
                <div className="flex items-start gap-2 p-3 bg-amber-500/10 border border-amber-500/30 rounded text-xs text-amber-400">
                  <Info size={14} className="shrink-0 mt-0.5" />
                  <div>
                    <span className="font-semibold">No native export.</span>
                    {' '}This format can be edited but only saved as a DEViLBOX project (.dbx).
                    Native format export is not available.
                  </div>
                </div>
              )}

              {formatCapabilities && !formatCapabilities.hasPatternData && (
                <div className="flex items-start gap-2 p-3 bg-accent-primary/10 border border-accent-primary/30 rounded text-xs text-accent-primary">
                  <Info size={14} className="shrink-0 mt-0.5" />
                  <div>
                    <span className="font-semibold">No pattern display.</span>
                    {' '}This format does not have extractable pattern data. The song will play back but no notes or effects are shown in the editor.
                  </div>
                </div>
              )}

              {moduleInfo.metadata.message && (
                <div className="text-xs text-text-muted bg-dark-bgSecondary p-2 rounded max-h-20 overflow-y-auto font-mono whitespace-pre-wrap">
                  {moduleInfo.metadata.message}
                </div>
              )}


            </div>
          )}

        </div>

        {/* Footer */}
        <div className="flex justify-end gap-2 px-4 py-3 border-t border-dark-border">
          <Button variant="ghost" size="sm" onClick={handleClose} disabled={isImporting}>Cancel</Button>
          <Button variant="primary" size="sm" onClick={handleImport} disabled={!moduleInfo || isLoading || isImporting}>
            {isImporting ? 'Loading…' : isLoading ? 'Loading…' : 'Load'}
          </Button>
        </div>
      </div>
    </div>
  );
};
