/**
 * PixiImportModuleDialog — GL-native version of the DOM ImportModuleDialog.
 * Handles module file import with preview (file info, format detection, subsong selection),
 * companion file selection, UADE metadata display, and import options.
 *
 * DOM reference: src/components/dialogs/ImportModuleDialog.tsx
 */

import React, { useState, useRef, useCallback, useEffect } from 'react';
import {
  PixiModal,
  PixiModalHeader,
  PixiModalFooter,
  PixiButton,
  PixiLabel,
} from '../components';
import { PixiSelect } from '../components/PixiSelect';
import { PixiNumericInput } from '../components/PixiNumericInput';
import { usePixiTheme } from '../theme';
import { pickFiles } from '../services/glFilePicker';
import {
  loadModuleFile,
  previewModule,
  stopPreview,
  getSupportedExtensions,
  isSupportedModule,
  type ModuleInfo,
} from '@/lib/import/ModuleLoader';
import { isUADEFormat } from '@/lib/import/formats/UADEParser';
import { getNativeFormatMetadata } from '@/lib/import/NativeFormatMetadata';
import { useSettingsStore, type FormatEnginePreferences } from '@/stores/useSettingsStore';
import { detectFormat, getLibopenmptPlayableKeys, type FormatDefinition } from '@/lib/import/FormatRegistry';
import { getFormatCapabilities, type FormatCapabilityInfo } from '@/lib/import/FormatCapabilities';
import type { UADEMetadata } from '@/engine/uade/UADEEngine';
import { computeSongDBHash, lookupSongDB, type SongDBResult } from '@/lib/songdb';
import { parseSIDHeader, type SIDHeaderInfo } from '@/lib/sid/SIDHeaderParser';
import type { ImportOptions } from '@/components/dialogs/ImportModuleDialog';

// Re-export for bridge consumers
export type { ImportOptions };

// ── Format detection helpers (mirrored from DOM dialog) ──────────────────────

function detectNativeFormat(filename: string): FormatDefinition | null {
  const fmt = detectFormat(filename);
  if (!fmt) return null;
  if (fmt.nativeParser || fmt.family === 'furnace' || fmt.family === 'chip-dump' || fmt.family === 'c64-chip') return fmt;
  return null;
}

const isFurnaceFormat = (filename: string): boolean => {
  const fmt = detectFormat(filename);
  return fmt?.family === 'furnace';
};

const isChipDumpFormat = (filename: string): boolean => {
  const fmt = detectFormat(filename);
  return fmt?.family === 'chip-dump' || fmt?.family === 'c64-chip';
};

// ── Props ────────────────────────────────────────────────────────────────────

interface PixiImportModuleDialogProps {
  isOpen: boolean;
  onClose: () => void;
  onImport: (info: ModuleInfo, options: ImportOptions) => void;
  initialFile?: File | null;
  companionFiles?: File[];
}

// ── Constants ────────────────────────────────────────────────────────────────

const MODAL_W = 480;
const MODAL_H = 520;
const CONTENT_W = MODAL_W - 34;
const ROW_H = 18;
const MULTI_FILE_FORMAT_KEYS = new Set<string>(['iffSmus']);

/**
 * For two-file Amiga formats, derive the expected companion filename from the main file.
 * Returns { expectedName, description } or null if not a two-file format.
 *
 * TFMX:  mdat.songname → smpl.songname
 * MFP:   mfp.songname  → smp.songname
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

// ── Helpers ──────────────────────────────────────────────────────────────────

function fmtDuration(seconds: number): string {
  return `${Math.floor(seconds / 60)}:${String(Math.floor(seconds % 60)).padStart(2, '0')}`;
}

function fmtDurationMs(ms: number): string {
  return `${Math.floor(ms / 60000)}:${String(Math.floor((ms % 60000) / 1000)).padStart(2, '0')}`;
}

function metaVal(v: number): string {
  return v < 0 ? '--' : String(v);
}

/** Pre-blend two 0xRRGGBB colours at a given alpha (for semi-transparent backgrounds). */
function blendColor(base: number, overlay: number, alpha: number): number {
  const r1 = (base >> 16) & 0xFF, g1 = (base >> 8) & 0xFF, b1 = base & 0xFF;
  const r2 = (overlay >> 16) & 0xFF, g2 = (overlay >> 8) & 0xFF, b2 = overlay & 0xFF;
  return (Math.round(r1 + (r2 - r1) * alpha) << 16) | (Math.round(g1 + (g2 - g1) * alpha) << 8) | Math.round(b1 + (b2 - b1) * alpha);
}

// ── Component ────────────────────────────────────────────────────────────────

export const PixiImportModuleDialog: React.FC<PixiImportModuleDialogProps> = ({
  isOpen,
  onClose,
  onImport,
  initialFile,
  companionFiles,
}) => {
  const theme = usePixiTheme();

  const [moduleInfo, setModuleInfo] = useState<ModuleInfo | null>(null);
  const [loadedFileName, setLoadedFileName] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [uadeInitProgress, setUadeInitProgress] = useState(0);
  const [uadeInitPhase, setUadeInitPhase] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [uadeMetadata, setUadeMetadata] = useState<UADEMetadata | null>(null);
  const [selectedSubsong, setSelectedSubsong] = useState(0);
  const [songDBInfo, setSongDBInfo] = useState<SongDBResult | null>(null);
  const [sidHeader, setSidHeader] = useState<SIDHeaderInfo | null>(null);
  const [activeCompanions, setActiveCompanions] = useState<File[]>([]);

  const uadeScanActiveRef = useRef(false);
  const mlPreviewRef = useRef<{ stop: () => void; output: GainNode } | null>(null);
  const companionFilesRef = useRef<File[]>(companionFiles ?? []);
  useEffect(() => { companionFilesRef.current = companionFiles ?? []; }, [companionFiles]);

  const setFormatEngine = useSettingsStore((s) => s.setFormatEngine);

  // Derived format state
  const nativeFmt = detectNativeFormat(loadedFileName);
  const isNativeOnly = !!(nativeFmt?.nativeOnly);
  const needsCompanionFiles =
    activeCompanions.length === 0 && (
      (nativeFmt !== null && MULTI_FILE_FORMAT_KEYS.has(nativeFmt.key)) ||
      getExpectedCompanion(loadedFileName) !== null
    );

  const formatCapabilities: FormatCapabilityInfo | null = moduleInfo
    ? getFormatCapabilities(
        uadeMetadata ? (uadeMetadata.formatName || 'UADE') : moduleInfo.metadata.type,
        loadedFileName,
        nativeFmt?.family,
      )
    : null;

  // ── File loading (matches DOM logic) ─────────────────────────────────────

  const handleFileSelect = useCallback(async (file: File, overrideCompanions?: File[]) => {
    if (!isSupportedModule(file.name)) {
      setError(`Unsupported file format. Supported: ${getSupportedExtensions().slice(0, 5).join(', ')}...`);
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

    if (isUADEExclusive) {
      try {
        const buf = await file.arrayBuffer();
        lookupSongDB(computeSongDBHash(buf)).then(setSongDBInfo);

        // Initialize UADE engine with progress reporting
        const { UADEEngine } = await import('@/engine/uade/UADEEngine');
        const engine = UADEEngine.getInstance();
        const unsubProgress = engine.onInitProgress((progress, phase) => {
          setUadeInitProgress(progress);
          setUadeInitPhase(phase);
        });
        await engine.ready();
        await engine.reinitIfNeeded();
        unsubProgress();
        setUadeInitProgress(100);

        // Skip pre-scan for synthetic/compiled 68k formats
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
        } // close else (non-synth)
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

    if (nativeFmtForFile || isFurnace) {
      try {
        const buf = await file.arrayBuffer();
        lookupSongDB(computeSongDBHash(buf)).then(setSongDBInfo);
        const sidInfo = parseSIDHeader(new Uint8Array(buf));
        if (sidInfo) {
          setSidHeader(sidInfo);
          setSelectedSubsong(sidInfo.defaultSubsong);
        }
        // For formats with nativeParser that libopenmpt can also handle, call
        // loadModuleFile to populate nativeData.  Amiga-native formats (SoundFX,
        // FC, OKT, MED, TFMX, etc.) are NOT libopenmpt-compatible — sending them
        // through loadModuleFile would crash because libopenmpt can't parse them.
        // Those formats go through the metadata-only path below and get routed to
        // parseModuleToSong → tryRouteFormat at import time.
        const canUseLibopenmpt = nativeFmtForFile?.nativeParser &&
          (nativeFmtForFile.libopenmptFallback || nativeFmtForFile.libopenmptPlayable);
        if (canUseLibopenmpt) {
          const info = await loadModuleFile(file);
          setModuleInfo(info);
        } else {
          // Furnace and other native formats - just use metadata
          const meta = nativeFmtForFile
            ? getNativeFormatMetadata(nativeFmtForFile.key, buf)
            : { channels: -1, patterns: -1, orders: -1, instruments: -1, samples: -1 };
          setModuleInfo({
            metadata: {
              title: sidInfo?.title || file.name.replace(/\.[^/.]+$/, ''),
              type: isFurnace ? 'Furnace' : nativeFmtForFile!.label,
              channels: meta.channels,
              patterns: meta.patterns,
              orders: meta.orders,
              instruments: meta.instruments,
              samples: meta.samples,
              duration: 0,
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

    // Standard libopenmpt path
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

  // Auto-load initial file
  useEffect(() => {
    if (initialFile && isOpen) {
      handleFileSelect(initialFile);
    }
  }, [initialFile, isOpen, handleFileSelect]);

  // ── Preview controls ───────────────────────────────────────────────────────

  const LIBOPENMPT_PLAYABLE_NATIVE_KEYS = getLibopenmptPlayableKeys();
  const isMusicLine = nativeFmt?.key === 'musicLine';
  const isHively = nativeFmt?.key === 'hvl';
  const canPreview = !uadeMetadata && (
    !nativeFmt || isMusicLine || isHively || LIBOPENMPT_PLAYABLE_NATIVE_KEYS.has(nativeFmt.key)
  );

  const stopEnginePreview = useCallback(() => {
    if (mlPreviewRef.current) {
      mlPreviewRef.current.stop();
      try { mlPreviewRef.current.output.disconnect(); } catch { /* already disconnected */ }
      mlPreviewRef.current = null;
    }
  }, []);

  const handlePreview = useCallback(async () => {
    if (!moduleInfo) return;
    if (isMusicLine || isHively) {
      if (isPlaying) {
        stopEnginePreview();
        setIsPlaying(false);
      } else {
        try {
          if (isMusicLine) {
            const { MusicLineEngine } = await import('@/engine/musicline/MusicLineEngine');
            const engine = MusicLineEngine.getInstance();
            await engine.ready();
            await engine.loadSong(new Uint8Array(moduleInfo.arrayBuffer));
            engine.output.connect(engine.output.context.destination);
            mlPreviewRef.current = { stop: () => engine.stop(), output: engine.output };
            engine.play();
          } else {
            const { HivelyEngine } = await import('@/engine/hively/HivelyEngine');
            const engine = HivelyEngine.getInstance();
            await engine.ready();
            await engine.loadTune(moduleInfo.arrayBuffer.slice(0));
            engine.output.connect(engine.output.context.destination);
            mlPreviewRef.current = { stop: () => engine.stop(), output: engine.output };
            engine.play();
          }
          setIsPlaying(true);
        } catch (err) {
          console.error('[PixiImportModuleDialog] Engine preview failed:', err);
        }
      }
      return;
    }
    if (isPlaying) {
      stopPreview(moduleInfo);
      setIsPlaying(false);
    } else {
      previewModule(moduleInfo);
      setIsPlaying(true);
    }
  }, [moduleInfo, isPlaying, isMusicLine, isHively, stopEnginePreview]);

  // ── Import handler ─────────────────────────────────────────────────────────

  const handleImport = useCallback(async () => {
    if (!moduleInfo) return;
    if (isPlaying) {
      if (isMusicLine || isHively) stopEnginePreview();
      else stopPreview(moduleInfo);
      setIsPlaying(false);
    }
    if (nativeFmt && !isNativeOnly) {
      setFormatEngine(nativeFmt.key as keyof FormatEnginePreferences, 'native');
    }
    setFormatEngine('uade', 'enhanced');
    let companionMap: Map<string, ArrayBuffer> | undefined;
    console.log('[PixiImportModuleDialog] activeCompanions:', activeCompanions.length, activeCompanions.map(f => f.name));
    if (activeCompanions.length > 0) {
      companionMap = new Map();
      for (const f of activeCompanions) {
        companionMap.set(f.name, await f.arrayBuffer());
      }
    }
    console.log('[PixiImportModuleDialog] companionMap:', companionMap ? [...companionMap.keys()] : 'undefined');
    onImport(moduleInfo, {
      useLibopenmpt: true,
      subsong: selectedSubsong,
      uadeMetadata: uadeMetadata ?? undefined,
      companionFiles: companionMap,
    });
    onClose();
  }, [moduleInfo, isPlaying, isMusicLine, isHively, stopEnginePreview, nativeFmt, isNativeOnly, setFormatEngine, onImport, onClose, selectedSubsong, activeCompanions, uadeMetadata]);

  // ── Close handler ──────────────────────────────────────────────────────────

  const handleClose = useCallback(() => {
    if (isPlaying) {
      if (isMusicLine || isHively) stopEnginePreview();
      else if (moduleInfo) stopPreview(moduleInfo);
    }
    if (uadeScanActiveRef.current) {
      import('@/engine/uade/UADEEngine').then(({ UADEEngine }) => {
        if (UADEEngine.hasInstance()) UADEEngine.getInstance().cancelLoad();
      }).catch(() => {});
    }
    setModuleInfo(null);
    setLoadedFileName('');
    setError(null);
    setIsPlaying(false);
    setUadeMetadata(null);
    setSidHeader(null);
    setSelectedSubsong(0);
    setActiveCompanions([]);
    onClose();
  }, [moduleInfo, isPlaying, isMusicLine, isHively, stopEnginePreview, onClose]);

  // ── File picker handlers ───────────────────────────────────────────────────

  const handlePickFile = useCallback(async () => {
    const files = await pickFiles({ accept: getSupportedExtensions().join(',') });
    if (files.length === 0) return;
    const mainFile = files.find(f => isSupportedModule(f.name)) ?? files[0];
    const companions = files.filter(f => f !== mainFile);

    // Two-part loader: if picked file needs a companion, auto-prompt for it
    const comp = getExpectedCompanion(mainFile.name);
    if (comp && companions.length === 0) {
      const companionFiles = await pickFiles({ accept: '*' });
      handleFileSelect(mainFile, companionFiles);
      return;
    }

    handleFileSelect(mainFile, companions);
  }, [handleFileSelect]);

  const handlePickCompanions = useCallback(async () => {
    const files = await pickFiles({ accept: '*' });
    if (files.length === 0) return;
    const mainFile = files.find(f => isSupportedModule(f.name));
    if (!mainFile) return;
    const companions = files.filter(f => f !== mainFile);
    handleFileSelect(mainFile, companions);
  }, [handleFileSelect]);

  // ── Subsong options for PixiSelect ─────────────────────────────────────────

  const subsongOptions = uadeMetadata && uadeMetadata.subsongCount <= 20
    ? Array.from({ length: uadeMetadata.subsongCount }, (_, i) => ({
        value: String(i),
        label: `Subsong ${i + 1}${i === 0 ? ' (default)' : ''}`,
      }))
    : null;

  // ── Render ─────────────────────────────────────────────────────────────────

  // Always render a pixiContainer so pixi-react never does a null→tree insertion
  // at the parent level (which can fail silently in the custom reconciler).
  // PixiModal handles visibility gating internally.
  const accentBg = isOpen ? blendColor(theme.bg.color, theme.accent.color, 0.2) : 0;

  return (
    <PixiModal isOpen={isOpen} onClose={handleClose} width={MODAL_W} height={MODAL_H}>
      <PixiModalHeader title="Import Tracker Module" onClose={handleClose} width={MODAL_W} />

      <layoutContainer layout={{ flex: 1, padding: 16, flexDirection: 'column', gap: 16, overflow: 'hidden' }}>

        {/* ── Drop zone / file pickers (before file is loaded) ── */}
        {!moduleInfo && !isLoading && !error && (
          <layoutContainer
            layout={{
              flexDirection: 'column',
              alignItems: 'center',
              gap: 16,
              padding: 32,
              borderRadius: 8,
              borderWidth: 2,
              borderColor: theme.border.color,
              width: CONTENT_W,
            }}
          >
            <PixiLabel text="Drop a file here, or pick one below" size="md" color="textMuted" />
            <layoutContainer layout={{ flexDirection: 'row', gap: 8 }}>
              <PixiButton label="Pick File" variant="default" onClick={handlePickFile} />
              <PixiButton label="Pick Files" variant="default" onClick={handlePickCompanions} />
            </layoutContainer>
          </layoutContainer>
        )}

        {/* ── Loading state with UADE init progress ── */}
        {isLoading && (
          <layoutContainer layout={{ flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: 60, gap: 6 }}>
            <PixiLabel
              text={uadeInitPhase === 'compiling' ? 'Compiling UADE engine…'
                : uadeInitPhase === 'compiled' ? 'UADE compiled, instantiating…'
                : uadeInitPhase === 'instantiating' ? 'Instantiating UADE…'
                : uadeInitPhase === 'instantiated' ? 'Initializing UADE engine…'
                : 'Analyzing module…'}
              size="sm"
              color="textMuted"
            />
            <layoutContainer layout={{ width: 300, height: 4 }}>
              <layoutContainer layout={{ width: 300, height: 4, backgroundColor: blendColor(theme.bg.color, theme.accent.color, 0.15), borderRadius: 2 }} />
              <layoutContainer layout={{ width: Math.max(15, Math.round(300 * (uadeInitProgress > 0 ? uadeInitProgress : 5) / 100)), height: 4, backgroundColor: theme.accent.color, borderRadius: 2, position: 'absolute' }} />
            </layoutContainer>
          </layoutContainer>
        )}

        {/* ── Error state ── */}
        {error && (
          <layoutContainer
            layout={{
              flexDirection: 'row',
              alignItems: 'center',
              gap: 8,
              padding: 12,
              borderRadius: 6,
              borderWidth: 1,
              backgroundColor: 0x3B1515,
              borderColor: 0x7F2020,
              width: CONTENT_W,
            }}
          >
            <PixiLabel text="⚠" size="md" color="error" />
            <PixiLabel text={error} size="md" color="error" layout={{ maxWidth: CONTENT_W - 40 }} />
          </layoutContainer>
        )}

        {/* ── Module info card ── */}
        {moduleInfo && (
          <layoutContainer
            layout={{
              flexDirection: 'column',
              gap: 12,
              padding: 16,
              borderRadius: 8,
              borderWidth: 1,
              backgroundColor: theme.bg.color,
              borderColor: theme.border.color,
              width: CONTENT_W,
            }}
          >
            {/* Title + format badge */}
            <layoutContainer layout={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', width: CONTENT_W - 32 }}>
              <PixiLabel
                text={moduleInfo.metadata.title}
                size="lg"
                weight="medium"
                color="text"
                layout={{ maxWidth: CONTENT_W - 120 }}
              />
              <layoutContainer
                layout={{
                  paddingLeft: 8,
                  paddingRight: 8,
                  paddingTop: 2,
                  paddingBottom: 2,
                  borderRadius: 4,
                  backgroundColor: accentBg,
                }}
              >
                <PixiLabel
                  text={uadeMetadata ? (uadeMetadata.formatName || 'UADE') : moduleInfo.metadata.type}
                  size="sm"
                  color="accent"
                />
              </layoutContainer>
            </layoutContainer>

            {/* Metadata grid */}
            {uadeMetadata ? (
              <layoutContainer layout={{ flexDirection: 'column', gap: 2 }}>
                <MetaRow label="Player" value={uadeMetadata.player || 'Unknown'} />
                <MetaRow label="Subsongs" value={String(uadeMetadata.subsongCount)} />
                <MetaRow label="Channels" value="4 (Paula)" />
                <MetaRow
                  label="Samples"
                  value={String(Object.keys(uadeMetadata.enhancedScan?.samples ?? {}).length)}
                />
              </layoutContainer>
            ) : (
              <layoutContainer layout={{ flexDirection: 'column', gap: 2 }}>
                <MetaRow label="Channels" value={metaVal(moduleInfo.metadata.channels)} />
                <MetaRow label="Patterns" value={metaVal(moduleInfo.metadata.patterns)} />
                <MetaRow label="Instruments" value={metaVal(moduleInfo.metadata.instruments)} />
                <MetaRow label="Samples" value={metaVal(moduleInfo.metadata.samples)} />
                <MetaRow label="Orders" value={metaVal(moduleInfo.metadata.orders)} />
                {moduleInfo.metadata.duration > 0 && (
                  <MetaRow label="Duration" value={fmtDuration(moduleInfo.metadata.duration)} />
                )}
              </layoutContainer>
            )}

            {/* SID header info */}
            {sidHeader && (
              <layoutContainer layout={{ flexDirection: 'column', gap: 2, marginTop: 4, borderTopWidth: 1, borderColor: theme.border.color, paddingTop: 8 }}>
                <MetaRow label="Title" value={sidHeader.title || '--'} />
                <MetaRow label="Author" value={sidHeader.author || '--'} />
                {sidHeader.subsongs > 1 && (
                  <MetaRow label="Subsongs" value={String(sidHeader.subsongs)} />
                )}
              </layoutContainer>
            )}

            {/* SongDB metadata (non-SID) */}
            {songDBInfo && !sidHeader && (
              <layoutContainer layout={{ flexDirection: 'column', gap: 2, marginTop: 4, borderTopWidth: 1, borderColor: theme.border.color, paddingTop: 8 }}>
                {songDBInfo.authors.length > 0 && (
                  <MetaRow label="Author" value={songDBInfo.authors.join(', ')} />
                )}
                {songDBInfo.album && <MetaRow label="Album" value={songDBInfo.album} />}
                {songDBInfo.year && <MetaRow label="Year" value={songDBInfo.year} />}
                {songDBInfo.publishers.length > 0 && (
                  <MetaRow label="Group" value={songDBInfo.publishers.join(', ')} />
                )}
                {songDBInfo.subsongs.length > 0 && !moduleInfo.metadata.duration && (
                  <MetaRow label="Duration" value={fmtDurationMs(songDBInfo.subsongs[0].duration_ms)} />
                )}
                {songDBInfo.format && !uadeMetadata && (
                  <MetaRow label="Format" value={songDBInfo.format} />
                )}
              </layoutContainer>
            )}

            {/* Format capability warnings */}
            {formatCapabilities && !formatCapabilities.isEditable && (
              <layoutContainer layout={{ flexDirection: 'row', gap: 6, padding: 8, borderRadius: 4, borderWidth: 1, borderColor: 0xcc4444, backgroundColor: blendColor(theme.bg.color, 0xcc4444, 0.1), width: CONTENT_W, marginTop: 4 }}>
                <PixiLabel text="Playback only — not editable. This format cannot be edited in the pattern editor." size="xs" color="custom" customColor={0xcc6666} layout={{ maxWidth: CONTENT_W - 24 }} />
              </layoutContainer>
            )}

            {formatCapabilities && formatCapabilities.isEditable && !formatCapabilities.isNativeExportable && (
              <layoutContainer layout={{ flexDirection: 'row', gap: 6, padding: 8, borderRadius: 4, borderWidth: 1, borderColor: 0xcc8800, backgroundColor: blendColor(theme.bg.color, 0xcc8800, 0.1), width: CONTENT_W, marginTop: 4 }}>
                <PixiLabel text="No native export. This format can be edited but only saved as a DEViLBOX project (.dbx)." size="xs" color="custom" customColor={0xcc9944} layout={{ maxWidth: CONTENT_W - 24 }} />
              </layoutContainer>
            )}

            {formatCapabilities && formatCapabilities.isEditable && formatCapabilities.isNativeExportable && (
              <layoutContainer layout={{ flexDirection: 'row', gap: 6, padding: 8, borderRadius: 4, borderWidth: 1, borderColor: 0x44aa44, backgroundColor: blendColor(theme.bg.color, 0x44aa44, 0.1), width: CONTENT_W, marginTop: 4 }}>
                <PixiLabel text="Editable and exportable. Pattern edits play back in real-time and can be exported to native format." size="xs" color="custom" customColor={0x66cc66} layout={{ maxWidth: CONTENT_W - 24 }} />
              </layoutContainer>
            )}

            {/* Subsong picker (UADE with multiple subsongs) */}
            {uadeMetadata && uadeMetadata.subsongCount > 1 && (
              <layoutContainer layout={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 4 }}>
                <PixiLabel text="Import subsong:" size="sm" color="textMuted" />
                {subsongOptions ? (
                  <PixiSelect
                    options={subsongOptions}
                    value={String(selectedSubsong)}
                    onChange={(v) => setSelectedSubsong(Number(v))}
                    width={160}
                  />
                ) : (
                  <>
                    <PixiNumericInput
                      value={selectedSubsong + 1}
                      min={1}
                      max={uadeMetadata.subsongCount}
                      onChange={(v) => setSelectedSubsong(v - 1)}
                      width={60}
                    />
                    <PixiLabel text={`of ${uadeMetadata.subsongCount}`} size="sm" color="textMuted" />
                  </>
                )}
              </layoutContainer>
            )}

            {/* SID subsong picker */}
            {sidHeader && sidHeader.subsongs > 1 && !uadeMetadata && (
              <layoutContainer layout={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 4 }}>
                <PixiLabel text="Subsong:" size="sm" color="textMuted" />
                <PixiNumericInput
                  value={selectedSubsong + 1}
                  min={1}
                  max={sidHeader.subsongs}
                  onChange={(v) => setSelectedSubsong(v - 1)}
                  width={60}
                />
                <PixiLabel text={`of ${sidHeader.subsongs}`} size="sm" color="textMuted" />
              </layoutContainer>
            )}

            {/* Companion files badge */}
            {activeCompanions.length > 0 && (
              <layoutContainer
                layout={{
                  flexDirection: 'row',
                  alignItems: 'center',
                  gap: 6,
                  padding: 8,
                  borderRadius: 6,
                  borderWidth: 1,
                  backgroundColor: 0x0F2F1A,
                  borderColor: 0x22753A,
                  marginTop: 4,
                }}
              >
                <PixiLabel
                  text={`${activeCompanions.length} companion file${activeCompanions.length > 1 ? 's' : ''} loaded`}
                  size="sm"
                  color="success"
                />
              </layoutContainer>
            )}

            {/* Warning: multi-file format without companions */}
            {needsCompanionFiles && (
              <layoutContainer
                layout={{
                  flexDirection: 'row',
                  alignItems: 'center',
                  gap: 6,
                  padding: 8,
                  borderRadius: 6,
                  borderWidth: 1,
                  backgroundColor: 0x2F2A0F,
                  borderColor: 0x756622,
                  marginTop: 4,
                }}
              >
                <PixiLabel
                  text={(() => {
                    const comp = getExpectedCompanion(loadedFileName);
                    if (comp) return `Missing ${comp.description} — drop folder or both files together`;
                    return 'Audio requires companion files. Use Pick Files to load them.';
                  })()}
                  size="sm"
                  color="warning"
                />
              </layoutContainer>
            )}

            {/* Module message */}
            {moduleInfo.metadata.message && (
              <layoutContainer
                layout={{
                  padding: 8,
                  borderRadius: 4,
                  backgroundColor: theme.bgSecondary.color,
                  marginTop: 4,
                  maxHeight: 60,
                  overflow: 'hidden',
                }}
              >
                <PixiLabel text={moduleInfo.metadata.message} size="sm" font="mono" color="textMuted" />
              </layoutContainer>
            )}

            {/* Preview button */}
            {canPreview && (
              <layoutContainer layout={{ marginTop: 4 }}>
                <PixiButton
                  label={isPlaying ? 'Stop Preview' : 'Preview'}
                  variant="ghost"
                  onClick={handlePreview}
                  icon={isPlaying ? 'stop' : 'play'}
                />
              </layoutContainer>
            )}
          </layoutContainer>
        )}
      </layoutContainer>

      {/* Footer */}
      <PixiModalFooter width={MODAL_W}>
        <PixiButton label="Cancel" variant="ghost" onClick={handleClose} />
        <PixiButton label="Import Module" variant="primary" onClick={handleImport} disabled={!moduleInfo} />
      </PixiModalFooter>
    </PixiModal>
  );
};

// ── MetaRow — key/value pair row ─────────────────────────────────────────────

const MetaRow: React.FC<{ label: string; value: string }> = ({ label, value }) => (
  <layoutContainer layout={{ flexDirection: 'row', justifyContent: 'space-between', height: ROW_H, alignItems: 'center' }}>
    <PixiLabel text={label} size="sm" color="textMuted" />
    <PixiLabel text={value} size="sm" font="mono" color="text" />
  </layoutContainer>
);
