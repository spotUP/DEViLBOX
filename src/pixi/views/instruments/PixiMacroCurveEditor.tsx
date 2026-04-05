/**
 * PixiMacroCurveEditor -- GL-native Furnace-style macro curve editor.
 *
 * Mirrors the DOM MacroEditor (src/components/instruments/editors/MacroEditor.tsx):
 *  - Canvas-based value bars drawn with Pixi Graphics
 *  - Click/drag to paint values, shift+drag for line-draw
 *  - Loop and release point markers
 *  - Playback position cursor
 *  - Preset patterns per macro type
 *  - Add/remove steps, speed control
 *
 * Also includes a PixiMacroListEditor that wraps multiple macros (like MacroListEditor).
 *
 * Wired to the same FurnaceMacro type the DOM uses.
 */

import React, { useCallback, useState, useMemo, useRef } from 'react';
import { Graphics } from 'pixi.js';
import type { FederatedPointerEvent } from 'pixi.js';
import { usePixiTheme } from '../../theme';
import {
  PixiButton,
  PixiLabel,
  PixiSelect,
  type SelectOption,
} from '../../components';
import { FurnaceMacroType, type FurnaceMacro } from '@typedefs/instrument';

// ── Macro type names (same as DOM) ──────────────────────────────────────────

const MACRO_TYPE_NAMES: Record<number, string> = {
  [FurnaceMacroType.VOL]:         'Volume',
  [FurnaceMacroType.ARP]:         'Arpeggio',
  [FurnaceMacroType.DUTY]:        'Duty',
  [FurnaceMacroType.WAVE]:        'Waveform',
  [FurnaceMacroType.PITCH]:       'Pitch',
  [FurnaceMacroType.EX1]:         'Extra 1',
  [FurnaceMacroType.EX2]:         'Extra 2',
  [FurnaceMacroType.EX3]:         'Extra 3',
  [FurnaceMacroType.ALG]:         'Algorithm',
  [FurnaceMacroType.FB]:          'Feedback',
  [FurnaceMacroType.FMS]:         'FM LFO Speed',
  [FurnaceMacroType.AMS]:         'AM LFO Speed',
  [FurnaceMacroType.PAN_L]:       'Pan Left',
  [FurnaceMacroType.PAN_R]:       'Pan Right',
  [FurnaceMacroType.PHASE_RESET]: 'Phase Reset',
  [FurnaceMacroType.EX4]:         'Extra 4',
  [FurnaceMacroType.EX5]:         'Extra 5',
  [FurnaceMacroType.EX6]:         'Extra 6',
  [FurnaceMacroType.EX7]:         'Extra 7',
  [FurnaceMacroType.EX8]:         'Extra 8',
  [FurnaceMacroType.FMS2]:        'FM LFO Speed 2',
  [FurnaceMacroType.AMS2]:        'AM LFO Speed 2',
};

// ── Preset patterns (matching DOM) ──────────────────────────────────────────

interface MacroPreset { name: string; data: number[]; loop?: number; release?: number; }

const MACRO_PRESETS: Partial<Record<number, MacroPreset[]>> = {
  [FurnaceMacroType.VOL]: [
    { name: 'Fade In',   data: [0, 2, 4, 6, 8, 10, 12, 14, 15, 15, 15, 15, 15, 15, 15, 15] },
    { name: 'Fade Out',  data: [15, 13, 11, 9, 7, 5, 3, 1, 0] },
    { name: 'Tremolo',   data: [15, 8, 15, 8, 15, 8, 15, 8], loop: 0 },
    { name: 'Gate',      data: [15, 15, 15, 15, 0, 0, 0, 0], loop: 0 },
    { name: 'Staccato',  data: [15, 0, 0, 0], loop: 0 },
  ],
  [FurnaceMacroType.ARP]: [
    { name: 'Major',     data: [0, 4, 7, 0, 4, 7], loop: 0 },
    { name: 'Minor',     data: [0, 3, 7, 0, 3, 7], loop: 0 },
    { name: 'Power',     data: [0, 7, 0, 7], loop: 0 },
    { name: 'Octave',    data: [0, 12, 0, 12], loop: 0 },
  ],
  [FurnaceMacroType.PITCH]: [
    { name: 'Vibrato',   data: [0, 2, 4, 2, 0, -2, -4, -2], loop: 0 },
    { name: 'Bend Up',   data: [0, 2, 4, 6, 8, 10, 12] },
    { name: 'Bend Down', data: [0, -2, -4, -6, -8, -10, -12] },
  ],
  [FurnaceMacroType.DUTY]: [
    { name: 'Square',    data: [2] },
    { name: 'PWM Up',    data: [0, 0, 1, 1, 2, 2, 3, 3], loop: 0 },
    { name: 'PWM Down',  data: [3, 3, 2, 2, 1, 1, 0, 0], loop: 0 },
  ],
};

// ── Color mapping (matching DOM) ────────────────────────────────────────────

function getMacroColorHex(macroType: number): number {
  const colors: Record<number, number> = {
    [FurnaceMacroType.VOL]:   0x22C55E,
    [FurnaceMacroType.ARP]:   0x3B82F6,
    [FurnaceMacroType.DUTY]:  0xF59E0B,
    [FurnaceMacroType.WAVE]:  0x06B6D4,
    [FurnaceMacroType.PITCH]: 0xEC4899,
  };
  return colors[macroType] ?? 0xA78BFA;
}

// ── Range per macro type ────────────────────────────────────────────────────

function getMacroRange(macroType: number): { min: number; max: number; bipolar: boolean } {
  switch (macroType) {
    case FurnaceMacroType.VOL:   return { min: 0,    max: 15,  bipolar: false };
    case FurnaceMacroType.ARP:   return { min: -12,  max: 12,  bipolar: true  };
    case FurnaceMacroType.DUTY:  return { min: 0,    max: 3,   bipolar: false };
    case FurnaceMacroType.WAVE:  return { min: 0,    max: 255, bipolar: false };
    case FurnaceMacroType.PITCH: return { min: -128, max: 127, bipolar: true  };
    case FurnaceMacroType.ALG:   return { min: 0,    max: 7,   bipolar: false };
    case FurnaceMacroType.FB:    return { min: 0,    max: 7,   bipolar: false };
    default:                     return { min: 0,    max: 15,  bipolar: false };
  }
}

// ── Single macro editor props ───────────────────────────────────────────────

interface PixiMacroCurveEditorProps {
  macro: FurnaceMacro;
  macroType: number;
  onChange: (macro: FurnaceMacro) => void;
  minValue?: number;
  maxValue?: number;
  width: number;
  height?: number;
  color?: number;
  bipolar?: boolean;
  playbackPosition?: number;
}

// ── Drawing ─────────────────────────────────────────────────────────────────

const PAD = 4;

function drawMacroCurve(
  g: Graphics,
  data: number[],
  minVal: number,
  maxVal: number,
  loop: number,
  release: number,
  playbackPos: number | undefined,
  bipolar: boolean,
  w: number,
  h: number,
  barColor: number,
  bgColor: number,
  gridColor: number,
  loopColor: number,
  releaseColor: number,
  playbackColor: number,
) {
  g.clear();
  const gw = w - PAD * 2;
  const gh = h - PAD * 2;
  const range = maxVal - minVal;

  // Background
  g.rect(0, 0, w, h).fill({ color: bgColor, alpha: 0.3 });

  // Horizontal grid (4 divisions)
  for (let i = 0; i <= 4; i++) {
    const y = PAD + (gh / 4) * i;
    g.moveTo(PAD, y).lineTo(w - PAD, y).stroke({ color: gridColor, width: 1, alpha: 0.3 });
  }

  // Zero line for bipolar
  if (bipolar && minVal < 0) {
    const zeroY = PAD + gh * (maxVal / range);
    g.moveTo(PAD, zeroY).lineTo(w - PAD, zeroY).stroke({ color: gridColor, width: 1, alpha: 0.6 });
  }

  // Vertical grid (every 4 steps)
  for (let i = 0; i < data.length; i += 4) {
    if (data.length === 0) break;
    const x = PAD + (i / data.length) * gw;
    g.moveTo(x, PAD).lineTo(x, h - PAD).stroke({ color: gridColor, width: 1, alpha: 0.3 });
  }

  // Loop region shading
  if (loop >= 0 && loop < data.length) {
    const loopX = PAD + (loop / data.length) * gw;
    const releaseX = release >= 0 && release < data.length ? PAD + (release / data.length) * gw : w - PAD;
    g.rect(loopX, PAD, releaseX - loopX, gh).fill({ color: loopColor, alpha: 0.08 });
  }

  // Value bars
  if (data.length > 0) {
    const barW = gw / data.length;
    for (let i = 0; i < data.length; i++) {
      const value = data[i];
      const normalizedValue = (value - minVal) / range;
      const barH = normalizedValue * gh;
      const x = PAD + i * barW;
      const y = PAD + gh - barH;

      g.rect(x + 1, y, barW - 2, Math.max(1, barH))
        .fill({ color: barColor, alpha: 0.7 });
      g.rect(x + 1, y, barW - 2, Math.max(1, barH))
        .stroke({ color: 0xFFFFFF, width: 1, alpha: 0.1 });
    }
  }

  // Loop point marker
  if (loop >= 0 && loop < data.length) {
    const lx = PAD + (loop / data.length) * gw;
    g.moveTo(lx, PAD).lineTo(lx, h - PAD).stroke({ color: loopColor, width: 2 });
    // Arrow
    g.moveTo(lx - 5, PAD + 8).lineTo(lx, PAD).lineTo(lx + 5, PAD + 8).closePath().fill({ color: loopColor });
  }

  // Release point marker
  if (release >= 0 && release < data.length) {
    const rx = PAD + (release / data.length) * gw;
    g.moveTo(rx, PAD).lineTo(rx, h - PAD).stroke({ color: releaseColor, width: 2 });
    g.rect(rx - 4, PAD + 4, 8, 8).fill({ color: releaseColor });
  }

  // Playback cursor
  if (typeof playbackPos === 'number' && playbackPos >= 0 && playbackPos < data.length) {
    const px = PAD + ((playbackPos + 0.5) / data.length) * gw;
    g.moveTo(px, PAD).lineTo(px, h - PAD).stroke({ color: playbackColor, width: 2, alpha: 0.9 });
    // Diamond
    g.moveTo(px, PAD + 4).lineTo(px - 4, PAD + 12).lineTo(px, PAD + 20).lineTo(px + 4, PAD + 12).closePath()
      .fill({ color: playbackColor, alpha: 0.9 });
  }
}

// ── Single macro curve editor component ─────────────────────────────────────

export const PixiMacroCurveEditor: React.FC<PixiMacroCurveEditorProps> = ({
  macro,
  macroType,
  onChange,
  minValue,
  maxValue,
  width,
  height: propHeight,
  color,
  bipolar: propBipolar,
  playbackPosition,
}) => {
  const theme = usePixiTheme();
  const { min: rangeMin, max: rangeMax, bipolar: rangeBipolar } = useMemo(() => getMacroRange(macroType), [macroType]);
  const minVal = minValue ?? rangeMin;
  const maxVal = maxValue ?? rangeMax;
  const bipolar = propBipolar ?? rangeBipolar;
  const barColor = color ?? getMacroColorHex(macroType);
  const h = propHeight ?? 80;

  const macroRef = useRef(macro);
  macroRef.current = macro;
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;

  const [isSettingLoop, setIsSettingLoop] = useState(false);
  const [isSettingRelease, setIsSettingRelease] = useState(false);
  const dragStartRef = useRef<{ step: number; value: number } | null>(null);
  const isLineModeRef = useRef(false);

  // ── Mouse coordinate helpers ──────────────────────────────────────────
  const getStepValue = useCallback((e: FederatedPointerEvent): { step: number; value: number } => {
    const target = e.target as unknown as { getBounds?: () => { x: number; y: number; width: number; height: number } };
    if (!target.getBounds) return { step: 0, value: 0 };
    const bounds = target.getBounds();
    const lx = e.global.x - bounds.x;
    const ly = e.global.y - bounds.y;
    const gw = bounds.width - PAD * 2;
    const gh = bounds.height - PAD * 2;
    const m = macroRef.current;
    const step = Math.max(0, Math.min(m.data.length - 1, Math.floor((lx - PAD) / (gw / Math.max(m.data.length, 1)))));
    const range = maxVal - minVal;
    const value = Math.max(minVal, Math.min(maxVal, Math.round(minVal + (1 - (ly - PAD) / gh) * range)));
    return { step, value };
  }, [minVal, maxVal]);

  // ── Line interpolation ────────────────────────────────────────────────
  const applyLine = useCallback((s0: number, v0: number, s1: number, v1: number) => {
    const m = macroRef.current;
    const newData = [...m.data];
    const lo = Math.min(s0, s1);
    const hi = Math.max(s0, s1);
    for (let s = lo; s <= hi; s++) {
      const t = hi === lo ? 0 : (s - lo) / (hi - lo);
      const v = s0 <= s1
        ? v0 + (v1 - v0) * t
        : v1 + (v0 - v1) * (1 - t);
      newData[s] = Math.max(minVal, Math.min(maxVal, Math.round(v)));
    }
    onChangeRef.current({ ...m, data: newData });
  }, [minVal, maxVal]);

  // ── Pointer handlers ──────────────────────────────────────────────────
  const handlePointerDown = useCallback((e: FederatedPointerEvent) => {
    const { step, value } = getStepValue(e);
    const m = macroRef.current;

    if (isSettingLoop) {
      onChangeRef.current({ ...m, loop: step });
      setIsSettingLoop(false);
      return;
    }
    if (isSettingRelease) {
      onChangeRef.current({ ...m, release: step });
      setIsSettingRelease(false);
      return;
    }

    dragStartRef.current = { step, value };
    // Check for shift via native event
    const ne = e.nativeEvent as PointerEvent | undefined;
    isLineModeRef.current = !!ne?.shiftKey;

    if (!isLineModeRef.current) {
      const newData = [...m.data];
      newData[step] = value;
      onChangeRef.current({ ...m, data: newData });
    }
  }, [getStepValue, isSettingLoop, isSettingRelease]);

  const handlePointerMove = useCallback((e: FederatedPointerEvent) => {
    if (e.buttons !== 1) return;
    if (!dragStartRef.current) return;
    const { step, value } = getStepValue(e);

    if (isLineModeRef.current && dragStartRef.current) {
      applyLine(dragStartRef.current.step, dragStartRef.current.value, step, value);
    } else {
      const m = macroRef.current;
      const newData = [...m.data];
      newData[step] = value;
      onChangeRef.current({ ...m, data: newData });
    }
  }, [getStepValue, applyLine]);

  const handlePointerUp = useCallback(() => {
    dragStartRef.current = null;
  }, []);

  // ── Step count controls ───────────────────────────────────────────────
  const addStep = useCallback(() => {
    const m = macroRef.current;
    if (m.data.length >= 256) return;
    onChangeRef.current({ ...m, data: [...m.data, m.data[m.data.length - 1] ?? 0] });
  }, []);

  const removeStep = useCallback(() => {
    const m = macroRef.current;
    if (m.data.length <= 1) return;
    const newData = m.data.slice(0, -1);
    const newLoop = m.loop >= newData.length ? newData.length - 1 : m.loop;
    const newRelease = m.release >= newData.length ? newData.length - 1 : m.release;
    onChangeRef.current({ ...m, data: newData, loop: newLoop, release: newRelease });
  }, []);

  const resetMacro = useCallback(() => {
    const m = macroRef.current;
    onChangeRef.current({
      ...m,
      data: Array(m.data.length).fill(bipolar ? 0 : minVal),
      loop: -1,
      release: -1,
    });
  }, [bipolar, minVal]);

  // ── Presets ───────────────────────────────────────────────────────────
  const presets = MACRO_PRESETS[macroType] ?? [];
  const presetOptions: SelectOption[] = useMemo(() => [
    { value: '__none__', label: 'Presets...' },
    ...presets.map((p, i) => ({ value: String(i), label: p.name })),
  ], [presets]);

  const handlePreset = useCallback((val: string) => {
    if (val === '__none__') return;
    const preset = presets[parseInt(val, 10)];
    if (!preset) return;
    const m = macroRef.current;
    onChangeRef.current({
      ...m,
      data: [...preset.data],
      loop: preset.loop ?? -1,
      release: preset.release ?? -1,
    });
  }, [presets]);

  // ── Draw callback ─────────────────────────────────────────────────────
  const drawCurve = useCallback((g: Graphics) => {
    drawMacroCurve(
      g, macro.data, minVal, maxVal,
      macro.loop, macro.release,
      playbackPosition,
      bipolar, width, h,
      barColor, theme.bg.color, theme.border.color,
      0x3B82F6, 0xEF4444, 0xFFDC00,
    );
  }, [macro, minVal, maxVal, playbackPosition, bipolar, width, h, barColor, theme]);

  const macroLabel = MACRO_TYPE_NAMES[macroType] || `Macro ${macroType}`;

  return (
    <layoutContainer layout={{ width, flexDirection: 'column', gap: 4 }}>
      {/* Header */}
      <layoutContainer layout={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', width, height: 20 }}>
        <layoutContainer layout={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
          <PixiLabel text={macroLabel.toUpperCase()} size="xs" weight="bold" color="textSecondary" />
          <PixiLabel text={`${macro.data.length} steps`} size="xs" color="textMuted" />
        </layoutContainer>
        <layoutContainer layout={{ flexDirection: 'row', alignItems: 'center', gap: 2 }}>
          {/* Loop button */}
          <PixiButton
            label="L"
            variant={isSettingLoop ? 'primary' : 'ghost'}
            size="sm"
            onClick={() => { setIsSettingLoop(!isSettingLoop); setIsSettingRelease(false); }}
          />
          {/* Release button */}
          <PixiButton
            label="R"
            variant={isSettingRelease ? 'primary' : 'ghost'}
            size="sm"
            onClick={() => { setIsSettingRelease(!isSettingRelease); setIsSettingLoop(false); }}
          />
          {/* Reset */}
          <PixiButton icon="undo" label="" variant="ghost" size="sm" onClick={resetMacro} />
        </layoutContainer>
      </layoutContainer>

      {/* Curve canvas (interactive) */}
      <pixiGraphics
        draw={drawCurve}
        eventMode="static"
        cursor={isSettingLoop || isSettingRelease ? 'pointer' : 'crosshair'}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerUpOutside={handlePointerUp}
      />

      {/* Controls: presets, +/- steps */}
      <layoutContainer layout={{ flexDirection: 'row', alignItems: 'center', gap: 6, width }}>
        {presets.length > 0 && (
          <PixiSelect
            options={presetOptions}
            value="__none__"
            onChange={handlePreset}
            width={100}
          />
        )}
        <PixiButton icon="prev" label="" variant="ghost" size="sm" onClick={removeStep} />
        <PixiLabel text={`${macro.data.length}`} size="xs" color="textMuted" />
        <PixiButton icon="next" label="" variant="ghost" size="sm" onClick={addStep} />
        <layoutContainer layout={{ flex: 1 }} />
        <PixiLabel text={`Spd ${macro.speed ?? 1}`} size="xs" color="textMuted" />
      </layoutContainer>
    </layoutContainer>
  );
};

// ── PixiMacroListEditor ─────────────────────────────────────────────────────

interface PixiMacroListEditorProps {
  macros: FurnaceMacro[];
  onChange: (macros: FurnaceMacro[]) => void;
  width: number;
  playbackPositions?: Record<number, number>;
}

export const PixiMacroListEditor: React.FC<PixiMacroListEditorProps> = ({
  macros,
  onChange,
  width,
  playbackPositions,
}) => {
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;
  const macrosRef = useRef(macros);
  macrosRef.current = macros;

  // Available types not yet added
  const availableTypes = useMemo(() => {
    return Object.entries(MACRO_TYPE_NAMES)
      .filter(([typeNum]) => !macros.some(m => m.type === parseInt(typeNum)))
      .map(([typeNum, name]) => ({ value: typeNum, label: name }));
  }, [macros]);

  const addOptions: SelectOption[] = useMemo(() => [
    { value: '__none__', label: 'Add Macro...' },
    ...availableTypes,
  ], [availableTypes]);

  const handleAdd = useCallback((val: string) => {
    if (val === '__none__') return;
    const type = parseInt(val, 10);
    const range = getMacroRange(type);
    const newMacro: FurnaceMacro = {
      type,
      data: Array(16).fill(range.bipolar ? 0 : range.min),
      loop: -1,
      release: -1,
      mode: 0,
      speed: 1,
    };
    onChangeRef.current([...macrosRef.current, newMacro]);
  }, []);

  const handleRemove = useCallback((index: number) => {
    onChangeRef.current(macrosRef.current.filter((_, i) => i !== index));
  }, []);

  const handleUpdate = useCallback((index: number, updated: FurnaceMacro) => {
    const newMacros = [...macrosRef.current];
    newMacros[index] = updated;
    onChangeRef.current(newMacros);
  }, []);

  // Per-macro width: try 2 columns if wide enough
  const colCount = width >= 500 ? 2 : 1;
  const macroW = (width - (colCount - 1) * 8) / colCount;

  return (
    <layoutContainer layout={{ width, flexDirection: 'column', gap: 8 }}>
      {/* Macro editors in a flow */}
      <layoutContainer layout={{ width, flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
        {macros.map((macro, index) => (
          <layoutContainer
            key={index}
            layout={{
              width: macroW,
              flexDirection: 'column',
              gap: 2,
              backgroundColor: 0x000000,
              borderRadius: 4,
              padding: 4,
            }}
          >
            {/* Title + remove button */}
            <layoutContainer layout={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', width: macroW - 8 }}>
              <PixiLabel
                text={MACRO_TYPE_NAMES[macro.type] || `Macro ${macro.type}`}
                size="xs"
                weight="bold"
                color="text"
              />
              <PixiButton label="X" variant="ghost" size="sm" onClick={() => handleRemove(index)} />
            </layoutContainer>
            <PixiMacroCurveEditor
              macro={macro}
              macroType={macro.type}
              onChange={(m) => handleUpdate(index, m)}
              width={macroW - 8}
              height={60}
              playbackPosition={playbackPositions?.[macro.type]}
            />
          </layoutContainer>
        ))}
      </layoutContainer>

      {/* Add macro dropdown */}
      {availableTypes.length > 0 && (
        <PixiSelect
          options={addOptions}
          value="__none__"
          onChange={handleAdd}
          width={160}
        />
      )}
    </layoutContainer>
  );
};
