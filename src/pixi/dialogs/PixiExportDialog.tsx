/**
 * PixiExportDialog — GL-native version of the DOM ExportDialog.
 *
 * Provides export for Song, SFX, Instrument, Audio, MIDI, XM, MOD, IT, S3M, Chip, and Nano
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
  notify,
} from '@stores';
import { useArrangementStore } from '@stores/useArrangementStore';
import { useTransportStore } from '@stores';
import {
  useExportDialog,
  EXPORT_MODE_OPTIONS,
  FORMAT_EXTENSIONS,
  CHIP_FORMAT_DESCRIPTIONS,
  CHIP_FORMATS,
  type ExportMode,
} from '@hooks/dialogs/useExportDialog';
import { tintBg } from '../colors';

interface PixiExportDialogProps {
  isOpen: boolean;
  onClose: () => void;
}

// ── Constants ──────────────────────────────────────────────────────────────────

const MODAL_W = 560;
const MODAL_H = 520;
const CONTENT_W = MODAL_W - 26;

const getLoopInfo = (chipFormat: string, chipLoopRow: number, theme: ReturnType<typeof usePixiTheme>) => {
  if (chipFormat === 'vgm') {
    return chipLoopRow > 0
      ? { text: `Loop point at row ${chipLoopRow} will be used`, color: theme.success.color }
      : { text: 'Set loop point above for custom loop', color: theme.textSecondary.color };
  }
  if (['nsf', 'gbs'].includes(chipFormat)) {
    return { text: `${chipFormat.toUpperCase()} loops entire song automatically`, color: theme.warning.color };
  }
  return { text: `${chipFormat.toUpperCase()} does not support loop points`, color: theme.error.color };
};

// ── Component ──────────────────────────────────────────────────────────────────

export const PixiExportDialog: React.FC<PixiExportDialogProps> = ({ isOpen, onClose }) => {
  const theme = usePixiTheme();

  // ── Shared hook ────────────────────────────────────────────────────────────
  const ex = useExportDialog({ isOpen });

  // ── Pixi-only store hooks ──────────────────────────────────────────────────
  const { currentRow } = useTransportStore();
  const arrangementClips = useArrangementStore(s => s.clips);

  // Audio export state
  const [audioScope, setAudioScope] = useState<'pattern' | 'song' | 'arrangement'>('song');
  const [audioSampleRate, setAudioSampleRate] = useState(44100);
  const [audioBitDepth, setAudioBitDepth] = useState<16 | 24 | 32>(16);

  // MIDI export state
  const [midiScope, setMidiScope] = useState<'pattern' | 'song'>('song');
  const [midiFormat, setMidiFormat] = useState<0 | 1>(1);
  const [midiIncludeAutomation, setMidiIncludeAutomation] = useState(true);

  // XM export state
  const [xmChannels, setXmChannels] = useState(Math.min(32, ex.patterns[0]?.channels?.length ?? 8));
  const [bakeSynths, setBakeSynths] = useState(true);

  // MOD export state
  const [modChannels, setModChannels] = useState<4 | 6 | 8>(4);

  // Chip export state
  const [chipFormat, setChipFormat] = useState('vgm');
  const [chipTitle, setChipTitle] = useState(ex.metadata.name || '');
  const [chipAuthor, setChipAuthor] = useState(ex.metadata.author || '');
  const [chipIsRecording, setChipIsRecording] = useState(false);
  const chipLogDataRef = useRef<Uint8Array | null>(null);
  const chipSessionRef = useRef<any>(null);

  // XM/MOD export warnings
  const [exportWarnings, setExportWarnings] = useState<string[]>([]);

  // Pre-export validation: warn about synth instruments and master FX
  // (these warnings were deferred from editing-time to export-time)
  const preExportWarnings: string[] = useMemo(() => {
    if (!isOpen) return [];
    const isNativeFormat = ['xm', 'mod', 'it', 's3m'].includes(ex.exportMode);
    if (!isNativeFormat) return [];

    const warnings: string[] = [];
    try {
      const { useInstrumentStore } = require('@stores/useInstrumentStore');
      const { useAudioStore } = require('@stores/useAudioStore');
      const instruments = useInstrumentStore.getState().instruments;
      const masterEffects = useAudioStore.getState().masterEffects;

      const synthInsts = instruments.filter(
        (i: any) => i.synthType && i.synthType !== 'Sampler' && i.synthType !== 'Player'
      );
      if (synthInsts.length > 0) {
        const names = synthInsts.slice(0, 5).map((i: any) => `${i.id}: ${i.name || i.synthType}`).join(', ');
        const extra = synthInsts.length > 5 ? ` (+${synthInsts.length - 5} more)` : '';
        warnings.push(`${synthInsts.length} synth instrument(s) will export as silence (${names}${extra}). Convert to samples or save as .dbx.`);
      }

      const activeFx = (masterEffects || []).filter((fx: any) => fx.enabled);
      if (activeFx.length > 0) {
        warnings.push(`${activeFx.length} master effect(s) active — not supported in ${ex.exportMode.toUpperCase()} format. Remove or disable before export.`);
      }
    } catch { /* stores not available */ }
    return warnings;
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen, ex.exportMode]);

  // Check for synth-replaced instruments
  const replacedIds: number[] = useMemo(() => {
    try {
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      const { getTrackerReplayer } = require('@engine/TrackerReplayer');
      return getTrackerReplayer().replacedInstrumentIds;
    } catch { return []; }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen]);
  const hasReplacedInstruments = replacedIds.length > 0;

  // Chip extended state
  const [chipRecordingTime, setChipRecordingTime] = useState(0);
  const [chipLoopPoint, setChipLoopPoint] = useState(0);
  const [, setChipWrites] = useState<any[]>([]);
  const [chipStats, setChipStats] = useState<{ duration: number; totalWrites: number; usedChips: { name: string; writes: number; type: number }[] } | null>(null);
  const [, setAvailableChipFormats] = useState<string[]>([]);

  // (auto-select audio scope is handled by useExportDialog hook)

  // Chip recording timer
  useEffect(() => {
    if (!chipIsRecording) return;
    const interval = setInterval(() => setChipRecordingTime(t => t + 0.1), 100);
    return () => clearInterval(interval);
  }, [chipIsRecording]);

  // Clear export warnings when export mode changes
  useEffect(() => {
    setExportWarnings([]);
  }, [ex.exportMode]);

  // ── Derived data ───────────────────────────────────────────────────────────
  const patternOptions: SelectOption[] = useMemo(
    () => ex.patterns.map((p, i) => ({ value: String(i), label: `${String(i).padStart(2, '0')} - ${p.name}` })),
    [ex.patterns],
  );

  const instrumentOptions: SelectOption[] = useMemo(
    () => ex.instruments.map((inst) => ({
      value: String(inst.id),
      label: `${inst.id.toString(16).toUpperCase().padStart(2, '0')} - ${inst.name}`,
    })),
    [ex.instruments],
  );

  const nanoUsedInstruments = useMemo(() => {
    const used = new Set<number>();
    ex.patterns.forEach((pat) =>
      pat.channels.forEach((ch) =>
        ch.rows.forEach((cell) => { if (cell.instrument > 0) used.add(cell.instrument); }),
      ),
    );
    return used.size;
  }, [ex.patterns]);

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
      switch (ex.exportMode) {
        case 'song': return ex.handleExportSong(onClose);
        case 'sfx': return ex.handleExportSFX(onClose);
        case 'instrument': return ex.handleExportInstrument(onClose);
        case 'fur': return ex.handleExportFur(downloadFile, onClose);
        case 'nano': return ex.handleExportNano(downloadFile, onClose);
        case 'native': return ex.handleExportNative(downloadFile, onClose);

        case 'audio': {
          const { exportPatternAsWav, exportSongAsWav, getUADEInstrument, exportUADEAsWav } = await import('@lib/export/audioExport');
          ex.setIsRendering(true);
          try {
            // Check UADE instrument first (matches DOM AudioExportPanel logic)
            const uadeInst = getUADEInstrument(ex.instruments);
            if (uadeInst && (uadeInst as any).uade?.fileData) {
              await exportUADEAsWav(
                (uadeInst as any).uade.fileData,
                (uadeInst as any).uade.filename || 'song',
                `${ex.metadata.name || 'song'}.wav`,
                (uadeInst as any).uade.currentSubsong ?? 0,
                (p: number) => ex.setRenderProgress(p),
              );
            } else if (ex.originalModuleData?.base64) {
              const binaryStr = atob(ex.originalModuleData.base64);
              const bytes = new Uint8Array(binaryStr.length);
              for (let i = 0; i < binaryStr.length; i++) bytes[i] = binaryStr.charCodeAt(i);
              const sourceFilename = ex.originalModuleData.sourceFile || `module.${ex.originalModuleData.format.toLowerCase()}`;
              await exportUADEAsWav(
                bytes.buffer,
                sourceFilename,
                `${ex.metadata.name || 'song'}.wav`,
                0,
                (p: number) => ex.setRenderProgress(p),
              );
            } else if (audioScope === 'arrangement') {

              const clips = useArrangementStore.getState?.()?.clips ?? [];
              if (clips.length > 0) {
                const patternIdToIndex = new Map(ex.patterns.map((p, i) => [p.id, i]));
                const sequence = clips
                  .filter((c: any) => !c.muted)
                  .sort((a: any, b: any) => a.startRow - b.startRow)
                  .map((c: any) => patternIdToIndex.get(c.patternId) ?? 0);
                if (sequence.length === 0) {
                  notify.warning('No unmuted clips in arrangement to export');
                  break;
                }
                await exportSongAsWav(ex.patterns, sequence, ex.instruments, ex.bpm, ex.metadata.name || 'arrangement', (p: number) => ex.setRenderProgress(p));
              } else {
                notify.warning('No clips in arrangement to export');
                break;
              }
            } else if (audioScope === 'song') {

              const sequence = ex.patterns.map((_: any, i: number) => i);
              await exportSongAsWav(ex.patterns, sequence, ex.instruments, ex.bpm, ex.metadata.name || 'song', (p: number) => ex.setRenderProgress(p));
            } else {

              const pattern = ex.patterns[ex.selectedPatternIndex];
              if (!pattern) { notify.warning('Please select a valid pattern'); break; }
              await exportPatternAsWav(pattern, ex.instruments, ex.bpm, `${ex.metadata.name || 'pattern'}_${ex.selectedPatternIndex}`, (p: number) => ex.setRenderProgress(p));
            }
            notify.success('Audio exported!');
            onClose();
          } finally {
            ex.setIsRendering(false);
            ex.setRenderProgress(0);
          }
          break;
        }

        case 'midi': {
          const { exportPatternToMIDI, exportSongToMIDI } = await import('@lib/export/midiExport');
          const midiOptions = { format: midiFormat as 0 | 1, ppq: 480, includeAutomation: midiIncludeAutomation, velocityScale: 1.0, excludeMutedChannels: true };
          const timeSignature: [number, number] = [4, 4];
          let midiData: Uint8Array;
          if (midiScope === 'song') {
            const sequence = ex.patterns.map((p) => p.id);
            midiData = exportSongToMIDI(ex.patterns, sequence, ex.bpm, timeSignature, ex.curves, midiOptions);
          } else {
            midiData = exportPatternToMIDI(ex.patterns[ex.selectedPatternIndex], ex.bpm, timeSignature, midiOptions);
          }
          downloadFile(new Blob([midiData.slice(0)], { type: 'audio/midi' }), `${ex.metadata.name || 'song'}.mid`);
          notify.success('MIDI exported!');
          onClose();
          break;
        }

        case 'xm': {
          const { exportAsXM } = await import('@lib/export/XMExporter');
          const result = await exportAsXM(ex.patterns, ex.instruments, { channelLimit: xmChannels, bakeSynthsToSamples: bakeSynths, moduleName: ex.metadata.name || 'song' });
          downloadFile(result.data, result.filename || `${ex.metadata.name || 'song'}.xm`);
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
          const result = await exportAsMOD(ex.patterns, ex.instruments, { channelCount: modChannels, bakeSynthsToSamples: bakeSynths, moduleName: ex.metadata.name || 'song' });
          downloadFile(result.data, result.filename || `${ex.metadata.name || 'song'}.mod`);
          if (result.warnings?.length) {
            setExportWarnings(result.warnings);
            notify.warning(`MOD exported with ${result.warnings.length} warnings`);
          } else {
            notify.success('MOD module exported!');
            onClose();
          }
          break;
        }

        case 'it':
        case 's3m': {
          const { exportWithOpenMPT } = await import('@lib/export/OpenMPTExporter');
          const songPositions = ex.patterns.map((_: unknown, i: number) => i);
          const result = await exportWithOpenMPT(ex.patterns, ex.instruments, songPositions, {
            format: ex.exportMode as 'it' | 's3m',
            moduleName: ex.metadata.name || 'song',
            channelLimit: ex.exportMode === 's3m' ? Math.min(xmChannels, 32) : xmChannels,
          });
          downloadFile(result.data, result.filename);
          if (result.warnings?.length) {
            setExportWarnings(result.warnings);
            notify.warning(`${ex.exportMode.toUpperCase()} exported with ${result.warnings.length} warnings`);
          } else {
            notify.success(`${ex.exportMode.toUpperCase()} module exported!`);
            onClose();
          }
          break;
        }

        case 'chip': {
          const { exportChipMusic } = await import('@lib/export/ChipExporter');
          const chipLogData = chipLogDataRef.current;
          if (!chipLogData) { notify.warning('No chip data recorded. Press Record and play your song first.'); break; }
          const rowsPerBeat = 4;
          const beatsPerSecond = ex.bpm / 60;
          const secondsPerRow = 1 / (beatsPerSecond * rowsPerBeat);
          const loopPointSamples = chipLoopPoint > 0 ? Math.floor(chipLoopPoint * secondsPerRow * 44100) : undefined;
          const chipResult = await exportChipMusic(chipLogData, { format: chipFormat as any, title: chipTitle || ex.metadata.name || 'Untitled', author: chipAuthor || ex.metadata.author || 'Unknown', loopPoint: loopPointSamples });
          downloadFile(chipResult.data, chipResult.filename || `${ex.metadata.name || 'song'}.${chipFormat}`);
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
  }, [ex, onClose,
      audioScope, audioSampleRate, audioBitDepth,
      midiScope, midiFormat, midiIncludeAutomation,
      xmChannels, bakeSynths, modChannels, chipFormat, chipTitle, chipAuthor, chipLoopPoint]);

  // ── Import handler ─────────────────────────────────────────────────────────
  const handleImport = useCallback(async () => {
    const file = await pickFile({ accept: '.json,.dbx,.dbi,.sfx.json' });
    if (!file) return;
    await ex.handleImportFile(file, onClose);
  }, [ex, onClose]);

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
            backgroundColor: ex.dialogMode === 'export' ? theme.accent.color : theme.bgSecondary.color,
            borderRightWidth: 1,
            borderColor: theme.border.color,
          }}
          eventMode="static"
          cursor="pointer"
          onPointerUp={() => ex.setDialogMode('export')}
          onClick={() => ex.setDialogMode('export')}
        >
          <PixiLabel
            text="Export"
            size="sm"
            weight="bold"
            color={ex.dialogMode === 'export' ? 'custom' : 'textSecondary'}
            customColor={ex.dialogMode === 'export' ? 0x000000 : undefined}
          />
        </layoutContainer>
        <layoutContainer
          layout={{
            flex: 1,
            alignItems: 'center',
            justifyContent: 'center',
            backgroundColor: ex.dialogMode === 'import' ? theme.accent.color : theme.bgSecondary.color,
          }}
          eventMode="static"
          cursor="pointer"
          onPointerUp={() => ex.setDialogMode('import')}
          onClick={() => ex.setDialogMode('import')}
        >
          <PixiLabel
            text="Import"
            size="sm"
            weight="bold"
            color={ex.dialogMode === 'import' ? 'custom' : 'textSecondary'}
            customColor={ex.dialogMode === 'import' ? 0x000000 : undefined}
          />
        </layoutContainer>
      </layoutContainer>

      {/* ── Content area ──────────────────────────────────────────────────── */}
      <layoutContainer layout={{ flex: 1, flexDirection: 'column', padding: 16, gap: 10 }}>
        {ex.dialogMode === 'export' ? (
          <>
            {/* Format selector */}
            <layoutContainer layout={{ flexDirection: 'row', alignItems: 'center', gap: 8, width: CONTENT_W }}>
              <PixiLabel text="FORMAT" size="xs" weight="bold" color="textMuted" />
              <PixiSelect
                options={EXPORT_MODE_OPTIONS}
                value={ex.exportMode}
                onChange={(v) => ex.setExportMode(v as ExportMode)}
                width={220}
              />
            </layoutContainer>

            {/* ── Song info ──────────────────────────────────────────────── */}
            {ex.exportMode === 'song' && (
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
                <PixiLabel text={`Project: ${ex.metadata.name}`} size="xs" color="text" />
                <PixiLabel text={`Patterns: ${ex.patterns.length}`} size="xs" color="text" />
                <PixiLabel text={`Instruments: ${ex.instruments.length}`} size="xs" color="text" />
                <PixiLabel text={`BPM: ${ex.bpm}`} size="xs" color="text" />
              </layoutContainer>
            )}

            {/* ── SFX options ────────────────────────────────────────────── */}
            {ex.exportMode === 'sfx' && (
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
                    value={String(ex.selectedPatternIndex)}
                    onChange={(v) => ex.setSelectedPatternIndex(Number(v))}
                    width={200}
                  />
                </layoutContainer>

                <layoutContainer layout={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', width: CONTENT_W - 24 }}>
                  <PixiLabel text="Instrument" size="xs" color="textMuted" />
                  <PixiSelect
                    options={instrumentOptions}
                    value={String(ex.selectedInstrumentId)}
                    onChange={(v) => ex.setSelectedInstrumentId(Number(v))}
                    width={200}
                  />
                </layoutContainer>
              </layoutContainer>
            )}

            {/* ── Instrument options ─────────────────────────────────────── */}
            {ex.exportMode === 'instrument' && (
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
                    value={String(ex.selectedInstrumentId)}
                    onChange={(v) => ex.setSelectedInstrumentId(Number(v))}
                    width={200}
                  />
                </layoutContainer>
              </layoutContainer>
            )}

            {/* ── Audio export panel ────────────────────────────────────── */}
            {ex.exportMode === 'audio' && (
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
                      value={String(ex.selectedPatternIndex)}
                      onChange={(v) => ex.setSelectedPatternIndex(Number(v))}
                      width={200}
                    />
                  </layoutContainer>
                )}

                {/* Sample rate selector */}
                <layoutContainer layout={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', width: CONTENT_W - 24 }}>
                  <PixiLabel text="Sample Rate" size="xs" color="textMuted" />
                  <PixiSelect
                    options={[
                      { value: '22050', label: '22,050 Hz' },
                      { value: '44100', label: '44,100 Hz' },
                      { value: '48000', label: '48,000 Hz' },
                      { value: '88200', label: '88,200 Hz' },
                      { value: '96000', label: '96,000 Hz' },
                    ]}
                    value={String(audioSampleRate)}
                    onChange={(v) => setAudioSampleRate(Number(v))}
                    width={160}
                  />
                </layoutContainer>

                {/* Bit depth selector */}
                <layoutContainer layout={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', width: CONTENT_W - 24 }}>
                  <PixiLabel text="Bit Depth" size="xs" color="textMuted" />
                  <PixiSelect
                    options={[
                      { value: '16', label: '16-bit (PCM)' },
                      { value: '24', label: '24-bit (PCM)' },
                      { value: '32', label: '32-bit (Float)' },
                    ]}
                    value={String(audioBitDepth)}
                    onChange={(v) => setAudioBitDepth(Number(v) as 16 | 24 | 32)}
                    width={160}
                  />
                </layoutContainer>

                {/* Metadata display */}
                <PixiLabel text={`Format: WAV ${audioBitDepth}-bit ${(audioSampleRate / 1000).toFixed(1)}kHz`} size="xs" font="mono" color="textMuted" />
                {audioScope === 'arrangement' ? (
                  <>
                    <PixiLabel text={`BPM: ${ex.bpm}`} size="xs" font="mono" color="textMuted" />
                    <PixiLabel text={`Clips: ${arrangementClips.length} total, ${arrangementClips.filter((c: any) => !c.muted).length} unmuted`} size="xs" font="mono" color="textMuted" />
                    <PixiLabel text={`Total Rows: ${arrangementClips.reduce((sum: number, c: any) => sum + (c.clipLengthRows ?? 64), 0)}`} size="xs" font="mono" color="textMuted" />
                  </>
                ) : audioScope === 'song' ? (
                  <>
                    <PixiLabel text={`BPM: ${ex.bpm}`} size="xs" font="mono" color="textMuted" />
                    <PixiLabel text={`Patterns: ${ex.patterns.length}`} size="xs" font="mono" color="textMuted" />
                    <PixiLabel text={`Total Rows: ${ex.patterns.reduce((sum, p) => sum + p.length, 0)}`} size="xs" font="mono" color="textMuted" />
                  </>
                ) : (
                  <>
                    <PixiLabel text={`BPM: ${ex.bpm}`} size="xs" font="mono" color="textMuted" />
                    <PixiLabel text={`Rows: ${ex.patterns[ex.selectedPatternIndex]?.channels[0]?.rows?.length ?? 0}`} size="xs" font="mono" color="textMuted" />
                  </>
                )}

                {ex.isRendering && (
                  <layoutContainer layout={{ flexDirection: 'column', gap: 4, width: CONTENT_W - 24 }}>
                    <PixiLabel text={`Rendering ${audioScope}... ${Math.round(ex.renderProgress * 100)}%`} size="xs" color="text" />
                    <layoutContainer layout={{ width: CONTENT_W - 24, height: 8, borderRadius: 4, overflow: 'hidden' }}>
                      <pixiGraphics draw={(g: any) => {
                        g.clear();
                        g.roundRect(0, 0, CONTENT_W - 24, 8, 4).fill(theme.bgSecondary.color);
                        g.roundRect(0, 0, (CONTENT_W - 24) * ex.renderProgress, 8, 4).fill(theme.accent.color);
                      }} />
                    </layoutContainer>
                  </layoutContainer>
                )}
              </layoutContainer>
            )}

            {/* ── MIDI export panel ─────────────────────────────────────── */}
            {ex.exportMode === 'midi' && (
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
                      value={String(ex.selectedPatternIndex)}
                      onChange={(v) => ex.setSelectedPatternIndex(Number(v))}
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
                <PixiLabel text={`BPM: ${ex.bpm}`} size="xs" font="mono" color="textMuted" />
                <PixiLabel text={`Channels: ${ex.patterns[ex.selectedPatternIndex]?.channels?.length ?? 0}`} size="xs" font="mono" color="textMuted" />
                {midiScope === 'song' && (
                  <PixiLabel text={`Patterns: ${ex.patterns.length}`} size="xs" font="mono" color="textMuted" />
                )}
              </layoutContainer>
            )}

            {/* ── XM export panel ───────────────────────────────────────── */}
            {ex.exportMode === 'xm' && (
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
                <PixiLabel text={`Format: FastTracker II · Patterns: ${ex.patterns.length} · Channels: ${xmChannels} · Max Instruments: 128`} size="xs" font="mono" color="textMuted" />

                {/* Pre-export compatibility warnings (deferred from editing-time) */}
                {preExportWarnings.length > 0 && (
                  <layoutContainer layout={{ flexDirection: 'column', gap: 4, padding: 8, borderRadius: 4, borderWidth: 1, borderColor: theme.warning.color, backgroundColor: tintBg(theme.warning.color), width: CONTENT_W - 24 }}>
                    {preExportWarnings.map((w, i) => (
                      <PixiLabel key={`pre-${i}`} text={`⚠ ${w}`} size="xs" color="warning" layout={{ maxWidth: CONTENT_W - 44 }} />
                    ))}
                  </layoutContainer>
                )}

                {/* Synth-replaced instrument warning */}
                {hasReplacedInstruments && (
                  <layoutContainer layout={{ flexDirection: 'column', gap: 4, padding: 8, borderRadius: 4, borderWidth: 1, borderColor: theme.warning.color, backgroundColor: tintBg(theme.warning.color), width: CONTENT_W - 24 }}>
                    <PixiLabel text={`WARNING: Instruments ${replacedIds.join(', ')} are synth-replaced. They will export as silence in XM format. Save as .dbx to preserve synth assignments.`} size="xs" color="warning" layout={{ maxWidth: CONTENT_W - 44 }} />
                  </layoutContainer>
                )}

                {/* Warnings display */}
                {exportWarnings.length > 0 && (
                  <layoutContainer layout={{ flexDirection: 'column', gap: 4, padding: 8, borderRadius: 4, borderWidth: 1, borderColor: 0xff8800, backgroundColor: 0x332200, width: CONTENT_W - 24, maxHeight: 120, overflow: 'scroll' }}>
                    <PixiLabel text={`Export Warnings (${exportWarnings.length})`} size="xs" weight="bold" color="custom" customColor={0xff8800} />
                    {exportWarnings.map((w, i) => (
                      <PixiLabel key={i} text={`• ${w}`} size="xs" color="textMuted" layout={{ maxWidth: CONTENT_W - 44 }} />
                    ))}
                  </layoutContainer>
                )}
              </layoutContainer>
            )}

            {/* ── MOD export panel ──────────────────────────────────────── */}
            {ex.exportMode === 'mod' && (
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

                {/* Pre-export compatibility warnings (deferred from editing-time) */}
                {preExportWarnings.length > 0 && (
                  <layoutContainer layout={{ flexDirection: 'column', gap: 4, padding: 8, borderRadius: 4, borderWidth: 1, borderColor: theme.warning.color, backgroundColor: tintBg(theme.warning.color), width: CONTENT_W - 24 }}>
                    {preExportWarnings.map((w, i) => (
                      <PixiLabel key={`pre-${i}`} text={`⚠ ${w}`} size="xs" color="warning" layout={{ maxWidth: CONTENT_W - 44 }} />
                    ))}
                  </layoutContainer>
                )}

                {/* Synth-replaced instrument warning */}
                {hasReplacedInstruments && (
                  <layoutContainer layout={{ flexDirection: 'column', gap: 4, padding: 8, borderRadius: 4, borderWidth: 1, borderColor: theme.warning.color, backgroundColor: tintBg(theme.warning.color), width: CONTENT_W - 24 }}>
                    <PixiLabel text={`WARNING: Instruments ${replacedIds.join(', ')} are synth-replaced. They will export as silence in MOD format. Save as .dbx to preserve synth assignments.`} size="xs" color="warning" layout={{ maxWidth: CONTENT_W - 44 }} />
                  </layoutContainer>
                )}

                {/* Warnings display */}
                {exportWarnings.length > 0 && (
                  <layoutContainer layout={{ flexDirection: 'column', gap: 4, padding: 8, borderRadius: 4, borderWidth: 1, borderColor: 0xff8800, backgroundColor: 0x332200, width: CONTENT_W - 24, maxHeight: 120, overflow: 'scroll' }}>
                    <PixiLabel text={`Export Warnings (${exportWarnings.length})`} size="xs" weight="bold" color="custom" customColor={0xff8800} />
                    {exportWarnings.map((w, i) => (
                      <PixiLabel key={i} text={`• ${w}`} size="xs" color="textMuted" layout={{ maxWidth: CONTENT_W - 44 }} />
                    ))}
                  </layoutContainer>
                )}
              </layoutContainer>
            )}

            {/* ── IT/S3M export panel ────────────────────────────────────── */}
            {(ex.exportMode === 'it' || ex.exportMode === 's3m') && (
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
                <PixiLabel text={ex.exportMode === 'it' ? 'Impulse Tracker IT Export' : 'ScreamTracker 3 S3M Export'} size="sm" weight="bold" color="accent" />

                <layoutContainer layout={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', width: CONTENT_W - 24 }}>
                  <PixiLabel text={`Channels (max ${ex.exportMode === 's3m' ? 32 : 64})`} size="xs" color="textMuted" />
                  <PixiNumericInput
                    value={xmChannels}
                    min={2}
                    max={ex.exportMode === 's3m' ? 32 : 64}
                    onChange={(v) => setXmChannels(v)}
                    width={80}
                  />
                </layoutContainer>

                <PixiLabel text={`Format: ${ex.exportMode === 'it' ? 'Impulse Tracker' : 'ScreamTracker 3'} · Engine: OpenMPT CSoundFile (WASM) · ${ex.patterns.length} patterns · ${ex.instruments.length} instruments`} size="xs" font="mono" color="textMuted" />

                {/* Pre-export compatibility warnings (deferred from editing-time) */}
                {preExportWarnings.length > 0 && (
                  <layoutContainer layout={{ flexDirection: 'column', gap: 4, padding: 8, borderRadius: 4, borderWidth: 1, borderColor: theme.warning.color, backgroundColor: tintBg(theme.warning.color), width: CONTENT_W - 24 }}>
                    {preExportWarnings.map((w, i) => (
                      <PixiLabel key={`pre-${i}`} text={`⚠ ${w}`} size="xs" color="warning" layout={{ maxWidth: CONTENT_W - 44 }} />
                    ))}
                  </layoutContainer>
                )}

                {/* Synth-replaced instrument warning */}
                {hasReplacedInstruments && (
                  <layoutContainer layout={{ flexDirection: 'column', gap: 4, padding: 8, borderRadius: 4, borderWidth: 1, borderColor: theme.warning.color, backgroundColor: tintBg(theme.warning.color), width: CONTENT_W - 24 }}>
                    <PixiLabel text={`WARNING: Instruments ${replacedIds.join(', ')} are synth-replaced. They will export as silence in ${ex.exportMode.toUpperCase()} format. Save as .dbx to preserve synth assignments.`} size="xs" color="warning" layout={{ maxWidth: CONTENT_W - 44 }} />
                  </layoutContainer>
                )}

                {exportWarnings.length > 0 && (
                  <layoutContainer layout={{ flexDirection: 'column', gap: 4, padding: 8, borderRadius: 4, borderWidth: 1, borderColor: 0xff8800, backgroundColor: 0x332200, width: CONTENT_W - 24, maxHeight: 120, overflow: 'scroll' }}>
                    <PixiLabel text={`Export Warnings (${exportWarnings.length})`} size="xs" weight="bold" color="custom" customColor={0xff8800} />
                    {exportWarnings.map((w, i) => (
                      <PixiLabel key={i} text={`• ${w}`} size="xs" color="textMuted" layout={{ maxWidth: CONTENT_W - 44 }} />
                    ))}
                  </layoutContainer>
                )}
              </layoutContainer>
            )}

            {/* ── Chip export panel ─────────────────────────────────────── */}
            {ex.exportMode === 'chip' && (
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
                  borderWidth: 1, borderColor: theme.error.color,
                  backgroundColor: tintBg(theme.error.color), width: CONTENT_W - 24,
                }}>
                  <PixiLabel text="RECORDING" size="xs" weight="bold" color="error" />
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
                  const loopInfo = getLoopInfo(chipFormat, chipLoopPoint, theme);
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
            {ex.exportMode === 'nano' && (
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

            {ex.exportMode === 'native' && (
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
                <PixiLabel text="Native Format Export" size="sm" weight="bold" color="accent" />
                <PixiLabel text="Exports as the original tracker format with all edits preserved. Supports 30+ formats with dedicated serializers; chip RAM readback as fallback." size="xs" color="textSecondary" />
                {ex.uadeEditableFileData && (
                  <>
                    <PixiLabel text={`File: ${ex.uadeEditableFileName || 'unknown'}`} size="xs" color="text" />
                    <PixiLabel text={`Size: ${(ex.uadeEditableFileData.byteLength / 1024).toFixed(1)} KB`} size="xs" color="text" />
                  </>
                )}
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

              {ex.exportMode === 'song' && (
                <layoutContainer layout={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', width: CONTENT_W - 24 }}>
                  <PixiLabel text="Include automation data" size="xs" color="text" />
                  <PixiCheckbox
                    checked={ex.options.includeAutomation ?? true}
                    onChange={(v) => ex.setOptions({ ...ex.options, includeAutomation: v })}
                  />
                </layoutContainer>
              )}

              <layoutContainer layout={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', width: CONTENT_W - 24 }}>
                <PixiLabel text="Prettify JSON (human-readable)" size="xs" color="text" />
                <PixiCheckbox
                  checked={ex.options.prettify ?? true}
                  onChange={(v) => ex.setOptions({ ...ex.options, prettify: v })}
                />
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
          text={ex.dialogMode === 'export' ? `Format: ${FORMAT_EXTENSIONS[ex.exportMode] ?? ''}` : 'Select a file to import'}
          size="xs"
          color="textMuted"
        />
        <PixiButton label="Cancel" variant="ghost" onClick={onClose} disabled={ex.isRendering} />
        {ex.dialogMode === 'export' && (
          <PixiButton
            label={ex.isRendering ? 'Rendering...' : 'Export'}
            variant="primary"
            onClick={handleExport}
            disabled={ex.isRendering}
          />
        )}
      </PixiModalFooter>
    </PixiModal>
  );
};
