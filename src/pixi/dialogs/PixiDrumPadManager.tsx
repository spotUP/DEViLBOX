/**
 * PixiDrumPadManager — GL-native drum pad manager.
 *
 * Always-mounted when activeView === 'drumpad'. Full-screen layout with:
 * - Left: 4×4 pad grid (per bank) with bank selector
 * - Right: Program selector, kit source, master controls, settings, note repeat, MPC resampling
 *
 * Port of src/components/drumpad/DrumPadManager.tsx + PadGrid.tsx + PadButton.tsx
 * using Div/Txt layout primitives.
 */

import React, { useState, useCallback, useEffect, useRef, useMemo } from 'react';
import { useApplication } from '@pixi/react';
import { useDrumPadStore } from '../../stores/useDrumPadStore';
import { useInstrumentStore, useAllSamplePacks } from '../../stores';
import { useUIStore } from '../../stores/useUIStore';
import { useTransportStore } from '../../stores/useTransportStore';
import {
  getAllKitSources,
  createInstrumentsFromPreset,
  createInstrumentsFromSamplePack,
} from '../../lib/drumpad/defaultKitLoader';
import { getBankPads } from '../../types/drumpad';
import type { PadBank, MpcResampleConfig, DrumPad, SampleData, ScratchActionId } from '../../types/drumpad';
import { DrumPadEngine } from '../../engine/drumpad/DrumPadEngine';
import { NoteRepeatEngine } from '../../engine/drumpad/NoteRepeatEngine';
import type { NoteRepeatRate } from '../../engine/drumpad/NoteRepeatEngine';
import { getAudioContext, resumeAudioContext } from '../../audio/AudioContextSingleton';
import { PixiButton } from '../components';
import { PixiSelect, type SelectOption } from '../components/PixiSelect';
import { PixiCheckbox } from '../components';
import { PixiViewHeader } from '../components/PixiViewHeader';
import { PixiSlider } from '../components/PixiSlider';
import { PixiPadEditor } from './PixiPadEditor';
import { PixiPadSetupWizard } from './PixiPadSetupWizard';
import { PixiContextMenu, type ContextMenuItem } from '../input/PixiContextMenu';
import { usePadContextMenu } from '@/hooks/drumpad/usePadContextMenu';
import { usePadSetupWizard } from '@/hooks/drumpad/usePadSetupWizard';
import type { MenuItemType, MenuItem } from '@/components/common/ContextMenu';
import { PAD_COLOR_PRESETS } from '@/constants/padColorPresets';
import { usePixiTheme } from '../theme';
import { Div, Txt } from '../layout';
import type { Container, FederatedPointerEvent } from 'pixi.js';
import {
  djScratchBaby, djScratchTrans, djScratchFlare, djScratchHydro, djScratchCrab, djScratchOrbit,
  djScratchChirp, djScratchStab, djScratchScrbl, djScratchTear,
  djScratchUzi, djScratchTwiddle, djScratch8Crab, djScratch3Flare,
  djScratchLaser, djScratchPhaser, djScratchTweak, djScratchDrag, djScratchVibrato,
  djScratchStop, djFaderLFOOff, djFaderLFO14, djFaderLFO18, djFaderLFO116, djFaderLFO132,
} from '../../engine/keyboard/commands/djScratch';

/* ── Scratch action handlers ────────────────────────────────────────────────── */

const SCRATCH_ACTION_HANDLERS: Record<ScratchActionId, () => boolean> = {
  scratch_baby: djScratchBaby,
  scratch_trans: djScratchTrans,
  scratch_flare: djScratchFlare,
  scratch_hydro: djScratchHydro,
  scratch_crab: djScratchCrab,
  scratch_orbit: djScratchOrbit,
  scratch_chirp: djScratchChirp,
  scratch_stab: djScratchStab,
  scratch_scribble: djScratchScrbl,
  scratch_tear: djScratchTear,
  scratch_uzi: djScratchUzi,
  scratch_twiddle: djScratchTwiddle,
  scratch_8crab: djScratch8Crab,
  scratch_3flare: djScratch3Flare,
  scratch_laser: djScratchLaser,
  scratch_phaser: djScratchPhaser,
  scratch_tweak: djScratchTweak,
  scratch_drag: djScratchDrag,
  scratch_vibrato: djScratchVibrato,
  scratch_stop: djScratchStop,
  lfo_off: djFaderLFOOff,
  lfo_14: djFaderLFO14,
  lfo_18: djFaderLFO18,
  lfo_116: djFaderLFO116,
  lfo_132: djFaderLFO132,
};

/* ── QWERTY pad map ─────────────────────────────────────────────────────────── */

const KEY_TO_PAD: Record<string, number> = {
  q:0, w:1, e:2, r:3, a:4, s:5, d:6, f:7, z:8, x:9, c:10, v:11, t:12, y:13, u:14, i:15,
};

/* ── Constants ──────────────────────────────────────────────────────────────── */

const PAD_GAP = 6;
const GRID_COLS = 4;
const GRID_ROWS = 4;
const MIN_PAD_SIZE = 48;
const MAX_PAD_SIZE = 90;
const RIGHT_W = 240;
const EDITOR_W = 320;
const HEADER_H = 36;
const BANK_ROW_H = 36; // bank selector row
const PROGRAM_INFO_H = 40; // program info row
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

interface PadCellProps {
  pad: DrumPad;
  selected: boolean;
  focused: boolean;
  velocity: number;
  onSelect: () => void;
  onTrigger: (padId: number, velocity: number) => void;
  onRelease: (padId: number) => void;
  onRightClick: (padId: number, x: number, y: number) => void;
  onEmptyClick: (padId: number) => void;
  size: number;
}

const PadCell: React.FC<PadCellProps> = React.memo(({ pad, selected, focused, velocity, onSelect, onTrigger, onRelease, onRightClick, onEmptyClick, size }) => {
  const theme = usePixiTheme();
  const [hovered, setHovered] = useState(false);
  const [pressed, setPressed] = useState(false);
  const [flashIntensity, setFlashIntensity] = useState(0);
  const flashRef = useRef<number>(0);
  const hasSample = !!pad.sample;

  // Clean up rAF on unmount
  useEffect(() => {
    return () => cancelAnimationFrame(flashRef.current);
  }, []);

  const startFlash = useCallback((vel: number) => {
    const intensity = vel / 127;
    setFlashIntensity(intensity);
    cancelAnimationFrame(flashRef.current);
    const startTime = performance.now();
    const duration = 200 + intensity * 200;
    const decay = () => {
      const elapsed = performance.now() - startTime;
      const progress = Math.min(elapsed / duration, 1);
      setFlashIntensity(intensity * Math.pow(1 - progress, 2));
      if (progress < 1) flashRef.current = requestAnimationFrame(decay);
    };
    flashRef.current = requestAnimationFrame(decay);
  }, []);

  const bg = pressed
    ? theme.accent.color
    : selected
      ? theme.accent.color
      : hovered
        ? theme.bgHover.color
        : hasSample
          ? theme.bgTertiary.color
          : theme.bg.color;

  const borderColor = focused && !selected
    ? theme.accent.color // blue for keyboard focus
    : selected
      ? theme.accent.color
      : theme.border.color;

  const isLoaded = !!(pad.sample || pad.synthConfig || (pad as { instrumentId?: number }).instrumentId != null || pad.scratchAction || (pad as { djFxAction?: string }).djFxAction);

  const handlePointerDown = useCallback((e: FederatedPointerEvent) => {
    if (e.button === 2) { onRightClick(pad.id, e.globalX, e.globalY); return; }
    if (!isLoaded) { onEmptyClick(pad.id); return; }
    const local = e.getLocalPosition(e.currentTarget as Container);
    const relativeY = local.y / size;
    const vel = Math.max(1, Math.min(127, Math.floor((1 - relativeY) * 127)));
    setPressed(true);
    onSelect();
    startFlash(vel);
    onTrigger(pad.id, vel);
  }, [pad.id, size, isLoaded, onSelect, onTrigger, onRightClick, onEmptyClick, startFlash]);

  const handlePointerUp = useCallback(() => {
    setPressed(false);
    onRelease(pad.id);
  }, [pad.id, onRelease]);

  const truncatedName = pad.name;

  return (
    <Div
      layout={{
        width: size,
        height: size,
        backgroundColor: bg,
        borderWidth: focused && !selected ? 2 : 1,
        borderColor,
        borderRadius: 4,
        flexDirection: 'column',
      }}
      eventMode="static"
      cursor="pointer"
      onPointerDown={handlePointerDown}
      onPointerUp={handlePointerUp}
      onPointerOver={() => setHovered(true)}
      onPointerOut={() => { setHovered(false); setPressed(false); }}
    >
      {/* Flash overlay */}
      {flashIntensity > 0.01 && (
        <Div
          layout={{
            position: 'absolute',
            width: size,
            height: size,
            backgroundColor: 0x10b981,
            borderRadius: 4,
          }}
          alpha={flashIntensity * 0.7}
        />
      )}

      {/* Pad number — top-left */}
      <Txt
        className="text-[10px] font-mono text-text-muted"
        layout={{ position: 'absolute', left: 4, top: 3 }}
      >
        {String(pad.id)}
      </Txt>

      {/* Pad name — centered */}
      <Div layout={{ flex: 1, alignItems: 'center', justifyContent: 'center', paddingLeft: 4, paddingRight: 4 }}>
        {hasSample ? (
          <Txt className={`${size >= 80 ? 'text-xs' : 'text-[10px]'} font-bold text-text-primary`}>
            {truncatedName}
          </Txt>
        ) : (
          <Txt className="text-lg text-text-muted">+</Txt>
        )}
      </Div>

      {/* Badges — bottom-left */}
      <Div layout={{ position: 'absolute', left: 4, bottom: 3, flexDirection: 'row', gap: 2 }}>
        {pad.muteGroup > 0 && (
          <Txt className="text-[8px] font-mono text-[#fbbf24]">{`M${pad.muteGroup}`}</Txt>
        )}
        {pad.playMode === 'sustain' && (
          <Txt className="text-[8px] font-mono text-[#60a5fa]">S</Txt>
        )}
        {pad.reverse && (
          <Txt className="text-[8px] font-mono text-[#a78bfa]">R</Txt>
        )}
      </Div>

      {/* Velocity dot — bottom-right */}
      {velocity > 0 && hasSample && (
        <Div
          layout={{
            position: 'absolute',
            right: 4,
            bottom: 4,
            width: 6,
            height: 6,
            backgroundColor: 0x34d399,
            borderRadius: 3,
          }}
          alpha={0.3 + (velocity / 127) * 0.7}
        />
      )}
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

  let screenW = 1920;
  let screenH = 1080;
  try { screenW = app?.screen?.width || 1920; screenH = app?.screen?.height || 1080; } catch { /* app not ready */ }

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
    loadSampleToPad,
    clearPad,
  } = useDrumPadStore();

  const allSamplePacks = useAllSamplePacks();
  const allKitSources = useMemo(() => getAllKitSources(allSamplePacks), [allSamplePacks]);
  const instruments = useInstrumentStore(s => s.instruments);

  const [selectedPadId, setSelectedPadId] = useState<number | null>(null);
  const [selectedKitSourceId, setSelectedKitSourceId] = useState<string>(allKitSources[0]?.id || '');
  const [importInstrumentId, setImportInstrumentId] = useState<number | null>(null);
  const [alertMsg, setAlertMsg] = useState<string | null>(null);
  const [showPadEditor, setShowPadEditor] = useState(false);
  const [padVelocities, setPadVelocities] = useState<Record<number, number>>({});
  const [focusedPadId, setFocusedPadId] = useState<number>(1);
  const [ctxMenuPadId, setCtxMenuPadId] = useState<number | null>(null);
  const [ctxMenuPos, setCtxMenuPos] = useState<{ x: number; y: number }>({ x: 0, y: 0 });
  const [ctxMenuOpen, setCtxMenuOpen] = useState(false);
  const padWizard = usePadSetupWizard();
  const noteRepeatRef = useRef<NoteRepeatEngine | null>(null);
  const noteRepeatEnabledRef = useRef(false);
  const heldPadsRef = useRef<Set<number>>(new Set());

  /* ── Current program / pads ── */
  const currentProgram = programs.get(currentProgramId);

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

  /* ── Audio engine + NoteRepeat ── */
  const engineRef = useRef<DrumPadEngine | null>(null);
  const bpm = useTransportStore(s => s.bpm);

  useEffect(() => {
    const audioContext = getAudioContext();
    engineRef.current = new DrumPadEngine(audioContext);
    noteRepeatRef.current = new NoteRepeatEngine(engineRef.current);
    // Load persisted audio samples from IndexedDB
    useDrumPadStore.getState().loadFromIndexedDB(audioContext);
    return () => {
      noteRepeatRef.current?.dispose();
      noteRepeatRef.current = null;
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

  // Sync note repeat state
  useEffect(() => {
    noteRepeatEnabledRef.current = noteRepeatEnabled;
    noteRepeatRef.current?.setEnabled(noteRepeatEnabled);
  }, [noteRepeatEnabled]);

  useEffect(() => {
    noteRepeatRef.current?.setRate(noteRepeatRate as NoteRepeatRate);
  }, [noteRepeatRate]);

  useEffect(() => {
    noteRepeatRef.current?.setBpm(bpm);
  }, [bpm]);

  // Reset focused pad on bank change
  useEffect(() => {
    const bankOffset = { A: 0, B: 16, C: 32, D: 48 }[currentBank];
    setFocusedPadId(bankOffset + 1);
  }, [currentBank]);

  const handlePadTrigger = useCallback(async (padId: number, velocity: number) => {
    setPadVelocities(prev => ({ ...prev, [padId]: velocity }));
    await resumeAudioContext();
    if (currentProgram && engineRef.current) {
      const pad = currentProgram.pads.find(p => p.id === padId);
      if (pad) {
        if (pad.scratchAction) {
          SCRATCH_ACTION_HANDLERS[pad.scratchAction]?.();
        }
        if (pad.sample) {
          engineRef.current.triggerPad(pad, velocity);
        }
        if (pad.playMode === 'sustain') {
          heldPadsRef.current.add(padId);
        }
        if (noteRepeatEnabledRef.current && noteRepeatRef.current) {
          noteRepeatRef.current.startRepeat(pad, velocity);
          heldPadsRef.current.add(padId);
        }
      }
    }
    setTimeout(() => {
      setPadVelocities(prev => ({ ...prev, [padId]: 0 }));
    }, 200);
  }, [currentProgram]);

  const handlePadRelease = useCallback((padId: number) => {
    if (!heldPadsRef.current.has(padId)) return;
    heldPadsRef.current.delete(padId);
    noteRepeatRef.current?.stopRepeat(padId);
    if (currentProgram && engineRef.current) {
      const pad = currentProgram.pads.find(p => p.id === padId);
      if (pad && pad.playMode === 'sustain') {
        engineRef.current.stopPad(padId, pad.release / 1000);
      }
    }
  }, [currentProgram]);

  const handleEmptyPadClick = useCallback((padId: number) => {
    setSelectedPadId(padId);
    padWizard.open(padId);
  }, [padWizard]);

  const handlePadRightClick = useCallback((padId: number, x: number, y: number) => {
    setCtxMenuPadId(padId);
    setCtxMenuPos({ x, y });
    setCtxMenuOpen(true);
  }, []);

  const ctxMenuCallbacks = useMemo(() => ({
    onEdit: (id: number) => { setSelectedPadId(id); setShowPadEditor(true); },
    onWizard: (id: number) => { setSelectedPadId(id); padWizard.open(id); },
    onPreview: (id: number) => {
      const prog = useDrumPadStore.getState().programs.get(useDrumPadStore.getState().currentProgramId);
      const p = prog?.pads.find(pp => pp.id === id);
      if (p && engineRef.current) engineRef.current.triggerPad(p, 100);
    },
  }), [padWizard]);

  const ctxMenuItemsDOM = usePadContextMenu(ctxMenuPadId, ctxMenuCallbacks);
  const ctxMenuItems: ContextMenuItem[] = useMemo(() => {
    function mapItems(items: MenuItemType[]): ContextMenuItem[] {
      return items.map((item) => {
        if (item.type === 'divider') return { label: '', separator: true };
        const mi = item as MenuItem;
        return {
          label: mi.label + (mi.checked ? ' \u2713' : ''),
          action: mi.onClick,
          disabled: mi.disabled,
          submenu: mi.submenu ? mapItems(mi.submenu) : undefined,
        };
      });
    }
    return mapItems(ctxMenuItemsDOM);
  }, [ctxMenuItemsDOM]);

  const handleStopAll = useCallback(() => {
    engineRef.current?.stopAll();
    heldPadsRef.current.clear();
  }, []);

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

  /* ── Import from project options ── */
  const importInstrumentOptions: SelectOption[] = useMemo(
    () =>
      instruments
        .filter(inst => inst.type === 'sample' && inst.sample?.url)
        .map(inst => ({ value: String(inst.id), label: `${inst.id}: ${inst.name}` })),
    [instruments],
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

  const handleLoadKit = useCallback(async () => {
    try {
      const src = allKitSources.find((s) => s.id === selectedKitSourceId);
      if (!src) throw new Error('Kit source not found');

      // Get sample URLs from kit source (no project instruments created)
      let samples: Array<{ name: string; url: string }> = [];
      if (src.type === 'preset') {
        samples = createInstrumentsFromPreset(src.id);
      } else if (src.type === 'samplepack') {
        const pack = allSamplePacks.find(p => p.id === src.id);
        if (!pack) throw new Error('Sample pack not found');
        samples = createInstrumentsFromSamplePack(pack);
      }

      // Fetch audio and load directly onto current bank's pads
      const audioContext = getAudioContext();
      const bankOffset = { A: 0, B: 16, C: 32, D: 48 }[currentBank];
      let loaded = 0;
      for (let i = 0; i < Math.min(samples.length, 16); i++) {
        const { name, url } = samples[i];
        const padId = bankOffset + i + 1;
        try {
          const response = await fetch(url);
          const arrayBuffer = await response.arrayBuffer();
          const audioBuffer = await audioContext.decodeAudioData(arrayBuffer);
          const sampleData: SampleData = {
            id: `kit-${src.id}-${i}`,
            name,
            audioBuffer,
            duration: audioBuffer.duration,
            sampleRate: audioBuffer.sampleRate,
          };
          await loadSampleToPad(padId, sampleData);
          loaded++;
        } catch (e) {
          console.warn(`[DrumPad] Failed to load sample "${name}" from ${url}:`, e);
        }
      }
      setAlertMsg(`Loaded ${loaded} samples from "${src.name}" to Bank ${currentBank}.`);
    } catch (err) {
      setAlertMsg(`Failed to load kit: ${err instanceof Error ? err.message : 'Unknown error'}`);
    }
  }, [selectedKitSourceId, allKitSources, allSamplePacks, currentBank, loadSampleToPad]);

  const handleImportFromProject = useCallback(async () => {
    if (selectedPadId == null) {
      setAlertMsg('Select a pad first to import a project instrument.');
      return;
    }
    // Build list of sample-type instruments
    const sampleInstruments = instruments.filter(
      inst => inst.type === 'sample' && inst.sample?.url,
    );
    if (sampleInstruments.length === 0) {
      setAlertMsg('No sample instruments in project to import.');
      return;
    }
    // Load first available sample instrument onto selected pad (user picks via dropdown)
    const inst = sampleInstruments.find(i => i.id === importInstrumentId) ?? sampleInstruments[0];
    if (!inst.sample?.url) return;
    try {
      const audioContext = getAudioContext();
      const response = await fetch(inst.sample.url);
      const arrayBuffer = await response.arrayBuffer();
      const audioBuffer = await audioContext.decodeAudioData(arrayBuffer);
      const sampleData: SampleData = {
        id: `proj-${inst.id}`,
        name: inst.name,
        audioBuffer,
        duration: audioBuffer.duration,
        sampleRate: audioBuffer.sampleRate,
      };
      await loadSampleToPad(selectedPadId, sampleData);
      setAlertMsg(`Imported "${inst.name}" to pad ${selectedPadId}.`);
    } catch (err) {
      setAlertMsg(`Failed to import: ${err instanceof Error ? err.message : 'Unknown error'}`);
    }
  }, [selectedPadId, instruments, importInstrumentId, loadSampleToPad]);

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

  const handleLoadSampleFromFile = useCallback(() => {
    if (selectedPadId == null) {
      setAlertMsg('Select a pad first.');
      return;
    }
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'audio/*,.wav,.mp3,.ogg,.flac,.aiff,.aif';
    input.onchange = async () => {
      const file = input.files?.[0];
      if (!file) return;
      try {
        const audioContext = getAudioContext();
        const arrayBuffer = await file.arrayBuffer();
        const audioBuffer = await audioContext.decodeAudioData(arrayBuffer);
        const sampleData: SampleData = {
          id: `file_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
          name: file.name.replace(/\.[^/.]+$/, ''),
          audioBuffer,
          duration: audioBuffer.duration,
          sampleRate: audioBuffer.sampleRate,
        };
        await loadSampleToPad(selectedPadId, sampleData);
        setAlertMsg(`Loaded "${sampleData.name}" to pad ${selectedPadId}.`);
      } catch (err) {
        setAlertMsg(`Failed to load audio: ${err instanceof Error ? err.message : 'Unknown error'}`);
      }
    };
    input.click();
  }, [selectedPadId, loadSampleToPad]);

  const handleExport = useCallback(async () => {
    try {
      const blob = await useDrumPadStore.getState().exportAllConfigs();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${currentProgram?.name || 'drumpad'}.dvbpads`;
      a.click();
      URL.revokeObjectURL(url);
    } catch {
      setAlertMsg('Export failed.');
    }
  }, [currentProgram]);

  const handleImport = useCallback(() => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.dvbpads';
    input.onchange = async () => {
      const file = input.files?.[0];
      if (!file) return;
      try {
        const audioContext = getAudioContext();
        await useDrumPadStore.getState().importConfigs(file, audioContext);
        setAlertMsg('Programs imported successfully.');
      } catch {
        setAlertMsg('Import failed.');
      }
    };
    input.click();
  }, []);

  // Keyboard navigation + QWERTY pad triggers
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement;
      if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.tagName === 'SELECT') return;

      const bankOffset = { A: 0, B: 16, C: 32, D: 48 }[currentBank];
      const bankStart = bankOffset + 1;
      const bankEnd = bankOffset + 16;
      let newFocused = focusedPadId;

      switch (event.key) {
        case 'ArrowLeft': event.preventDefault(); newFocused = focusedPadId > bankStart ? focusedPadId - 1 : bankEnd; break;
        case 'ArrowRight': event.preventDefault(); newFocused = focusedPadId < bankEnd ? focusedPadId + 1 : bankStart; break;
        case 'ArrowUp': event.preventDefault(); newFocused = focusedPadId > bankStart + 3 ? focusedPadId - 4 : focusedPadId + 12; break;
        case 'ArrowDown': event.preventDefault(); newFocused = focusedPadId <= bankEnd - 4 ? focusedPadId + 4 : focusedPadId - 12; break;
        case 'Enter': case ' ': event.preventDefault(); handlePadTrigger(focusedPadId, 100); break;
        default: break;
      }
      if (newFocused !== focusedPadId) setFocusedPadId(newFocused);
    };

    const handleQWERTY = (event: KeyboardEvent) => {
      if (event.repeat) return;
      const target = event.target as HTMLElement;
      if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.tagName === 'SELECT') return;
      const idx = KEY_TO_PAD[event.key.toLowerCase()];
      if (idx === undefined) return;
      const bankOffset = { A: 0, B: 16, C: 32, D: 48 }[currentBank];
      const padId = bankOffset + idx + 1;
      const velocity = event.shiftKey ? 100 : 80;
      handlePadTrigger(padId, velocity);
    };

    const handleQWERTYUp = (event: KeyboardEvent) => {
      const idx = KEY_TO_PAD[event.key.toLowerCase()];
      if (idx === undefined) return;
      const bankOffset = { A: 0, B: 16, C: 32, D: 48 }[currentBank];
      handlePadRelease(bankOffset + idx + 1);
    };

    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keydown', handleQWERTY);
    window.addEventListener('keyup', handleQWERTYUp);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('keydown', handleQWERTY);
      window.removeEventListener('keyup', handleQWERTYUp);
    };
  }, [focusedPadId, currentBank, handlePadTrigger, handlePadRelease]);

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

  const bankLoadedCount = bankPads.filter(p => p.sample !== null).length;
  const totalLoadedCount = currentProgram?.pads.filter(p => p.sample !== null).length ?? 0;

  /* ── Layout — compute pad size to fill available space ── */
  const rightPanelW = showPadEditor ? EDITOR_W : RIGHT_W;
  const availW = screenW - rightPanelW - LEFT_PADDING - 1; // -1 for border
  const availH = screenH - HEADER_H - BANK_ROW_H - PROGRAM_INFO_H - PAD_INFO_H - SHORTCUTS_H - LEFT_PADDING - 16;
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
          {/* Program info row */}
          <Div className="flex-row items-center gap-2" layout={{ width: gridW }}>
            <Div className="flex-col" layout={{ flex: 1 }}>
              <Txt className="text-sm font-bold text-text-primary">{currentProgram?.name ?? ''}</Txt>
              <Txt className="text-xs text-text-muted">{currentProgramId}</Txt>
            </Div>
            <PixiButton label="Stop All" size="sm" variant="ghost" onClick={handleStopAll} />
            <PixiButton label="Export" size="sm" variant="ghost" onClick={handleExport} />
            <PixiButton label="Import" size="sm" variant="ghost" onClick={handleImport} />
          </Div>

          {/* Bank selector */}
          <Div className="flex-row items-center gap-2" layout={{ width: gridW }}>
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
            <Div layout={{ flex: 1 }} />
            <Txt className="text-xs text-text-muted">{`${bankLoadedCount}/16 (${totalLoadedCount}/64)`}</Txt>
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
                focused={pad.id === focusedPadId}
                velocity={padVelocities[pad.id] || 0}
                onSelect={() => setSelectedPadId(pad.id)}
                onTrigger={handlePadTrigger}
                onRelease={handlePadRelease}
                onRightClick={handlePadRightClick}
                onEmptyClick={handleEmptyPadClick}
                size={padSize}
              />
            ))}
          </Div>

          {/* Selected pad info */}
          {selectedPad ? (
            <Div
              className="flex-row gap-2 items-center p-3"
              layout={{
                width: gridW,
                backgroundColor: theme.bgSecondary.color,
                borderWidth: 1,
                borderColor: theme.border.color,
                borderRadius: 4,
              }}
            >
              <Txt className="text-xs text-text-muted" layout={{ flex: 1 }}>
                {`Pad ${selectedPad.id}: ${selectedPad.name} ${selectedPad.sample ? `(${selectedPad.sample.duration.toFixed(2)}s)` : '(empty)'}`}
              </Txt>
              <PixiButton label="Edit" size="sm" variant="primary" onClick={() => setShowPadEditor(true)} />
              <PixiButton label="Load File" size="sm" color="blue" onClick={handleLoadSampleFromFile} />
              <PixiButton
                label="Clear"
                size="sm"
                variant="danger"
                onClick={() => { if (selectedPadId != null) clearPad(selectedPadId); }}
                disabled={!selectedPad.sample}
              />
            </Div>
          ) : (
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
              <Txt className="text-xs text-text-muted">Click a pad to select it</Txt>
            </Div>
          )}

          {/* Keyboard shortcuts */}
          <Div
            className="flex-col p-3 gap-1"
            layout={{
              width: gridW,
              backgroundColor: theme.bgTertiary.color,
              borderWidth: 1,
              borderColor: theme.border.color,
              borderRadius: 4,
            }}
          >
            <Txt className="text-xs text-text-muted">Q-R / A-F / Z-V / T-I = trigger pads</Txt>
            <Txt className="text-xs text-text-muted">Arrow keys = navigate  |  Enter = trigger</Txt>
            <Txt className="text-xs text-text-muted">Shift = harder velocity</Txt>
          </Div>
        </Div>

        {/* ── Right: Pad editor or Controls panel ── */}
        {showPadEditor && selectedPadId != null ? (
          <PixiPadEditor
            padId={selectedPadId}
            width={EDITOR_W}
            onClose={() => setShowPadEditor(false)}
          />
        ) : (
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

          {/* ── Inline Pad Quick-Edit ──────────────────────────────── */}
          <Div className="flex-col gap-3" layout={{ backgroundColor: theme.bg.color, borderWidth: 1, borderColor: theme.border.color, borderRadius: 6, padding: 8 }}>
            {selectedPadId != null && selectedPad ? (() => {
              const { updatePad: updPad, clearPad: clrPad } = useDrumPadStore.getState();
              const sliderW = RIGHT_W - 48;
              return (
                <>
                  <Div className="flex-row items-center gap-2">
                    <Txt className="text-[10px] text-text-muted">{`PAD ${selectedPadId}`}</Txt>
                    {selectedPad.synthConfig && <Txt className="text-[9px] text-blue-400">{selectedPad.synthConfig.synthType}</Txt>}
                    {selectedPad.sample && <Txt className="text-[9px] text-emerald-400">{selectedPad.sample.name}</Txt>}
                  </Div>
                  <Div className="flex-col gap-1">
                    <Txt className="text-[10px] text-text-muted">{`Level: ${selectedPad.level}`}</Txt>
                    <PixiSlider value={selectedPad.level} min={0} max={127} orientation="horizontal" length={sliderW}
                      onChange={(v) => updPad(selectedPadId, { level: v })} />
                  </Div>
                  <Div className="flex-col gap-1">
                    <Txt className="text-[10px] text-text-muted">{`Tune: ${(selectedPad.tune / 10).toFixed(1)} st`}</Txt>
                    <PixiSlider value={selectedPad.tune} min={-120} max={120} step={1} orientation="horizontal" length={sliderW}
                      onChange={(v) => updPad(selectedPadId, { tune: v })} defaultValue={0} detent={0} />
                  </Div>
                  <Div className="flex-col gap-1">
                    <Txt className="text-[10px] text-text-muted">Mode</Txt>
                    <Div className="flex-row gap-2">
                      <PixiButton label="One-shot" size="sm" variant={selectedPad.playMode === 'oneshot' ? 'primary' : 'default'} height={22} width={70}
                        onClick={() => updPad(selectedPadId, { playMode: 'oneshot' })} />
                      <PixiButton label="Sustain" size="sm" variant={selectedPad.playMode === 'sustain' ? 'primary' : 'default'} height={22} width={70}
                        onClick={() => updPad(selectedPadId, { playMode: 'sustain' })} />
                    </Div>
                  </Div>
                  <Div className="flex-col gap-1">
                    <Txt className="text-[10px] text-text-muted">Mute Group</Txt>
                    <Div className="flex-row gap-2">
                      {[0,1,2,3,4,5,6,7,8].map(g => (
                        <PixiButton key={g} label={g === 0 ? '-' : String(g)} size="sm" variant={selectedPad.muteGroup === g ? 'primary' : 'default'} height={20} width={20}
                          onClick={() => updPad(selectedPadId, { muteGroup: g })} />
                      ))}
                    </Div>
                  </Div>
                  <Div className="flex-col gap-1">
                    <Txt className="text-[10px] text-text-muted">Color</Txt>
                    <Div className="flex-row gap-2" layout={{ flexWrap: 'wrap' }}>
                      <Div eventMode="static" cursor="pointer" onPointerUp={() => updPad(selectedPadId, { color: undefined })}
                        layout={{ width: 16, height: 16, backgroundColor: theme.bgTertiary.color, borderWidth: !selectedPad.color ? 2 : 1, borderColor: !selectedPad.color ? theme.accent.color : theme.borderLight.color, borderRadius: 3 }} />
                      {PAD_COLOR_PRESETS.map(c => {
                        const num = parseInt(c.hex.slice(1), 16);
                        const sel = selectedPad.color === c.hex;
                        return (
                          <Div key={c.id} eventMode="static" cursor="pointer" onPointerUp={() => updPad(selectedPadId, { color: c.hex })}
                            layout={{ width: 16, height: 16, backgroundColor: num, borderWidth: sel ? 2 : 1, borderColor: sel ? 0xffffff : theme.borderLight.color, borderRadius: 3 }} />
                        );
                      })}
                    </Div>
                  </Div>
                  <Div className="flex-row gap-2">
                    <PixiButton label="Full Editor" size="sm" color="blue" height={24} width={90} onClick={() => setShowPadEditor(true)} />
                    <PixiButton label="Clear" size="sm" variant="danger" height={24} width={56} onClick={() => clrPad(selectedPadId)} />
                  </Div>
                </>
              );
            })() : (
              <Div layout={{ height: 60, alignItems: 'center', justifyContent: 'center' }}>
                <Txt className="text-[10px] text-text-muted">Click a pad to edit</Txt>
              </Div>
            )}
          </Div>

          {/* ── Advanced Toggle ──────────────────────────────────────── */}
          <PixiCheckbox
            checked={preferences.showAdvanced}
            onChange={(v) => setPreference('showAdvanced', v)}
            label="Advanced"
          />

          {/* ── Advanced Sections ────────────────────────────────────── */}
          {preferences.showAdvanced && (<>
            <Div className="flex-col gap-2">
              <SectionHeader>KIT SOURCE</SectionHeader>
              <PixiSelect options={kitSourceOptions} value={selectedKitSourceId} onChange={setSelectedKitSourceId} width={RIGHT_W - 32} />
              <PixiButton label="Load to Pads" size="sm" color="green" onClick={handleLoadKit} width={RIGHT_W - 32} />
            </Div>
            <Div className="flex-col gap-2">
              <SectionHeader>IMPORT FROM PROJECT</SectionHeader>
              <PixiSelect options={importInstrumentOptions} value={importInstrumentId != null ? String(importInstrumentId) : ''} onChange={(v) => setImportInstrumentId(Number(v))} width={RIGHT_W - 32} />
              <PixiButton label="Import to Pad" size="sm" color="blue" onClick={handleImportFromProject} disabled={selectedPadId == null || importInstrumentOptions.length === 0} width={RIGHT_W - 32} />
            </Div>
            <Div className="flex-col gap-2">
              <SectionHeader>MASTER</SectionHeader>
              <Txt className="text-xs text-text-muted">{`Level: ${masterLevel}`}</Txt>
              <PixiSlider value={masterLevel} min={0} max={127} orientation="horizontal" length={RIGHT_W - 32} onChange={handleMasterLevelChange} />
              <Txt className="text-xs text-text-muted">{`Tune: ${masterTune} st`}</Txt>
              <PixiSlider value={masterTune} min={-12} max={12} step={1} orientation="horizontal" length={RIGHT_W - 32} onChange={handleMasterTuneChange} defaultValue={0} detent={0} />
            </Div>
            {busesInUse.length > 0 && (
              <Div className="flex-col gap-2">
                <SectionHeader>OUTPUT BUSES</SectionHeader>
                {busesInUse.map((bus) => (
                  <Div key={bus} className="flex-col gap-1">
                    <Txt className="text-xs text-text-muted">{`${bus}: ${busLevels[bus] ?? 100}`}</Txt>
                    <PixiSlider value={busLevels[bus] ?? 100} min={0} max={127} orientation="horizontal" length={RIGHT_W - 32} onChange={(v) => setBusLevel(bus, v)} />
                  </Div>
                ))}
              </Div>
            )}
            <Div className="flex-col gap-2">
              <SectionHeader>SETTINGS</SectionHeader>
              <Txt className="text-xs text-text-muted">{`Velocity Sensitivity: ${preferences.velocitySensitivity.toFixed(1)}x`}</Txt>
              <PixiSlider value={preferences.velocitySensitivity} min={0} max={2} step={0.1} orientation="horizontal" length={RIGHT_W - 32} onChange={(v) => setPreference('velocitySensitivity', v)} />
            </Div>
            <Div className="flex-col gap-2">
              <SectionHeader>NOTE REPEAT</SectionHeader>
              <PixiCheckbox checked={noteRepeatEnabled} onChange={setNoteRepeatEnabled} label="Enable" />
              <Div className="flex-row gap-1" layout={{ flexWrap: 'wrap' }}>
                {NOTE_REPEAT_RATES.map((rate) => (
                  <PixiButton key={rate} label={rate} size="sm" variant={noteRepeatRate === rate ? 'primary' : 'ghost'} onClick={() => setNoteRepeatRate(rate)} width={44} />
                ))}
              </Div>
            </Div>
            <Div className="flex-col gap-2">
              <SectionHeader>MPC RESAMPLING</SectionHeader>
              <PixiCheckbox checked={mpcEnabled} onChange={handleMpcToggle} label="Enable on sample load" />
              {mpcEnabled && (
                <Div className="flex-col gap-1">
                  <Txt className="text-xs text-text-muted">Model</Txt>
                  <PixiSelect options={mpcModelOptions} value={mpcModel} onChange={handleMpcModelChange} width={RIGHT_W - 32} />
                </Div>
              )}
            </Div>
          </>)}
          </Div>
        )}
      </Div>

      {/* ── Pad Setup Wizard ── */}
      <PixiPadSetupWizard wizard={padWizard} />

      {/* ── Context menu ── */}
      <PixiContextMenu
        items={ctxMenuItems}
        x={ctxMenuPos.x}
        y={ctxMenuPos.y}
        isOpen={ctxMenuOpen}
        onClose={() => { setCtxMenuOpen(false); setCtxMenuPadId(null); }}
      />

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
