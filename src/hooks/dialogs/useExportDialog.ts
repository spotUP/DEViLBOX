// src/hooks/dialogs/useExportDialog.ts
/**
 * useExportDialog — Shared logic hook for ExportDialog (DOM) and PixiExportDialog (Pixi).
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
  useEditorStore,
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
  getOriginalModuleDataForExport,
  type ExportOptions,
} from '@lib/export/exporters';
import { NanoExporter } from '@lib/export/NanoExporter';
import { saveFurFileWasm } from '@lib/import/wasm/FurnaceFileOps';
import type { AutomationCurve } from '@typedefs/automation';

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
    const { patternOrder } = useTrackerStore.getState();
    const sequence = patternOrder.map((idx: number) => patterns[idx]?.id).filter(Boolean);

    // Convert automation curves to export format (nested structure for legacy compat)
    const automationData: Record<string, Record<number, Record<string, AutomationCurve>>> = {};
    patterns.forEach((pattern) => {
      pattern.channels.forEach((_channel, channelIndex) => {
        const channelCurves = curves.filter(
          (c) => c.patternId === pattern.id && c.channelIndex === channelIndex,
        );
        if (channelCurves.length > 0) {
          if (!automationData[pattern.id]) automationData[pattern.id] = {};
          automationData[pattern.id][channelIndex] = channelCurves.reduce(
            (acc, curve) => { acc[curve.parameter] = curve; return acc; },
            {} as Record<string, AutomationCurve>,
          );
        }
      });
    });

    const { speed } = useTransportStore.getState();
    const { linearPeriods } = useEditorStore.getState();
    const trackerFormat = patterns[0]?.importMetadata?.sourceFormat as string | undefined;

    exportSong(
      metadata, bpm, instruments, patterns, sequence,
      automationData, masterEffects, curves, options,
      undefined,
      { speed, trackerFormat, linearPeriods },
      patternOrder,
      getOriginalModuleDataForExport(),
    );
    onClose();
  }, [patterns, curves, metadata, bpm, instruments, masterEffects, options]);

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
    const { getTrackerReplayer } = await import('@engine/TrackerReplayer');
    const song = getTrackerReplayer().getSong();
    const { exportNativeSong } = await import('@lib/export/nativeExportRouter');
    const result = await exportNativeSong(song, {});

    if (!result) {
      notify.error(song ? 'No native exporter available for this format' : 'No song loaded');
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
            setMetadata(data.metadata);
            setBPM(data.bpm);
            loadPatterns(data.patterns);
            loadInstruments(data.instruments);

            // Load automation curves - prefer flat array format, fall back to nested
            if (data.automationCurves && data.automationCurves.length > 0) {
              loadCurves(data.automationCurves);
            } else if (data.automation) {
              const allCurves: AutomationCurve[] = [];
              Object.entries(data.automation).forEach(([, channels]) => {
                Object.entries(channels as Record<number, Record<string, AutomationCurve>>).forEach(([, params]) => {
                  Object.values(params).forEach((curve) => allCurves.push(curve));
                });
              });
              if (allCurves.length > 0) loadCurves(allCurves);
            }

            if (data.masterEffects && data.masterEffects.length > 0) setMasterEffects(data.masterEffects);

            // Restore dub bus tuning (character preset + 30+ coloring params).
            // Spread over whatever's currently in the store so older .dbx
            // files missing newer fields inherit current defaults — shape
            // evolves as dub coloring params land.
            if (data.dubBus) {
              const { useDrumPadStore } = await import('@/stores/useDrumPadStore');
              useDrumPadStore.getState().setDubBus(data.dubBus);
            }

            // Restore Auto Dub state (enabled, persona, intensity, blacklist).
            // Uses individual setters rather than a bulk replace so the
            // engine's useEffect in AutoDubPanel re-fires on the enabled
            // flag and starts/stops the tick loop appropriately.
            if (data.autoDub) {
              const { useDubStore } = await import('@/stores/useDubStore');
              const s = useDubStore.getState();
              s.setAutoDubPersona(data.autoDub.persona);
              s.setAutoDubIntensity(data.autoDub.intensity);
              s.setAutoDubMoveBlacklist(data.autoDub.moveBlacklist ?? []);
              s.setAutoDubEnabled(data.autoDub.enabled);
            }

            // Restore mixer state (channel volumes, pans, mutes, solos, dub sends, send buses)
            if (data.mixer) {
              const { useMixerStore } = await import('@/stores/useMixerStore');
              useMixerStore.getState().loadMixerState(data.mixer);
            }

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
