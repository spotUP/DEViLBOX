/**
 * PixiTD3PatternDialog — GL-native TD-3 / TB-303 pattern transfer dialog.
 *
 * Supports:
 * - Export: tracker pattern → SysEx to TD-3, JSON file, or .seq file
 * - Import: SysEx from TD-3 or file (.sqs/.json) → tracker pattern
 *
 * DOM reference: src/components/midi/TD3PatternDialog.tsx
 */

import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  PixiModal,
  PixiModalHeader,
  PixiModalFooter,
  PixiButton,
  PixiLabel,
} from '../components';
import { PixiSelect, type SelectOption } from '../components/PixiSelect';
import { usePixiTheme } from '../theme';
import { pickFile } from '../services/glFilePicker';
import { tintBg } from '../colors';
import { downloadFile } from '../services/glFileDownload';

import { useMIDIStore } from '../../stores/useMIDIStore';
import { useTrackerStore } from '../../stores/useTrackerStore';
import { useCursorStore } from '../../stores/useCursorStore';
import { useInstrumentStore } from '../../stores/useInstrumentStore';
import { createDefaultTB303Instrument } from '../../lib/instrumentFactory';
import { getMIDIManager } from '../../midi/MIDIManager';
import { encodePattern, encodePatternRequest, formatPatternLocation } from '../../midi/sysex/TD3SysExEncoder';
import { decodePattern, isTD3PatternResponse } from '../../midi/sysex/TD3SysExDecoder';
import {
  trackerPatternToTD3Steps,
  td3StepsToTrackerCells,
  validatePatternForTD3Export,
  suggestBaseOctave,
} from '../../midi/sysex/TD3PatternTranslator';
import { parseTD3File } from '../../lib/import/TD3PatternLoader';
import { exportTD3PatternToSeq } from '../../lib/export/TD3PatternExporter';
import type { TD3PatternData, MIDIMessage } from '../../midi/types';
import type { TrackerCell } from '@typedefs/tracker';

// ── Props ─────────────────────────────────────────────────────────────────────

interface PixiTD3PatternDialogProps {
  isOpen: boolean;
  onClose: () => void;
}

// ── Constants ─────────────────────────────────────────────────────────────────

type TabType = 'export' | 'import';

const MODAL_W = 480;
const MODAL_H = 520;
const CONTENT_W = MODAL_W - 26;

const GROUP_NAMES = ['A', 'B', 'C', 'D'];

const GROUP_OPTIONS: SelectOption[] = GROUP_NAMES.map((name, i) => ({
  value: String(i),
  label: `Group ${name}`,
}));

const PATTERN_OPTIONS: SelectOption[] = Array.from({ length: 16 }, (_, i) => ({
  value: String(i),
  label: i < 8 ? `A${i + 1}` : `B${i - 7}`,
}));

const OCTAVE_OPTIONS: SelectOption[] = [
  { value: '1', label: 'C1 – C4' },
  { value: '2', label: 'C2 – C5' },
  { value: '3', label: 'C3 – C6' },
  { value: '4', label: 'C4 – C7' },
];

// ── Component ─────────────────────────────────────────────────────────────────

export const PixiTD3PatternDialog: React.FC<PixiTD3PatternDialogProps> = ({ isOpen, onClose }) => {
  const theme = usePixiTheme();

  const [activeTab, setActiveTab] = useState<TabType>('export');
  const [selectedGroup, setSelectedGroup] = useState(0);
  const [selectedPattern, setSelectedPattern] = useState(0);
  const [selectedChannel, setSelectedChannel] = useState(0);
  const [baseOctave, setBaseOctave] = useState(2);
  const [isSending, setIsSending] = useState(false);
  const [isRequesting, setIsRequesting] = useState(false);
  const [sendResult, setSendResult] = useState<{ success: boolean; message: string } | null>(null);
  const [receivedPattern, setReceivedPattern] = useState<TD3PatternData | null>(null);
  const [warnings, setWarnings] = useState<string[]>([]);
  const requestTimeoutRef = useRef<number | null>(null);

  const { selectedOutputId, selectedInputId } = useMIDIStore();
  const { patterns, currentPatternIndex, setCell } = useTrackerStore();
  const cursor = useCursorStore((s) => s.cursor);

  const currentPattern = patterns[currentPatternIndex];
  const channels = currentPattern?.channels || [];

  // Channel options for selects
  const channelOptions: SelectOption[] = channels.map((ch, idx) => ({
    value: String(idx),
    label: ch.name || `Channel ${idx + 1}`,
  }));

  // Reset state when dialog opens
  useEffect(() => {
    if (isOpen) {
      setSendResult(null);
      setReceivedPattern(null);
      setWarnings([]);
      setSelectedChannel(cursor.channelIndex);

      if (currentPattern && currentPattern.channels[cursor.channelIndex]) {
        const cells = currentPattern.channels[cursor.channelIndex].rows;
        setBaseOctave(suggestBaseOctave(cells));
      }
    }
  }, [isOpen, cursor.channelIndex, currentPattern]);

  // Clean up timeout on unmount
  useEffect(() => {
    return () => {
      if (requestTimeoutRef.current !== null) {
        clearTimeout(requestTimeoutRef.current);
        requestTimeoutRef.current = null;
      }
    };
  }, []);

  // Listen for SysEx responses when importing
  useEffect(() => {
    if (!isOpen || activeTab !== 'import' || !isRequesting) return;

    const manager = getMIDIManager();
    const handleMessage = (message: MIDIMessage) => {
      if (message.type === 'sysex' && isTD3PatternResponse(message.data)) {
        const decoded = decodePattern(message.data);
        if (decoded) {
          if (requestTimeoutRef.current !== null) {
            clearTimeout(requestTimeoutRef.current);
            requestTimeoutRef.current = null;
          }
          setReceivedPattern(decoded);
          setIsRequesting(false);
        }
      }
    };

    manager.addMessageHandler(handleMessage);
    return () => manager.removeMessageHandler(handleMessage);
  }, [isOpen, activeTab, isRequesting]);

  // Get current channel cells for export preview
  const getExportCells = useCallback((): TrackerCell[] => {
    if (!currentPattern || !currentPattern.channels[selectedChannel]) return [];
    return currentPattern.channels[selectedChannel].rows;
  }, [currentPattern, selectedChannel]);

  const validation = validatePatternForTD3Export(getExportCells(), baseOctave);

  // ── Export handlers ───────────────────────────────────────────────────────

  const handleExport = useCallback(async () => {
    if (!selectedOutputId) return;

    const cells = getExportCells();
    const { steps, warnings: exportWarnings } = trackerPatternToTD3Steps(cells, baseOctave);
    setWarnings(exportWarnings);

    const patternData: TD3PatternData = {
      group: selectedGroup,
      pattern: selectedPattern,
      steps,
      triplet: false,
      activeSteps: Math.min(16, cells.length),
    };

    const sysex = encodePattern(patternData);
    setIsSending(true);
    setSendResult(null);

    try {
      getMIDIManager().sendSysEx(sysex);
      setSendResult({
        success: true,
        message: `Pattern sent to ${formatPatternLocation(selectedGroup, selectedPattern)}`,
      });
    } catch (error) {
      setSendResult({
        success: false,
        message: error instanceof Error ? error.message : 'Failed to send pattern',
      });
    } finally {
      setIsSending(false);
    }
  }, [selectedOutputId, getExportCells, baseOctave, selectedGroup, selectedPattern]);

  const handleExportFile = useCallback(() => {
    const cells = getExportCells();
    const { steps } = trackerPatternToTD3Steps(cells, baseOctave);

    const patternData = {
      name: `Pattern ${formatPatternLocation(selectedGroup, selectedPattern)}`,
      steps: steps.map((s) => ({
        note: s.note ? s.note.value : null,
        octave: s.note ? s.note.octave : 0,
        upperC: s.note ? s.note.upperC : false,
        flag1: s.accent ? 1 : undefined,
        flag2: s.slide ? 2 : undefined,
        tie: s.tie,
      })),
      activeSteps: Math.min(16, cells.length),
    };

    const blob = new Blob([JSON.stringify(patternData, null, 2)], { type: 'application/json' });
    downloadFile(blob, `td3-pattern-${formatPatternLocation(selectedGroup, selectedPattern).replace(' ', '')}.json`);
    setSendResult({ success: true, message: 'Pattern exported to JSON file' });
  }, [getExportCells, baseOctave, selectedGroup, selectedPattern]);

  const handleExportSeq = useCallback(() => {
    const cells = getExportCells();
    const { steps } = trackerPatternToTD3Steps(cells, baseOctave);

    const patternData: TD3PatternData = {
      group: selectedGroup,
      pattern: selectedPattern,
      steps,
      triplet: false,
      activeSteps: Math.min(16, cells.length),
    };

    try {
      const bytes = exportTD3PatternToSeq(patternData);
      const blob = new Blob([bytes.buffer as ArrayBuffer], { type: 'application/octet-stream' });
      downloadFile(blob, `td3-pattern-${formatPatternLocation(selectedGroup, selectedPattern).replace(' ', '')}.seq`);
      setSendResult({ success: true, message: 'Pattern exported to .seq file' });
    } catch {
      setSendResult({ success: false, message: 'Failed to export .seq file' });
    }
  }, [getExportCells, baseOctave, selectedGroup, selectedPattern]);

  // ── Import handlers ───────────────────────────────────────────────────────

  const handleFileImport = useCallback(async () => {
    const file = await pickFile({ accept: '.json,.sqs' });
    if (!file) return;

    try {
      const buffer = await file.arrayBuffer();

      if (file.name.toLowerCase().endsWith('.sqs')) {
        const td3File = await parseTD3File(buffer);
        if (td3File.patterns.length > 0) {
          const firstPatt = td3File.patterns[0];
          setReceivedPattern({
            group: 0,
            pattern: 0,
            steps: firstPatt.steps,
            triplet: firstPatt.triplet || false,
            activeSteps: firstPatt.length,
          });
          setSendResult({
            success: true,
            message: `Loaded pattern "${firstPatt.name}" from .sqs file`,
          });
        }
      } else {
        const text = new TextDecoder().decode(buffer);
        const data = JSON.parse(text);
        const mappedSteps = data.steps.map(
          (s: { note: number | null; octave: number; upperC?: boolean; accent?: boolean; slide?: boolean; tie?: boolean }) => ({
            note: s.note === null ? null : { value: s.note, octave: s.octave, upperC: s.upperC || false },
            flag1: s.accent ? 1 : undefined,
            flag2: s.slide ? 2 : undefined,
            tie: s.tie,
          }),
        );

        setReceivedPattern({
          group: data.group || 0,
          pattern: data.pattern || 0,
          steps: mappedSteps,
          triplet: data.triplet || false,
          activeSteps: data.activeSteps || 16,
        });
        setSendResult({ success: true, message: 'Loaded pattern from JSON file' });
      }
    } catch {
      setSendResult({ success: false, message: 'Failed to parse pattern file' });
    }
  }, []);

  const handleRequestPattern = useCallback(() => {
    if (!selectedOutputId || !selectedInputId) return;

    const sysex = encodePatternRequest(selectedGroup, selectedPattern);
    setIsRequesting(true);
    setReceivedPattern(null);
    setSendResult(null);

    try {
      getMIDIManager().sendSysEx(sysex);
      if (requestTimeoutRef.current !== null) clearTimeout(requestTimeoutRef.current);
      requestTimeoutRef.current = window.setTimeout(() => {
        requestTimeoutRef.current = null;
        setIsRequesting(false);
        setSendResult({
          success: false,
          message: 'No response from TD-3. Make sure it is connected and in the correct mode.',
        });
      }, 5000);
    } catch (error) {
      setIsRequesting(false);
      setSendResult({
        success: false,
        message: error instanceof Error ? error.message : 'Failed to send request',
      });
    }
  }, [selectedOutputId, selectedInputId, selectedGroup, selectedPattern]);

  const handleImportIntoPattern = useCallback(() => {
    if (!receivedPattern) return;

    const { instruments, addInstrument } = useInstrumentStore.getState();
    let tb303Instrument = instruments.find((inst) => inst.synthType === 'TB303');
    if (!tb303Instrument) {
      const newInst = createDefaultTB303Instrument();
      addInstrument(newInst);
      tb303Instrument = newInst;
    }
    const instrumentIndex = instruments.findIndex((i) => i.id === tb303Instrument!.id) + 1;

    const cells = td3StepsToTrackerCells(receivedPattern.steps, baseOctave);
    const stepsToImport = Math.min(receivedPattern.activeSteps, cells.length);

    for (let i = 0; i < stepsToImport; i++) {
      const cell = cells[i];
      setCell(selectedChannel, i, {
        note: cell.note,
        instrument: cell.note ? instrumentIndex : undefined,
        flag1: cell.flag1,
        flag2: cell.flag2,
      });
    }

    setSendResult({
      success: true,
      message: `Imported ${stepsToImport} steps into channel ${selectedChannel + 1} with TB-303`,
    });
    setReceivedPattern(null);
  }, [receivedPattern, baseOctave, selectedChannel, setCell]);

  // ── Tab switcher helper ───────────────────────────────────────────────────

  const TabButton: React.FC<{ tab: TabType; label: string }> = ({ tab, label }) => {
    const isActive = activeTab === tab;
    return (
      <layoutContainer
        eventMode="static"
        cursor="pointer"
        onPointerUp={() => setActiveTab(tab)}
        onClick={() => setActiveTab(tab)}
        layout={{
          flex: 1,
          height: 30,
          justifyContent: 'center',
          alignItems: 'center',
          backgroundColor: isActive ? theme.bgActive.color : undefined,
          borderBottomWidth: isActive ? 2 : 0,
          borderColor: theme.accent.color,
        }}
      >
        <PixiLabel text={label} size="sm" weight={isActive ? 'semibold' : 'regular'} color={isActive ? 'text' : 'textSecondary'} />
      </layoutContainer>
    );
  };

  // ── Render ────────────────────────────────────────────────────────────────

  if (!isOpen) return null;

  const exportStepCount = Math.min(16, getExportCells().length);
  const allWarnings = [...validation.warnings, ...warnings];

  return (
    <PixiModal isOpen={isOpen} onClose={onClose} width={MODAL_W} height={MODAL_H}>
      <PixiModalHeader title="TD-3 Pattern Transfer" onClose={onClose} width={MODAL_W} />

      {/* Tabs */}
      <layoutContainer
        layout={{
          width: MODAL_W,
          height: 30,
          flexDirection: 'row',
          borderBottomWidth: 1,
          borderColor: theme.border.color,
        }}
      >
        <TabButton tab="export" label="Export" />
        <TabButton tab="import" label="Import" />
      </layoutContainer>

      {/* Content */}
      <layoutContainer layout={{ flex: 1, padding: 16, flexDirection: 'column', gap: 10, overflow: 'hidden' }}>
        {/* MIDI warning */}
        {!selectedOutputId && activeTab === 'export' && (
          <layoutContainer
            layout={{
              flexDirection: 'row',
              alignItems: 'center',
              gap: 8,
              padding: 10,
              borderRadius: 6,
              borderWidth: 1,
              backgroundColor: 0x2a2000,
              borderColor: 0x665500,
              width: CONTENT_W,
            }}
          >
            <PixiLabel text="⚠" size="sm" color="warning" />
            <PixiLabel text="No MIDI output selected. You can still export to file." size="xs" color="textSecondary" layout={{ maxWidth: CONTENT_W - 40 }} />
          </layoutContainer>
        )}

        {(!selectedOutputId || !selectedInputId) && activeTab === 'import' && !receivedPattern && (
          <layoutContainer
            layout={{
              flexDirection: 'row',
              alignItems: 'center',
              gap: 8,
              padding: 10,
              borderRadius: 6,
              borderWidth: 1,
              backgroundColor: theme.bg.color,
              borderColor: theme.border.color,
              width: CONTENT_W,
            }}
          >
            <PixiLabel text="⚠" size="sm" color="textMuted" />
            <PixiLabel
              text='MIDI transfer requires hardware. Use "Load File" for .sqs or .json patterns.'
              size="xs"
              color="textMuted"
              layout={{ maxWidth: CONTENT_W - 40 }}
            />
          </layoutContainer>
        )}

        {/* Pattern location */}
        <layoutContainer layout={{ flexDirection: 'row', gap: 10, width: CONTENT_W }}>
          <layoutContainer layout={{ flex: 1, flexDirection: 'column', gap: 4 }}>
            <PixiLabel text="GROUP" size="xs" weight="semibold" color="textMuted" />
            <PixiSelect
              options={GROUP_OPTIONS}
              value={String(selectedGroup)}
              onChange={(v) => setSelectedGroup(Number(v))}
              width={CONTENT_W / 2 - 8}
            />
          </layoutContainer>
          <layoutContainer layout={{ flex: 1, flexDirection: 'column', gap: 4 }}>
            <PixiLabel text="PATTERN" size="xs" weight="semibold" color="textMuted" />
            <PixiSelect
              options={PATTERN_OPTIONS}
              value={String(selectedPattern)}
              onChange={(v) => setSelectedPattern(Number(v))}
              width={CONTENT_W / 2 - 8}
            />
          </layoutContainer>
        </layoutContainer>

        {/* Export-specific options */}
        {activeTab === 'export' && (
          <>
            <layoutContainer layout={{ flexDirection: 'row', gap: 10, width: CONTENT_W }}>
              <layoutContainer layout={{ flex: 1, flexDirection: 'column', gap: 4 }}>
                <PixiLabel text="SOURCE CHANNEL" size="xs" weight="semibold" color="textMuted" />
                <PixiSelect
                  options={channelOptions}
                  value={String(selectedChannel)}
                  onChange={(v) => setSelectedChannel(Number(v))}
                  width={CONTENT_W / 2 - 8}
                />
              </layoutContainer>
              <layoutContainer layout={{ flex: 1, flexDirection: 'column', gap: 4 }}>
                <PixiLabel text="BASE OCTAVE" size="xs" weight="semibold" color="textMuted" />
                <PixiSelect
                  options={OCTAVE_OPTIONS}
                  value={String(baseOctave)}
                  onChange={(v) => setBaseOctave(Number(v))}
                  width={CONTENT_W / 2 - 8}
                />
              </layoutContainer>
            </layoutContainer>

            {/* Warnings */}
            {allWarnings.length > 0 && (
              <layoutContainer layout={{ flexDirection: 'column', gap: 3, width: CONTENT_W }}>
                {allWarnings.map((w, i) => (
                  <layoutContainer key={i} layout={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                    <PixiLabel text="⚠" size="xs" color="warning" />
                    <PixiLabel text={w} size="xs" color="warning" layout={{ maxWidth: CONTENT_W - 24 }} />
                  </layoutContainer>
                ))}
              </layoutContainer>
            )}

            {/* Info line */}
            <PixiLabel
              text={`Exporting ${exportStepCount} steps from ${channels[selectedChannel]?.name || `Channel ${selectedChannel + 1}`} to ${formatPatternLocation(selectedGroup, selectedPattern)}`}
              size="xs"
              color="textMuted"
              layout={{ maxWidth: CONTENT_W }}
            />
          </>
        )}

        {/* Import: received pattern preview */}
        {activeTab === 'import' && receivedPattern && (
          <layoutContainer
            layout={{
              flexDirection: 'column',
              gap: 8,
              padding: 12,
              borderRadius: 8,
              borderWidth: 1,
              backgroundColor: theme.bg.color,
              borderColor: theme.border.color,
              width: CONTENT_W,
            }}
          >
            <layoutContainer layout={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
              <PixiLabel text="✓" size="sm" color="success" />
              <PixiLabel text="Pattern Loaded" size="sm" weight="semibold" color="text" />
            </layoutContainer>
            <PixiLabel text={`${receivedPattern.activeSteps} active steps detected.`} size="xs" color="textMuted" />

            <PixiLabel text="TARGET CHANNEL" size="xs" weight="semibold" color="textMuted" />
            <PixiSelect
              options={channelOptions}
              value={String(selectedChannel)}
              onChange={(v) => setSelectedChannel(Number(v))}
              width={CONTENT_W - 24}
            />
          </layoutContainer>
        )}

        {/* Result message */}
        {sendResult && (
          <layoutContainer
            layout={{
              flexDirection: 'row',
              alignItems: 'center',
              gap: 8,
              padding: 10,
              borderRadius: 6,
              borderWidth: 1,
              backgroundColor: sendResult.success ? 0x0a2010 : tintBg(theme.error.color),
              borderColor: sendResult.success ? 0x206040 : theme.error.color,
              width: CONTENT_W,
            }}
          >
            <PixiLabel text={sendResult.success ? '✓' : '⚠'} size="sm" color={sendResult.success ? 'success' : 'error'} />
            <PixiLabel text={sendResult.message} size="xs" color="textSecondary" layout={{ maxWidth: CONTENT_W - 40 }} />
          </layoutContainer>
        )}
      </layoutContainer>

      {/* Footer */}
      <PixiModalFooter width={MODAL_W}>
        {activeTab === 'import' && (
          <PixiButton label="Load File" variant="default" size="sm" onClick={handleFileImport} />
        )}
        {activeTab === 'export' && (
          <>
            <PixiButton label="Save JSON" variant="default" size="sm" onClick={handleExportFile} />
            <PixiButton label="Save .seq" variant="default" size="sm" onClick={handleExportSeq} />
          </>
        )}

        <PixiButton label="Close" variant="ghost" onClick={onClose} />

        {activeTab === 'export' && (
          <PixiButton
            label={isSending ? 'Sending...' : 'Send to TD-3'}
            variant="primary"
            onClick={handleExport}
            disabled={!selectedOutputId || isSending || !validation.valid}
            loading={isSending}
          />
        )}
        {activeTab === 'import' && !receivedPattern && (
          <PixiButton
            label={isRequesting ? 'Requesting...' : 'Request from TD-3'}
            variant="primary"
            onClick={handleRequestPattern}
            disabled={!selectedOutputId || !selectedInputId || isRequesting}
            loading={isRequesting}
          />
        )}
        {activeTab === 'import' && receivedPattern && (
          <PixiButton label="Insert into Pattern" variant="primary" onClick={handleImportIntoPattern} />
        )}
      </PixiModalFooter>
    </PixiModal>
  );
};
