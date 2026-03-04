/**
 * PixiExportDialog — GL-native version of the DOM ExportDialog.
 *
 * Provides export for Song, SFX, Instrument, Audio, MIDI, XM, MOD, Chip, and Nano
 * formats using PixiJS layout components.  Import is handled via a file picker.
 *
 * DOM reference: src/lib/export/ExportDialog.tsx
 */

import React, { useState, useCallback, useEffect, useMemo, useRef } from 'react';
import {
  PixiModal,
  PixiModalHeader,
  PixiModalFooter,
  PixiButton,
  PixiLabel,
  PixiCheckbox,
  PixiNumericInput,
} from '../components';
import { PixiSelect, type SelectOption } from '../components/PixiSelect';
import { PixiPureTextInput } from '../input/PixiPureTextInput';
import { usePixiTheme } from '../theme';
import { downloadFile } from '../services/glFileDownload';
import { pickFile } from '../services/glFilePicker';

import {
  useTrackerStore,
  useInstrumentStore,
  useProjectStore,
  useTransportStore,
  useAutomationStore,
  useAudioStore,
  notify,
} from '@stores';
import { useUIStore } from '@stores/useUIStore';
import { useArrangementStore } from '@stores/useArrangementStore';
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
import type { AutomationCurve } from '@typedefs/automation';

// ── Types ──────────────────────────────────────────────────────────────────────

type ExportMode = 'song' | 'sfx' | 'instrument' | 'audio' | 'midi' | 'xm' | 'mod' | 'chip' | 'nano';
type DialogMode = 'export' | 'import';

interface PixiExportDialogProps {
  isOpen: boolean;
  onClose: () => void;
}

// ── Constants ──────────────────────────────────────────────────────────────────

const MODAL_W = 560;
const MODAL_H = 520;
const CONTENT_W = MODAL_W - 26;

const MODE_OPTIONS: SelectOption[] = [
  { value: 'song', label: 'Song (.dbx)' },
  { value: 'sfx', label: 'SFX (.sfx.json)' },
  { value: 'instrument', label: 'Instrument (.dbi)' },
  { value: 'audio', label: 'Audio (.wav)' },
  { value: 'midi', label: 'MIDI (.mid)' },
  { value: 'xm', label: 'XM Module (.xm)' },
  { value: 'mod', label: 'MOD Module (.mod)' },
  { value: 'chip', label: 'Chip (.vgm/.nsf/...)' },
  { value: 'nano', label: 'Nano Binary (.dbn)' },
];

const FORMAT_EXTENSIONS: Record<ExportMode, string> = {
  song: '.dbx',
  sfx: '.sfx.json',
  instrument: '.dbi',
  audio: '.wav',
  midi: '.mid',
  xm: '.xm',
  mod: '.mod',
  chip: '.vgm',
  nano: '.dbn',
};


const CHIP_FORMAT_DESCRIPTIONS: Record<string, string> = {
  vgm: 'Video Game Music — multi-chip, custom loop support',
  gym: 'Genesis YM2612 — Sega Genesis/Mega Drive audio',
  nsf: 'NES Sound Format — Nintendo 8-bit audio',
  gbs: 'Game Boy Sound — original Game Boy audio',
  spc: 'SPC700 — Super Nintendo audio processor',
  zsm: 'ZSM — Commander X16 audio',
  sap: 'SAP — Atari 8-bit POKEY audio',
  tiuna: 'TIAUna — Atari 2600 TIA audio',
};

const CHIP_FORMATS = [
  { id: 'vgm', label: 'VGM', loop: 'custom' as const, ext: '.vgm' },
  { id: 'gym', label: 'GYM', loop: 'none' as const, ext: '.gym' },
  { id: 'nsf', label: 'NSF', loop: 'auto' as const, ext: '.nsf' },
  { id: 'gbs', label: 'GBS', loop: 'auto' as const, ext: '.gbs' },
  { id: 'spc', label: 'SPC', loop: 'none' as const, ext: '.spc' },
  { id: 'zsm', label: 'ZSM', loop: 'none' as const, ext: '.zsm' },
];

const getLoopInfo = (chipFormat: string, chipLoopRow: number) => {
  if (chipFormat === 'vgm') {
    return chipLoopRow > 0
      ? { text: `Loop point at row ${chipLoopRow} will be used`, color: 0x44cc44 }
      : { text: 'Set loop point above for custom loop', color: 0x888888 };
  }
  if (['nsf', 'gbs'].includes(chipFormat)) {
    return { text: `${chipFormat.toUpperCase()} loops entire song automatically`, color: 0xddaa00 };
  }
  return { text: `${chipFormat.toUpperCase()} does not support loop points`, color: 0xff6644 };
};

// ── Component ──────────────────────────────────────────────────────────────────

export const PixiExportDialog: React.FC<PixiExportDialogProps> = ({ isOpen, onClose }) => {
  const theme = usePixiTheme();

  // ── Store hooks ────────────────────────────────────────────────────────────
  const { patterns, currentPatternIndex, originalModuleData, importPattern, setCurrentPattern, loadPatterns } = useTrackerStore();
  const { instruments, currentInstrumentId, addInstrument, setCurrentInstrument, loadInstruments } = useInstrumentStore();
  const { metadata, setMetadata } = useProjectStore();
  const { bpm, setBPM, isPlaying, stop, currentRow } = useTransportStore();
  const { curves, loadCurves } = useAutomationStore();
  const { masterEffects, setMasterEffects } = useAudioStore();
  const modalData = useUIStore((s) => s.modalData);
  const arrangementClips = useArrangementStore(s => s.clips);

  // ── Local state ────────────────────────────────────────────────────────────
  const [dialogMode, setDialogMode] = useState<DialogMode>('export');
  const [exportMode, setExportMode] = useState<ExportMode>('song');
  const [options, setOptions] = useState<ExportOptions>({
    includeAutomation: true,
    compress: false,
    prettify: true,
  });
  const [sfxName] = useState('MySound');
  const [selectedPatternIndex, setSelectedPatternIndex] = useState(currentPatternIndex);
  const [selectedInstrumentId, setSelectedInstrumentId] = useState(currentInstrumentId || 0);
  const [isRendering, setIsRendering] = useState(false);
  const [renderProgress, setRenderProgress] = useState(0);

  // Audio export state
  const [audioScope, setAudioScope] = useState<'pattern' | 'song' | 'arrangement'>('song');

  // MIDI export state
  const [midiScope, setMidiScope] = useState<'pattern' | 'song'>('song');
  const [midiFormat, setMidiFormat] = useState<0 | 1>(1);
  const [midiIncludeAutomation, setMidiIncludeAutomation] = useState(true);

  // XM export state
  const [xmChannels, setXmChannels] = useState(Math.min(32, patterns[0]?.channels?.length ?? 8));
  const [bakeSynths, setBakeSynths] = useState(true);

  // MOD export state
  const [modChannels, setModChannels] = useState<4 | 6 | 8>(4);

  // Chip export state
  const [chipFormat, setChipFormat] = useState('vgm');
  const [chipTitle, setChipTitle] = useState(metadata.name || '');
  const [chipAuthor, setChipAuthor] = useState(metadata.author || '');
  const [chipIsRecording, setChipIsRecording] = useState(false);
  const chipLogDataRef = useRef<Uint8Array | null>(null);
  const chipSessionRef = useRef<any>(null);

  // XM/MOD export warnings
  const [exportWarnings, setExportWarnings] = useState<string[]>([]);

  // Chip extended state
  const [chipRecordingTime, setChipRecordingTime] = useState(0);
  const [chipLoopPoint, setChipLoopPoint] = useState(0);
  const [, setChipWrites] = useState<any[]>([]);
  const [chipStats, setChipStats] = useState<{ duration: number; totalWrites: number; usedChips: { name: string; writes: number; type: number }[] } | null>(null);
  const [, setAvailableChipFormats] = useState<string[]>([]);

  // Auto-select audio scope when opened from arrangement toolbar
  useEffect(() => {
    if (isOpen && modalData?.audioScope === 'arrangement') {
      setExportMode('audio');
    }
  }, [isOpen, modalData]);

  // Chip recording timer
  useEffect(() => {
    if (!chipIsRecording) return;
    const interval = setInterval(() => setChipRecordingTime(t => t + 0.1), 100);
    return () => clearInterval(interval);
  }, [chipIsRecording]);

  // Clear export warnings when export mode changes
  useEffect(() => {
    setExportWarnings([]);
  }, [exportMode]);

  // ── Derived data ───────────────────────────────────────────────────────────
  const patternOptions: SelectOption[] = useMemo(
    () => patterns.map((p, i) => ({ value: String(i), label: `${String(i).padStart(2, '0')} - ${p.name}` })),
    [patterns],
  );

  const instrumentOptions: SelectOption[] = useMemo(
    () => instruments.map((inst) => ({
      value: String(inst.id),
      label: `${inst.id.toString(16).toUpperCase().padStart(2, '0')} - ${inst.name}`,
    })),
    [instruments],
  );

  const nanoUsedInstruments = useMemo(() => {
    const used = new Set<number>();
    patterns.forEach((pat) =>
      pat.channels.forEach((ch) =>
        ch.rows.forEach((cell) => { if (cell.instrument > 0) used.add(cell.instrument); }),
      ),
    );
    return used.size;
  }, [patterns]);

  // ── Chip recording handler ──────────────────────────────────────────────
  const handleChipRecord = useCallback(async () => {
    if (chipIsRecording) {
      if (chipSessionRef.current) {
        const logData = await chipSessionRef.current.stopRecording();
        chipLogDataRef.current = logData;
        setChipIsRecording(false);
        setChipRecordingTime(0);
        // Parse writes and detect available formats
        if (logData.length > 0) {
          const { parseRegisterLog, getAvailableFormats, getLogStatistics } = await import('@lib/export/ChipExporter');
          const writes = parseRegisterLog(logData);
          setChipWrites(writes);
          const stats = getLogStatistics(writes);
          setChipStats(stats);
          const formats = getAvailableFormats(writes);
          setAvailableChipFormats(formats.map(String));
          if (formats.length > 0 && !formats.includes(chipFormat as any)) {
            setChipFormat(formats[0]);
          }
        }
      }
    } else {
      const { ChipRecordingSession } = await import('@lib/export/ChipExporter');
      chipSessionRef.current = new ChipRecordingSession();
      chipSessionRef.current.startRecording();
      chipLogDataRef.current = null;
      setChipIsRecording(true);
      setChipRecordingTime(0);
      setChipWrites([]);
      setChipStats(null);
      setAvailableChipFormats([]);
    }
  }, [chipIsRecording, chipFormat]);

  // ── Export handler ─────────────────────────────────────────────────────────
  const handleExport = useCallback(async () => {
    try {
      switch (exportMode) {
        case 'song': {
          const sequence = patterns.map((p) => p.id);
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
          exportSong(metadata, bpm, instruments, patterns, sequence, automationData, masterEffects, curves, options);
          onClose();
          break;
        }

        case 'sfx': {
          const pattern = patterns[selectedPatternIndex];
          const instrument = instruments.find((i) => i.id === selectedInstrumentId);
          if (!pattern || !instrument) { notify.warning('Please select a valid pattern and instrument'); return; }
          exportSFX(sfxName, instrument, pattern, bpm, options);
          onClose();
          break;
        }

        case 'instrument': {
          const instrument = instruments.find((i) => i.id === selectedInstrumentId);
          if (!instrument) { notify.warning('Please select a valid instrument'); return; }
          exportInstrument(instrument, options);
          onClose();
          break;
        }

        case 'nano': {
          const sequence = patterns.map((_, idx) => idx);
          const nanoData = NanoExporter.export(instruments, patterns, sequence, bpm, 6);
          const blob = new Blob([new Uint8Array(nanoData)], { type: 'application/octet-stream' });
          downloadFile(blob, `${metadata.name || 'song'}.dbn`);
          notify.success(`Nano binary exported! (${nanoData.length} bytes)`);
          onClose();
          break;
        }

        case 'audio': {
          const { exportPatternAsWav, exportSongAsWav, getUADEInstrument, exportUADEAsWav } = await import('@lib/export/audioExport');
          setIsRendering(true);
          try {
            // Check UADE instrument first (matches DOM AudioExportPanel logic)
            const uadeInst = getUADEInstrument(instruments);
            if (uadeInst && (uadeInst as any).uade?.fileData) {
              await exportUADEAsWav(
                (uadeInst as any).uade.fileData,
                (uadeInst as any).uade.filename || 'song',
                `${metadata.name || 'song'}.wav`,
                (uadeInst as any).uade.currentSubsong ?? 0,
                (p: number) => setRenderProgress(p),
              );
            } else if (originalModuleData?.base64) {
              const binaryStr = atob(originalModuleData.base64);
              const bytes = new Uint8Array(binaryStr.length);
              for (let i = 0; i < binaryStr.length; i++) bytes[i] = binaryStr.charCodeAt(i);
              const sourceFilename = originalModuleData.sourceFile || `module.${originalModuleData.format.toLowerCase()}`;
              await exportUADEAsWav(
                bytes.buffer,
                sourceFilename,
                `${metadata.name || 'song'}.wav`,
                0,
                (p: number) => setRenderProgress(p),
              );
            } else if (audioScope === 'arrangement') {
              const clips = useArrangementStore.getState?.()?.clips ?? [];
              if (clips.length > 0) {
                const patternIdToIndex = new Map(patterns.map((p, i) => [p.id, i]));
                const sequence = clips
                  .filter((c: any) => !c.muted)
                  .sort((a: any, b: any) => a.startRow - b.startRow)
                  .map((c: any) => patternIdToIndex.get(c.patternId) ?? 0);
                if (sequence.length === 0) {
                  notify.warning('No unmuted clips in arrangement to export');
                  break;
                }
                await exportSongAsWav(patterns, sequence, instruments, bpm, metadata.name || 'arrangement', (p: number) => setRenderProgress(p));
              } else {
                notify.warning('No clips in arrangement to export');
                break;
              }
            } else if (audioScope === 'song') {
              const sequence = patterns.map((_: any, i: number) => i);
              await exportSongAsWav(patterns, sequence, instruments, bpm, metadata.name || 'song', (p: number) => setRenderProgress(p));
            } else {
              const pattern = patterns[selectedPatternIndex];
              if (!pattern) { notify.warning('Please select a valid pattern'); break; }
              await exportPatternAsWav(pattern, instruments, bpm, `${metadata.name || 'pattern'}_${selectedPatternIndex}`, (p: number) => setRenderProgress(p));
            }
            notify.success('Audio exported!');
            onClose();
          } finally {
            setIsRendering(false);
            setRenderProgress(0);
          }
          break;
        }

        case 'midi': {
          const { exportPatternToMIDI, exportSongToMIDI } = await import('@lib/export/midiExport');
          const midiOptions = { format: midiFormat as 0 | 1, ppq: 480, includeAutomation: midiIncludeAutomation, velocityScale: 1.0, excludeMutedChannels: true };
          const timeSignature: [number, number] = [4, 4];
          let midiData: Uint8Array;
          if (midiScope === 'song') {
            const sequence = patterns.map((p) => p.id);
            midiData = exportSongToMIDI(patterns, sequence, bpm, timeSignature, curves, midiOptions);
          } else {
            midiData = exportPatternToMIDI(patterns[selectedPatternIndex], bpm, timeSignature, midiOptions);
          }
          downloadFile(new Blob([midiData.slice(0)], { type: 'audio/midi' }), `${metadata.name || 'song'}.mid`);
          notify.success('MIDI exported!');
          onClose();
          break;
        }

        case 'xm': {
          const { exportAsXM } = await import('@lib/export/XMExporter');
          const result = await exportAsXM(patterns, instruments, { channelLimit: xmChannels, bakeSynthsToSamples: bakeSynths, moduleName: metadata.name || 'song' });
          downloadFile(result.data, result.filename || `${metadata.name || 'song'}.xm`);
          if (result.warnings?.length) {
            setExportWarnings(result.warnings);
            notify.warning(`XM exported with ${result.warnings.length} warnings`);
          } else {
            notify.success('XM module exported!');
            onClose();
          }
          break;
        }

        case 'mod': {
          const { exportAsMOD } = await import('@lib/export/MODExporter');
          const result = await exportAsMOD(patterns, instruments, { channelCount: modChannels, bakeSynthsToSamples: bakeSynths, moduleName: metadata.name || 'song' });
          downloadFile(result.data, result.filename || `${metadata.name || 'song'}.mod`);
          if (result.warnings?.length) {
            setExportWarnings(result.warnings);
            notify.warning(`MOD exported with ${result.warnings.length} warnings`);
          } else {
            notify.success('MOD module exported!');
            onClose();
          }
          break;
        }

        case 'chip': {
          const { exportChipMusic } = await import('@lib/export/ChipExporter');
          const chipLogData = chipLogDataRef.current;
          if (!chipLogData) { notify.warning('No chip data recorded. Press Record and play your song first.'); break; }
          const rowsPerBeat = 4;
          const beatsPerSecond = bpm / 60;
          const secondsPerRow = 1 / (beatsPerSecond * rowsPerBeat);
          const loopPointSamples = chipLoopPoint > 0 ? Math.floor(chipLoopPoint * secondsPerRow * 44100) : undefined;
          const chipResult = await exportChipMusic(chipLogData, { format: chipFormat as any, title: chipTitle || metadata.name || 'Untitled', author: chipAuthor || metadata.author || 'Unknown', loopPoint: loopPointSamples });
          downloadFile(chipResult.data, chipResult.filename || `${metadata.name || 'song'}.${chipFormat}`);
          notify.success(`${chipFormat.toUpperCase()} chip music exported!`);
          onClose();
          break;
        }

        default:
          break;
      }
    } catch (error) {
      console.error('Export failed:', error);
      notify.error('Export failed: ' + (error as Error).message);
    }
  }, [exportMode, patterns, instruments, metadata, bpm, curves, masterEffects, options,
      selectedPatternIndex, selectedInstrumentId, sfxName, onClose, originalModuleData,
      audioScope, midiScope, midiFormat, midiIncludeAutomation,
      xmChannels, bakeSynths, modChannels, chipFormat, chipTitle, chipAuthor, chipLoopPoint]);

  // ── Import handler ─────────────────────────────────────────────────────────
  const handleImport = useCallback(async () => {
    const file = await pickFile({ accept: '.json,.dbx,.dbi,.sfx.json' });
    if (!file) return;

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
  }, [isPlaying, stop, onClose, setMetadata, setBPM, loadPatterns, loadInstruments,
      loadCurves, setMasterEffects, importPattern, addInstrument, setCurrentPattern, setCurrentInstrument]);

  // ── Render ─────────────────────────────────────────────────────────────────
  return (
    <PixiModal isOpen={isOpen} onClose={onClose} width={MODAL_W} height={MODAL_H}>
      <PixiModalHeader title="Export / Import" width={MODAL_W} onClose={onClose} />

      {/* ── Mode toggle tabs ──────────────────────────────────────────────── */}
      <layoutContainer
        layout={{
          width: MODAL_W,
          height: 32,
          flexDirection: 'row',
          borderBottomWidth: 1,
          borderColor: theme.border.color,
        }}
      >
        <layoutContainer
          layout={{
            flex: 1,
            alignItems: 'center',
            justifyContent: 'center',
            backgroundColor: dialogMode === 'export' ? theme.accent.color : theme.bgSecondary.color,
            borderRightWidth: 1,
            borderColor: theme.border.color,
          }}
          eventMode="static"
          cursor="pointer"
          onPointerUp={() => setDialogMode('export')}
          onClick={() => setDialogMode('export')}
        >
          <PixiLabel
            text="Export"
            size="sm"
            weight="bold"
            color={dialogMode === 'export' ? 'custom' : 'textSecondary'}
            customColor={dialogMode === 'export' ? 0x000000 : undefined}
          />
        </layoutContainer>
        <layoutContainer
          layout={{
            flex: 1,
            alignItems: 'center',
            justifyContent: 'center',
            backgroundColor: dialogMode === 'import' ? theme.accent.color : theme.bgSecondary.color,
          }}
          eventMode="static"
          cursor="pointer"
          onPointerUp={() => setDialogMode('import')}
          onClick={() => setDialogMode('import')}
        >
          <PixiLabel
            text="Import"
            size="sm"
            weight="bold"
            color={dialogMode === 'import' ? 'custom' : 'textSecondary'}
            customColor={dialogMode === 'import' ? 0x000000 : undefined}
          />
        </layoutContainer>
      </layoutContainer>

      {/* ── Content area ──────────────────────────────────────────────────── */}
      <layoutContainer layout={{ flex: 1, flexDirection: 'column', padding: 16, gap: 10 }}>
        {dialogMode === 'export' ? (
          <>
            {/* Format selector */}
            <layoutContainer layout={{ flexDirection: 'row', alignItems: 'center', gap: 8, width: CONTENT_W }}>
              <PixiLabel text="FORMAT" size="xs" weight="bold" color="textMuted" />
              <PixiSelect
                options={MODE_OPTIONS}
                value={exportMode}
                onChange={(v) => setExportMode(v as ExportMode)}
                width={220}
              />
            </layoutContainer>

            {/* ── Song info ──────────────────────────────────────────────── */}
            {exportMode === 'song' && (
              <layoutContainer
                layout={{
                  flexDirection: 'column',
                  gap: 6,
                  padding: 10,
                  borderRadius: 6,
                  borderWidth: 1,
                  backgroundColor: theme.bgSecondary.color,
                  borderColor: theme.border.color,
                  width: CONTENT_W,
                }}
              >
                <PixiLabel text="Song Export" size="sm" weight="bold" color="accent" />
                <PixiLabel text={`Project: ${metadata.name}`} size="xs" color="text" />
                <PixiLabel text={`Patterns: ${patterns.length}`} size="xs" color="text" />
                <PixiLabel text={`Instruments: ${instruments.length}`} size="xs" color="text" />
                <PixiLabel text={`BPM: ${bpm}`} size="xs" color="text" />
              </layoutContainer>
            )}

            {/* ── SFX options ────────────────────────────────────────────── */}
            {exportMode === 'sfx' && (
              <layoutContainer
                layout={{
                  flexDirection: 'column',
                  gap: 8,
                  padding: 10,
                  borderRadius: 6,
                  borderWidth: 1,
                  backgroundColor: theme.bgSecondary.color,
                  borderColor: theme.border.color,
                  width: CONTENT_W,
                }}
              >
                <PixiLabel text="SFX Export" size="sm" weight="bold" color="accent" />

                <layoutContainer layout={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', width: CONTENT_W - 24 }}>
                  <PixiLabel text="Pattern" size="xs" color="textMuted" />
                  <PixiSelect
                    options={patternOptions}
                    value={String(selectedPatternIndex)}
                    onChange={(v) => setSelectedPatternIndex(Number(v))}
                    width={200}
                  />
                </layoutContainer>

                <layoutContainer layout={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', width: CONTENT_W - 24 }}>
                  <PixiLabel text="Instrument" size="xs" color="textMuted" />
                  <PixiSelect
                    options={instrumentOptions}
                    value={String(selectedInstrumentId)}
                    onChange={(v) => setSelectedInstrumentId(Number(v))}
                    width={200}
                  />
                </layoutContainer>
              </layoutContainer>
            )}

            {/* ── Instrument options ─────────────────────────────────────── */}
            {exportMode === 'instrument' && (
              <layoutContainer
                layout={{
                  flexDirection: 'column',
                  gap: 8,
                  padding: 10,
                  borderRadius: 6,
                  borderWidth: 1,
                  backgroundColor: theme.bgSecondary.color,
                  borderColor: theme.border.color,
                  width: CONTENT_W,
                }}
              >
                <PixiLabel text="Instrument Export" size="sm" weight="bold" color="accent" />
                <layoutContainer layout={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', width: CONTENT_W - 24 }}>
                  <PixiLabel text="Instrument" size="xs" color="textMuted" />
                  <PixiSelect
                    options={instrumentOptions}
                    value={String(selectedInstrumentId)}
                    onChange={(v) => setSelectedInstrumentId(Number(v))}
                    width={200}
                  />
                </layoutContainer>
              </layoutContainer>
            )}

            {/* ── Audio export panel ────────────────────────────────────── */}
            {exportMode === 'audio' && (
              <layoutContainer
                layout={{
                  flexDirection: 'column',
                  gap: 8,
                  padding: 10,
                  borderRadius: 6,
                  borderWidth: 1,
                  backgroundColor: theme.bgSecondary.color,
                  borderColor: theme.border.color,
                  width: CONTENT_W,
                }}
              >
                <PixiLabel text="Audio Export" size="sm" weight="bold" color="accent" />

                <layoutContainer layout={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', width: CONTENT_W - 24 }}>
                  <PixiLabel text="Scope" size="xs" color="textMuted" />
                  <PixiSelect
                    options={[
                      { value: 'pattern', label: 'Current Pattern' },
                      { value: 'song', label: 'Full Song' },
                      { value: 'arrangement', label: 'Arrangement' },
                    ]}
                    value={audioScope}
                    onChange={(v) => setAudioScope(v as 'pattern' | 'song' | 'arrangement')}
                    width={200}
                  />
                </layoutContainer>

                {audioScope === 'pattern' && (
                  <layoutContainer layout={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', width: CONTENT_W - 24 }}>
                    <PixiLabel text="Pattern" size="xs" color="textMuted" />
                    <PixiSelect
                      options={patternOptions}
                      value={String(selectedPatternIndex)}
                      onChange={(v) => setSelectedPatternIndex(Number(v))}
                      width={200}
                    />
                  </layoutContainer>
                )}

                {/* Metadata display */}
                <PixiLabel text="Format: WAV 16-bit 44.1kHz" size="xs" font="mono" color="textMuted" />
                {audioScope === 'arrangement' ? (
                  <>
                    <PixiLabel text={`BPM: ${bpm}`} size="xs" font="mono" color="textMuted" />
                    <PixiLabel text={`Clips: ${arrangementClips.length} total, ${arrangementClips.filter((c: any) => !c.muted).length} unmuted`} size="xs" font="mono" color="textMuted" />
                    <PixiLabel text={`Total Rows: ${arrangementClips.reduce((sum: number, c: any) => sum + (c.clipLengthRows ?? 64), 0)}`} size="xs" font="mono" color="textMuted" />
                  </>
                ) : audioScope === 'song' ? (
                  <>
                    <PixiLabel text={`BPM: ${bpm}`} size="xs" font="mono" color="textMuted" />
                    <PixiLabel text={`Patterns: ${patterns.length}`} size="xs" font="mono" color="textMuted" />
                    <PixiLabel text={`Total Rows: ${patterns.reduce((sum, p) => sum + p.length, 0)}`} size="xs" font="mono" color="textMuted" />
                  </>
                ) : (
                  <>
                    <PixiLabel text={`BPM: ${bpm}`} size="xs" font="mono" color="textMuted" />
                    <PixiLabel text={`Rows: ${patterns[selectedPatternIndex]?.channels[0]?.rows?.length ?? 0}`} size="xs" font="mono" color="textMuted" />
                  </>
                )}

                {isRendering && (
                  <layoutContainer layout={{ flexDirection: 'column', gap: 4, width: CONTENT_W - 24 }}>
                    <PixiLabel text={`Rendering ${audioScope}... ${Math.round(renderProgress * 100)}%`} size="xs" color="text" />
                    <layoutContainer layout={{ width: CONTENT_W - 24, height: 8, borderRadius: 4, overflow: 'hidden' }}>
                      <pixiGraphics draw={(g: any) => {
                        g.clear();
                        g.roundRect(0, 0, CONTENT_W - 24, 8, 4).fill(theme.bgSecondary?.color ?? 0x222222);
                        g.roundRect(0, 0, (CONTENT_W - 24) * renderProgress, 8, 4).fill(theme.accent?.color ?? 0x4488ff);
                      }} />
                    </layoutContainer>
                  </layoutContainer>
                )}
              </layoutContainer>
            )}

            {/* ── MIDI export panel ─────────────────────────────────────── */}
            {exportMode === 'midi' && (
              <layoutContainer
                layout={{
                  flexDirection: 'column',
                  gap: 8,
                  padding: 10,
                  borderRadius: 6,
                  borderWidth: 1,
                  backgroundColor: theme.bgSecondary.color,
                  borderColor: theme.border.color,
                  width: CONTENT_W,
                }}
              >
                <PixiLabel text="MIDI Export" size="sm" weight="bold" color="accent" />

                <layoutContainer layout={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', width: CONTENT_W - 24 }}>
                  <PixiLabel text="Scope" size="xs" color="textMuted" />
                  <PixiSelect
                    options={[
                      { value: 'pattern', label: 'Current Pattern' },
                      { value: 'song', label: 'Full Song' },
                    ]}
                    value={midiScope}
                    onChange={(v) => setMidiScope(v as 'pattern' | 'song')}
                    width={200}
                  />
                </layoutContainer>

                {midiScope === 'pattern' && (
                  <layoutContainer layout={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', width: CONTENT_W - 24 }}>
                    <PixiLabel text="Pattern" size="xs" color="textMuted" />
                    <PixiSelect
                      options={patternOptions}
                      value={String(selectedPatternIndex)}
                      onChange={(v) => setSelectedPatternIndex(Number(v))}
                      width={200}
                    />
                  </layoutContainer>
                )}

                <layoutContainer layout={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', width: CONTENT_W - 24 }}>
                  <PixiLabel text="Format" size="xs" color="textMuted" />
                  <PixiSelect
                    options={[
                      { value: '0', label: 'Type 0 (Single Track)' },
                      { value: '1', label: 'Type 1 (Multi-Track)' },
                    ]}
                    value={String(midiFormat)}
                    onChange={(v) => setMidiFormat(Number(v) as 0 | 1)}
                    width={200}
                  />
                </layoutContainer>

                <layoutContainer layout={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', width: CONTENT_W - 24 }}>
                  <PixiLabel text="Include automation" size="xs" color="text" />
                  <PixiCheckbox
                    checked={midiIncludeAutomation}
                    onChange={(v) => setMidiIncludeAutomation(v)}
                  />
                </layoutContainer>

                {/* Metadata display */}
                <PixiLabel text="Format: Standard MIDI File (SMF)" size="xs" font="mono" color="textMuted" />
                <PixiLabel text="Resolution: 480 PPQ" size="xs" font="mono" color="textMuted" />
                <PixiLabel text={`BPM: ${bpm}`} size="xs" font="mono" color="textMuted" />
                <PixiLabel text={`Channels: ${patterns[selectedPatternIndex]?.channels?.length ?? 0}`} size="xs" font="mono" color="textMuted" />
                {midiScope === 'song' && (
                  <PixiLabel text={`Patterns: ${patterns.length}`} size="xs" font="mono" color="textMuted" />
                )}
              </layoutContainer>
            )}

            {/* ── XM export panel ───────────────────────────────────────── */}
            {exportMode === 'xm' && (
              <layoutContainer
                layout={{
                  flexDirection: 'column',
                  gap: 8,
                  padding: 10,
                  borderRadius: 6,
                  borderWidth: 1,
                  backgroundColor: theme.bgSecondary.color,
                  borderColor: theme.border.color,
                  width: CONTENT_W,
                }}
              >
                <PixiLabel text="XM Module Export" size="sm" weight="bold" color="accent" />

                <layoutContainer layout={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', width: CONTENT_W - 24 }}>
                  <PixiLabel text="Channels (2-32)" size="xs" color="textMuted" />
                  <PixiNumericInput
                    value={xmChannels}
                    min={2}
                    max={32}
                    step={1}
                    onChange={setXmChannels}
                    width={80}
                  />
                </layoutContainer>

                <layoutContainer layout={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', width: CONTENT_W - 24 }}>
                  <PixiLabel text="Bake synths to samples" size="xs" color="text" />
                  <PixiCheckbox
                    checked={bakeSynths}
                    onChange={(v) => setBakeSynths(v)}
                  />
                </layoutContainer>

                {/* Metadata display */}
                <PixiLabel text={`Format: FastTracker II · Patterns: ${patterns.length} · Channels: ${xmChannels} · Max Instruments: 128`} size="xs" font="mono" color="textMuted" />

                {/* Warnings display */}
                {exportWarnings.length > 0 && (
                  <layoutContainer layout={{ flexDirection: 'column', gap: 4, padding: 8, borderRadius: 4, borderWidth: 1, borderColor: 0xff8800, backgroundColor: 0x332200, width: CONTENT_W - 24, maxHeight: 100 }}>
                    <PixiLabel text={`Export Warnings (${exportWarnings.length})`} size="xs" weight="bold" color="custom" customColor={0xff8800} />
                    {exportWarnings.map((w, i) => (
                      <PixiLabel key={i} text={`• ${w}`} size="xs" color="textMuted" layout={{ maxWidth: CONTENT_W - 44 }} />
                    ))}
                  </layoutContainer>
                )}
              </layoutContainer>
            )}

            {/* ── MOD export panel ──────────────────────────────────────── */}
            {exportMode === 'mod' && (
              <layoutContainer
                layout={{
                  flexDirection: 'column',
                  gap: 8,
                  padding: 10,
                  borderRadius: 6,
                  borderWidth: 1,
                  backgroundColor: theme.bgSecondary.color,
                  borderColor: theme.border.color,
                  width: CONTENT_W,
                }}
              >
                <PixiLabel text="MOD Module Export" size="sm" weight="bold" color="accent" />

                <layoutContainer layout={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', width: CONTENT_W - 24 }}>
                  <PixiLabel text="Channels" size="xs" color="textMuted" />
                  <layoutContainer layout={{ flexDirection: 'row', gap: 4 }}>
                    {([
                      { value: 4 as const, label: '4ch (M.K.)' },
                      { value: 6 as const, label: '6ch (6CHN)' },
                      { value: 8 as const, label: '8ch (8CHN)' },
                    ]).map(opt => (
                      <PixiButton
                        key={opt.value}
                        label={opt.label}
                        variant={modChannels === opt.value ? 'primary' : 'ghost'}
                        width={100}
                        onClick={() => setModChannels(opt.value)}
                      />
                    ))}
                  </layoutContainer>
                </layoutContainer>

                <layoutContainer layout={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', width: CONTENT_W - 24 }}>
                  <PixiLabel text="Bake synths to samples" size="xs" color="text" />
                  <PixiCheckbox
                    checked={bakeSynths}
                    onChange={(v) => setBakeSynths(v)}
                  />
                </layoutContainer>

                {/* Metadata display */}
                <PixiLabel text={`Format: ProTracker (${modChannels === 4 ? 'M.K.' : modChannels === 6 ? '6CHN' : '8CHN'}) · Max Samples: 31 · Max Rows: 64 · Notes: C-0 to B-3`} size="xs" font="mono" color="textMuted" />

                {/* Warnings display */}
                {exportWarnings.length > 0 && (
                  <layoutContainer layout={{ flexDirection: 'column', gap: 4, padding: 8, borderRadius: 4, borderWidth: 1, borderColor: 0xff8800, backgroundColor: 0x332200, width: CONTENT_W - 24, maxHeight: 100 }}>
                    <PixiLabel text={`Export Warnings (${exportWarnings.length})`} size="xs" weight="bold" color="custom" customColor={0xff8800} />
                    {exportWarnings.map((w, i) => (
                      <PixiLabel key={i} text={`• ${w}`} size="xs" color="textMuted" layout={{ maxWidth: CONTENT_W - 44 }} />
                    ))}
                  </layoutContainer>
                )}
              </layoutContainer>
            )}

            {/* ── Chip export panel ─────────────────────────────────────── */}
            {exportMode === 'chip' && (
              <layoutContainer
                layout={{
                  flexDirection: 'column',
                  gap: 8,
                  padding: 10,
                  borderRadius: 6,
                  borderWidth: 1,
                  backgroundColor: theme.bgSecondary.color,
                  borderColor: theme.border.color,
                  width: CONTENT_W,
                }}
              >
                <PixiLabel text="Chip Music Export" size="sm" weight="bold" color="accent" />

                {/* Recording controls */}
                <layoutContainer layout={{
                  flexDirection: 'column', gap: 4, padding: 8, borderRadius: 6,
                  borderWidth: 1, borderColor: 0xff4444,
                  backgroundColor: 0x1a0000, width: CONTENT_W - 24,
                }}>
                  <PixiLabel text="RECORDING" size="xs" weight="bold" color="custom" customColor={0xff4444} />
                  <layoutContainer layout={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                    <PixiButton
                      label={chipIsRecording ? 'Stop Recording' : 'Record'}
                      variant={chipIsRecording ? 'danger' : 'primary'}
                      onClick={handleChipRecord}
                    />
                    {chipIsRecording && (
                      <PixiLabel
                        text={`${Math.floor(chipRecordingTime / 60)}:${(chipRecordingTime % 60).toFixed(1).padStart(4, '0')}`}
                        size="sm"
                        font="mono"
                        weight="bold"
                        color="accent"
                      />
                    )}
                    {chipIsRecording && (
                      <PixiLabel text="Recording... play your song now" size="xs" color="warning" />
                    )}
                    {chipLogDataRef.current && !chipIsRecording && (
                      <PixiLabel text="Recording ready" size="xs" color="accent" />
                    )}
                  </layoutContainer>
                </layoutContainer>

                {/* Statistics display */}
                {chipStats && !chipIsRecording && (
                  <layoutContainer layout={{ flexDirection: 'column', gap: 4, padding: 8, borderRadius: 4, borderWidth: 1, borderColor: theme.border.color, backgroundColor: theme.bg.color, width: CONTENT_W - 24 }}>
                    <PixiLabel text="Captured Data" size="xs" weight="bold" color="accent" />
                    <PixiLabel text={`Duration: ${chipStats.duration.toFixed(1)}s`} size="xs" font="mono" color="text" />
                    <PixiLabel text={`Total Writes: ${chipStats.totalWrites.toLocaleString()}`} size="xs" font="mono" color="text" />
                    {chipStats.usedChips.map((chip) => (
                      <PixiLabel key={chip.type} text={`  ${chip.name}: ${chip.writes.toLocaleString()} writes`} size="xs" font="mono" color="textMuted" />
                    ))}
                  </layoutContainer>
                )}

                {/* Format grid with loop indicators */}
                <layoutContainer layout={{ flexDirection: 'row', flexWrap: 'wrap', gap: 4, width: CONTENT_W - 24 }}>
                  {CHIP_FORMATS.map(fmt => (
                    <PixiButton
                      key={fmt.id}
                      label={`${fmt.label} ${fmt.loop === 'custom' ? '\u21BB' : fmt.loop === 'auto' ? '\u21BA' : ''}`}
                      variant={chipFormat === fmt.id ? 'primary' : 'ghost'}
                      width={Math.floor((CONTENT_W - 32) / 3)}
                      onClick={() => setChipFormat(fmt.id)}
                    />
                  ))}
                </layoutContainer>

                {/* Format description */}
                <PixiLabel text={CHIP_FORMAT_DESCRIPTIONS[chipFormat] || ''} size="xs" font="mono" color="textMuted" />

                {/* Color-coded loop support indicator */}
                {(() => {
                  const loopInfo = getLoopInfo(chipFormat, chipLoopPoint);
                  return (
                    <layoutContainer layout={{ padding: 8, borderRadius: 4, borderWidth: 1, borderColor: loopInfo.color, width: CONTENT_W - 24 }}>
                      <PixiLabel text={loopInfo.text} size="xs" color="custom" customColor={loopInfo.color} />
                    </layoutContainer>
                  );
                })()}

                <layoutContainer layout={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', width: CONTENT_W - 24 }}>
                  <PixiLabel text="Title" size="xs" color="textMuted" />
                  <PixiPureTextInput
                    value={chipTitle}
                    onChange={setChipTitle}
                    width={200}
                    placeholder="Song title"
                  />
                </layoutContainer>

                <layoutContainer layout={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', width: CONTENT_W - 24 }}>
                  <PixiLabel text="Author" size="xs" color="textMuted" />
                  <PixiPureTextInput
                    value={chipAuthor}
                    onChange={setChipAuthor}
                    width={200}
                    placeholder="Author name"
                  />
                </layoutContainer>

                {/* Loop point */}
                <layoutContainer layout={{ flexDirection: 'row', alignItems: 'center', gap: 8, width: CONTENT_W - 24 }}>
                  <PixiLabel text="Loop Row" size="xs" color="textMuted" />
                  <PixiNumericInput
                    value={chipLoopPoint}
                    min={0}
                    max={9999}
                    step={1}
                    onChange={setChipLoopPoint}
                    width={80}
                  />
                  <PixiButton label="From Cursor" variant="ghost" width={90} onClick={() => {
                    setChipLoopPoint(currentRow);
                    useTransportStore.getState().setLoopStartRow(currentRow);
                  }} />
                </layoutContainer>
                <PixiLabel
                  text={chipLoopPoint > 0 ? `Music will loop back to row ${chipLoopPoint}` : 'Set to 0 for no loop (one-shot playback)'}
                  size="xs"
                  font="mono"
                  color="textMuted"
                />
              </layoutContainer>
            )}

            {/* ── Nano info ──────────────────────────────────────────────── */}
            {exportMode === 'nano' && (
              <layoutContainer
                layout={{
                  flexDirection: 'column',
                  gap: 6,
                  padding: 10,
                  borderRadius: 6,
                  borderWidth: 1,
                  backgroundColor: theme.bgSecondary.color,
                  borderColor: theme.border.color,
                  width: CONTENT_W,
                }}
              >
                <PixiLabel text="Nano Binary Export (.dbn)" size="sm" weight="bold" color="accent" />
                <PixiLabel text="Extreme binary compression for demoscene 4k intros." size="xs" color="textSecondary" />
                <PixiLabel text={`Target Size: < 4KB`} size="xs" color="text" />
                <PixiLabel text={`Format: DBXN Binary`} size="xs" color="text" />
                <PixiLabel text={`Used Instruments: ${nanoUsedInstruments}`} size="xs" color="text" />
              </layoutContainer>
            )}

            {/* ── Export options (checkboxes) ─────────────────────────────── */}
            <layoutContainer
              layout={{
                flexDirection: 'column',
                gap: 8,
                padding: 10,
                borderRadius: 6,
                borderWidth: 1,
                backgroundColor: theme.bgSecondary.color,
                borderColor: theme.border.color,
                width: CONTENT_W,
              }}
            >
              <PixiLabel text="Options" size="sm" weight="bold" color="accent" />

              {exportMode === 'song' && (
                <layoutContainer layout={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', width: CONTENT_W - 24 }}>
                  <PixiLabel text="Include automation data" size="xs" color="text" />
                  <PixiCheckbox
                    checked={options.includeAutomation ?? true}
                    onChange={(v) => setOptions({ ...options, includeAutomation: v })}
                  />
                </layoutContainer>
              )}

              <layoutContainer layout={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', width: CONTENT_W - 24 }}>
                <PixiLabel text="Prettify JSON (human-readable)" size="xs" color="text" />
                <PixiCheckbox
                  checked={options.prettify ?? true}
                  onChange={(v) => setOptions({ ...options, prettify: v })}
                />
              </layoutContainer>

              <layoutContainer layout={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', width: CONTENT_W - 24 }}>
                <PixiLabel text="Compress (coming soon)" size="xs" color="textMuted" />
                <PixiCheckbox checked={false} onChange={() => {}} disabled />
              </layoutContainer>
            </layoutContainer>
          </>
        ) : (
          /* ── Import mode ───────────────────────────────────────────────── */
          <layoutContainer layout={{ flexDirection: 'column', alignItems: 'center', gap: 12, paddingTop: 30, width: CONTENT_W }}>
            <PixiLabel text="Import File" size="lg" weight="bold" color="text" />
            <PixiLabel text="Select a .dbx, .sfx.json, or .dbi file" size="xs" color="textMuted" />
            <PixiButton label="Choose File" variant="primary" onClick={handleImport} />

            <layoutContainer
              layout={{
                flexDirection: 'column',
                gap: 6,
                padding: 10,
                borderRadius: 6,
                borderWidth: 1,
                backgroundColor: theme.bgSecondary.color,
                borderColor: theme.border.color,
                width: CONTENT_W,
                marginTop: 12,
              }}
            >
              <PixiLabel text="Supported Formats" size="xs" weight="bold" color="accent" />
              <PixiLabel text="• .dbx — Full song with all patterns and instruments" size="xs" color="textSecondary" />
              <PixiLabel text="• .sfx.json — Single pattern with one instrument" size="xs" color="textSecondary" />
              <PixiLabel text="• .dbi — Individual instrument preset" size="xs" color="textSecondary" />
            </layoutContainer>
          </layoutContainer>
        )}
      </layoutContainer>

      {/* ── Footer ────────────────────────────────────────────────────────── */}
      <PixiModalFooter width={MODAL_W}>
        <PixiLabel
          text={dialogMode === 'export' ? `Format: ${FORMAT_EXTENSIONS[exportMode]}` : 'Select a file to import'}
          size="xs"
          color="textMuted"
        />
        <PixiButton label="Cancel" variant="ghost" onClick={onClose} disabled={isRendering} />
        {dialogMode === 'export' && (
          <PixiButton
            label={isRendering ? 'Rendering...' : 'Export'}
            variant="primary"
            onClick={handleExport}
            disabled={isRendering}
          />
        )}
      </PixiModalFooter>
    </PixiModal>
  );
};
