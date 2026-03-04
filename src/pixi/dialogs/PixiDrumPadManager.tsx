/**
 * PixiDrumPadManager — GL-native drum pad manager.
 *
 * Always-mounted when activeView === 'drumpad'. Full-screen layout with:
 * - Left: 4×4 pad grid (per bank) with bank selector
 * - Right: Program selector, kit source, master controls, settings, note repeat, MPC resampling
 *
 * Port of src/components/drumpad/DrumPadManager.tsx using Div/Txt layout primitives.
 */

import React, { useState, useCallback, useEffect, useRef, useMemo } from 'react';
import { useApplication } from '@pixi/react';
import { useDrumPadStore } from '../../stores/useDrumPadStore';
import { useInstrumentStore, useAllSamplePacks } from '../../stores';
import { useUIStore } from '../../stores/useUIStore';
import {
  getAllKitSources,
  loadKitSource,
} from '../../lib/drumpad/defaultKitLoader';
import { getBankPads } from '../../types/drumpad';
import type { PadBank, MpcResampleConfig, DrumPad } from '../../types/drumpad';
import { DrumPadEngine } from '../../engine/drumpad/DrumPadEngine';
import { getAudioContext, resumeAudioContext } from '../../audio/AudioContextSingleton';
import { PixiButton } from '../components';
import { PixiSelect, type SelectOption } from '../components/PixiSelect';
import { PixiCheckbox } from '../components';
import { PixiViewHeader, VIEW_HEADER_HEIGHT } from '../components/PixiViewHeader';
import { PixiSlider } from '../components/PixiSlider';
import { usePixiTheme } from '../theme';
import { Div, Txt } from '../layout';

/* ── Constants ──────────────────────────────────────────────────────────────── */

const PAD_GAP = 6;
const GRID_COLS = 4;
const GRID_ROWS = 4;
const MIN_PAD_SIZE = 48;
const MAX_PAD_SIZE = 160;
const RIGHT_W = 240;
const HEADER_H = 36;
const BANK_ROW_H = 36; // bank selector row
const PAD_INFO_H = 56; // selected pad info box
const SHORTCUTS_H = 68; // shortcuts box
const LEFT_PADDING = 32; // p-4 top+bottom = 16+16
const BANKS: PadBank[] = ['A', 'B', 'C', 'D'];
const NOTE_REPEAT_RATES = ['1/4', '1/8', '1/16', '1/32', '1/8T', '1/16T'] as const;
const MPC_MODELS: { value: MpcResampleConfig['model']; label: string }[] = [
  { value: 'MPC60', label: 'MPC 60 (12-bit, 40kHz)' },
  { value: 'MPC3000', label: 'MPC 3000 (16-bit, 44.1kHz)' },
  { value: 'SP1200', label: 'SP-1200 (12-bit, 26kHz)' },
  { value: 'MPC2000XL', label: 'MPC 2000XL (16-bit, 44.1kHz)' },
];

/* ── Pad cell ───────────────────────────────────────────────────────────────── */

const PadCell: React.FC<{
  pad: DrumPad;
  selected: boolean;
  onSelect: () => void;
  onTrigger: (padId: number) => void;
  size: number;
}> = React.memo(({ pad, selected, onSelect, onTrigger, size }) => {
  const theme = usePixiTheme();
  const [hovered, setHovered] = useState(false);
  const [pressed, setPressed] = useState(false);
  const hasSample = !!pad.sample;

  const bg = pressed
    ? theme.accent.color
    : selected
      ? theme.accent.color
      : hovered
        ? theme.bgHover.color
        : hasSample
          ? theme.bgTertiary.color
          : theme.bg.color;

  const handlePointerDown = useCallback(() => {
    setPressed(true);
    onSelect();
    onTrigger(pad.id);
  }, [onSelect, onTrigger, pad.id]);

  const handlePointerUp = useCallback(() => {
    setPressed(false);
  }, []);

  return (
    <Div
      layout={{
        width: size,
        height: size,
        backgroundColor: bg,
        borderWidth: 1,
        borderColor: selected ? theme.accent.color : theme.border.color,
        borderRadius: 4,
        alignItems: 'center',
        justifyContent: 'center',
        flexDirection: 'column',
        gap: 2,
      }}
      eventMode="static"
      cursor="pointer"
      onPointerDown={handlePointerDown}
      onPointerUp={handlePointerUp}
      onPointerUpOutside={handlePointerUp}
      onPointerOver={() => setHovered(true)}
      onPointerOut={() => { setHovered(false); setPressed(false); }}
    >
      <Txt className={`${size >= 80 ? 'text-sm' : 'text-xs'} font-bold text-text-primary`}>{`${pad.id}`}</Txt>
      <Txt className={`${size >= 80 ? 'text-sm' : 'text-xs'} text-text-muted`}>
        {pad.name.length > (size >= 100 ? 14 : 8) ? pad.name.slice(0, size >= 100 ? 12 : 8) : pad.name}
      </Txt>
    </Div>
  );
});

/* ── Section header helper ──────────────────────────────────────────────────── */

const SectionHeader: React.FC<{ children: string }> = ({ children }) => (
  <Txt className="text-xs font-bold text-text-muted">{children}</Txt>
);

/* ── Main component ─────────────────────────────────────────────────────────── */

export const PixiDrumPadManager: React.FC = () => {
  const { app } = useApplication();
  const theme = usePixiTheme();

  const screenW = app?.screen?.width ?? 1920;
  const screenH = app?.screen?.height ?? 1080;

  /* ── Store state ── */
  const {
    programs,
    currentProgramId,
    loadProgram,
    createProgram,
    deleteProgram,
    copyProgram,
    saveProgram,
    preferences,
    setPreference,
    busLevels,
    setBusLevel,
    noteRepeatEnabled,
    noteRepeatRate,
    setNoteRepeatEnabled,
    setNoteRepeatRate,
    currentBank,
    setBank,
  } = useDrumPadStore();

  const allSamplePacks = useAllSamplePacks();
  const allKitSources = useMemo(() => getAllKitSources(allSamplePacks), [allSamplePacks]);
  const { createInstrument } = useInstrumentStore();

  const [selectedPadId, setSelectedPadId] = useState<number | null>(null);
  const [selectedKitSourceId, setSelectedKitSourceId] = useState<string>(allKitSources[0]?.id || '');
  const [alertMsg, setAlertMsg] = useState<string | null>(null);

  // Debounced master controls
  const [localMasterLevel, setLocalMasterLevel] = useState<number | null>(null);
  const [localMasterTune, setLocalMasterTune] = useState<number | null>(null);
  const masterLevelTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const masterTuneTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return () => {
      if (masterLevelTimerRef.current) clearTimeout(masterLevelTimerRef.current);
      if (masterTuneTimerRef.current) clearTimeout(masterTuneTimerRef.current);
    };
  }, []);

  /* ── Audio engine ── */
  const engineRef = useRef<DrumPadEngine | null>(null);

  useEffect(() => {
    const audioContext = getAudioContext();
    engineRef.current = new DrumPadEngine(audioContext);
    return () => {
      engineRef.current?.dispose();
      engineRef.current = null;
    };
  }, []);

  // Sync master level to engine
  useEffect(() => {
    if (engineRef.current && currentProgram) {
      engineRef.current.setMasterLevel(currentProgram.masterLevel);
    }
  }, [currentProgram?.masterLevel]);

  // Sync mute groups to engine
  useEffect(() => {
    if (engineRef.current && currentProgram) {
      engineRef.current.setMuteGroups(currentProgram.pads);
    }
  }, [currentProgram]);

  // Sync bus levels to engine
  useEffect(() => {
    if (!engineRef.current || !busLevels) return;
    for (const [bus, level] of Object.entries(busLevels)) {
      engineRef.current.setOutputLevel(bus, level);
    }
  }, [busLevels]);

  const handlePadTrigger = useCallback(async (padId: number) => {
    await resumeAudioContext();
    if (currentProgram && engineRef.current) {
      const pad = currentProgram.pads.find(p => p.id === padId);
      if (pad?.sample) {
        engineRef.current.triggerPad(pad, 100);
      }
    }
  }, [currentProgram]);

  /* ── Current program / pads ── */
  const currentProgram = programs.get(currentProgramId);
  const bankPads = useMemo(
    () => (currentProgram ? getBankPads(currentProgram.pads, currentBank) : []),
    [currentProgram, currentBank],
  );

  /* ── Program options for select ── */
  const programOptions: SelectOption[] = useMemo(
    () =>
      Array.from(programs.entries()).map(([id, prog]) => ({
        value: id,
        label: `${id} - ${prog.name}`,
      })),
    [programs],
  );

  /* ── Kit source options ── */
  const kitSourceOptions: SelectOption[] = useMemo(
    () =>
      allKitSources.map((s) => ({
        value: s.id,
        label: `${s.type === 'preset' ? '♪ ' : '▣ '}${s.name}`,
      })),
    [allKitSources],
  );

  /* ── Handlers ── */
  const handleProgramChange = useCallback(
    (id: string) => {
      loadProgram(id);
      setSelectedPadId(null);
    },
    [loadProgram],
  );

  const handleNewProgram = useCallback(() => {
    const existingIds = Array.from(programs.keys());
    let letter = 'A';
    let number = 1;
    while (existingIds.includes(`${letter}-${String(number).padStart(2, '0')}`)) {
      number++;
      if (number > 99) { number = 1; letter = String.fromCharCode(letter.charCodeAt(0) + 1); }
    }
    const newId = `${letter}-${String(number).padStart(2, '0')}`;
    createProgram(newId, `New Kit ${letter}${number}`);
  }, [programs, createProgram]);

  const handleCopyProgram = useCallback(() => {
    const existingIds = Array.from(programs.keys());
    let letter = 'A';
    let number = 1;
    while (existingIds.includes(`${letter}-${String(number).padStart(2, '0')}`)) {
      number++;
      if (number > 99) { number = 1; letter = String.fromCharCode(letter.charCodeAt(0) + 1); }
    }
    const newId = `${letter}-${String(number).padStart(2, '0')}`;
    copyProgram(currentProgramId, newId);
    loadProgram(newId);
  }, [programs, currentProgramId, copyProgram, loadProgram]);

  const handleDeleteProgram = useCallback(() => {
    if (programs.size <= 1) {
      setAlertMsg('Cannot delete the last program.');
      return;
    }
    deleteProgram(currentProgramId);
  }, [programs.size, currentProgramId, deleteProgram]);

  const handleLoadKit = useCallback(() => {
    try {
      const src = allKitSources.find((s) => s.id === selectedKitSourceId);
      if (!src) throw new Error('Kit source not found');
      const ids = loadKitSource(src, allSamplePacks, createInstrument);
      setAlertMsg(`Added ${ids.length} instruments from "${src.name}".`);
    } catch (err) {
      setAlertMsg(`Failed to load kit: ${err instanceof Error ? err.message : 'Unknown error'}`);
    }
  }, [selectedKitSourceId, allKitSources, allSamplePacks, createInstrument]);

  const handleMasterLevelChange = useCallback(
    (level: number) => {
      setLocalMasterLevel(level);
      if (masterLevelTimerRef.current) clearTimeout(masterLevelTimerRef.current);
      masterLevelTimerRef.current = setTimeout(() => {
        const prog = programs.get(currentProgramId);
        if (prog) { saveProgram({ ...prog, masterLevel: level }); setLocalMasterLevel(null); }
      }, 300);
    },
    [programs, currentProgramId, saveProgram],
  );

  const handleMasterTuneChange = useCallback(
    (tune: number) => {
      setLocalMasterTune(tune);
      if (masterTuneTimerRef.current) clearTimeout(masterTuneTimerRef.current);
      masterTuneTimerRef.current = setTimeout(() => {
        const prog = programs.get(currentProgramId);
        if (prog) { saveProgram({ ...prog, masterTune: tune }); setLocalMasterTune(null); }
      }, 300);
    },
    [programs, currentProgramId, saveProgram],
  );

  const handleMpcToggle = useCallback(
    (enabled: boolean) => {
      if (!currentProgram) return;
      saveProgram({
        ...currentProgram,
        mpcResample: { enabled, model: currentProgram.mpcResample?.model ?? 'MPC60' },
      });
    },
    [currentProgram, saveProgram],
  );

  const handleMpcModelChange = useCallback(
    (model: string) => {
      if (!currentProgram) return;
      saveProgram({
        ...currentProgram,
        mpcResample: { enabled: true, model: model as MpcResampleConfig['model'] },
      });
    },
    [currentProgram, saveProgram],
  );

  /* ── Derived values ── */
  const masterLevel = localMasterLevel ?? currentProgram?.masterLevel ?? 100;
  const masterTune = localMasterTune ?? currentProgram?.masterTune ?? 0;
  const mpcEnabled = currentProgram?.mpcResample?.enabled ?? false;
  const mpcModel = currentProgram?.mpcResample?.model ?? 'MPC60';

  const busesInUse = useMemo(() => {
    if (!currentProgram) return [];
    return ['out1', 'out2', 'out3', 'out4'].filter((bus) =>
      currentProgram.pads.some((p) => p.output === bus),
    );
  }, [currentProgram]);

  const selectedPad = useMemo(
    () => (selectedPadId != null ? currentProgram?.pads.find((p) => p.id === selectedPadId) : undefined),
    [selectedPadId, currentProgram],
  );

  const mpcModelOptions: SelectOption[] = useMemo(
    () => MPC_MODELS.map((m) => ({ value: m.value, label: m.label })),
    [],
  );

  /* ── Layout — compute pad size to fill available space ── */
  const availW = screenW - RIGHT_W - LEFT_PADDING - 1; // -1 for border
  const availH = screenH - HEADER_H - BANK_ROW_H - PAD_INFO_H - SHORTCUTS_H - LEFT_PADDING - 16; // extra gap
  const maxFromW = Math.floor((availW - (GRID_COLS - 1) * PAD_GAP) / GRID_COLS);
  const maxFromH = Math.floor((availH - (GRID_ROWS - 1) * PAD_GAP) / GRID_ROWS);
  const padSize = Math.max(MIN_PAD_SIZE, Math.min(MAX_PAD_SIZE, maxFromW, maxFromH));
  const gridW = GRID_COLS * padSize + (GRID_COLS - 1) * PAD_GAP;
  const gridH = GRID_ROWS * padSize + (GRID_ROWS - 1) * PAD_GAP;

  return (
    <Div
      className="flex-col"
      layout={{
        position: 'absolute',
        width: screenW,
        height: screenH,
        backgroundColor: theme.bg.color,
      }}
      eventMode="static"
    >
      {/* ── Header bar ── */}
      <PixiViewHeader activeView="drumpad" title="DRUM PADS">
        <Txt className="text-xs text-text-muted">MPC-style 64-pad drum machine</Txt>
        <pixiContainer layout={{ flex: 1 }} />
        <PixiButton
          label="MIDI Map"
          size="sm"
          variant="ghost"
          onClick={() => useUIStore.getState().openModal('midi-pads')}
        />
      </PixiViewHeader>

      {/* ── Main content: grid left, controls right ── */}
      <Div className="flex-1 flex-row" layout={{ overflow: 'hidden' }}>
        {/* ── Left: Pad grid + bank selector ── */}
        <Div className="flex-col items-center p-4 gap-4" layout={{ flex: 1 }}>
          {/* Bank selector */}
          <Div className="flex-row gap-2">
            {BANKS.map((bank) => (
              <PixiButton
                key={bank}
                label={`Bank ${bank}`}
                size="sm"
                variant={currentBank === bank ? 'primary' : 'default'}
                onClick={() => setBank(bank)}
                width={72}
              />
            ))}
          </Div>

          {/* 4×4 Pad grid */}
          <Div
            layout={{
              width: gridW,
              height: gridH,
              flexDirection: 'row',
              flexWrap: 'wrap',
              gap: PAD_GAP,
            }}
          >
            {bankPads.map((pad) => (
              <PadCell
                key={pad.id}
                pad={pad}
                selected={pad.id === selectedPadId}
                onSelect={() => setSelectedPadId(pad.id)}
                onTrigger={handlePadTrigger}
                size={padSize}
              />
            ))}
          </Div>

          {/* Selected pad info */}
          {selectedPad && (
            <Div
              className="flex-col p-3 gap-2"
              layout={{
                width: gridW,
                backgroundColor: theme.bgSecondary.color,
                borderWidth: 1,
                borderColor: theme.border.color,
                borderRadius: 4,
              }}
            >
              <Txt className="text-xs font-bold text-text-muted">{`PAD ${selectedPad.id}`}</Txt>
              <Txt className="text-sm text-text-primary">
                {selectedPad.name || 'Empty'}
              </Txt>
            </Div>
          )}

          {/* Shortcuts */}
          <Div
            className="flex-col p-3 gap-1"
            layout={{
              width: gridW,
              backgroundColor: theme.bgSecondary.color,
              borderWidth: 1,
              borderColor: theme.border.color,
              borderRadius: 4,
            }}
          >
            <Txt className="text-xs font-bold text-text-muted">SHORTCUTS</Txt>
            <Txt className="text-xs text-text-muted">Click: Select pad</Txt>
            <Txt className="text-xs text-text-muted">Q-R / A-F / Z-V / T-N: Trigger</Txt>
          </Div>
        </Div>

        {/* ── Right: Controls panel ── */}
        <Div
          className="flex-col p-4 gap-4"
          layout={{
            width: RIGHT_W,
            backgroundColor: theme.bgSecondary.color,
            borderLeftWidth: 1,
            borderColor: theme.border.color,
            overflow: 'scroll',
          }}
        >
          {/* Program selector */}
          <Div className="flex-col gap-2">
            <SectionHeader>PROGRAM</SectionHeader>
            <PixiSelect
              options={programOptions}
              value={currentProgramId}
              onChange={handleProgramChange}
              width={RIGHT_W - 32}
            />
            <Div className="flex-row gap-2">
              <PixiButton label="+ New" size="sm" variant="primary" onClick={handleNewProgram} width={64} />
              <PixiButton label="Copy" size="sm" color="blue" onClick={handleCopyProgram} width={56} />
              <PixiButton
                label="Delete"
                size="sm"
                variant="danger"
                onClick={handleDeleteProgram}
                disabled={programs.size <= 1}
                width={56}
              />
            </Div>
          </Div>

          {/* Kit source */}
          <Div className="flex-col gap-2">
            <SectionHeader>KIT SOURCE</SectionHeader>
            <PixiSelect
              options={kitSourceOptions}
              value={selectedKitSourceId}
              onChange={setSelectedKitSourceId}
              width={RIGHT_W - 32}
            />
            <PixiButton
              label="Add to Instruments"
              size="sm"
              color="green"
              onClick={handleLoadKit}
              width={RIGHT_W - 32}
            />
          </Div>

          {/* Master controls */}
          <Div className="flex-col gap-2">
            <SectionHeader>MASTER</SectionHeader>
            <Div className="flex-row items-center gap-2">
              <Txt className="text-xs text-text-muted">{`Level: ${masterLevel}`}</Txt>
            </Div>
            <PixiSlider
              value={masterLevel}
              min={0}
              max={127}
              orientation="horizontal"
              length={RIGHT_W - 32}
              onChange={handleMasterLevelChange}
            />
            <Div className="flex-row items-center gap-2">
              <Txt className="text-xs text-text-muted">{`Tune: ${masterTune} st`}</Txt>
            </Div>
            <PixiSlider
              value={masterTune}
              min={-12}
              max={12}
              step={1}
              orientation="horizontal"
              length={RIGHT_W - 32}
              onChange={handleMasterTuneChange}
              defaultValue={0}
              detent={0}
            />
          </Div>

          {/* Output buses */}
          {busesInUse.length > 0 && (
            <Div className="flex-col gap-2">
              <SectionHeader>OUTPUT BUSES</SectionHeader>
              {busesInUse.map((bus) => (
                <Div key={bus} className="flex-col gap-1">
                  <Txt className="text-xs text-text-muted">{`${bus}: ${busLevels[bus] ?? 100}`}</Txt>
                  <PixiSlider
                    value={busLevels[bus] ?? 100}
                    min={0}
                    max={127}
                    orientation="horizontal"
                    length={RIGHT_W - 32}
                    onChange={(v) => setBusLevel(bus, v)}
                  />
                </Div>
              ))}
            </Div>
          )}

          {/* Settings */}
          <Div className="flex-col gap-2">
            <SectionHeader>SETTINGS</SectionHeader>
            <Txt className="text-xs text-text-muted">
              {`Velocity Sensitivity: ${preferences.velocitySensitivity.toFixed(1)}x`}
            </Txt>
            <PixiSlider
              value={preferences.velocitySensitivity}
              min={0}
              max={2}
              step={0.1}
              orientation="horizontal"
              length={RIGHT_W - 32}
              onChange={(v) => setPreference('velocitySensitivity', v)}
            />
          </Div>

          {/* Note repeat */}
          <Div className="flex-col gap-2">
            <SectionHeader>NOTE REPEAT</SectionHeader>
            <PixiCheckbox
              checked={noteRepeatEnabled}
              onChange={setNoteRepeatEnabled}
              label="Enable"
            />
            <Div className="flex-row gap-1" layout={{ flexWrap: 'wrap' }}>
              {NOTE_REPEAT_RATES.map((rate) => (
                <PixiButton
                  key={rate}
                  label={rate}
                  size="sm"
                  variant={noteRepeatRate === rate ? 'primary' : 'ghost'}
                  onClick={() => setNoteRepeatRate(rate)}
                  width={44}
                />
              ))}
            </Div>
          </Div>

          {/* MPC resampling */}
          <Div className="flex-col gap-2">
            <SectionHeader>MPC RESAMPLING</SectionHeader>
            <PixiCheckbox
              checked={mpcEnabled}
              onChange={handleMpcToggle}
              label="Enable on sample load"
            />
            {mpcEnabled && (
              <Div className="flex-col gap-1">
                <Txt className="text-xs text-text-muted">Model</Txt>
                <PixiSelect
                  options={mpcModelOptions}
                  value={mpcModel}
                  onChange={handleMpcModelChange}
                  width={RIGHT_W - 32}
                />
              </Div>
            )}
          </Div>
        </Div>
      </Div>

      {/* ── Alert overlay ── */}
      {alertMsg && (
        <Div
          className="flex-col items-center justify-center"
          layout={{
            position: 'absolute',
            width: screenW,
            height: screenH,
          }}
          eventMode="static"
          onPointerUp={() => setAlertMsg(null)}
        >
          <Div
            className="flex-col p-6 gap-4 items-center"
            layout={{
              width: 360,
              backgroundColor: theme.bgSecondary.color,
              borderWidth: 1,
              borderColor: theme.border.color,
              borderRadius: 8,
            }}
            eventMode="static"
            onPointerDown={(e) => e.stopPropagation()}
          >
            <Txt className="text-sm text-text-primary">{alertMsg}</Txt>
            <PixiButton label="OK" variant="primary" onClick={() => setAlertMsg(null)} width={80} />
          </Div>
        </Div>
      )}
    </Div>
  );
};
