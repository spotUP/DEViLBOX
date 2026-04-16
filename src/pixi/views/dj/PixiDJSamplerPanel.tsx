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
import { getToneEngine } from '@/engine/ToneEngine';
import { useTransportStore } from '@/stores/useTransportStore';
import type { PadBank, DrumPad, ScratchActionId } from '@/types/drumpad';
import { getBankPads, PAD_INSTRUMENT_BASE } from '@/types/drumpad';
import {
  djScratchBaby, djScratchTrans, djScratchFlare, djScratchHydro, djScratchCrab, djScratchOrbit,
  djScratchChirp, djScratchStab, djScratchScrbl, djScratchTear,
  djScratchUzi, djScratchTwiddle, djScratch8Crab, djScratch3Flare,
  djScratchLaser, djScratchPhaser, djScratchTweak, djScratchDrag, djScratchVibrato,
  djScratchStop, djFaderLFOOff, djFaderLFO14, djFaderLFO18, djFaderLFO116, djFaderLFO132,
} from '@/engine/keyboard/commands/djScratch';

const SCRATCH_ACTION_HANDLERS: Record<ScratchActionId, (start?: boolean) => boolean> = {
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
  fader_lfo_off: djFaderLFOOff,
  fader_lfo_1_4: djFaderLFO14,
  fader_lfo_1_8: djFaderLFO18,
  fader_lfo_1_16: djFaderLFO116,
  fader_lfo_1_32: djFaderLFO132,
};

// ─── Constants ──────────────────────────────────────────────────────────────

const PAD_SIZE = 44;
const PAD_GAP = 3;
const PANEL_PAD = 5;
const HEADER_H = 20;
const TOOLBAR_H = 20;
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

// ─── Color blend helper ─────────────────────────────────────────────────────

function blendColor(base: number, target: number, t: number): number {
  const r1 = (base >> 16) & 0xff, g1 = (base >> 8) & 0xff, b1 = base & 0xff;
  const r2 = (target >> 16) & 0xff, g2 = (target >> 8) & 0xff, b2 = target & 0xff;
  return (
    (Math.round(r1 + (r2 - r1) * t) << 16) |
    (Math.round(g1 + (g2 - g1) * t) << 8) |
    Math.round(b1 + (b2 - b1) * t)
  );
}

// ─── Synth badge helpers ────────────────────────────────────────────────────

/** Short 3-char badge for a synth type shown in pad cell top-right */
function getSynthBadge(synthType: string): string {
  const badges: Record<string, string> = {
    TR808: '808', TR909: '909',
    Sam: 'SAM', DECtalk: 'DEC', V2Speech: 'V2S', PinkTrombone: 'PKT',
    TB303: '303',
  };
  return badges[synthType] ?? 'SYN';
}

/** Accent color for a synth type badge — themed */
function getSynthColor(synthType: string, theme: ReturnType<typeof usePixiTheme>): number {
  if (synthType === 'TR808' || synthType === 'TR909') return theme.warning.color;
  if (synthType === 'Sam' || synthType === 'DECtalk' || synthType === 'V2Speech' || synthType === 'PinkTrombone') return theme.warning.color;
  if (synthType === 'TB303') return theme.success.color;
  return theme.accent.color;
}

// ─── Individual Pad ─────────────────────────────────────────────────────────

interface PadCellProps {
  pad: DrumPad;
  velocity: number;
  isSelected: boolean;
  accentColor: number;
  bgColor: number;
  borderColor: number;
  textColor: number;
  textMutedColor: number;
  onTrigger: (pad: DrumPad, e: FederatedPointerEvent) => void;
  onRelease: (pad: DrumPad) => void;
}

const PadCell: React.FC<PadCellProps> = ({
  pad, velocity, isSelected, accentColor, bgColor, borderColor, textColor, textMutedColor,
  onTrigger, onRelease,
}) => {
  const theme = usePixiTheme();
  const isPressed = velocity > 0;
  const hasSample = pad.sample !== null;
  const hasScratch = !!pad.scratchAction;
  const hasSynth = !!pad.synthConfig;
  const hasContent = hasSample || hasScratch || hasSynth;
  const brightness = isPressed ? 0.3 + (velocity / 127) * 0.7 : 0;
  const fillColor = isPressed ? blendColor(bgColor, 0xffffff, brightness) : bgColor;
  const fillAlpha = isPressed ? 0.9 : hasContent ? 1 : 0.5;
  const strokeColor = isSelected ? accentColor : isPressed ? accentColor : borderColor;
  const strokeWidth = isSelected ? 2 : 1;
  const strokeAlpha = isSelected ? 1 : isPressed ? 1 : 0.4;
  const padNum = ((pad.id - 1) % 16) + 1;
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
          g.stroke({ color: strokeColor, width: strokeWidth, alpha: strokeAlpha });
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
          tint={theme.warning.color}
          layout={{ position: 'absolute', right: 4, top: 3 }}
        />
      )}
      {hasSynth && !hasScratch && (
        <pixiBitmapText
          text={getSynthBadge(pad.synthConfig!.synthType)}
          style={{ fontFamily: PIXI_FONTS.MONO, fontSize: 8, fill: 0xffffff }}
          tint={getSynthColor(pad.synthConfig!.synthType, theme)}
          layout={{ position: 'absolute', right: 4, top: 3 }}
        />
      )}
      <pixiBitmapText
        text={hasContent ? pad.name : '\u2014'}
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
  const [padVelocities, setPadVelocities] = useState<Record<number, number>>({});
  const [selectedPad, setSelectedPad] = useState<number | null>(null);

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
    setSelectedPad(pad.id);
    await resumeAudioContext();

    let velocity = 100;
    const bounds = (e.target as any)?.getBounds?.();
    if (bounds && bounds.height > 0) {
      const relY = (e.global.y - bounds.y) / bounds.height;
      velocity = Math.round(40 + (1 - relY) * 87); // 40-127, top=loud
    }

    setPadVelocities(prev => ({ ...prev, [pad.id]: velocity }));

    if (currentProgram && engineRef.current) {
      // Fire scratch action if assigned (start on press)
      if (pad.scratchAction) {
        SCRATCH_ACTION_HANDLERS[pad.scratchAction]?.(true);
        heldPadsRef.current.add(pad.id); // track for release
      }
      if (pad.sample) {
        engineRef.current.triggerPad(pad, velocity);
      }
      if (pad.synthConfig) {
        try {
          const engine = getToneEngine();
          const note = pad.instrumentNote || 'C4';
          const normalizedVel = velocity / 127;
          const padInstId = PAD_INSTRUMENT_BASE + pad.id;
          const config = { ...pad.synthConfig, id: padInstId };
          engine.triggerNoteAttack(padInstId, note, 0, normalizedVel, config);
          if (pad.playMode === 'oneshot') {
            const releaseDelay = Math.max(pad.decay, 100) / 1000;
            setTimeout(() => {
              try { engine.triggerNoteRelease(padInstId, note, 0, config); } catch { /* ignore */ }
            }, releaseDelay * 1000);
          }
        } catch (err) {
          console.warn('[PixiDJSamplerPanel] Pad synth trigger failed:', err);
        }
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

    setTimeout(() => setPadVelocities(prev => ({ ...prev, [pad.id]: 0 })), 200);
  }, [currentProgram]);

  const handleRelease = useCallback((pad: DrumPad) => {
    setPadVelocities(prev => ({ ...prev, [pad.id]: 0 }));

    if (heldPadsRef.current.has(pad.id)) {
      heldPadsRef.current.delete(pad.id);
      noteRepeatRef.current?.stopRepeat(pad.id);
    }

    // Stop scratch action on release (finish current cycle gracefully)
    if (pad.scratchAction) {
      SCRATCH_ACTION_HANDLERS[pad.scratchAction]?.(false);
    }

    if (engineRef.current && currentProgram && pad.playMode === 'sustain') {
      engineRef.current.stopPad(pad.id, pad.release / 1000);
    }

    if (pad.playMode === 'sustain' && pad.synthConfig && heldPadsRef.current.has(pad.id)) {
      try {
        const padInstId = PAD_INSTRUMENT_BASE + pad.id;
        const config = { ...pad.synthConfig, id: padInstId };
        const note = pad.instrumentNote || 'C4';
        getToneEngine().triggerNoteRelease(padInstId, note, 0, config);
      } catch { /* ignore */ }
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

        {/* Program selector */}
        <PixiSelect
          options={(() => {
            const progs = useDrumPadStore.getState().programs;
            return Array.from(progs.entries()).map(([id, prog]) => ({
              value: id,
              label: `${id}: ${prog.name}`,
            }));
          })()}
          value={useDrumPadStore.getState().currentProgramId}
          onChange={(id) => useDrumPadStore.getState().loadProgram(id)}
          width={90}
          height={18}
        />

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
                  velocity={padVelocities[pad.id] ?? 0}
                  isSelected={selectedPad === pad.id}
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
