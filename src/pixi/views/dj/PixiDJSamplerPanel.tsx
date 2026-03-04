/**
 * PixiDJSamplerPanel — GL-native 4×4 drum pad grid for DJ view.
 * Routes audio through the DJ mixer's sampler input.
 * Matches the DOM DJSamplerPanel 1:1 in features.
 */

import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import type { FederatedPointerEvent, Graphics as GraphicsType } from 'pixi.js';
import { PIXI_FONTS } from '../../fonts';
import { usePixiTheme } from '../../theme';
import { PixiButton, PixiLabel, PixiSelect } from '../../components';
import type { SelectOption } from '../../components';
import { useDrumPadStore } from '@/stores/useDrumPadStore';
import { DrumPadEngine } from '@/engine/drumpad/DrumPadEngine';
import { NoteRepeatEngine } from '@/engine/drumpad/NoteRepeatEngine';
import type { NoteRepeatRate } from '@/engine/drumpad/NoteRepeatEngine';
import { getAudioContext, resumeAudioContext } from '@/audio/AudioContextSingleton';
import { getDJEngineIfActive } from '@/engine/dj/DJEngine';
import { useTransportStore } from '@/stores/useTransportStore';
import type { PadBank, DrumPad, ScratchActionId } from '@/types/drumpad';
import { getBankPads } from '@/types/drumpad';
import {
  djScratchBaby, djScratchTrans, djScratchFlare, djScratchHydro, djScratchCrab, djScratchOrbit,
  djScratchChirp, djScratchStab, djScratchScrbl, djScratchTear,
  djScratchUzi, djScratchTwiddle, djScratch8Crab, djScratch3Flare,
  djScratchLaser, djScratchPhaser, djScratchTweak, djScratchDrag, djScratchVibrato,
  djScratchStop, djFaderLFOOff, djFaderLFO14, djFaderLFO18, djFaderLFO116, djFaderLFO132,
} from '@/engine/keyboard/commands/djScratch';

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

// ─── Constants ──────────────────────────────────────────────────────────────

const PAD_SIZE = 60;
const PAD_GAP = 4;
const PANEL_PAD = 6;
const HEADER_H = 22;
const TOOLBAR_H = 22;
const GRID_SIZE = PAD_SIZE * 4 + PAD_GAP * 3;
const PANEL_W = GRID_SIZE + PANEL_PAD * 2;
const PANEL_H = HEADER_H + TOOLBAR_H + PAD_GAP * 3 + GRID_SIZE + PANEL_PAD * 2;

const NOTE_REPEAT_RATES: SelectOption[] = [
  { value: '1/4', label: '1/4' },
  { value: '1/8', label: '1/8' },
  { value: '1/16', label: '1/16' },
  { value: '1/32', label: '1/32' },
  { value: '1/8T', label: '1/8T' },
  { value: '1/16T', label: '1/16T' },
];

// ─── Individual Pad ─────────────────────────────────────────────────────────

interface PadCellProps {
  pad: DrumPad;
  isPressed: boolean;
  accentColor: number;
  bgColor: number;
  borderColor: number;
  textColor: number;
  textMutedColor: number;
  onTrigger: (pad: DrumPad, e: FederatedPointerEvent) => void;
  onRelease: (pad: DrumPad) => void;
}

const PadCell: React.FC<PadCellProps> = ({
  pad, isPressed, accentColor, bgColor, borderColor, textColor, textMutedColor,
  onTrigger, onRelease,
}) => {
  const hasSample = pad.sample !== null;
  const hasScratch = !!pad.scratchAction;
  const hasContent = hasSample || hasScratch;
  const fillColor = isPressed ? accentColor : bgColor;
  const fillAlpha = isPressed ? 0.8 : hasContent ? 1 : 0.5;
  const padNum = ((pad.id - 1) % 16) + 1;
  const displayName = pad.name.length > 8 ? pad.name.slice(0, 7) + '\u2026' : pad.name;

  return (
    <pixiContainer
      layout={{ width: PAD_SIZE, height: PAD_SIZE }}
      eventMode="static"
      cursor="pointer"
      onPointerDown={(e: FederatedPointerEvent) => onTrigger(pad, e)}
      onPointerUp={() => onRelease(pad)}
      onPointerUpOutside={() => onRelease(pad)}
    >
      <pixiGraphics
        draw={(g: GraphicsType) => {
          g.clear();
          g.roundRect(0, 0, PAD_SIZE, PAD_SIZE, 4);
          g.fill({ color: fillColor, alpha: fillAlpha });
          g.roundRect(0, 0, PAD_SIZE, PAD_SIZE, 4);
          g.stroke({ color: isPressed ? accentColor : borderColor, width: 1, alpha: isPressed ? 1 : 0.4 });
        }}
        layout={{ position: 'absolute', left: 0, top: 0, width: PAD_SIZE, height: PAD_SIZE }}
      />
      <pixiBitmapText
        text={String(padNum)}
        style={{ fontFamily: PIXI_FONTS.MONO_BOLD, fontSize: 10, fill: 0xffffff }}
        tint={isPressed ? 0xffffff : textMutedColor}
        layout={{ position: 'absolute', left: 4, top: 3 }}
      />
      {hasScratch && (
        <pixiBitmapText
          text="SCR"
          style={{ fontFamily: PIXI_FONTS.MONO, fontSize: 8, fill: 0xffffff }}
          tint={0xd97706}
          layout={{ position: 'absolute', right: 4, top: 3 }}
        />
      )}
      <pixiBitmapText
        text={hasContent ? displayName : '\u2014'}
        style={{ fontFamily: PIXI_FONTS.MONO, fontSize: 9, fill: 0xffffff }}
        tint={isPressed ? 0xffffff : hasContent ? textColor : textMutedColor}
        layout={{ position: 'absolute', left: 4, bottom: 4 }}
      />
    </pixiContainer>
  );
};

// ─── Bus Level Bar ──────────────────────────────────────────────────────────

const BusLevelBar: React.FC<{ level: number; width: number; height: number; color: number; bgColor: number }> = ({
  level, width, height, color, bgColor,
}) => {
  const clampedLevel = Math.max(0, Math.min(1, level));
  return (
    <pixiGraphics
      draw={(g: GraphicsType) => {
        g.clear();
        g.roundRect(0, 0, width, height, 2);
        g.fill({ color: bgColor, alpha: 0.5 });
        if (clampedLevel > 0) {
          g.roundRect(0, 0, Math.round(width * clampedLevel), height, 2);
          g.fill({ color, alpha: 0.8 });
        }
      }}
      layout={{ width, height }}
    />
  );
};

// ─── Panel ──────────────────────────────────────────────────────────────────

export interface PixiDJSamplerPanelProps {
  isOpen: boolean;
  onClose: () => void;
}

export const PixiDJSamplerPanel: React.FC<PixiDJSamplerPanelProps> = ({ isOpen, onClose }) => {
  const theme = usePixiTheme();
  const engineRef = useRef<DrumPadEngine | null>(null);
  const noteRepeatRef = useRef<NoteRepeatEngine | null>(null);
  const noteRepeatEnabledRef = useRef(false);
  const heldPadsRef = useRef<Set<number>>(new Set());
  const [pressedPad, setPressedPad] = useState<number | null>(null);

  const currentBank = useDrumPadStore(s => s.currentBank);
  const setBank = useDrumPadStore(s => s.setBank);
  const programs = useDrumPadStore(s => s.programs);
  const currentProgramId = useDrumPadStore(s => s.currentProgramId);
  const loadProgram = useDrumPadStore(s => s.loadProgram);
  const currentProgram = programs.get(currentProgramId);

  // Note repeat state from store
  const noteRepeatEnabled = useDrumPadStore(s => s.noteRepeatEnabled);
  const setNoteRepeatEnabled = useDrumPadStore(s => s.setNoteRepeatEnabled);
  const noteRepeatRate = useDrumPadStore(s => s.noteRepeatRate);
  const setNoteRepeatRate = useDrumPadStore(s => s.setNoteRepeatRate);
  const bpm = useTransportStore(s => s.bpm);
  const busLevels = useDrumPadStore(s => s.busLevels);

  // Initialize engine routed through DJ mixer sampler input
  useEffect(() => {
    if (!isOpen) return;
    const audioContext = getAudioContext();
    const djEngine = getDJEngineIfActive();
    const destination = djEngine?.mixer.samplerInput ?? undefined;
    engineRef.current = new DrumPadEngine(audioContext, destination);
    noteRepeatRef.current = new NoteRepeatEngine(engineRef.current);
    useDrumPadStore.getState().loadFromIndexedDB(audioContext);
    return () => {
      noteRepeatRef.current?.dispose();
      noteRepeatRef.current = null;
      engineRef.current?.dispose();
      engineRef.current = null;
    };
  }, [isOpen]);

  // Sync mute groups and master level
  useEffect(() => {
    if (engineRef.current && currentProgram) {
      engineRef.current.setMuteGroups(currentProgram.pads);
      engineRef.current.setMasterLevel(currentProgram.masterLevel);
    }
  }, [currentProgram]);

  // Sync note repeat
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

  // Sync bus levels
  useEffect(() => {
    if (!engineRef.current || !busLevels) return;
    for (const [bus, level] of Object.entries(busLevels)) {
      engineRef.current.setOutputLevel(bus, level);
    }
  }, [busLevels]);

  const bankPads = useMemo(() => {
    if (!currentProgram) return [];
    return getBankPads(currentProgram.pads, currentBank);
  }, [currentProgram, currentBank]);

  // Program options for PixiSelect
  const programOptions = useMemo<SelectOption[]>(() =>
    Array.from(programs.values()).map(p => ({ value: p.id, label: p.name })),
    [programs],
  );

  // Velocity derived from pointer Y position within pad (top=loud, bottom=soft)
  const handleTrigger = useCallback(async (pad: DrumPad, e: FederatedPointerEvent) => {
    setPressedPad(pad.id);
    await resumeAudioContext();

    let velocity = 100;
    const bounds = (e.target as any)?.getBounds?.();
    if (bounds && bounds.height > 0) {
      const relY = (e.global.y - bounds.y) / bounds.height;
      velocity = Math.round(40 + (1 - relY) * 87); // 40-127, top=loud
    }

    if (currentProgram && engineRef.current) {
      // Fire scratch action if assigned
      if (pad.scratchAction) {
        SCRATCH_ACTION_HANDLERS[pad.scratchAction]?.();
      }
      if (pad.sample) {
        engineRef.current.triggerPad(pad, velocity);
      }
      if (pad.playMode === 'sustain') {
        heldPadsRef.current.add(pad.id);
      }
      // Note repeat
      if (noteRepeatEnabledRef.current && noteRepeatRef.current) {
        noteRepeatRef.current.startRepeat(pad, velocity);
        heldPadsRef.current.add(pad.id);
      }
    }

    setTimeout(() => setPressedPad(prev => prev === pad.id ? null : prev), 200);
  }, [currentProgram]);

  const handleRelease = useCallback((pad: DrumPad) => {
    setPressedPad(prev => prev === pad.id ? null : prev);

    if (heldPadsRef.current.has(pad.id)) {
      heldPadsRef.current.delete(pad.id);
      noteRepeatRef.current?.stopRepeat(pad.id);
    }

    if (engineRef.current && currentProgram && pad.playMode === 'sustain') {
      engineRef.current.stopPad(pad.id, pad.release / 1000);
    }
  }, [currentProgram]);

  const handleStopAll = useCallback(() => {
    engineRef.current?.stopAll();
    noteRepeatRef.current?.stopAll();
    heldPadsRef.current.clear();
  }, []);

  if (!isOpen || !currentProgram) return null;

  const banks: PadBank[] = ['A', 'B', 'C', 'D'];
  const bankLoadedCount = bankPads.filter(p => p.sample !== null).length;

  // Aggregate bus level for display
  const masterLevel = Object.values(busLevels).length > 0
    ? Math.max(...Object.values(busLevels))
    : currentProgram.masterLevel;

  return (
    <pixiContainer layout={{ width: PANEL_W, flexDirection: 'column', padding: PANEL_PAD, gap: PAD_GAP }}>
      {/* Background */}
      <pixiGraphics
        draw={(g: GraphicsType) => {
          g.clear();
          g.roundRect(0, 0, PANEL_W, PANEL_H, 6);
          g.fill({ color: theme.bgSecondary.color, alpha: 0.95 });
          g.roundRect(0, 0, PANEL_W, PANEL_H, 6);
          g.stroke({ color: theme.border.color, width: 1, alpha: 0.5 });
        }}
        layout={{ position: 'absolute', left: 0, top: 0, width: PANEL_W, height: PANEL_H }}
      />

      {/* Header row: title + program selector + bank buttons + count + stop + close */}
      <pixiContainer layout={{ flexDirection: 'row', alignItems: 'center', gap: 4, height: HEADER_H }}>
        <PixiLabel text="SAMPLER" size="xs" color="accent" />
        <PixiSelect
          options={programOptions}
          value={currentProgramId}
          onChange={loadProgram}
          width={80}
          height={18}
        />
        <pixiContainer layout={{ flex: 1 }} />
        {banks.map(bank => (
          <PixiButton
            key={bank}
            label={bank}
            variant={currentBank === bank ? 'ft2' : 'ghost'}
            color={currentBank === bank ? 'yellow' : undefined}
            size="sm"
            width={24}
            active={currentBank === bank}
            onClick={() => setBank(bank)}
          />
        ))}
        <PixiLabel text={`${bankLoadedCount}/16`} size="xs" color="textMuted" />
        <PixiButton icon="stop" label="" variant="ghost" color="red" size="sm" onClick={handleStopAll} />
        <PixiButton icon="close" label="" variant="ghost" size="sm" onClick={onClose} />
      </pixiContainer>

      {/* Toolbar row: note repeat + rate + bus level */}
      <pixiContainer layout={{ flexDirection: 'row', alignItems: 'center', gap: 4, height: TOOLBAR_H }}>
        <PixiButton
          label="REPEAT"
          variant={noteRepeatEnabled ? 'ft2' : 'ghost'}
          color={noteRepeatEnabled ? 'green' : undefined}
          active={noteRepeatEnabled}
          size="sm"
          width={56}
          onClick={() => setNoteRepeatEnabled(!noteRepeatEnabled)}
        />
        {noteRepeatEnabled && (
          <PixiSelect
            options={NOTE_REPEAT_RATES}
            value={noteRepeatRate}
            onChange={(v) => setNoteRepeatRate(v)}
            width={60}
            height={18}
          />
        )}
        <pixiContainer layout={{ flex: 1 }} />
        <PixiLabel text="OUT" size="xs" color="textMuted" />
        <BusLevelBar
          level={masterLevel}
          width={40}
          height={8}
          color={theme.accent.color}
          bgColor={theme.border.color}
        />
      </pixiContainer>

      {/* 4×4 Pad grid */}
      <pixiContainer layout={{ flexDirection: 'column', gap: PAD_GAP }}>
        {[0, 1, 2, 3].map(row => (
          <pixiContainer key={row} layout={{ flexDirection: 'row', gap: PAD_GAP }}>
            {[0, 1, 2, 3].map(col => {
              const padIndex = row * 4 + col;
              const pad = bankPads[padIndex];
              if (!pad) return null;
              return (
                <PadCell
                  key={col}
                  pad={pad}
                  isPressed={pressedPad === pad.id}
                  accentColor={theme.accent.color}
                  bgColor={theme.bgTertiary.color}
                  borderColor={theme.border.color}
                  textColor={theme.text.color}
                  textMutedColor={theme.textMuted.color}
                  onTrigger={handleTrigger}
                  onRelease={handleRelease}
                />
              );
            })}
          </pixiContainer>
        ))}
      </pixiContainer>
    </pixiContainer>
  );
};
