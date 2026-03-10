/**
 * PixiDrumpadEditorModal — GL-native MIDI pad mapping editor.
 *
 * Two-panel layout: left = 4×4 pad grid + bank selector,
 * right = selected pad detail editor with MIDI learn, instrument list, note input.
 *
 * Port of src/components/midi/DrumpadEditorModal.tsx using Div/Txt/GlModal.
 */

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import type { FederatedWheelEvent } from 'pixi.js';
import { getPadMappingManager, type PadMapping } from '../../midi/PadMappingManager';
import { useInstrumentStore, useMIDIStore } from '@stores';
import { detectControllerProfile } from '../../midi/controllerProfiles';
import { useMIDI } from '../../hooks/useMIDI';
import { getToneEngine } from '../../engine/ToneEngine';
import { TR707DrumMap } from '../../engine/tr707/TR707Synth';
import { PixiButton } from '../components';
import { PixiPureTextInput } from '../input/PixiPureTextInput';
import { usePixiTheme } from '../theme';
import { useModalClose } from '@hooks/useDialogKeyboard';
import { Div, Txt, GlModal, GlModalFooter } from '../layout';

const MODAL_W = 700;
const MODAL_H = 520;
const LEFT_W = 340;
const RIGHT_W = MODAL_W - LEFT_W;
const PAD_SIZE = 68;
const PAD_GAP = 6;
const INST_LIST_H = 160;
const INST_ROW_H = 22;

const NOTE_NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
const noteName = (n: number) => `${NOTE_NAMES[n % 12]}${Math.floor(n / 12) - 1}`;

interface PixiDrumpadEditorModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const PixiDrumpadEditorModal: React.FC<PixiDrumpadEditorModalProps> = ({
  isOpen,
  onClose,
}) => {
  const theme = usePixiTheme();
  const padManager = getPadMappingManager();
  const { instruments } = useInstrumentStore();
  const { devices, isEnabled } = useMIDI();
  const { padBank: activeBank, setPadBank: setActiveBank } = useMIDIStore();

  useModalClose({ isOpen, onClose });

  const [mappings, setMappings] = useState<PadMapping[]>([]);
  const [selectedPadIndex, setSelectedPadIndex] = useState<number | null>(null);
  const [isLearning, setIsLearning] = useState(false);
  const [instScrollY, setInstScrollY] = useState(0);

  // Detect drum machines in instrument list
  const drumMachines = useMemo(() => {
    return instruments.filter(
      (inst) =>
        inst.synthType === 'MAMETR707' ||
        inst.synthType?.toLowerCase().includes('drum') ||
        inst.name.toLowerCase().includes('drum machine'),
    );
  }, [instruments]);

  const refreshMappings = useCallback(() => {
    setMappings(padManager.getAllMappings());
  }, [padManager]);

  // Auto-populate pads from drum machine
  const handleLoadDrumMachine = useCallback(
    (drumMachineId: number) => {
      const drumMachine = instruments.find((inst) => inst.id === drumMachineId);
      if (!drumMachine) return;

      const startNote = 36;
      const notes = Array.from({ length: 16 }, (_, i) => startNote + i);
      notes.forEach((n) => {
        const mapping = padManager.getMapping(9, n);
        if (mapping) padManager.removeMapping(mapping.id);
      });

      if (drumMachine.synthType === 'MAMETR707') {
        const drumMap = [
          { note: TR707DrumMap.BASS_1, padNote: 36 },
          { note: TR707DrumMap.RIMSHOT, padNote: 37 },
          { note: TR707DrumMap.SNARE_1, padNote: 38 },
          { note: TR707DrumMap.HANDCLAP, padNote: 39 },
          { note: TR707DrumMap.SNARE_2, padNote: 40 },
          { note: TR707DrumMap.LOW_TOM, padNote: 41 },
          { note: TR707DrumMap.CLOSED_HIHAT, padNote: 42 },
          { note: TR707DrumMap.MID_TOM, padNote: 43 },
          { note: TR707DrumMap.OPEN_HIHAT, padNote: 46 },
          { note: TR707DrumMap.CRASH, padNote: 49 },
          { note: TR707DrumMap.HI_TOM, padNote: 50 },
          { note: TR707DrumMap.RIDE, padNote: 51 },
          { note: TR707DrumMap.TAMBOURINE, padNote: 54 },
          { note: TR707DrumMap.COWBELL, padNote: 56 },
        ];
        drumMap.forEach(({ note, padNote }) => {
          padManager.setMapping({
            id: `9-${padNote}`,
            inputChannel: 9,
            inputNote: padNote,
            type: 'instrument',
            targetInstrumentId: drumMachine.id,
            targetNote: note,
          });
        });
      } else {
        notes.slice(0, 8).forEach((padNote, i) => {
          padManager.setMapping({
            id: `9-${padNote}`,
            inputChannel: 9,
            inputNote: padNote,
            type: 'instrument',
            targetInstrumentId: drumMachine.id,
            targetNote: 36 + i,
          });
        });
      }
      refreshMappings();
    },
    [instruments, padManager, refreshMappings],
  );

  // Initialize
  useEffect(() => {
    if (isOpen && isEnabled) {
      padManager.init();
      const frame = requestAnimationFrame(() => refreshMappings());
      return () => cancelAnimationFrame(frame);
    }
  }, [isOpen, isEnabled, padManager, refreshMappings]);

  // Auto-populate from profile if empty
  useEffect(() => {
    if (isOpen && mappings.length === 0 && devices.length > 0) {
      const profile = detectControllerProfile(devices[0].name || '');
      if (profile && profile.pads.length > 0) {
        // Kept for future auto-create; currently manual.
      }
    }
  }, [isOpen, devices, mappings.length]);

  // Default pad layout
  const DEFAULT_PADS = useMemo(
    () =>
      Array.from({ length: 16 }, (_, i) => ({
        index: i,
        label: `Pad ${i + 1}`,
        defaultNote: 36 + i,
        bank: (i < 8 ? 'A' : 'B') as 'A' | 'B',
      })),
    [],
  );

  const getMappingForPad = useCallback(
    (padIndex: number) => {
      const defaultNote = 36 + padIndex;
      return mappings.find((m) => m.inputNote === defaultNote);
    },
    [mappings],
  );

  const getInstrumentName = useCallback(
    (id: number) => instruments.find((i) => i.id === id)?.name || `Inst ${id}`,
    [instruments],
  );

  const previewInstrument = useCallback(
    (id: number) => {
      const inst = instruments.find((i) => i.id === id);
      if (inst) {
        const engine = getToneEngine();
        engine.triggerPolyNoteAttack(inst.id, 'C4', 1, inst);
        setTimeout(() => {
          engine.triggerPolyNoteRelease(inst.id, 'C4', inst);
        }, 500);
      }
    },
    [instruments],
  );

  const handleInstrumentChange = useCallback(
    (instrumentId: number) => {
      if (selectedPadIndex === null) return;
      const existing = getMappingForPad(selectedPadIndex);
      const defaultNote = 36 + selectedPadIndex;

      const newMapping: PadMapping = {
        id: existing?.id || `10-${defaultNote}`,
        inputChannel: existing?.inputChannel || 9,
        inputNote: existing?.inputNote || defaultNote,
        type: 'instrument',
        targetInstrumentId: instrumentId,
        targetNote: existing?.targetNote || 60,
      };

      padManager.setMapping(newMapping);
      refreshMappings();
      previewInstrument(instrumentId);
    },
    [selectedPadIndex, getMappingForPad, padManager, refreshMappings, previewInstrument],
  );

  const handleNoteChange = useCallback(
    (note: number) => {
      if (selectedPadIndex === null) return;
      const existing = getMappingForPad(selectedPadIndex);
      if (!existing) return;

      padManager.setMapping({ ...existing, targetNote: note });
      refreshMappings();
    },
    [selectedPadIndex, getMappingForPad, padManager, refreshMappings],
  );

  const startLearn = useCallback(() => {
    if (selectedPadIndex === null) return;
    setIsLearning(true);

    padManager.startLearn((note, channel) => {
      const existing = getMappingForPad(selectedPadIndex);
      const targetId = existing?.targetInstrumentId ?? (instruments[0]?.id || 1);

      const newMapping: PadMapping = {
        id: `${channel}-${note}`,
        inputChannel: channel,
        inputNote: note,
        type: 'instrument',
        targetInstrumentId: targetId,
        targetNote: existing?.targetNote || 60,
      };

      if (existing && existing.id !== newMapping.id) {
        padManager.removeMapping(existing.id);
      }

      padManager.setMapping(newMapping);
      refreshMappings();
      setIsLearning(false);
    });
  }, [selectedPadIndex, getMappingForPad, instruments, padManager, refreshMappings]);

  const handleRemoveMapping = useCallback(() => {
    if (selectedPadIndex === null) return;
    const existing = getMappingForPad(selectedPadIndex);
    if (existing) {
      padManager.removeMapping(existing.id);
      refreshMappings();
    }
  }, [selectedPadIndex, getMappingForPad, padManager, refreshMappings]);

  const handleClearAll = useCallback(() => {
    const allMappings = padManager.getAllMappings();
    allMappings.forEach((m) => padManager.removeMapping(m.id));
    refreshMappings();
    setSelectedPadIndex(null);
  }, [padManager, refreshMappings]);

  // Instrument list scroll
  const handleInstWheel = useCallback(
    (e: FederatedWheelEvent) => {
      e.stopPropagation();
      const maxScroll = Math.max(0, instruments.length * INST_ROW_H - INST_LIST_H);
      setInstScrollY((prev) => Math.max(0, Math.min(maxScroll, prev + e.deltaY)));
    },
    [instruments.length],
  );

  if (!isOpen) return null;

  const visiblePads = DEFAULT_PADS.filter((p) => p.bank === activeBank);
  const currentPadMapping = selectedPadIndex !== null ? getMappingForPad(selectedPadIndex) : null;

  const instMaxScroll = Math.max(0, instruments.length * INST_ROW_H - INST_LIST_H);
  const clampedInstScroll = Math.min(instScrollY, instMaxScroll);

  return (
    <GlModal isOpen={isOpen} onClose={onClose} title="Drumpad Editor" width={MODAL_W} height={MODAL_H}>
      {/* Two-panel body */}
      <Div className="flex-row flex-1" layout={{ overflow: 'hidden' }}>
        {/* ── Left panel: Pad grid ── */}
        <Div
          className="flex-col items-center"
          layout={{
            width: LEFT_W,
            borderRightWidth: 1,
            borderColor: theme.border.color,
            padding: 16,
            gap: 10,
          }}
        >
          {/* Drum kit load + bank selector row */}
          <Div className="flex-row items-center gap-2" layout={{ width: LEFT_W - 24 }}>
            {drumMachines.length > 0 && (
              <PixiButton
                label={drumMachines.length === 1 ? drumMachines[0].name : 'Load Kit'}
                variant="primary"
                size="sm"
                width={90}
                onClick={() => handleLoadDrumMachine(drumMachines[0].id)}
              />
            )}
            <Div className="flex-1" />
            <PixiButton
              label="A"
              variant="ft2"
              size="sm"
              width={32}
              active={activeBank === 'A'}
              onClick={() => setActiveBank('A')}
            />
            <PixiButton
              label="B"
              variant="ft2"
              size="sm"
              width={32}
              active={activeBank === 'B'}
              onClick={() => setActiveBank('B')}
            />
          </Div>

          {/* 4×2 pad grid (8 visible pads per bank) */}
          <Div className="flex-row flex-wrap" layout={{ width: 4 * PAD_SIZE + 3 * PAD_GAP, gap: PAD_GAP }}>
            {visiblePads.map((pad) => {
              const mapping = getMappingForPad(pad.index);
              const isSelected = selectedPadIndex === pad.index;
              const hasMapped = !!mapping;

              return (
                <Div
                  key={pad.index}
                  className="flex-col items-center justify-center"
                  layout={{
                    width: PAD_SIZE,
                    height: PAD_SIZE,
                    backgroundColor: isSelected
                      ? theme.accent.color
                      : hasMapped
                        ? theme.bgTertiary.color
                        : theme.bgSecondary.color,
                    borderWidth: isSelected ? 2 : 1,
                    borderColor: isSelected
                      ? theme.accent.color
                      : hasMapped
                        ? theme.success.color
                        : theme.border.color,
                    borderRadius: 6,
                    padding: 4,
                  }}
                  eventMode="static"
                  cursor="pointer"
                  onPointerUp={() => setSelectedPadIndex(pad.index)}
                >
                  <Txt className={`text-[10px] font-bold ${isSelected ? 'text-text-primary' : 'text-text-muted'}`}>
                    {pad.label}
                  </Txt>
                  {mapping ? (
                    <>
                      <Txt
                        className={`text-[10px] font-mono ${isSelected ? 'text-text-primary' : 'text-text-secondary'}`}
                        layout={{ maxWidth: PAD_SIZE - 8 }}
                      >
                        {getInstrumentName(mapping.targetInstrumentId!).slice(0, 9)}
                      </Txt>
                      <Txt className="text-[10px] text-text-muted">{`N:${mapping.targetNote}`}</Txt>
                    </>
                  ) : (
                    <Txt className="text-[10px] text-text-muted" alpha={0.4}>
                      {'—'}
                    </Txt>
                  )}
                </Div>
              );
            })}
          </Div>

          {/* Clear All button */}
          <PixiButton label="Clear All" variant="danger" size="sm" width={100} onClick={handleClearAll} />
        </Div>

        {/* ── Right panel: Pad detail editor ── */}
        <Div
          className="flex-1 flex-col p-3 gap-3"
          layout={{ overflow: 'hidden', backgroundColor: theme.bgTertiary.color }}
        >
          {selectedPadIndex !== null ? (
            <>
              {/* Pad header */}
              <Div className="flex-row items-center justify-between">
                <Txt className="text-sm font-bold text-text-primary">{`Pad ${selectedPadIndex + 1}`}</Txt>
                {currentPadMapping && (
                  <PixiButton label="Remove" variant="danger" size="sm" width={72} onClick={handleRemoveMapping} />
                )}
              </Div>

              {/* Channel + Note display */}
              <Div
                className="flex-row items-center px-2 py-1"
                layout={{
                  backgroundColor: theme.bgSecondary.color,
                  borderWidth: 1,
                  borderColor: theme.border.color,
                  borderRadius: 3,
                  height: 26,
                }}
              >
                <Txt className="text-xs font-mono text-text-muted">
                  {currentPadMapping
                    ? `CH ${currentPadMapping.inputChannel + 1} | Note ${currentPadMapping.inputNote}`
                    : `Default: Note ${36 + selectedPadIndex}`}
                </Txt>
              </Div>

              {/* Learn button */}
              <PixiButton
                label={isLearning ? 'Learning...' : 'Learn'}
                variant={isLearning ? 'primary' : 'default'}
                size="sm"
                width={RIGHT_W - 24}
                onClick={startLearn}
              />

              {/* Target Instrument label */}
              <Txt className="text-[10px] font-bold text-text-muted uppercase">Target Instrument</Txt>

              {/* Instrument scrollable list */}
              <Div
                className="flex-col"
                layout={{
                  height: INST_LIST_H,
                  backgroundColor: theme.bgSecondary.color,
                  borderWidth: 1,
                  borderColor: theme.border.color,
                  borderRadius: 3,
                  overflow: 'hidden',
                }}
                eventMode="static"
                onWheel={handleInstWheel}
              >
                <pixiContainer y={-clampedInstScroll}>
                  <Div className="flex-col" layout={{ width: RIGHT_W - 26 }}>
                    {instruments.map((inst) => {
                      const isActive = currentPadMapping?.targetInstrumentId === inst.id;
                      return (
                        <Div
                          key={inst.id}
                          className="flex-row items-center px-2"
                          layout={{
                            height: INST_ROW_H,
                            backgroundColor: isActive ? theme.accent.color : undefined,
                          }}
                          eventMode="static"
                          cursor="pointer"
                          onPointerUp={() => handleInstrumentChange(inst.id)}
                        >
                          <Txt
                            className={`text-[10px] font-mono ${isActive ? 'text-text-primary' : 'text-text-muted'}`}
                            layout={{ width: 26 }}
                          >
                            {inst.id.toString(16).toUpperCase().padStart(2, '0')}
                          </Txt>
                          <Txt
                            className={`text-[10px] ${isActive ? 'text-text-primary font-bold' : 'text-text-secondary'}`}
                          >
                            {inst.name}
                          </Txt>
                        </Div>
                      );
                    })}
                  </Div>
                </pixiContainer>
              </Div>

              {/* Target Note */}
              <Txt className="text-[10px] font-bold text-text-muted uppercase">Target Note</Txt>
              <Div className="flex-row items-center gap-2">
                <PixiPureTextInput
                  value={String(currentPadMapping?.targetNote ?? 60)}
                  onChange={(v) => {
                    const n = parseInt(v, 10);
                    if (!isNaN(n) && n >= 0 && n <= 127) handleNoteChange(n);
                  }}
                  numeric
                  min={0}
                  max={127}
                  width={60}
                  height={24}
                  fontSize={11}
                />
                <Txt className="text-xs font-mono text-text-muted">
                  {noteName(currentPadMapping?.targetNote ?? 60)}
                </Txt>
                {currentPadMapping?.targetInstrumentId && (
                  <PixiButton
                    icon="play"
                    label=""
                    variant="ghost"
                    size="sm"
                    width={28}
                    onClick={() => previewInstrument(currentPadMapping.targetInstrumentId!)}
                  />
                )}
              </Div>
            </>
          ) : (
            <Div className="flex-1 flex-col items-center justify-center">
              <Txt className="text-sm text-text-muted" alpha={0.5}>
                Select a pad to edit
              </Txt>
            </Div>
          )}
        </Div>
      </Div>

      {/* Footer */}
      <GlModalFooter>
        <Txt className="text-[10px] text-text-muted" layout={{ flex: 1 }}>
          {`${mappings.length} mapping${mappings.length !== 1 ? 's' : ''} configured`}
        </Txt>
        <PixiButton label="Done" variant="primary" width={80} onClick={onClose} />
      </GlModalFooter>
    </GlModal>
  );
};
