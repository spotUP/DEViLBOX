// src/hooks/dialogs/useExportDialog.ts
/**
 * useExportDialog — Logic hook for ExportDialog.
 *
 * Both dialogs call this hook and keep only their renderer-specific markup.
 * All store subscriptions, local state, effects, and handlers live here.
 */

import { useState, useEffect, useCallback } from 'react';
import {
  useTrackerStore,
  useInstrumentStore,
  useProjectStore,
  useTransportStore,
  useAutomationStore,
  useAudioStore,
  notify,
  useFormatStore,
} from '@stores';
import { useUIStore } from '@stores/useUIStore';
import { getToneEngine } from '@engine/ToneEngine';
import {
  exportSong,
  exportSFX,
  exportInstrument,
  importSong,
  importSFX,
  importInstrument,
  detectFileFormat,
  type ExportOptions,
} from '@lib/export/exporters';
import { NanoExporter } from '@lib/export/NanoExporter';
import { saveFurFileWasm } from '@lib/import/wasm/FurnaceFileOps';

// ── Types ───────────────────────────────────────────────────────────────────────

export type ExportMode = 'song' | 'sfx' | 'instrument' | 'audio' | 'midi' | 'xm' | 'mod' | 'it' | 's3m' | 'chip' | 'nano' | 'native' | 'fur';
export type DialogMode = 'export' | 'import';

export type { ExportOptions };

// ── Constants (exported separately, not in hook return) ─────────────────────────

export interface ExportModeOption {
  value: ExportMode;
  label: string;
}

export const EXPORT_MODE_OPTIONS: ExportModeOption[] = [
  { value: 'song', label: 'Song (.dbx)' },
  { value: 'sfx', label: 'SFX (.sfx.json)' },
  { value: 'instrument', label: 'Instrument (.dbi)' },
  { value: 'audio', label: 'Audio (.wav)' },
  { value: 'midi', label: 'MIDI (.mid)' },
  { value: 'xm', label: 'XM Module (.xm)' },
  { value: 'mod', label: 'MOD Module (.mod)' },
  { value: 'it', label: 'IT Module (.it)' },
  { value: 's3m', label: 'S3M Module (.s3m)' },
  { value: 'chip', label: 'Chip (.vgm/.nsf/...)' },
  { value: 'nano', label: 'Nano Binary (.dbn)' },
  { value: 'native', label: 'Native Format (with edits)' },
];

export const FORMAT_EXTENSIONS: Record<ExportMode, string> = {
  song: '.dbx',
  sfx: '.sfx.json',
  instrument: '.dbi',
  audio: '.wav',
  midi: '.mid',
  xm: '.xm',
  mod: '.mod',
  it: '.it',
  s3m: '.s3m',
  chip: '.vgm',
  nano: '.dbn',
  native: '',
  fur: '.fur',
};

export const CHIP_FORMAT_DESCRIPTIONS: Record<string, string> = {
  vgm: 'Video Game Music — multi-chip, custom loop support',
  gym: 'Genesis YM2612 — Sega Genesis/Mega Drive audio',
  nsf: 'NES Sound Format — Nintendo 8-bit audio',
  gbs: 'Game Boy Sound — original Game Boy audio',
  spc: 'SPC700 — Super Nintendo audio processor',
  zsm: 'ZSM — Commander X16 audio',
  sap: 'SAP — Atari 8-bit POKEY audio',
  tiuna: 'TIAUna — Atari 2600 TIA audio',
};

export const CHIP_FORMATS = [
  { id: 'vgm', label: 'VGM', loop: 'custom' as const, ext: '.vgm' },
  { id: 'gym', label: 'GYM', loop: 'none' as const, ext: '.gym' },
  { id: 'nsf', label: 'NSF', loop: 'auto' as const, ext: '.nsf' },
  { id: 'gbs', label: 'GBS', loop: 'auto' as const, ext: '.gbs' },
  { id: 'spc', label: 'SPC', loop: 'none' as const, ext: '.spc' },
  { id: 'zsm', label: 'ZSM', loop: 'none' as const, ext: '.zsm' },
];

// ── Hook ────────────────────────────────────────────────────────────────────────

interface UseExportDialogOptions {
  isOpen: boolean;
}

export function useExportDialog({ isOpen }: UseExportDialogOptions) {
  // ── Store: useTrackerStore ──────────────────────────────────────────────────
  const patterns = useTrackerStore((s) => s.patterns);
  const currentPatternIndex = useTrackerStore((s) => s.currentPatternIndex);
  const importPattern = useTrackerStore((s) => s.importPattern);
  const setCurrentPattern = useTrackerStore((s) => s.setCurrentPattern);
  const loadPatterns = useTrackerStore((s) => s.loadPatterns);

  // ── Store: useInstrumentStore ───────────────────────────────────────────────
  const instruments = useInstrumentStore((s) => s.instruments);
  const currentInstrumentId = useInstrumentStore((s) => s.currentInstrumentId);
  const addInstrument = useInstrumentStore((s) => s.addInstrument);
  const setCurrentInstrument = useInstrumentStore((s) => s.setCurrentInstrument);
  const loadInstruments = useInstrumentStore((s) => s.loadInstruments);

  // ── Store: useProjectStore ──────────────────────────────────────────────────
  const metadata = useProjectStore((s) => s.metadata);
  const setMetadata = useProjectStore((s) => s.setMetadata);

  // ── Store: useTransportStore ────────────────────────────────────────────────
  const bpm = useTransportStore((s) => s.bpm);
  const setBPM = useTransportStore((s) => s.setBPM);
  const isPlaying = useTransportStore((s) => s.isPlaying);
  const stop = useTransportStore((s) => s.stop);

  // ── Store: useAutomationStore ───────────────────────────────────────────────
  const curves = useAutomationStore((s) => s.curves);
  const loadCurves = useAutomationStore((s) => s.loadCurves);

  // ── Store: useAudioStore ────────────────────────────────────────────────────
  const masterEffects = useAudioStore((s) => s.masterEffects);
  const setMasterEffects = useAudioStore((s) => s.setMasterEffects);

  // ── Store: useUIStore ───────────────────────────────────────────────────────
  const modalData = useUIStore((s) => s.modalData);

  // ── Store: useFormatStore ───────────────────────────────────────────────────
  const editorMode = useFormatStore((s) => s.editorMode);
  const originalModuleData = useFormatStore((s) => s.originalModuleData);
  const uadeEditableFileData = useFormatStore((s) => s.uadeEditableFileData);
  const uadeEditableFileName = useFormatStore((s) => s.uadeEditableFileName);

  // ── Local state ─────────────────────────────────────────────────────────────
  const [dialogMode, setDialogMode] = useState<DialogMode>('export');
  const [exportMode, setExportMode] = useState<ExportMode>('song');
  const [options, setOptions] = useState<ExportOptions>({
    includeAutomation: true,
    prettify: true,
  });
  const [sfxName, setSfxName] = useState('MySound');
  const [selectedPatternIndex, setSelectedPatternIndex] = useState(currentPatternIndex);
  const [selectedInstrumentId, setSelectedInstrumentId] = useState(currentInstrumentId || 0);
  const [isRendering, setIsRendering] = useState(false);
  const [renderProgress, setRenderProgress] = useState(0);

  // ── Effects ─────────────────────────────────────────────────────────────────

  // Auto-select audio scope when opened with audioScope hint
  useEffect(() => {
    if (isOpen && modalData?.audioScope) {
      setExportMode('audio');
    }
  }, [isOpen, modalData]);

  // ── Shared handler: export song ─────────────────────────────────────────────

  const handleExportSong = useCallback((onClose: () => void) => {
    exportSong(options);
    onClose();
  }, [options]);

  // ── Shared handler: export SFX ──────────────────────────────────────────────

  const handleExportSFX = useCallback((onClose: () => void) => {
    const pattern = patterns[selectedPatternIndex];
    const instrument = instruments.find((i) => i.id === selectedInstrumentId);
    if (!pattern || !instrument) {
      notify.warning('Please select a valid pattern and instrument');
      return;
    }
    exportSFX(sfxName, instrument, pattern, bpm, options);
    onClose();
  }, [patterns, instruments, selectedPatternIndex, selectedInstrumentId, sfxName, bpm, options]);

  // ── Shared handler: export instrument ───────────────────────────────────────

  const handleExportInstrument = useCallback((onClose: () => void) => {
    const instrument = instruments.find((i) => i.id === selectedInstrumentId);
    if (!instrument) {
      notify.warning('Please select a valid instrument');
      return;
    }
    exportInstrument(instrument, options);
    onClose();
  }, [instruments, selectedInstrumentId, options]);

  // ── Shared handler: export fur ──────────────────────────────────────────────

  const handleExportFur = useCallback(async (
    downloadFn: (blob: Blob, filename: string) => void,
    onClose: () => void,
  ) => {
    const furBuffer = await saveFurFileWasm();
    const blob = new Blob([furBuffer], { type: 'application/octet-stream' });
    const filename = `${metadata.name || 'song'}.fur`;
    downloadFn(blob, filename);
    notify.success(`Furnace file "${filename}" exported successfully! (${furBuffer.byteLength} bytes)`);
    onClose();
  }, [metadata]);

  // ── Shared handler: export nano ─────────────────────────────────────────────

  const handleExportNano = useCallback((
    downloadFn: (blob: Blob, filename: string) => void,
    onClose: () => void,
  ) => {
    const sequence = patterns.map((_: unknown, idx: number) => idx);
    const nanoData = NanoExporter.export(instruments, patterns, sequence, bpm, 6);
    const blob = new Blob([new Uint8Array(nanoData)], { type: 'application/octet-stream' });
    const filename = `${metadata.name || 'song'}.dbn`;
    downloadFn(blob, filename);
    notify.success(`Nano binary exported! (${nanoData.length} bytes)`);
    onClose();
  }, [patterns, instruments, bpm, metadata]);

  // ── Shared handler: export native ───────────────────────────────────────────

  const handleExportNative = useCallback(async (
    downloadFn: (blob: Blob, filename: string) => void,
    onClose: () => void,
  ) => {
    // All native-export dispatch lives in the shared router (single source of truth
    // for the Export dialog, the MCP export_native tool, and the FT2 toolbar Save).
    // This consumer keeps only UI concerns: blob download + toasts.
    // The song from the stores (null): the replayer's copy is only rebuilt when
    // playback starts, so an edit made since the last play was missing.
    const { useTrackerStore } = await import('@stores/useTrackerStore');
    const hasSong = useTrackerStore.getState().patterns.length > 0;
    const { exportNativeSong } = await import('@lib/export/nativeExportRouter');
    const result = await exportNativeSong(null, {});

    if (!result) {
      notify.error(hasSong ? 'No native exporter available for this format' : 'No song loaded');
      onClose();
      return;
    }

    const blobType = 'application/octet-stream';
    downloadFn(new Blob([result.data as unknown as Uint8Array<ArrayBuffer>], { type: blobType }), result.filename);
    result.companions?.forEach((c) => {
      downloadFn(new Blob([c.data as unknown as Uint8Array<ArrayBuffer>], { type: blobType }), c.name);
    });

    if (result.warnings.length > 0) {
      notify.warning(`Exported with warnings: ${result.warnings.join('; ')}`);
    } else {
      notify.success(`Native format exported: ${result.filename}`);
    }
    onClose();
  }, []);

  // ── Shared handler: import file ─────────────────────────────────────────────

  const handleImportFile = useCallback(async (file: File, onClose: () => void) => {
    // CRITICAL: Stop playback before loading new song to prevent audio glitches
    if (isPlaying) {
      stop();
      const engine = getToneEngine();
      engine.releaseAll();
    }

    try {
      const format = await detectFileFormat(file);

      switch (format) {
        case 'song': {
          const data = await importSong(file);
          if (data) {
            // One parser, one apply for every saved song (this restored its
            // own subset of the project by hand).
            const [{ applySong }, { savedSongToApply }] = await Promise.all([
              import('@/lib/song/applySong'),
              import('@/lib/song/savedSong'),
            ]);
            await applySong(savedSongToApply(data), 'project');
            notify.success(`Song "${data.metadata.name}" imported!`);
          }
          break;
        }

        case 'sfx': {
          const data = await importSFX(file);
          if (data) {
            const patternIndex = importPattern(data.pattern);
            addInstrument(data.instrument);
            setCurrentPattern(patternIndex);
            setCurrentInstrument(data.instrument.id);
            notify.success(`SFX "${data.name}" imported!`);
          }
          break;
        }

        case 'instrument': {
          const data = await importInstrument(file);
          if (data) {
            addInstrument(data.instrument);
            setCurrentInstrument(data.instrument.id);
            notify.success(`Instrument "${data.instrument.name}" imported!`);
          }
          break;
        }

        default:
          notify.error('Unknown or invalid file format');
      }

      onClose();
    } catch (error) {
      console.error('Import failed:', error);
      notify.error('Import failed: ' + (error as Error).message);
    }
  }, [isPlaying, stop, setMetadata, setBPM, loadPatterns, loadInstruments,
      loadCurves, setMasterEffects, importPattern, addInstrument, setCurrentPattern, setCurrentInstrument]);

  // ── Return ──────────────────────────────────────────────────────────────────

  return {
    // Store bindings
    patterns,
    currentPatternIndex,
    instruments,
    currentInstrumentId,
    metadata,
    bpm,
    isPlaying,
    stop,
    curves,
    masterEffects,
    modalData,
    editorMode,
    originalModuleData,
    uadeEditableFileData,
    uadeEditableFileName,

    // Store setters (used by import handler internally, but also needed by dialog panels)
    setMetadata,
    setBPM,
    loadPatterns,
    loadInstruments,
    loadCurves,
    setMasterEffects,
    importPattern,
    addInstrument,
    setCurrentPattern,
    setCurrentInstrument,

    // Shared state
    dialogMode, setDialogMode,
    exportMode, setExportMode,
    options, setOptions,
    sfxName, setSfxName,
    selectedPatternIndex, setSelectedPatternIndex,
    selectedInstrumentId, setSelectedInstrumentId,
    isRendering, setIsRendering,
    renderProgress, setRenderProgress,

    // Shared handlers
    handleExportSong,
    handleExportSFX,
    handleExportInstrument,
    handleExportFur,
    handleExportNano,
    handleExportNative,
    handleImportFile,
  };
}
