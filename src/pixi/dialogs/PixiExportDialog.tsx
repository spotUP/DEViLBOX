/**
 * PixiExportDialog — GL-native version of the DOM ExportDialog.
 *
 * Provides export for Song, SFX, Instrument, Audio, MIDI, XM, MOD, Chip, and Nano
 * formats using PixiJS layout components.  Import is handled via a file picker.
 *
 * DOM reference: src/lib/export/ExportDialog.tsx
 */

import React, { useState, useCallback, useRef, useEffect, useMemo } from 'react';
import {
  PixiModal,
  PixiModalHeader,
  PixiModalFooter,
  PixiButton,
  PixiLabel,
  PixiCheckbox,
} from '../components';
import { PixiSelect, type SelectOption } from '../components/PixiSelect';
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

// ── Component ──────────────────────────────────────────────────────────────────

export const PixiExportDialog: React.FC<PixiExportDialogProps> = ({ isOpen, onClose }) => {
  const theme = usePixiTheme();

  // ── Store hooks ────────────────────────────────────────────────────────────
  const { patterns, currentPatternIndex, importPattern, setCurrentPattern, loadPatterns } = useTrackerStore();
  const { instruments, currentInstrumentId, addInstrument, setCurrentInstrument, loadInstruments } = useInstrumentStore();
  const { metadata, setMetadata } = useProjectStore();
  const { bpm, setBPM, isPlaying, stop } = useTransportStore();
  const { curves, loadCurves } = useAutomationStore();
  const { masterEffects, setMasterEffects } = useAudioStore();
  const modalData = useUIStore((s) => s.modalData);

  // ── Local state ────────────────────────────────────────────────────────────
  const [dialogMode, setDialogMode] = useState<DialogMode>('export');
  const [exportMode, setExportMode] = useState<ExportMode>('song');
  const [options, setOptions] = useState<ExportOptions>({
    includeAutomation: true,
    compress: false,
    prettify: true,
  });
  const [sfxName, setSfxName] = useState('MySound');
  const [selectedPatternIndex, setSelectedPatternIndex] = useState(currentPatternIndex);
  const [selectedInstrumentId, setSelectedInstrumentId] = useState(currentInstrumentId || 0);
  const [isRendering, setIsRendering] = useState(false);
  const [renderProgress, setRenderProgress] = useState(0);

  // Auto-select audio scope when opened from arrangement toolbar
  useEffect(() => {
    if (isOpen && modalData?.audioScope === 'arrangement') {
      setExportMode('audio');
    }
  }, [isOpen, modalData]);

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

        // Audio / MIDI / XM / MOD / Chip are complex sub-panels; for now just
        // show a notification pointing to the full DOM dialog for those modes.
        default:
          notify.info(`${exportMode.toUpperCase()} export: use the full Export dialog (Ctrl+Shift+E) for this format.`);
          break;
      }
    } catch (error) {
      console.error('Export failed:', error);
      notify.error('Export failed: ' + (error as Error).message);
    }
  }, [exportMode, patterns, instruments, metadata, bpm, curves, masterEffects, options,
      selectedPatternIndex, selectedInstrumentId, sfxName, onClose]);

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

  if (!isOpen) return null;

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
      <layoutContainer layout={{ flex: 1, flexDirection: 'column', padding: 12, gap: 10 }}>
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

            {/* ── Audio / MIDI / XM / MOD / Chip placeholder ─────────────── */}
            {(exportMode === 'audio' || exportMode === 'midi' || exportMode === 'xm' || exportMode === 'mod' || exportMode === 'chip') && (
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
                <PixiLabel text={`${exportMode.toUpperCase()} Export`} size="sm" weight="bold" color="accent" />
                <PixiLabel
                  text={`${exportMode.toUpperCase()} rendering uses the DOM export panel. Press Export to render.`}
                  size="xs"
                  color="textSecondary"
                />
                {isRendering && (
                  <layoutContainer layout={{ flexDirection: 'row', alignItems: 'center', gap: 8, width: CONTENT_W - 24 }}>
                    <PixiLabel text={`Rendering: ${Math.round(renderProgress * 100)}%`} size="xs" color="accent" />
                  </layoutContainer>
                )}
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
