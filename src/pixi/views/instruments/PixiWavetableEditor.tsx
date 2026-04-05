/**
 * PixiWavetableEditor — GL-native wavetable editor for the instrument editor.
 *
 * Features:
 * - Wavetable frame display (one waveform cycle, drawn as bars + line)
 * - Frame selector/slider to scrub through frames
 * - Draw mode (click+drag to edit waveform shape)
 * - Waveform generator (sine, triangle, saw, square, noise)
 * - Length and height controls
 * - Morph position indicator
 *
 * DOM reference: src/components/instruments/editors/WavetableEditor.tsx
 */

import React, { useCallback, useRef, useState } from 'react';
import { Graphics } from 'pixi.js';
import type { FederatedPointerEvent } from 'pixi.js';
import { usePixiTheme } from '../../theme';
import { PixiLabel, PixiButton, PixiSlider, PixiSelect, PixiIcon } from '../../components';
import type { SelectOption } from '../../components';

// ── Types ───────────────────────────────────────────────────────────────

export interface WavetableData {
  id: number;
  data: number[];
  len?: number;
  max?: number;
}

interface PixiWavetableEditorProps {
  wavetables: WavetableData[];
  onChange: (wavetables: WavetableData[]) => void;
  width: number;
  height: number;
  maxWavetables?: number;
}

type WaveformType = 'sine' | 'triangle' | 'saw' | 'square' | 'pulse25' | 'noise';

// ── Waveform generator ──────────────────────────────────────────────────

const generateWaveform = (type: WaveformType, length: number, maxValue: number): number[] => {
  const data: number[] = [];
  const mid = maxValue / 2;
  for (let i = 0; i < length; i++) {
    const phase = i / length;
    let value: number;
    switch (type) {
      case 'sine':
        value = Math.sin(phase * 2 * Math.PI) * mid + mid;
        break;
      case 'triangle':
        value = phase < 0.5 ? phase * 4 * mid : (1 - phase) * 4 * mid;
        break;
      case 'saw':
        value = phase * maxValue;
        break;
      case 'square':
        value = phase < 0.5 ? maxValue : 0;
        break;
      case 'pulse25':
        value = phase < 0.25 ? maxValue : 0;
        break;
      case 'noise':
        value = Math.random() * maxValue;
        break;
      default:
        value = mid;
    }
    data.push(Math.round(Math.max(0, Math.min(maxValue, value))));
  }
  return data;
};

// ── Height options ──────────────────────────────────────────────────────

const HEIGHT_OPTIONS: SelectOption[] = [
  { value: '3', label: '4' },
  { value: '7', label: '8' },
  { value: '15', label: '16' },
  { value: '31', label: '32' },
  { value: '63', label: '64' },
  { value: '127', label: '128' },
  { value: '255', label: '256' },
];

const WAVEFORM_TYPES: SelectOption[] = [
  { value: 'sine', label: 'Sine' },
  { value: 'triangle', label: 'Triangle' },
  { value: 'saw', label: 'Saw' },
  { value: 'square', label: 'Square' },
  { value: 'pulse25', label: 'Pulse 25%' },
  { value: 'noise', label: 'Noise' },
];

// ── Component ───────────────────────────────────────────────────────────

export const PixiWavetableEditor: React.FC<PixiWavetableEditorProps> = ({
  wavetables,
  onChange,
  width,
  height,
  maxWavetables = 64,
}) => {
  const theme = usePixiTheme();
  const [selectedWaveIdx, setSelectedWaveIdx] = useState(0);
  const [_isDragging, setIsDragging] = useState(false);
  const isDraggingRef = useRef(false);

  // Current wavetable data
  const currentWave = wavetables[selectedWaveIdx] ?? null;
  const maxValue = currentWave?.max ?? 15;
  const waveLength = currentWave?.data.length ?? 32;

  // ── Layout ──────────────────────────────────────────────────────────
  const TOOLBAR_H = 32;
  const SELECTOR_H = 36;
  const CONTROLS_H = 28;
  const CANVAS_H = height - TOOLBAR_H - SELECTOR_H - CONTROLS_H - 20;
  const CANVAS_W = width;

  // ── Update current wavetable ────────────────────────────────────────
  const updateCurrentWave = useCallback((updated: WavetableData) => {
    const newWavetables = [...wavetables];
    newWavetables[selectedWaveIdx] = updated;
    onChange(newWavetables);
  }, [wavetables, selectedWaveIdx, onChange]);

  // ── Add wavetable ───────────────────────────────────────────────────
  const addWavetable = useCallback(() => {
    if (wavetables.length >= maxWavetables) return;
    const newId = wavetables.length > 0 ? Math.max(...wavetables.map(w => w.id)) + 1 : 0;
    const newWave: WavetableData = {
      id: newId,
      data: generateWaveform('sine', 32, 15),
      len: 32,
      max: 15,
    };
    onChange([...wavetables, newWave]);
    setSelectedWaveIdx(wavetables.length);
  }, [wavetables, maxWavetables, onChange]);

  // ── Remove wavetable ────────────────────────────────────────────────
  const removeWavetable = useCallback(() => {
    if (wavetables.length <= 1) return;
    const newWavetables = wavetables.filter((_, i) => i !== selectedWaveIdx);
    onChange(newWavetables);
    setSelectedWaveIdx(Math.min(selectedWaveIdx, newWavetables.length - 1));
  }, [wavetables, selectedWaveIdx, onChange]);

  // ── Generate waveform ───────────────────────────────────────────────
  const applyWaveform = useCallback((type: WaveformType) => {
    if (!currentWave) return;
    const newData = generateWaveform(type, waveLength, maxValue);
    updateCurrentWave({ ...currentWave, data: newData });
  }, [currentWave, waveLength, maxValue, updateCurrentWave]);

  // ── Clear / Invert ──────────────────────────────────────────────────
  const clearWave = useCallback(() => {
    if (!currentWave) return;
    const mid = Math.floor(maxValue / 2);
    updateCurrentWave({ ...currentWave, data: Array(waveLength).fill(mid) });
  }, [currentWave, maxValue, waveLength, updateCurrentWave]);

  const invertWave = useCallback(() => {
    if (!currentWave) return;
    updateCurrentWave({ ...currentWave, data: currentWave.data.map(v => maxValue - v) });
  }, [currentWave, maxValue, updateCurrentWave]);

  // ── Resize ──────────────────────────────────────────────────────────
  const resizeWavetable = useCallback((newLength: number) => {
    if (!currentWave || newLength < 4 || newLength > 256) return;
    const oldData = currentWave.data;
    const newData: number[] = [];
    for (let i = 0; i < newLength; i++) {
      const srcPos = (i / newLength) * oldData.length;
      const srcFloor = Math.floor(srcPos);
      const srcCeil = Math.min(oldData.length - 1, srcFloor + 1);
      const frac = srcPos - srcFloor;
      newData.push(Math.round(oldData[srcFloor] * (1 - frac) + oldData[srcCeil] * frac));
    }
    updateCurrentWave({ ...currentWave, data: newData, len: newLength });
  }, [currentWave, updateCurrentWave]);

  const setMaxValue2 = useCallback((newMax: number) => {
    if (!currentWave || newMax < 1 || newMax > 255) return;
    const scale = newMax / maxValue;
    const newData = currentWave.data.map(v => Math.round(v * scale));
    updateCurrentWave({ ...currentWave, data: newData, max: newMax });
  }, [currentWave, maxValue, updateCurrentWave]);

  // ── Draw the wavetable canvas ───────────────────────────────────────
  const barColor = theme.accentHighlight.color;
  const drawCanvas = useCallback((g: Graphics) => {
    g.clear();
    const w = CANVAS_W;
    const h = CANVAS_H;

    // Background
    g.rect(0, 0, w, h).fill({ color: theme.bg.color, alpha: 1 });

    // Grid
    const gridColor = theme.border.color;
    for (let i = 1; i < 4; i++) {
      const y = (h / 4) * i;
      g.moveTo(0, y).lineTo(w, y).stroke({ color: gridColor, width: 1, alpha: 0.3 });
    }
    const gridStep = Math.max(1, Math.floor(waveLength / 8));
    for (let i = 0; i < waveLength; i += gridStep) {
      const x = (i / waveLength) * w;
      g.moveTo(x, 0).lineTo(x, h).stroke({ color: gridColor, width: 1, alpha: 0.3 });
    }

    if (!currentWave || currentWave.data.length === 0) return;

    const barWidth = w / waveLength;

    // Draw bars
    currentWave.data.forEach((value, i) => {
      const x = i * barWidth;
      const normalizedValue = value / maxValue;
      const barHeight = normalizedValue * h;
      const y = h - barHeight;
      g.rect(x, y, Math.max(1, barWidth - 1), barHeight).fill({ color: barColor, alpha: 0.8 });
    });

    // Draw line on top
    g.moveTo(barWidth / 2, h - (currentWave.data[0] / maxValue) * h);
    for (let i = 1; i < currentWave.data.length; i++) {
      const x = (i / waveLength) * w + barWidth / 2;
      const y = h - (currentWave.data[i] / maxValue) * h;
      g.lineTo(x, y);
    }
    g.stroke({ color: theme.text.color, width: 1, alpha: 0.5 });
  }, [CANVAS_W, CANVAS_H, currentWave, waveLength, maxValue, barColor, theme]);

  // ── Pointer interaction for draw mode ───────────────────────────────
  const editSample = useCallback((e: FederatedPointerEvent) => {
    if (!currentWave) return;
    const bounds = (e.currentTarget as unknown as { getBounds(): { x: number; y: number; width: number; height: number } }).getBounds();
    const localX = e.global.x - bounds.x;
    const localY = e.global.y - bounds.y;
    const sampleIndex = Math.floor((localX / CANVAS_W) * waveLength);
    const normalizedY = 1 - (localY / CANVAS_H);
    const value = Math.round(normalizedY * maxValue);

    if (sampleIndex >= 0 && sampleIndex < waveLength) {
      const newData = [...currentWave.data];
      newData[sampleIndex] = Math.max(0, Math.min(maxValue, value));
      updateCurrentWave({ ...currentWave, data: newData });
    }
  }, [currentWave, CANVAS_W, CANVAS_H, waveLength, maxValue, updateCurrentWave]);

  const handlePointerDown = useCallback((e: FederatedPointerEvent) => {
    isDraggingRef.current = true;
    setIsDragging(true);
    editSample(e);
  }, [editSample]);

  const handlePointerMove = useCallback((e: FederatedPointerEvent) => {
    if (!isDraggingRef.current) return;
    editSample(e);
  }, [editSample]);

  const handlePointerUp = useCallback(() => {
    isDraggingRef.current = false;
    setIsDragging(false);
  }, []);

  // ── Render ──────────────────────────────────────────────────────────
  return (
    <layoutContainer layout={{ width, height, flexDirection: 'column', gap: 4 }}>
      {/* Toolbar */}
      <layoutContainer
        layout={{
          height: TOOLBAR_H,
          flexDirection: 'row',
          alignItems: 'center',
          gap: 6,
          paddingLeft: 4,
          paddingRight: 4,
        }}
      >
        <PixiIcon name="preset-a" size={12} color={theme.accentHighlight.color} />
        <PixiLabel text="WAVETABLE EDITOR" size="xs" weight="bold" color="textSecondary" />

        {currentWave && (
          <PixiLabel
            text={`Wave ${currentWave.id} | ${waveLength} x ${maxValue + 1}`}
            size="sm"
            color="textMuted"
          />
        )}

        <layoutContainer layout={{ flex: 1 }} />

        {/* Waveform generator */}
        <PixiSelect
          options={WAVEFORM_TYPES}
          value=""
          onChange={(v) => applyWaveform(v as WaveformType)}
          placeholder="Generate"
          width={90}
        />

        {/* Invert */}
        <PixiButton
          label="Inv"
          variant="ghost"
          size="sm"
          onClick={invertWave}
          tooltip="Invert waveform"
        />

        {/* Clear */}
        <PixiButton
          icon="undo"
          label=""
          variant="ghost"
          size="sm"
          onClick={clearWave}
          tooltip="Clear to midpoint"
        />

        {/* Remove */}
        {wavetables.length > 1 && (
          <PixiButton
            icon="close"
            label=""
            variant="ghost"
            size="sm"
            onClick={removeWavetable}
            tooltip="Remove wavetable"
          />
        )}
      </layoutContainer>

      {/* Wave selector (frame thumbnails) */}
      <layoutContainer
        layout={{
          height: SELECTOR_H,
          flexDirection: 'row',
          alignItems: 'center',
          gap: 4,
          paddingLeft: 4,
          paddingRight: 4,
          overflow: 'scroll',
        }}
      >
        {wavetables.map((wave, index) => {
          const isSelected = selectedWaveIdx === index;
          return (
            <layoutContainer
              key={wave.id}
              layout={{
                width: 52,
                height: SELECTOR_H - 4,
                borderRadius: 4,
                borderWidth: 1,
                borderColor: isSelected ? theme.accentHighlight.color : theme.border.color,
                backgroundColor: isSelected ? (theme.accentHighlight.color & 0xffffff) : theme.bg.color,
                alignItems: 'center',
                justifyContent: 'center',
                flexDirection: 'column',
                gap: 1,
                padding: 2,
              }}
              eventMode="static"
              cursor="pointer"
              onPointerUp={() => setSelectedWaveIdx(index)}
            >
              {/* Mini waveform thumbnail */}
              <pixiGraphics
                draw={(g: Graphics) => {
                  g.clear();
                  const tw = 44;
                  const th = 14;
                  const wMax = wave.max ?? 15;
                  const wLen = wave.data.length;
                  for (let i = 0; i < wLen; i++) {
                    const x = (i / wLen) * tw;
                    const barH = (wave.data[i] / wMax) * th;
                    g.rect(x, th - barH, tw / wLen, barH)
                      .fill({ color: isSelected ? theme.accentHighlight.color : theme.textMuted.color, alpha: 0.8 });
                  }
                }}
                layout={{ width: 44, height: 14 }}
              />
              <PixiLabel
                text={`${wave.id}`}
                size="sm"
                color={isSelected ? 'accent' : 'textMuted'}
              />
            </layoutContainer>
          );
        })}

        {/* Add button */}
        {wavetables.length < maxWavetables && (
          <layoutContainer
            layout={{
              width: 36,
              height: SELECTOR_H - 4,
              borderRadius: 4,
              borderWidth: 1,
              borderColor: theme.border.color,
              backgroundColor: theme.bg.color,
              alignItems: 'center',
              justifyContent: 'center',
            }}
            eventMode="static"
            cursor="pointer"
            onPointerUp={addWavetable}
          >
            <PixiLabel text="+" size="sm" weight="bold" color="textMuted" />
          </layoutContainer>
        )}
      </layoutContainer>

      {/* Waveform canvas */}
      {currentWave ? (
        <layoutContainer
          layout={{
            width: CANVAS_W,
            height: CANVAS_H,
            borderRadius: 4,
            borderWidth: 1,
            borderColor: theme.border.color,
            overflow: 'hidden',
          }}
        >
          <pixiGraphics
            draw={drawCanvas}
            layout={{ width: CANVAS_W, height: CANVAS_H }}
            eventMode="static"
            cursor="crosshair"
            onPointerDown={handlePointerDown}
            onGlobalPointerMove={handlePointerMove}
            onPointerUp={handlePointerUp}
            onPointerUpOutside={handlePointerUp}
          />
        </layoutContainer>
      ) : (
        <layoutContainer layout={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
          <PixiLabel text="No wavetables" size="sm" color="textMuted" />
          <PixiButton label="Add Wavetable" variant="primary" size="sm" onClick={addWavetable} />
        </layoutContainer>
      )}

      {/* Size controls */}
      {currentWave && (
        <layoutContainer
          layout={{
            height: CONTROLS_H,
            flexDirection: 'row',
            alignItems: 'center',
            gap: 8,
            paddingLeft: 8,
            paddingRight: 8,
            backgroundColor: theme.bgSecondary.color,
            borderRadius: 4,
          }}
        >
          <PixiLabel text="Length:" size="xs" color="textMuted" />
          <PixiButton
            label="/2"
            variant="ghost"
            size="sm"
            onClick={() => resizeWavetable(Math.max(4, waveLength / 2))}
            disabled={waveLength <= 4}
          />
          <PixiLabel text={String(waveLength)} size="xs" weight="bold" color="text" />
          <PixiButton
            label="x2"
            variant="ghost"
            size="sm"
            onClick={() => resizeWavetable(Math.min(256, waveLength * 2))}
            disabled={waveLength >= 256}
          />

          <layoutContainer layout={{ width: 1, height: 16, backgroundColor: theme.border.color, marginLeft: 8, marginRight: 8 }} />

          <PixiLabel text="Height:" size="xs" color="textMuted" />
          <PixiSelect
            options={HEIGHT_OPTIONS}
            value={String(maxValue)}
            onChange={(v) => setMaxValue2(parseInt(v))}
            width={60}
          />

          <layoutContainer layout={{ flex: 1 }} />

          {/* Frame indicator (morph position) */}
          {wavetables.length > 1 && (
            <>
              <PixiLabel text="Frame:" size="xs" color="textMuted" />
              <PixiSlider
                value={selectedWaveIdx}
                min={0}
                max={wavetables.length - 1}
                step={1}
                onChange={(v) => setSelectedWaveIdx(Math.round(v))}
                orientation="horizontal"
                length={Math.min(120, width / 3)}
                thickness={4}
                showValue={false}
              />
              <PixiLabel
                text={`${selectedWaveIdx + 1}/${wavetables.length}`}
                size="sm"
                color="textMuted"
              />
            </>
          )}
        </layoutContainer>
      )}
    </layoutContainer>
  );
};
