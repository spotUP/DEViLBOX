/**
 * PixiArpeggioEditor -- GL-native arpeggio editor for the instrument editor.
 *
 * Mirrors the DOM ArpeggioEditor (src/components/instruments/ArpeggioEditor.tsx):
 *  - 16-step grid with note offset bars
 *  - Step visualization (bar graph)
 *  - Speed knob, mode selector, enable toggle
 *  - Preset browser dropdown
 *  - Current-step highlight during playback
 *
 * Wired to the same ArpeggioConfig type the DOM uses.
 */

import React, { useCallback, useMemo, useRef } from 'react';
import { Graphics } from 'pixi.js';
import type { FederatedPointerEvent } from 'pixi.js';
import { usePixiTheme } from '../../theme';
import {
  PixiButton,
  PixiLabel,
  PixiToggle,
  PixiSelect,
  PixiKnob,
  type SelectOption,
} from '../../components';
import type {
  ArpeggioConfig,
  ArpeggioStep,
  ArpeggioMode,
  ArpeggioSpeedUnit,
} from '@typedefs/instrument';

// ── Props ───────────────────────────────────────────────────────────────────

interface PixiArpeggioEditorProps {
  config: ArpeggioConfig;
  onChange: (config: ArpeggioConfig) => void;
  width: number;
  height?: number;
  currentStep?: number;
  isPlaying?: boolean;
}

// ── Presets (same as DOM) ───────────────────────────────────────────────────

interface ArpPreset {
  label: string;
  steps: ArpeggioStep[];
}

const ARP_PRESETS: ArpPreset[] = [
  { label: 'Major', steps: [{ noteOffset: 0 }, { noteOffset: 4 }, { noteOffset: 7 }] },
  { label: 'Minor', steps: [{ noteOffset: 0 }, { noteOffset: 3 }, { noteOffset: 7 }] },
  { label: 'Power', steps: [{ noteOffset: 0 }, { noteOffset: 7 }] },
  { label: 'Octave', steps: [{ noteOffset: 0 }, { noteOffset: 12 }] },
  { label: 'Maj7', steps: [{ noteOffset: 0 }, { noteOffset: 4 }, { noteOffset: 7 }, { noteOffset: 11 }] },
  { label: 'Dom7', steps: [{ noteOffset: 0 }, { noteOffset: 4 }, { noteOffset: 7 }, { noteOffset: 10 }] },
  { label: 'Min7', steps: [{ noteOffset: 0 }, { noteOffset: 3 }, { noteOffset: 7 }, { noteOffset: 10 }] },
  { label: 'Dim', steps: [{ noteOffset: 0 }, { noteOffset: 3 }, { noteOffset: 6 }] },
];

const PRESET_OPTIONS: SelectOption[] = [
  { value: '__none__', label: 'Presets...' },
  ...ARP_PRESETS.map((p, i) => ({ value: String(i), label: p.label })),
];

const MODE_OPTIONS: SelectOption[] = [
  { value: 'loop', label: 'Loop' },
  { value: 'pingpong', label: 'Ping-Pong' },
  { value: 'oneshot', label: 'One-Shot' },
  { value: 'random', label: 'Random' },
];

const SPEED_UNIT_OPTIONS: SelectOption[] = [
  { value: 'hz', label: 'Hz' },
  { value: 'ticks', label: 'Ticks' },
  { value: 'division', label: 'Div' },
];

// ── Helpers ─────────────────────────────────────────────────────────────────

const normalizeConfig = (config: Partial<ArpeggioConfig>): ArpeggioConfig => {
  const steps = config.steps?.length
    ? config.steps
    : config.pattern?.length
      ? config.pattern.map(o => ({ noteOffset: o }))
      : [{ noteOffset: 0 }, { noteOffset: 4 }, { noteOffset: 7 }];
  return {
    enabled: config.enabled ?? false,
    speed: config.speed ?? 15,
    speedUnit: config.speedUnit ?? 'hz',
    steps,
    mode: config.mode ?? 'loop',
    swing: config.swing ?? 0,
  };
};

const MIN_NOTE = -24;
const MAX_NOTE = 36;

// ── Grid drawing (canvas-style via Pixi Graphics) ──────────────────────────

const GRID_PAD = 4;

function drawArpeggioGrid(
  g: Graphics,
  steps: ArpeggioStep[],
  currentStep: number,
  isPlaying: boolean,
  w: number,
  h: number,
  accentColor: number,
  bgColor: number,
  gridColor: number,
  _textColor: number,
  warningColor: number,
) {
  g.clear();
  const pad = GRID_PAD;
  const gw = w - pad * 2;
  const gh = h - pad * 2;

  // Background
  g.rect(0, 0, w, h).fill({ color: bgColor, alpha: 0.3 });

  // Total range for note display
  const range = MAX_NOTE - MIN_NOTE;
  const zeroY = pad + gh * (MAX_NOTE / range);

  // Zero line
  g.moveTo(pad, zeroY).lineTo(w - pad, zeroY)
    .stroke({ color: gridColor, width: 1 });

  // Horizontal gridlines at octave boundaries
  for (let n = -24; n <= 36; n += 12) {
    if (n === 0) continue;
    const y = pad + gh * ((MAX_NOTE - n) / range);
    g.moveTo(pad, y).lineTo(w - pad, y)
      .stroke({ color: gridColor, width: 1, alpha: 0.3 });
  }

  if (steps.length === 0) return;
  const barW = gw / steps.length;

  // Draw step bars
  for (let i = 0; i < steps.length; i++) {
    const offset = steps[i].noteOffset;
    const x = pad + i * barW;
    const clamped = Math.max(MIN_NOTE, Math.min(MAX_NOTE, offset));
    const barY = pad + gh * ((MAX_NOTE - clamped) / range);
    const barH = Math.abs(barY - zeroY);
    const topY = Math.min(barY, zeroY);

    const isActive = isPlaying && currentStep === i;
    const barColor = isActive ? warningColor : accentColor;
    const barAlpha = isActive ? 0.9 : 0.7;

    g.rect(x + 1, topY, barW - 2, Math.max(1, barH))
      .fill({ color: barColor, alpha: barAlpha });

    // Outline
    g.rect(x + 1, topY, barW - 2, Math.max(1, barH))
      .stroke({ color: 0xffffff, width: 1, alpha: 0.12 });
  }

  // Step number labels
  if (barW >= 14) {
    for (let i = 0; i < steps.length; i++) {
      const x = pad + i * barW + barW / 2;
      // Draw step numbers at bottom
      g.circle(x, h - pad - 4, 0); // pixi needs a shape for text alignment workaround
    }
  }
}

// ── Component ───────────────────────────────────────────────────────────────

export const PixiArpeggioEditor: React.FC<PixiArpeggioEditorProps> = ({
  config: rawConfig,
  onChange,
  width,
  height: propHeight,
  currentStep = 0,
  isPlaying = false,
}) => {
  const theme = usePixiTheme();
  const config = useMemo(() => normalizeConfig(rawConfig), [rawConfig]);
  const configRef = useRef(config);
  configRef.current = config;

  const gridH = propHeight ?? 120;

  // ── Update helpers (use ref pattern to avoid stale state) ─────────────
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;

  const updateConfig = useCallback((updates: Partial<ArpeggioConfig>) => {
    onChangeRef.current({ ...configRef.current, ...updates });
  }, []);

  // ── Step editing via grid click ───────────────────────────────────────
  const handleGridClick = useCallback((e: FederatedPointerEvent) => {
    const target = e.target as unknown as { getBounds?: () => { x: number; y: number; width: number; height: number } };
    if (!target.getBounds) return;
    const bounds = target.getBounds();
    const localX = e.global.x - bounds.x;
    const localY = e.global.y - bounds.y;
    const gw = bounds.width - GRID_PAD * 2;
    const gh = bounds.height - GRID_PAD * 2;
    const cfg = configRef.current;
    if (cfg.steps.length === 0) return;

    const stepIdx = Math.max(0, Math.min(cfg.steps.length - 1, Math.floor((localX - GRID_PAD) / (gw / cfg.steps.length))));
    const range = MAX_NOTE - MIN_NOTE;
    const noteVal = Math.round(MAX_NOTE - ((localY - GRID_PAD) / gh) * range);
    const clamped = Math.max(MIN_NOTE, Math.min(MAX_NOTE, noteVal));

    const newSteps = [...cfg.steps];
    newSteps[stepIdx] = { ...newSteps[stepIdx], noteOffset: clamped };
    onChangeRef.current({ ...cfg, steps: newSteps });
  }, []);

  // ── Preset handler ────────────────────────────────────────────────────
  const handlePresetChange = useCallback((val: string) => {
    if (val === '__none__') return;
    const idx = parseInt(val, 10);
    const preset = ARP_PRESETS[idx];
    if (preset) {
      updateConfig({ steps: [...preset.steps] });
    }
  }, [updateConfig]);

  // ── Add/remove step ───────────────────────────────────────────────────
  const handleAddStep = useCallback(() => {
    const cfg = configRef.current;
    if (cfg.steps.length >= 16) return;
    const last = cfg.steps[cfg.steps.length - 1] || { noteOffset: 0 };
    updateConfig({ steps: [...cfg.steps, { noteOffset: last.noteOffset }] });
  }, [updateConfig]);

  const handleRemoveStep = useCallback(() => {
    const cfg = configRef.current;
    if (cfg.steps.length <= 1) return;
    updateConfig({ steps: cfg.steps.slice(0, -1) });
  }, [updateConfig]);

  // ── Speed range per unit ──────────────────────────────────────────────
  const speedRange = useMemo(() => {
    switch (config.speedUnit) {
      case 'hz': return { min: 1, max: 60 };
      case 'ticks': return { min: 1, max: 48 };
      case 'division': return { min: 1, max: 64 };
      default: return { min: 1, max: 60 };
    }
  }, [config.speedUnit]);

  // ── Draw callback ─────────────────────────────────────────────────────
  const drawGrid = useCallback((g: Graphics) => {
    drawArpeggioGrid(
      g,
      config.steps,
      currentStep,
      isPlaying,
      width,
      gridH,
      theme.accent.color,
      theme.bg.color,
      theme.border.color,
      theme.textMuted.color,
      theme.warning.color,
    );
  }, [config.steps, currentStep, isPlaying, width, gridH, theme]);

  return (
    <layoutContainer layout={{ width, flexDirection: 'column', gap: 6 }}>
      {/* Header row: title + enable toggle */}
      <layoutContainer layout={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', width, height: 24 }}>
        <layoutContainer layout={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
          <PixiLabel text="ARPEGGIO" size="xs" weight="bold" color="textSecondary" />
          <PixiLabel text={`${config.steps.length} steps`} size="xs" color="textMuted" />
        </layoutContainer>
        <PixiToggle
          value={config.enabled}
          onChange={(v) => updateConfig({ enabled: v })}
          label="ON"
          size="sm"
        />
      </layoutContainer>

      {/* Grid visualization (interactive) */}
      <pixiGraphics
        draw={drawGrid}
        eventMode="static"
        cursor="crosshair"
        onPointerDown={handleGridClick}
        onPointerMove={(e: FederatedPointerEvent) => {
          if (e.buttons === 1) handleGridClick(e);
        }}
      />

      {/* Controls row: preset, speed, mode, add/remove */}
      <layoutContainer layout={{ flexDirection: 'row', alignItems: 'center', gap: 8, width, flexWrap: 'wrap' }}>
        {/* Presets */}
        <PixiSelect
          options={PRESET_OPTIONS}
          value="__none__"
          onChange={handlePresetChange}
          width={100}
        />

        {/* Speed knob */}
        <layoutContainer layout={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
          <PixiLabel text="Spd" size="xs" color="textMuted" />
          <PixiKnob
            value={config.speed}
            min={speedRange.min}
            max={speedRange.max}
            onChange={(v) => updateConfig({ speed: Math.round(v) })}
            size="sm"
          />
        </layoutContainer>

        {/* Speed unit */}
        <PixiSelect
          options={SPEED_UNIT_OPTIONS}
          value={config.speedUnit}
          onChange={(v) => updateConfig({ speedUnit: v as ArpeggioSpeedUnit, speed: speedRange.min })}
          width={64}
        />

        {/* Mode */}
        <PixiSelect
          options={MODE_OPTIONS}
          value={config.mode}
          onChange={(v) => updateConfig({ mode: v as ArpeggioMode })}
          width={90}
        />

        {/* Spacer */}
        <layoutContainer layout={{ flex: 1 }} />

        {/* Add/remove step */}
        <PixiButton icon="prev" label="" variant="ghost" size="sm" onClick={handleRemoveStep} />
        <PixiLabel text={`${config.steps.length}/16`} size="xs" color="textMuted" />
        <PixiButton icon="next" label="" variant="ghost" size="sm" onClick={handleAddStep} />
      </layoutContainer>
    </layoutContainer>
  );
};
