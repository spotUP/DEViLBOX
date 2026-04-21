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
    const { getTrackerReplayer } = await import('@engine/TrackerReplayer');
    const song = getTrackerReplayer().getSong();
    if (!song) { notify.error('No song loaded'); return; }

    const format = song.format;
    const layoutFmtId = song.uadePatternLayout?.formatId || song.uadeVariableLayout?.formatId || '';
    let result: { data: Blob; filename: string; warnings: string[] } | null = null;
    const baseName = (song.name || 'untitled').replace(/[^a-zA-Z0-9_-]/g, '_');
    const blobType = 'application/octet-stream';

    if (format === 'JamCracker' as string) {
      const { exportAsJamCracker } = await import('@lib/export/JamCrackerExporter');
      result = await exportAsJamCracker(song);
    } else if (format === ('SMON' as string)) {
      const { exportAsSoundMon } = await import('@lib/export/SoundMonExporter');
      result = await exportAsSoundMon(song);
    } else if (format === 'MOD' && !layoutFmtId) {
      const { exportSongToMOD } = await import('@lib/export/modExport');
      const modResult = await exportSongToMOD(song, { bakeSynths: true });
      result = { data: modResult.blob, filename: modResult.filename, warnings: modResult.warnings };
    } else if (format === 'FC' as string) {
      const { exportFC } = await import('@lib/export/FCExporter');
      const buf = exportFC(song);
      result = { data: new Blob([buf], { type: blobType }), filename: `${baseName}.fc`, warnings: [] };
    } else if (format === 'SidMon2' as string) {
      const { exportSidMon2File } = await import('@lib/export/SidMon2Exporter');
      const buf = await exportSidMon2File(song);
      result = { data: new Blob([buf], { type: blobType }), filename: `${baseName}.sd2`, warnings: [] };
    } else if (format === 'PumaTracker' as string) {
      const { exportPumaTrackerFile } = await import('@lib/export/PumaTrackerExporter');
      const buf = exportPumaTrackerFile(song);
      result = { data: new Blob([buf as unknown as Uint8Array<ArrayBuffer>], { type: blobType }), filename: `${baseName}.puma`, warnings: [] };
    } else if (format === 'OctaMED' as string) {
      const { exportMED } = await import('@lib/export/MEDExporter');
      const buf = exportMED(song);
      result = { data: new Blob([buf], { type: blobType }), filename: `${baseName}.mmd0`, warnings: [] };
    } else if (format === 'HVL' as string || format === 'AHX' as string || layoutFmtId === 'hivelyHVL' || layoutFmtId === 'hivelyAHX') {
      const { exportAsHively } = await import('@lib/export/HivelyExporter');
      const hvlFmt = (format === 'AHX' || layoutFmtId === 'hivelyAHX') ? 'ahx' : 'hvl';
      result = exportAsHively(song, { format: hvlFmt, nativeOverride: useFormatStore.getState().hivelyNative });
    } else if (format === 'DIGI' as string || layoutFmtId === 'digiBooster') {
      const { exportDigiBooster } = await import('@lib/export/DigiBoosterExporter');
      const buf = exportDigiBooster(song);
      result = { data: new Blob([new Uint8Array(buf)], { type: blobType }), filename: `${baseName}.dbm`, warnings: [] };
    } else if (format === 'OKT' as string || layoutFmtId === 'oktalyzer') {
      const { exportOktalyzer } = await import('@lib/export/OktalyzerExporter');
      const buf = exportOktalyzer(song);
      result = { data: new Blob([new Uint8Array(buf)], { type: blobType }), filename: `${baseName}.okt`, warnings: [] };
    } else if (format === 'KT' as string || layoutFmtId === 'klystrack') {
      const { exportAsKlystrack } = await import('@lib/export/KlysExporter');
      result = await exportAsKlystrack(song);
    } else if (layoutFmtId === 'musicLine') {
      const { exportMusicLineFile } = await import('@lib/export/MusicLineExporter');
      const buf = exportMusicLineFile(song);
      result = { data: new Blob([new Uint8Array(buf)], { type: blobType }), filename: `${baseName}.ml`, warnings: [] };
    } else if (layoutFmtId === 'musicAssembler') {
      const { exportAsMusicAssembler } = await import('@lib/export/MusicAssemblerExporter');
      result = await exportAsMusicAssembler(song);
    } else if (layoutFmtId === 'futurePlayer') {
      const { exportAsFuturePlayer } = await import('@lib/export/FuturePlayerExporter');
      result = await exportAsFuturePlayer(song);
    } else if (layoutFmtId === 'digitalSymphony') {
      const { exportDigitalSymphony } = await import('@lib/export/DigitalSymphonyExporter');
      const buf = exportDigitalSymphony(song);
      result = { data: new Blob([new Uint8Array(buf)], { type: blobType }), filename: `${baseName}.dsym`, warnings: [] };
    } else if (layoutFmtId === 'amosMusicBank') {
      const { exportAMOSMusicBank } = await import('@lib/export/AMOSMusicBankExporter');
      const buf = exportAMOSMusicBank(song);
      result = { data: new Blob([new Uint8Array(buf)], { type: blobType }), filename: `${baseName}.abk`, warnings: [] };
    } else if (layoutFmtId === 'hippelCoSo') {
      const { exportAsHippelCoSo } = await import('@lib/export/HippelCoSoExporter');
      result = await exportAsHippelCoSo(song);
    } else if (layoutFmtId === 'symphoniePro' || song.symphonieFileData) {
      const { exportSymphonieProFile } = await import('@lib/export/SymphonieProExporter');
      const buf = exportSymphonieProFile(song);
      result = { data: new Blob([new Uint8Array(buf)], { type: blobType }), filename: `${baseName}.symmod`, warnings: [] };
    } else if (format === 'IS10' as string || layoutFmtId === 'inStereo1') {
      const { exportInStereo1 } = await import('@lib/export/InStereo1Exporter');
      result = await exportInStereo1(song);
    } else if (layoutFmtId === 'inStereo2') {
      const { exportInStereo2 } = await import('@lib/export/InStereo2Exporter');
      result = await exportInStereo2(song);
    } else if (layoutFmtId === 'deltaMusic1') {
      const { exportDeltaMusic1 } = await import('@lib/export/DeltaMusic1Exporter');
      result = await exportDeltaMusic1(song);
    } else if (layoutFmtId === 'deltaMusic2') {
      const { exportDeltaMusic2 } = await import('@lib/export/DeltaMusic2Exporter');
      result = await exportDeltaMusic2(song);
    } else if (layoutFmtId === 'digitalMugician') {
      const { exportDigitalMugician } = await import('@lib/export/DigitalMugicianExporter');
      result = await exportDigitalMugician(song);
    } else if (layoutFmtId === 'sidmon1') {
      const { exportSidMon1 } = await import('@lib/export/SidMon1Exporter');
      result = await exportSidMon1(song);
    } else if (layoutFmtId === 'sonicArranger') {
      const { exportSonicArranger } = await import('@lib/export/SonicArrangerExporter');
      result = await exportSonicArranger(song);
    } else if (layoutFmtId === 'tfmx') {
      const { exportTFMX } = await import('@lib/export/TFMXExporter');
      result = await exportTFMX(song);
    } else if (layoutFmtId === 'fredEditor') {
      const { exportFredEditor } = await import('@lib/export/FredEditorExporter');
      result = await exportFredEditor(song);
    } else if (layoutFmtId === 'soundfx') {
      const { exportSoundFX } = await import('@lib/export/SoundFXExporter');
      result = await exportSoundFX(song);
    } else if (layoutFmtId === 'tcbTracker') {
      const { exportTCBTracker } = await import('@lib/export/TCBTrackerExporter');
      result = await exportTCBTracker(song);
    } else if (layoutFmtId === 'gameMusicCreator') {
      const { exportGameMusicCreator } = await import('@lib/export/GameMusicCreatorExporter');
      result = await exportGameMusicCreator(song);
    } else if (layoutFmtId === 'quadraComposer') {
      const { exportQuadraComposer } = await import('@lib/export/QuadraComposerExporter');
      result = await exportQuadraComposer(song);
    } else if (layoutFmtId === 'activisionPro') {
      const { exportActivisionPro } = await import('@lib/export/ActivisionProExporter');
      result = await exportActivisionPro(song);
    } else if (layoutFmtId === 'digiBoosterPro') {
      const { exportDigiBoosterPro } = await import('@lib/export/DigiBoosterProExporter');
      result = await exportDigiBoosterPro(song);
    } else if (layoutFmtId === 'faceTheMusic') {
      const { exportFaceTheMusic } = await import('@lib/export/FaceTheMusicExporter');
      result = await exportFaceTheMusic(song);
    } else if (layoutFmtId === 'sawteeth') {
      const { exportSawteeth } = await import('@lib/export/SawteethExporter');
      result = await exportSawteeth(song);
    } else if (layoutFmtId === 'earAche') {
      const { exportEarAche } = await import('@lib/export/EarAcheExporter');
      result = await exportEarAche(song);
    } else if (layoutFmtId === 'iffSmus') {
      const { exportIffSmus } = await import('@lib/export/IffSmusExporter');
      result = await exportIffSmus(song);
    } else if (layoutFmtId === 'actionamics') {
      const { exportActionamics } = await import('@lib/export/ActionamicsExporter');
      result = await exportActionamics(song);
    } else if (layoutFmtId === 'soundFactory') {
      const { exportSoundFactory } = await import('@lib/export/SoundFactoryExporter');
      result = await exportSoundFactory(song);
    } else if (layoutFmtId === 'synthesis') {
      const { exportSynthesis } = await import('@lib/export/SynthesisExporter');
      result = await exportSynthesis(song);
    } else if (layoutFmtId === 'soundControl') {
      const { exportSoundControl } = await import('@lib/export/SoundControlExporter');
      result = await exportSoundControl(song);
    } else if (layoutFmtId === 'c67') {
      const { exportCDFM67 } = await import('@lib/export/CDFM67Exporter');
      result = await exportCDFM67(song);
    } else if (layoutFmtId === 'zoundMonitor') {
      const { exportZoundMonitor } = await import('@lib/export/ZoundMonitorExporter');
      result = await exportZoundMonitor(song);
    } else if (layoutFmtId === 'chuckBiscuits') {
      const { exportChuckBiscuits } = await import('@lib/export/ChuckBiscuitsExporter');
      result = await exportChuckBiscuits(song);
    } else if (layoutFmtId === 'composer667') {
      const { exportComposer667 } = await import('@lib/export/Composer667Exporter');
      result = await exportComposer667(song);
    } else if (layoutFmtId === 'kris') {
      const { exportKRIS } = await import('@lib/export/KRISExporter');
      result = await exportKRIS(song);
    } else if (layoutFmtId === 'nru') {
      const { exportNRU } = await import('@lib/export/NRUExporter');
      result = await exportNRU(song);
    } else if (layoutFmtId === 'ims') {
      const { exportIMS } = await import('@lib/export/IMSExporter');
      result = await exportIMS(song);
    } else if (layoutFmtId === 'stp') {
      const { exportSTP } = await import('@lib/export/STPExporter');
      result = await exportSTP(song);
    } else if (layoutFmtId === 'unic') {
      const { exportUNIC } = await import('@lib/export/UNICExporter');
      result = await exportUNIC(song);
    } else if (layoutFmtId === 'dsm_dyn') {
      const { exportDSMDyn } = await import('@lib/export/DSMDynExporter');
      result = await exportDSMDyn(song);
    } else if (layoutFmtId === 'scumm') {
      const { exportSCUMM } = await import('@lib/export/SCUMMExporter');
      result = await exportSCUMM(song);
    } else if (layoutFmtId === 'xmf') {
      const { exportXMF } = await import('@lib/export/XMFExporter');
      result = await exportXMF(song);
    } else if (format === 'AdPlug' as string) {
      const { exportAdPlug } = await import('@lib/export/AdPlugExporter');
      result = exportAdPlug(song, 'rad');
    }

    // Fallback: UADE chip RAM readback (works for any running UADE format)
    if (!result) {
      try {
        const { UADEChipEditor } = await import('@engine/uade/UADEChipEditor');
        const { UADEEngine } = await import('@engine/uade/UADEEngine');
        if (UADEEngine.hasInstance()) {
          const chipEditor = new UADEChipEditor(UADEEngine.getInstance());
          // Try uadeEditableFileData first, then fall back to chipRamInfo
          const fmtUadeData = useFormatStore.getState().uadeEditableFileData;
          const fmtUadeFileName = useFormatStore.getState().uadeEditableFileName;
          let moduleSize = fmtUadeData?.byteLength ?? 0;
          if (moduleSize === 0) {
            const songInstruments = song.instruments || [];
            const chipInfo = songInstruments.find(i => i.uadeChipRam)?.uadeChipRam;
            moduleSize = chipInfo?.moduleSize ?? 0;
          }
          if (moduleSize > 0) {
            const bytes = await chipEditor.readEditedModule(moduleSize);
            const ext = (fmtUadeFileName || song.name || '').split('.').pop() || 'bin';
            const fname = `${baseName}.${ext}`;
            result = {
              data: new Blob([new Uint8Array(bytes.buffer as ArrayBuffer, bytes.byteOffset, bytes.byteLength)], { type: blobType }),
              filename: fname,
              warnings: ['Exported via chip RAM readback — edits to pattern data are included'],
            };
          }
        }
      } catch { /* UADE engine not running */ }
    }

    if (result) {
      downloadFn(result.data, result.filename);
      if (result.warnings.length > 0) {
        notify.warning(`Exported with warnings: ${result.warnings.join('; ')}`);
      } else {
        notify.success(`Native format exported: ${result.filename}`);
      }
    } else {
      notify.error('No native exporter available for this format');
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
