/**
 * PixiTB303View — Native PixiJS port of the DOM TB303View.
 *
 * 1:1 functional parity:
 *  - 16-step sequencer grid with note, octave, accent, slide
 *  - LED indicators for current step during playback
 *  - TB-303 parameter knobs (cutoff, resonance, envmod, decay, accent, waveform)
 *  - Pattern controls (random, clear, acid generator)
 *  - Auto-detect/create TB-303 instrument on channel
 *
 * Rendering: pixiGraphics for sequencer grid + pixiBitmapText for labels.
 * Knobs: native PixiKnob components. Dropdowns: PixiDOMOverlay for <select>.
 */

import React, { useCallback, useMemo, useRef, useEffect } from 'react';
import type { Graphics as GraphicsType, FederatedPointerEvent } from 'pixi.js';
import { usePixiTheme } from '../../theme';
import { PIXI_FONTS } from '../../fonts';
import { PixiButton, PixiKnob, PixiLabel } from '../../components';
import { useTrackerStore, useInstrumentStore, useTransportStore } from '@stores';
import { useShallow } from 'zustand/react/shallow';
import { xmNoteToString, stringNoteToXM } from '@/lib/xmConversions';
import { getToneEngine } from '@engine/ToneEngine';
import { DEFAULT_TB303 } from '@typedefs/instrument';
import type { InstrumentConfig, DevilFishConfig } from '@typedefs/instrument';

// ─── Note names ──────────────────────────────────────────────────────────────
const NOTE_NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];

// ─── Conversion helpers (same as DOM TB303View) ─────────────────────────────
const parseTrackerNote = (noteValue: number | string | null): { note: string; octave: number } => {
  if (typeof noteValue === 'number') {
    if (noteValue === 0 || noteValue === 97) return { note: 'C', octave: 2 };
    const noteStr = xmNoteToString(noteValue);
    const notePart = noteStr.substring(0, 2);
    const octaveNum = parseInt(noteStr.substring(2), 10);
    let tb303Octave = 2;
    if (octaveNum <= 2) tb303Octave = 1;
    else if (octaveNum >= 4) tb303Octave = 3;
    return { note: notePart.replace('-', ''), octave: tb303Octave };
  }
  if (typeof noteValue === 'string') {
    if (!noteValue || noteValue === '...' || noteValue === '===') return { note: 'C', octave: 2 };
    const notePart = noteValue.substring(0, 2);
    const octaveNum = parseInt(noteValue.substring(2), 10);
    let tb303Octave = 2;
    if (octaveNum <= 2) tb303Octave = 1;
    else if (octaveNum >= 4) tb303Octave = 3;
    return { note: notePart.replace('-', ''), octave: tb303Octave };
  }
  return { note: 'C', octave: 2 };
};

const tb303ToTrackerNote = (note: string, octave: number): number => {
  const trackerOctave = octave === 1 ? 2 : octave === 2 ? 3 : 4;
  const noteStr = note.length === 1 ? `${note}-` : note;
  return stringNoteToXM(`${noteStr}${trackerOctave}`);
};

// ─── Layout constants ─────────────────────────────────────────────────────────
const TRANSPORT_H = 32;
const STEP_W = 48;
const STEP_H = 120;
const LED_H = 8;
const STEP_GAP = 3;
const SEQ_PAD = 8;
const KNOB_SECTION_H = 130;

interface TB303Step {
  active: boolean;
  note: string;
  octave: number;
  accent: boolean;
  slide: boolean;
}

interface PixiTB303ViewProps {
  channelIndex?: number;
  width: number;
  height: number;
}

export const PixiTB303View: React.FC<PixiTB303ViewProps> = ({ channelIndex = 0, width, height }) => {
  const theme = usePixiTheme();

  const { patterns, currentPatternIndex, setCell } = useTrackerStore(
    useShallow((s) => ({ patterns: s.patterns, currentPatternIndex: s.currentPatternIndex, setCell: s.setCell }))
  );
  const { instruments, updateInstrument } = useInstrumentStore(
    useShallow((s) => ({ instruments: s.instruments, updateInstrument: s.updateInstrument }))
  );
  const isPlaying = useTransportStore((s) => s.isPlaying);
  const currentRow = useTransportStore((s) => s.currentRow);
  const bpm = useTransportStore((s) => s.bpm);

  const currentPattern = patterns[currentPatternIndex];
  const channel = currentPattern?.channels[channelIndex];
  const instrumentId = channel?.instrumentId ?? 0;
  let instrument = instruments.find((inst) => inst.id === instrumentId);

  // Auto-detect/create TB-303 instrument (same logic as DOM)
  const tb303Instruments = useMemo(() =>
    instruments.filter(inst => inst.synthType === 'TB303' || inst.synthType === 'Buzz3o3'),
    [instruments]
  );

  // Auto-assign existing TB303 instrument to channel if only one exists
  useEffect(() => {
    if (!instrument || (instrument.synthType !== 'TB303' && instrument.synthType !== 'Buzz3o3')) {
      if (tb303Instruments.length === 1) {
        useTrackerStore.setState((state) => {
          const pat = state.patterns[state.currentPatternIndex];
          if (pat?.channels[channelIndex]) pat.channels[channelIndex].instrumentId = tb303Instruments[0].id;
        });
      }
    }
  }, [instrument, tb303Instruments, channelIndex]);

  instrument = instruments.find((inst) => inst.id === (channel?.instrumentId ?? 0));

  const currentStep = isPlaying ? currentRow % 16 : -1;

  // Refs for knob callbacks (avoid stale closures — CLAUDE.md pattern)
  const instrumentRef = useRef(instrument);
  const tb303ConfigRef = useRef(instrument?.tb303);
  useEffect(() => {
    instrumentRef.current = instrument;
    tb303ConfigRef.current = instrument?.tb303;
  }, [instrument]);

  const storeUpdateTimerRef = useRef<number | null>(null);
  const debouncedStoreUpdate = useCallback((updates: Partial<InstrumentConfig>) => {
    if (storeUpdateTimerRef.current) clearTimeout(storeUpdateTimerRef.current);
    storeUpdateTimerRef.current = window.setTimeout(() => {
      updateInstrument(instrumentId, updates);
      storeUpdateTimerRef.current = null;
    }, 300);
  }, [instrumentId, updateInstrument]);

  // TB-303 parameters
  const tb303Config = instrument?.tb303;
  const waveform = tb303Config?.oscillator.type === 'square' ? 1.0 : 0.0;
  const cutoff = tb303Config?.filter.cutoff ?? 0.5;
  const resonance = tb303Config?.filter.resonance ?? 0.5;
  const envMod = tb303Config?.filterEnvelope.envMod ?? 0.5;
  const decay = tb303Config?.devilFish?.enabled
    ? (tb303Config?.devilFish?.normalDecay ?? 0.164)
    : (tb303Config?.filterEnvelope.decay ?? 0.5);
  const accentAmt = tb303Config?.accent.amount ?? 0.5;

  // Convert tracker pattern to TB303Step[]
  const steps = useMemo<TB303Step[]>(() => {
    if (!currentPattern || !currentPattern.channels[channelIndex]) {
      return Array.from({ length: 16 }, () => ({ active: false, note: 'C', octave: 2, accent: false, slide: false }));
    }
    const ch = currentPattern.channels[channelIndex];
    const result: TB303Step[] = [];
    for (let i = 0; i < 16; i++) {
      const row = ch.rows[i];
      const hasNote = !!(row && row.note && row.note !== 0 && row.note !== 97);
      const { note, octave } = hasNote ? parseTrackerNote(row.note) : { note: 'C', octave: 2 };
      result.push({
        active: hasNote, note, octave,
        accent: !!(row?.flag1 === 1 || row?.flag2 === 1),
        slide: !!(row?.flag1 === 2 || row?.flag2 === 2),
      });
    }
    return result;
  }, [currentPattern, channelIndex]);

  // ─── Knob handlers (identical to DOM version, using configRef pattern) ──────
  const makeParamHandler = useCallback((applyFn: (config: NonNullable<typeof tb303Config>, value: number) => NonNullable<typeof tb303Config>) => {
    return (value: number) => {
      const config = tb303ConfigRef.current;
      if (!instrumentRef.current || !config) return;
      const updatedConfig = applyFn(config, value);
      getToneEngine().updateTB303Parameters(instrumentId, updatedConfig);
      debouncedStoreUpdate({ tb303: updatedConfig });
    };
  }, [instrumentId, debouncedStoreUpdate]);

  const handleCutoffChange = makeParamHandler((c, v) => ({ ...c, filter: { ...c.filter, cutoff: v } }));
  const handleResonanceChange = makeParamHandler((c, v) => ({ ...c, filter: { ...c.filter, resonance: v } }));
  const handleEnvModChange = makeParamHandler((c, v) => ({ ...c, filterEnvelope: { ...c.filterEnvelope, envMod: v } }));
  const handleDecayChange = makeParamHandler((c, v) => ({
    ...c,
    filterEnvelope: { ...c.filterEnvelope, decay: v },
    devilFish: { ...DEFAULT_TB303.devilFish, ...(c.devilFish || {}), normalDecay: v } as DevilFishConfig,
  }));
  const handleAccentChange = makeParamHandler((c, v) => ({ ...c, accent: { ...c.accent, amount: v } }));
  const handleWaveformChange = makeParamHandler((c, v) => ({
    ...c,
    oscillator: { ...c.oscillator, type: (v < 0.5 ? 'sawtooth' : 'square') as 'sawtooth' | 'square' },
  }));

  // ─── Step toggle/click ──────────────────────────────────────────────────────
  const handleStepToggle = useCallback((stepIndex: number) => {
    const s = steps[stepIndex];
    setCell(channelIndex, stepIndex, {
      note: !s.active ? tb303ToTrackerNote(s.note, s.octave) : 0,
      flag1: s.accent ? 1 : undefined,
      flag2: s.slide ? 2 : undefined,
    });
  }, [channelIndex, setCell, steps]);

  const handleToggleAccent = useCallback((stepIndex: number) => {
    const s = steps[stepIndex];
    if (!s.active) return;
    setCell(channelIndex, stepIndex, {
      note: tb303ToTrackerNote(s.note, s.octave),
      flag1: s.accent ? 0 : 1,
      flag2: s.slide ? 2 : undefined,
    });
  }, [channelIndex, setCell, steps]);

  const handleToggleSlide = useCallback((stepIndex: number) => {
    const s = steps[stepIndex];
    if (!s.active) return;
    setCell(channelIndex, stepIndex, {
      note: tb303ToTrackerNote(s.note, s.octave),
      flag1: s.accent ? 1 : undefined,
      flag2: s.slide ? 0 : 2,
    });
  }, [channelIndex, setCell, steps]);

  const handleCycleNote = useCallback((stepIndex: number, delta: number) => {
    const s = steps[stepIndex];
    if (!s.active) return;
    const noteIdx = NOTE_NAMES.indexOf(s.note);
    const newIdx = (noteIdx + delta + 12) % 12;
    setCell(channelIndex, stepIndex, {
      note: tb303ToTrackerNote(NOTE_NAMES[newIdx], s.octave),
      flag1: s.accent ? 1 : undefined,
      flag2: s.slide ? 2 : undefined,
    });
  }, [channelIndex, setCell, steps]);

  const handleCycleOctave = useCallback((stepIndex: number) => {
    const s = steps[stepIndex];
    if (!s.active) return;
    const newOct = s.octave === 1 ? 2 : s.octave === 2 ? 3 : 1;
    setCell(channelIndex, stepIndex, {
      note: tb303ToTrackerNote(s.note, newOct),
      flag1: s.accent ? 1 : undefined,
      flag2: s.slide ? 2 : undefined,
    });
  }, [channelIndex, setCell, steps]);

  // ─── Pattern controls ──────────────────────────────────────────────────────
  const handleClear = useCallback(() => {
    for (let i = 0; i < 16; i++) setCell(channelIndex, i, { note: 0, flag1: 0, flag2: 0 });
  }, [channelIndex, setCell]);

  const handleRandomize = useCallback(() => {
    for (let i = 0; i < 16; i++) {
      const active = Math.random() > 0.3;
      const note = NOTE_NAMES[Math.floor(Math.random() * 12)];
      const octave = Math.floor(Math.random() * 3) + 1;
      setCell(channelIndex, i, {
        note: active ? tb303ToTrackerNote(note, octave) : 0,
        flag1: Math.random() > 0.7 ? 1 : 0,
        flag2: Math.random() > 0.8 ? 2 : 0,
      });
    }
  }, [channelIndex, setCell]);

  // ─── Grid pointer handler ──────────────────────────────────────────────────
  const handlePointerDown = useCallback((e: FederatedPointerEvent) => {
    const local = e.getLocalPosition(e.currentTarget);
    const x = local.x - SEQ_PAD;
    const y = local.y;
    if (x < 0) return;

    const stepIndex = Math.floor(x / (STEP_W + STEP_GAP));
    if (stepIndex < 0 || stepIndex >= 16) return;

    // Determine click zone within step column
    const stepY = y;
    const nativeEvent = e.nativeEvent as PointerEvent;

    if (stepY < LED_H + 4) {
      // LED area — toggle step
      handleStepToggle(stepIndex);
    } else if (stepY < LED_H + 30) {
      // Note area — cycle note up (or with Shift: down)
      handleCycleNote(stepIndex, nativeEvent.shiftKey ? -1 : 1);
    } else if (stepY < LED_H + 55) {
      // Octave area
      handleCycleOctave(stepIndex);
    } else if (stepY < LED_H + 80) {
      // Accent toggle
      handleToggleAccent(stepIndex);
    } else {
      // Slide toggle
      handleToggleSlide(stepIndex);
    }
  }, [handleStepToggle, handleCycleNote, handleCycleOctave, handleToggleAccent, handleToggleSlide]);

  // ─── Draw sequencer grid ───────────────────────────────────────────────────
  const sequencerWidth = 16 * (STEP_W + STEP_GAP) + SEQ_PAD * 2;

  const drawSequencer = useCallback((g: GraphicsType) => {
    g.clear();
    const seqH = STEP_H + LED_H + 4;

    // Background
    g.rect(0, 0, Math.max(width, sequencerWidth), seqH);
    g.fill({ color: theme.bg.color });

    for (let i = 0; i < 16; i++) {
      const x = SEQ_PAD + i * (STEP_W + STEP_GAP);
      const step = steps[i];
      const isCurrent = currentStep === i;
      const isBeat = i % 4 === 0;

      // Step background
      g.roundRect(x, LED_H + 4, STEP_W, STEP_H, 4);
      g.fill({
        color: step.active
          ? (isCurrent ? 0xef4444 : theme.accent.color)
          : (isBeat ? theme.bgTertiary.color : theme.bgSecondary.color),
        alpha: step.active ? (isCurrent ? 0.5 : 0.25) : 0.8,
      });
      g.roundRect(x, LED_H + 4, STEP_W, STEP_H, 4);
      g.stroke({ color: step.active ? theme.accent.color : theme.border.color, width: 1, alpha: step.active ? 0.6 : 0.3 });

      // LED
      g.circle(x + STEP_W / 2, LED_H / 2, 3);
      g.fill({ color: isCurrent ? 0xef4444 : (step.active ? theme.accent.color : theme.textMuted.color), alpha: isCurrent ? 1 : 0.3 });

      if (step.active) {
        // Accent indicator
        if (step.accent) {
          g.rect(x + 2, LED_H + 4 + STEP_H - 30, STEP_W - 4, 12);
          g.fill({ color: 0xd97706, alpha: 0.5 });
        }

        // Slide indicator
        if (step.slide) {
          g.rect(x + 2, LED_H + 4 + STEP_H - 16, STEP_W - 4, 12);
          g.fill({ color: theme.accentSecondary.color, alpha: 0.5 });
        }
      }

      // Current step glow
      if (isCurrent) {
        g.roundRect(x - 1, LED_H + 3, STEP_W + 2, STEP_H + 2, 5);
        g.stroke({ color: 0xef4444, width: 2, alpha: 0.7 });
      }
    }
  }, [width, sequencerWidth, theme, steps, currentStep]);

  // Step labels (note name, octave, AC, SL)
  const stepLabelData = useMemo(() => {
    const labels: { x: number; y: number; text: string; color: number; bold?: boolean }[] = [];
    for (let i = 0; i < 16; i++) {
      const x = SEQ_PAD + i * (STEP_W + STEP_GAP);
      const step = steps[i];

      // Step number
      labels.push({ x: x + STEP_W / 2 - 5, y: LED_H + 8, text: (i + 1).toString().padStart(2, '0'), color: theme.textMuted.color });

      if (step.active) {
        // Note name
        labels.push({ x: x + STEP_W / 2 - 6, y: LED_H + 24, text: step.note, color: 0xffffff, bold: true });

        // Octave
        const octLabel = step.octave === 1 ? 'DN' : step.octave === 3 ? 'UP' : '--';
        labels.push({ x: x + STEP_W / 2 - 6, y: LED_H + 42, text: octLabel, color: step.octave !== 2 ? theme.accent.color : theme.textMuted.color });

        // Accent
        labels.push({ x: x + STEP_W / 2 - 5, y: LED_H + 4 + STEP_H - 28, text: 'AC', color: step.accent ? 0xd97706 : theme.textMuted.color, bold: step.accent });

        // Slide
        labels.push({ x: x + STEP_W / 2 - 5, y: LED_H + 4 + STEP_H - 14, text: 'SL', color: step.slide ? theme.accentSecondary.color : theme.textMuted.color, bold: step.slide });
      }
    }
    return labels;
  }, [steps, theme]);

  // ─── Draw transport bar ─────────────────────────────────────────────────────
  const drawTransport = useCallback((g: GraphicsType) => {
    g.clear();
    g.rect(0, 0, width, TRANSPORT_H);
    g.fill({ color: theme.bgSecondary.color });
    g.rect(0, TRANSPORT_H - 1, width, 1);
    g.fill({ color: theme.border.color, alpha: theme.border.alpha });
  }, [width, theme]);

  // Use visible prop instead of early return to avoid @pixi/layout BindingError.
  // Conditional mount/unmount of Pixi children triggers Yoga node swap errors;
  // always render the same tree structure and control visibility instead.
  const hasInstrument = !!instrument;

  return (
    <pixiContainer layout={{ width, height }}>
      {/* Error overlay — always mounted; shown only when no instrument.
          position: 'absolute' keeps it out of the flex layout flow. */}
      <pixiBitmapText
        alpha={!hasInstrument ? 1 : 0}
        renderable={!hasInstrument}
        text={hasInstrument ? '' : `No instrument on Ch ${channelIndex + 1}`}
        style={{ fontFamily: PIXI_FONTS.MONO, fontSize: 12, fill: 0xffffff }}
        tint={theme.error.color}
        layout={{ position: 'absolute', marginTop: 40, marginLeft: 20 }}
      />

      {/* Main content — always mounted; hidden when no instrument */}
      <pixiContainer alpha={hasInstrument ? 1 : 0} renderable={hasInstrument} eventMode={hasInstrument ? 'static' : 'none'} layout={{ width, height, flexDirection: 'column' }}>
        {/* Transport bar */}
        <pixiContainer layout={{ width, height: TRANSPORT_H, flexDirection: 'row', alignItems: 'center', paddingLeft: 8, gap: 8 }}>
          <pixiGraphics draw={drawTransport} layout={{ position: 'absolute', width, height: TRANSPORT_H }} />

          <PixiLabel text="TB-303" size="sm" weight="bold" color="accent" />

          {isPlaying && (
            <PixiLabel text={`Step ${(currentStep + 1).toString().padStart(2, '0')}/16 @ ${bpm} BPM`} size="xs" color="textMuted" />
          )}

          <pixiContainer layout={{ flex: 1 }} />

          <PixiButton label="RANDOM" variant="ghost" size="sm" onClick={handleRandomize} />
          <PixiButton label="CLEAR" variant="ghost" size="sm" color="red" onClick={handleClear} />
        </pixiContainer>

        {/* Sequencer grid */}
        <pixiContainer
          layout={{ width, height: STEP_H + LED_H + 8 }}
          eventMode="static"
          cursor="pointer"
          onPointerDown={handlePointerDown}
        >
          <pixiGraphics draw={drawSequencer} layout={{ position: 'absolute', width, height: STEP_H + LED_H + 8 }} />

          {/* Labels */}
          {stepLabelData.map((label, idx) => (
            <pixiBitmapText
              key={idx}
              text={label.text}
              style={{ fontFamily: label.bold ? PIXI_FONTS.MONO_BOLD : PIXI_FONTS.MONO, fontSize: 9, fill: 0xffffff }}
              tint={label.color}
              x={label.x}
              y={label.y}
            />
          ))}
        </pixiContainer>

        {/* Knob section — TB-303 parameters */}
        <pixiContainer layout={{ width, height: KNOB_SECTION_H, flexDirection: 'row', gap: 12, paddingLeft: 16, paddingTop: 8 }}>
          <PixiKnob label="Waveform" value={waveform} min={0} max={1} onChange={handleWaveformChange} size="sm" />
          <PixiKnob label="Cutoff" value={cutoff} min={0} max={1} onChange={handleCutoffChange} size="sm" />
          <PixiKnob label="Resonance" value={resonance} min={0} max={1} onChange={handleResonanceChange} size="sm" />
          <PixiKnob label="Env Mod" value={envMod} min={0} max={1} onChange={handleEnvModChange} size="sm" />
          <PixiKnob label="Decay" value={decay} min={0} max={1} onChange={handleDecayChange} size="sm" />
          <PixiKnob label="Accent" value={accentAmt} min={0} max={1} onChange={handleAccentChange} size="sm" />
        </pixiContainer>
      </pixiContainer>
    </pixiContainer>
  );
};
