// src/hooks/dialogs/useExportDialog.ts
/**
 * useExportDialog — Logic hook for ExportDialog.
 *
 * Both dialogs call this hook and keep only their renderer-specific markup.
 * All store subscriptions, local state, effects, and handlers live here.
 */

import { furnaceModuleExportAvailable } from '@/lib/export/FurnaceModuleExporter';
import { furnaceAyScrambleExportAvailable, ayScrambleTempoWarning, type AyScrambleTarget } from '@/lib/export/FurnaceExporter';
import { nesRomExportAvailable, nesTempoWarning, type NesRegionChoice } from '@/lib/export/nes/nesExport';
import { FURNACE_SNES_CHIP_ID } from '@/lib/export/tad/tadSongWriter';
import { useState, useEffect, useCallback } from 'react';
import { lowOctaveExportRefusal } from '@/lib/tracker/noteValue';
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
import { saveFurFileWasm, saveFurTextWasm, loadFurFileWasm } from '@lib/import/wasm/FurnaceFileOps';

// ── Types ───────────────────────────────────────────────────────────────────────

export type ExportMode = 'song' | 'sfx' | 'instrument' | 'audio' | 'midi' | 'xm' | 'mod' | 'it' | 's3m' | 'chip' | 'nano' | 'native' | 'fur' | 'furText' | 'furAy' | 'zxTap' | 'zxBeeperTap' | 'vectrexCart' | 'nesRom' | 'nsfe' | 'tad';
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
  furText: '.txt',
  furAy: '.fur',
  zxTap: '.tap',
  zxBeeperTap: '.tap',
  vectrexCart: '.bin',
  nesRom: '.nes',
  nsfe: '.nsfe',
  tad: '.zip',
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
  const furnaceNative = useFormatStore((s) => s.furnaceNative);
  const furnaceSubsongs = useFormatStore((s) => s.furnaceSubsongs);
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

  // The one export call of the native export router in this dialog (the Export button). Whether the
  // Native option is offered is asked separately (nativeExportAvailableForLiveSong below): the router's
  // exporter table (not a list of editor modes kept here, which missed SunTronic mule.src and Ben
  // Daglish) knows which exporter a song takes. Loaded when asked: it pulls in every exporter. The song is the one the stores hold (null): the replayer's copy is only
  // rebuilt when playback starts, so an edit made since the last play was missing.
  const runNativeExport = useCallback(async () => {
    const { exportNativeFile } = await import('@lib/export/moduleExportService');
    return exportNativeFile();
  }, []);

  const [nativeAvailable, setNativeAvailable] = useState(false);
  useEffect(() => {
    if (!isOpen) return;
    let current = true;
    // The router answers from its own exporter table without serializing the song; the real export runs
    // only when the Export button asks (runNativeExport).
    import('@lib/export/moduleExportService')
      .then((m) => m.nativeExportAvailableForLiveSong())
      .catch(() => false)
      .then((available) => { if (current) setNativeAvailable(available); });
    return () => { current = false; };
  }, [isOpen, patterns, editorMode, uadeEditableFileData]);

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

  const furnaceModuleAvailable = furnaceModuleExportAvailable(instruments);

  // ── Shared handler: export fur ──────────────────────────────────────────────

  const handleExportFur = useCallback(async (
    downloadFn: (blob: Blob, filename: string) => void,
    onClose: () => void,
  ) => {
    // A song composed in the app on Neo Geo voices is written by the module writer;
    // any other Furnace song is the imported module the WASM engine holds.
    let furBuffer: ArrayBuffer | Uint8Array;
    if (furnaceModuleAvailable) {
      const { exportFurnaceModuleFile } = await import('@lib/export/moduleExportService');
      const result = exportFurnaceModuleFile();
      furBuffer = result.bytes;
      result.warnings.forEach((w) => notify.warning(w));
    } else {
      furBuffer = await saveFurFileWasm();
    }
    const blob = new Blob([furBuffer as BlobPart], { type: 'application/octet-stream' });
    const filename = `${metadata.name || 'song'}.fur`;
    downloadFn(blob, filename);
    notify.success(`Furnace file "${filename}" exported successfully! (${furBuffer.byteLength} bytes)`);
    onClose();
  }, [metadata, furnaceModuleAvailable]);

  const handleExportFurText = useCallback(async (
    downloadFn: (blob: Blob, filename: string) => void,
    onClose: () => void,
  ) => {
    // A song composed in the app is written to a module first so the WASM engine holds it.
    if (furnaceModuleAvailable) {
      const { exportFurnaceModuleFile } = await import('@lib/export/moduleExportService');
      const result = exportFurnaceModuleFile();
      result.warnings.forEach((w) => notify.warning(w));
      await loadFurFileWasm(new Uint8Array(result.bytes).buffer);
    }
    const text = await saveFurTextWasm();
    const filename = `${metadata.name || 'song'}.txt`;
    downloadFn(new Blob([text], { type: 'text/plain' }), filename);
    notify.success(`Furnace text "${filename}" exported successfully! (${text.length} characters)`);
    onClose();
  }, [metadata, furnaceModuleAvailable]);

  const furnaceAyAvailable: Record<AyScrambleTarget, boolean> = {
    arcade: furnaceAyScrambleExportAvailable(instruments, 'arcade'),
    vectrex: furnaceAyScrambleExportAvailable(instruments, 'vectrex'),
    zx128: furnaceAyScrambleExportAvailable(instruments, 'zx128'),
    zxbeeper: furnaceAyScrambleExportAvailable(instruments, 'zxbeeper'),
  };
  const [ayTarget, setAyTarget] = useState<AyScrambleTarget>('arcade');
  const furnaceAyTempoWarning = ayScrambleTempoWarning(bpm, ayTarget);

  const handleExportFurAy = useCallback(async (
    downloadFn: (blob: Blob, filename: string) => void,
    onClose: () => void,
  ) => {
    const { exportFurnaceAyScrambleFile } = await import('@lib/export/moduleExportService');
    const result = exportFurnaceAyScrambleFile(ayTarget);
    result.warnings.forEach((w) => notify.warning(w));
    const blob = new Blob([result.bytes as BlobPart], { type: 'application/octet-stream' });
    const filename = `${metadata.name || 'song'}.fur`;
    downloadFn(blob, filename);
    notify.success(`Furnace file "${filename}" exported successfully! (${result.bytes.byteLength} bytes)`);
    onClose();
  }, [metadata, ayTarget]);

  const zxTapTempoWarning = ayScrambleTempoWarning(bpm, 'zx128');
  const [zxTapBusy, setZxTapBusy] = useState(false);

  const handleExportZxTap = useCallback(async (
    downloadFn: (blob: Blob, filename: string) => void,
    onClose: () => void,
  ) => {
    setZxTapBusy(true);
    try {
      const { recordZxTap } = await import('@lib/export/zx/zxTapCapture');
      const r = await recordZxTap((metadata.name || 'song').slice(0, 10));
      downloadFn(new Blob([r.tap as BlobPart], { type: 'application/octet-stream' }), `${metadata.name || 'song'}.tap`);
      notify.success(`ZX Spectrum 128 tape exported (${r.frames} frames, ${Math.round(r.seconds)} s, ${r.tap.byteLength} bytes).`);
      onClose();
    } catch (e) {
      notify.error(e instanceof Error ? e.message : 'ZX Spectrum tape export failed.');
    } finally {
      setZxTapBusy(false);
    }
  }, [metadata]);

  const vectrexCartTempoWarning = ayScrambleTempoWarning(bpm, 'vectrex');
  const [vectrexCartBusy, setVectrexCartBusy] = useState(false);

  const handleExportVectrexCart = useCallback(async (
    downloadFn: (blob: Blob, filename: string) => void,
    onClose: () => void,
  ) => {
    setVectrexCartBusy(true);
    try {
      const { recordVectrexCartridge } = await import('@lib/export/vectrex/vectrexCapture');
      const r = await recordVectrexCartridge((metadata.name || 'song').slice(0, 16), metadata.author && metadata.author !== 'Unknown' ? metadata.author : undefined);
      downloadFn(new Blob([r.bin as BlobPart], { type: 'application/octet-stream' }), `${metadata.name || 'song'}.bin`);
      notify.success(`Vectrex cartridge exported (${r.frames} frames, ${Math.round(r.seconds)} s, ${r.bin.byteLength} bytes).`);
      onClose();
    } catch (e) {
      notify.error(e instanceof Error ? e.message : 'Vectrex cartridge export failed.');
    } finally {
      setVectrexCartBusy(false);
    }
  }, [metadata]);

  // NES targets: custom mapper-31 cartridge or the original VRC6 board ('nesRom', chosen in nesRecord), and NSFe.
  const nesRomAvailable = nesRomExportAvailable(furnaceNative?.chipIds, furnaceNative?.chipFlags);
  const [nesRegion, setNesRegion] = useState<NesRegionChoice>('ntsc');
  const nesRomTempoWarning = nesTempoWarning(bpm, nesRegion === 'all' ? undefined : [nesRegion]);
  const [nesSubsongs, setNesSubsongs] = useState<'current' | 'all'>('current');
  const [nesRomBusy, setNesRomBusy] = useState(false);

  const exportNes = useCallback(async (
    format: 'nes' | 'nsfe',
    downloadFn: (blob: Blob, filename: string) => void,
    onClose: () => void,
  ) => {
    setNesRomBusy(true);
    try {
      const { recordNesRom } = await import('@lib/export/nes/nesRecord');
      const author = metadata.author && metadata.author !== 'Unknown' ? metadata.author : undefined;
      const r = await recordNesRom(nesRegion, metadata.name || 'song', author, metadata.description || undefined, format, nesSubsongs);
      const label = format === 'nsfe' ? 'NSFe' : 'NES ROM';
      downloadFn(new Blob([r.rom as BlobPart], { type: 'application/octet-stream' }), `${metadata.name || 'song'}.${format === 'nsfe' ? 'nsfe' : 'nes'}`);
      notify.success(`${label} exported (${r.rom.byteLength} bytes).`);
      r.warnings.forEach((w) => notify.warning(w));
      onClose();
    } catch (e) {
      notify.error(e instanceof Error ? e.message : 'NES export failed.');
    } finally {
      setNesRomBusy(false);
    }
  }, [metadata, nesRegion, nesSubsongs]);
  const handleExportNesRom = useCallback((d: (blob: Blob, filename: string) => void, c: () => void) => exportNes('nes', d, c), [exportNes]);
  const handleExportNsfe = useCallback((d: (blob: Blob, filename: string) => void, c: () => void) => exportNes('nsfe', d, c), [exportNes]);

  const [zxBeeperReport, setZxBeeperReport] = useState<{ warnings: string[]; seconds: number } | null>(null);

  // Preview: build the tape when the tile is selected so the dialog can list what is dropped.
  useEffect(() => {
    if (exportMode !== 'zxBeeperTap') return;
    let live = true;
    import('@lib/export/moduleExportService')
      .then((m) => m.exportZxBeeperTapFile())
      .then((r) => { if (live) setZxBeeperReport({ warnings: r.warnings, seconds: r.seconds }); })
      .catch((e) => { if (live) setZxBeeperReport({ warnings: [e instanceof Error ? e.message : 'The song cannot be exported.'], seconds: 0 }); });
    return () => { live = false; };
  }, [exportMode]);

  const handleExportZxBeeperTap = useCallback(async (
    downloadFn: (blob: Blob, filename: string) => void,
    onClose: () => void,
  ) => {
    try {
      const { exportZxBeeperTapFile } = await import('@lib/export/moduleExportService');
      const r = await exportZxBeeperTapFile((metadata.name || 'song').slice(0, 10));
      downloadFn(new Blob([r.tap as BlobPart], { type: 'application/octet-stream' }), `${metadata.name || 'song'}.tap`);
      notify.success(`ZX Spectrum beeper tape exported (${r.rows} rows, ${Math.round(r.seconds)} s, ${r.tap.byteLength} bytes).`);
      onClose();
    } catch (e) {
      notify.error(e instanceof Error ? e.message : 'ZX Spectrum beeper tape export failed.');
    }
  }, [metadata]);

  const tadAvailable = (furnaceNative?.chipIds ?? []).includes(FURNACE_SNES_CHIP_ID);
  const [tadReport, setTadReport] = useState<{ warnings: string[]; ram: string; rows: { id: string; label: string; bytes: number }[] } | null>(null);

  const handleExportTad = useCallback(async (
    downloadFn: (blob: Blob, filename: string) => void,
    onClose: () => void,
  ) => {
    const { exportTadProjectFile } = await import('@lib/export/moduleExportService');
    const result = await exportTadProjectFile();
    const ram = result.ram ? `Common ${result.ram.common} bytes; ${result.ram.songs.map((s) => `${s.name} ${s.bytes} bytes`).join('; ')}` : 'not measured';
    const { tadAudioRamBudget, tadAudioRamWarning } = await import('@lib/export/tad/tadAudioRam');
    const budget = result.audioRam ? tadAudioRamBudget(result.audioRam) : null;
    setTadReport({ warnings: result.warnings, ram, rows: budget?.rows ?? [] });
    const over = budget && tadAudioRamWarning(budget);
    if (over) notify.warning(over);
    downloadFn(new Blob([result.zip as BlobPart], { type: 'application/zip' }), `${metadata.name || 'song'}-tad.zip`);
    // One toast, not one per warning: the full list is in the zip's README.txt (and the dialog on failure).
    if (result.warnings.length) notify.warning(`${result.warnings.length} export warnings (dropped macros/effects). Full list in README.txt in the zip.`);
    if (result.ok) { notify.success(`Terrific Audio Driver project exported (${result.songs.length} songs, ${result.soundEffects.length} sound effects).`); onClose(); }
    else notify.error('The TAD compiler rejected the project. The zip holds the project and compiler log only.');
  }, [metadata]);

  // ── Shared handler: export nano ─────────────────────────────────────────────

  const handleExportNano = useCallback((
    downloadFn: (blob: Blob, filename: string) => void,
    onClose: () => void,
  ) => {
    const refusal = lowOctaveExportRefusal(patterns, 'Nano');
    if (refusal) throw new Error(refusal);
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
    const result = await runNativeExport();

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
  }, [runNativeExport]);

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
            const [{ openSavedSong }, { savedSongToApply }] = await Promise.all([
              import('@/lib/song/openSong'),
              import('@/lib/song/savedSong'),
            ]);
            await openSavedSong({ name: data.metadata.name, source: 'project', song: () => savedSongToApply(data) });
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
    handleExportFurText,
    furnaceModuleAvailable,
    handleExportFurAy,
    handleExportZxTap,
    zxTapTempoWarning,
    zxTapBusy,
    handleExportVectrexCart,
    vectrexCartTempoWarning,
    vectrexCartBusy,
    handleExportNesRom,
    handleExportNsfe,
    nesRomAvailable,
    nesRegion,
    setNesRegion,
    nesSubsongs,
    setNesSubsongs,
    nesSubsongCount: furnaceSubsongs?.length ?? 1,
    nesRomTempoWarning,
    nesRomBusy,
    handleExportZxBeeperTap,
    zxBeeperReport,
    handleExportTad,
    tadAvailable,
    tadReport,
    furnaceAyAvailable,
    furnaceAyTempoWarning,
    ayTarget, setAyTarget,
    handleExportNano,
    handleExportNative,
    nativeAvailable,
    handleImportFile,
  };
}
