/**
 * PixiSpectrumFilterPanel — GL-native spectrum filter panel for the sample editor.
 *
 * Matches DOM: src/components/instruments/SampleSpectrumFilter.tsx
 *
 * Rendered as an inline panel (not a modal) below the waveform.
 * Shows the sample's FFT spectrum as a background, overlaid with a
 * user-editable gain curve built from draggable control points.
 */

import { useState, useCallback, useRef, useEffect } from 'react';
import { Graphics } from 'pixi.js';
import type { FederatedPointerEvent } from 'pixi.js';
import { PixiButton, PixiLabel, PixiSlider } from '../components';
import { usePixiTheme } from '../theme';
import {
  type FilterPoint,
  type FilterPreset,
  getPresetPoints,
  interpolateGain,
  computeSpectrum,
  filterAudioBuffer,
} from '@/lib/audio/SpectralFilter';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const MIN_FREQ = 20;
const MAX_FREQ = 20000;
const MIN_DB = -60;
const MAX_DB = 6;
const PANEL_H = 200;
const FFT_SIZE = 4096;
const POINT_RADIUS = 6;
const PRESET_BAR_H = 56;
const ACTION_BAR_H = 32;

// Frequency grid lines (Hz)
const FREQ_GRID = [100, 1000, 10000];
// dB grid lines
const DB_GRID = [-48, -36, -24, -12, 0];

const PRESETS: { key: FilterPreset; label: string }[] = [
  { key: 'lowpass',  label: 'LP' },
  { key: 'highpass', label: 'HP' },
  { key: 'bandpass', label: 'BP' },
  { key: 'notch',    label: 'Notch' },
  { key: 'custom',   label: 'Custom' },
];

// ---------------------------------------------------------------------------
// Coordinate helpers
// ---------------------------------------------------------------------------

function freqToX(freq: number, width: number): number {
  const logMin = Math.log10(MIN_FREQ);
  const logMax = Math.log10(MAX_FREQ);
  const logF = Math.log10(Math.max(MIN_FREQ, Math.min(MAX_FREQ, freq)));
  return ((logF - logMin) / (logMax - logMin)) * width;
}

function xToFreq(x: number, width: number): number {
  const logMin = Math.log10(MIN_FREQ);
  const logMax = Math.log10(MAX_FREQ);
  const logF = logMin + (x / width) * (logMax - logMin);
  return Math.pow(10, logF);
}

function dbToY(db: number): number {
  return ((MAX_DB - db) / (MAX_DB - MIN_DB)) * PANEL_H;
}

function yToDb(y: number): number {
  return MAX_DB - (y / PANEL_H) * (MAX_DB - MIN_DB);
}

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

interface PixiSpectrumFilterPanelProps {
  audioBuffer: AudioBuffer | null;
  selectionStart: number; // sample index, -1 = no selection
  selectionEnd: number;
  onApply: (newBuffer: AudioBuffer) => void;
  onClose: () => void;
  width: number; // match parent width
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export const PixiSpectrumFilterPanel: React.FC<PixiSpectrumFilterPanelProps> = ({
  audioBuffer,
  selectionStart,
  selectionEnd,
  onApply,
  onClose,
  width,
}) => {
  const theme = usePixiTheme();

  const [preset, setPreset] = useState<FilterPreset>('custom');
  const [cutoff, setCutoff] = useState(2000);
  const [points, setPoints] = useState<FilterPoint[]>(() => getPresetPoints('custom'));
  const [draggingIdx, setDraggingIdx] = useState<number | null>(null);
  const [isPreviewing, setIsPreviewing] = useState(false);

  const draggingRef = useRef<number | null>(null);
  const pointsRef = useRef<FilterPoint[]>(points);
  const previewSourceRef = useRef<AudioBufferSourceNode | null>(null);

  // Keep refs in sync
  useEffect(() => {
    pointsRef.current = points;
  }, [points]);
  useEffect(() => {
    draggingRef.current = draggingIdx;
  }, [draggingIdx]);

  // Spectrum cache
  const spectrumRef = useRef<Float32Array | null>(null);
  useEffect(() => {
    if (!audioBuffer) { spectrumRef.current = null; return; }
    const ch0 = audioBuffer.getChannelData(0);
    const hasSelection = selectionStart >= 0 && selectionEnd > selectionStart;
    const data = hasSelection ? ch0.slice(selectionStart, selectionEnd) : ch0;
    spectrumRef.current = computeSpectrum(data, FFT_SIZE);
  }, [audioBuffer, selectionStart, selectionEnd]);

  // Stop preview on unmount
  useEffect(() => {
    return () => {
      if (previewSourceRef.current) {
        try { previewSourceRef.current.stop(); } catch { /* ignore */ }
      }
    };
  }, []);

  // ── Draw ─────────────────────────────────────────────────────────────
  const drawCurveEditor = useCallback((g: Graphics) => {
    g.clear();
    const w = width;
    const H = PANEL_H;

    // Background
    g.rect(0, 0, w, H).fill({ color: 0x0a0a0f, alpha: 1 });

    // Spectrum bars
    const spectrum = spectrumRef.current;
    if (spectrum && audioBuffer) {
      const sampleRate = audioBuffer.sampleRate;
      const numBins = spectrum.length;
      for (let b = 1; b < numBins; b++) {
        const freq = (b * sampleRate) / FFT_SIZE;
        if (freq < MIN_FREQ || freq > MAX_FREQ) continue;
        const x = freqToX(freq, w);
        const nextFreq = ((b + 1) * sampleRate) / FFT_SIZE;
        const x2 = freqToX(nextFreq, w);
        const dB = spectrum[b];
        const clamped = Math.max(-96, Math.min(0, dB));
        const barH = ((clamped + 96) / 96) * H;
        g.rect(x, H - barH, Math.max(1, x2 - x), barH).fill({ color: theme.accent.color, alpha: 0.2 });
      }
    }

    // dB grid lines
    for (const db of DB_GRID) {
      const y = dbToY(db);
      g.moveTo(0, y).lineTo(w, y).stroke({ color: 0xffffff, width: 1, alpha: 0.06 });
    }

    // Freq grid lines
    for (const freq of FREQ_GRID) {
      const x = freqToX(freq, w);
      g.moveTo(x, 0).lineTo(x, H).stroke({ color: 0xffffff, width: 1, alpha: 0.06 });
    }

    // 0 dB reference line
    const y0 = dbToY(0);
    g.moveTo(0, y0).lineTo(w, y0).stroke({ color: 0xffffff, width: 1, alpha: 0.15 });

    // Filter curve fill area
    const sorted = [...pointsRef.current].sort((a, b) => a.frequency - b.frequency);
    if (sorted.length >= 2) {
      // Build fill polygon: bottom-left → curve → bottom-right → close
      const fillPath: [number, number][] = [];
      fillPath.push([0, H]);
      for (let px = 0; px <= w; px += 2) {
        const freq = xToFreq(px, w);
        const db = interpolateGain(sorted, freq);
        const y = dbToY(db);
        fillPath.push([px, y]);
      }
      fillPath.push([w, H]);

      g.moveTo(fillPath[0][0], fillPath[0][1]);
      for (let i = 1; i < fillPath.length; i++) {
        g.lineTo(fillPath[i][0], fillPath[i][1]);
      }
      g.closePath().fill({ color: theme.accent.color, alpha: 0.08 });

      // Curve stroke
      let started = false;
      for (let px = 0; px <= w; px += 2) {
        const freq = xToFreq(px, w);
        const db = interpolateGain(sorted, freq);
        const y = dbToY(db);
        if (!started) {
          g.moveTo(px, y);
          started = true;
        } else {
          g.lineTo(px, y);
        }
      }
      g.stroke({ color: theme.accent.color, width: 2, alpha: 0.9 });
    }

    // Control points
    for (let i = 0; i < pointsRef.current.length; i++) {
      const p = pointsRef.current[i];
      const x = freqToX(p.frequency, w);
      const y = dbToY(p.gain);
      g.circle(x, y, POINT_RADIUS).fill({
        color: draggingRef.current === i ? theme.accent.color : theme.accent.color,
        alpha: draggingRef.current === i ? 1.0 : 0.75,
      });
      g.circle(x, y, POINT_RADIUS).stroke({ color: 0xffffff, width: 1.5, alpha: 0.9 });
    }
  }, [width, audioBuffer, theme]);

  // ── Hit test ─────────────────────────────────────────────────────────
  const hitTestPoint = useCallback((x: number, y: number): number => {
    const pts = pointsRef.current;
    for (let i = 0; i < pts.length; i++) {
      const px = freqToX(pts[i].frequency, width);
      const py = dbToY(pts[i].gain);
      const dist = Math.sqrt((px - x) ** 2 + (py - y) ** 2);
      if (dist <= POINT_RADIUS + 4) return i;
    }
    return -1;
  }, [width]);

  // ── Pointer interaction ──────────────────────────────────────────────
  const getLocalPos = useCallback((e: FederatedPointerEvent): { x: number; y: number } => {
    const bounds = (e.currentTarget as unknown as { getBounds(): { x: number; y: number } }).getBounds();
    return {
      x: e.global.x - bounds.x,
      y: e.global.y - bounds.y,
    };
  }, []);

  const handlePointerDown = useCallback((e: FederatedPointerEvent) => {
    const { x, y } = getLocalPos(e);
    const idx = hitTestPoint(x, y);

    if (e.button === 2) {
      // Right-click: delete point (keep min 2)
      if (idx >= 0 && pointsRef.current.length > 2) {
        setPoints(prev => prev.filter((_, i) => i !== idx));
        setPreset('custom');
      }
      return;
    }

    if (idx >= 0) {
      draggingRef.current = idx;
      setDraggingIdx(idx);
    } else {
      // Add new point
      const freq = Math.max(MIN_FREQ, Math.min(MAX_FREQ, xToFreq(x, width)));
      const db = Math.max(MIN_DB, Math.min(MAX_DB, yToDb(y)));
      const newIdx = pointsRef.current.length;
      setPoints(prev => [...prev, { frequency: freq, gain: db }]);
      setPreset('custom');
      draggingRef.current = newIdx;
      setDraggingIdx(newIdx);
    }
  }, [getLocalPos, hitTestPoint, width]);

  const handlePointerMove = useCallback((e: FederatedPointerEvent) => {
    if (draggingRef.current === null) return;
    const { x, y } = getLocalPos(e);
    const freq = Math.max(MIN_FREQ, Math.min(MAX_FREQ, xToFreq(x, width)));
    const db = Math.max(MIN_DB, Math.min(MAX_DB, yToDb(y)));
    const idx = draggingRef.current;
    setPoints(prev => prev.map((p, i) => i === idx ? { frequency: freq, gain: db } : p));
    setPreset('custom');
  }, [getLocalPos, width]);

  const handlePointerUp = useCallback(() => {
    draggingRef.current = null;
    setDraggingIdx(null);
  }, []);

  // ── Preset handlers ──────────────────────────────────────────────────
  const applyPreset = useCallback((p: FilterPreset) => {
    setPreset(p);
    setPoints(getPresetPoints(p, cutoff));
  }, [cutoff]);

  const handleCutoffChange = useCallback((value: number) => {
    setCutoff(value);
    setPreset(prev => {
      if (prev !== 'custom') {
        setPoints(getPresetPoints(prev, value));
      }
      return prev;
    });
  }, []);

  // ── Preview ──────────────────────────────────────────────────────────
  const handlePreview = useCallback(() => {
    if (!audioBuffer) return;
    if (previewSourceRef.current) {
      try { previewSourceRef.current.stop(); } catch { /* already stopped */ }
      previewSourceRef.current = null;
      setIsPreviewing(false);
      return;
    }

    setIsPreviewing(true);
    const selStart = selectionStart >= 0 ? selectionStart : undefined;
    const selEnd = selectionEnd > (selectionStart ?? 0) ? selectionEnd : undefined;
    const filtered = filterAudioBuffer(audioBuffer, pointsRef.current, FFT_SIZE, selStart, selEnd);

    const actx = new AudioContext();
    const src = actx.createBufferSource();
    src.buffer = filtered;
    src.connect(actx.destination);
    src.onended = () => {
      setIsPreviewing(false);
      previewSourceRef.current = null;
    };
    src.start();
    previewSourceRef.current = src;
  }, [audioBuffer, selectionStart, selectionEnd]);

  // ── Apply ────────────────────────────────────────────────────────────
  const handleApply = useCallback(() => {
    if (!audioBuffer) return;
    const selStart = selectionStart >= 0 ? selectionStart : undefined;
    const selEnd = selectionEnd > (selectionStart ?? 0) ? selectionEnd : undefined;
    const filtered = filterAudioBuffer(audioBuffer, pointsRef.current, FFT_SIZE, selStart, selEnd);
    onApply(filtered);
  }, [audioBuffer, selectionStart, selectionEnd, onApply]);

  const totalH = PRESET_BAR_H + PANEL_H + ACTION_BAR_H;

  // ── Render ───────────────────────────────────────────────────────────
  return (
    <layoutContainer
      layout={{
        width,
        height: totalH,
        flexDirection: 'column',
        borderRadius: 4,
        borderWidth: 1,
        borderColor: theme.accent.color,
        overflow: 'hidden',
      }}
    >
      {/* Preset bar */}
      <layoutContainer
        layout={{
          height: PRESET_BAR_H,
          flexDirection: 'column',
          paddingLeft: 8,
          paddingRight: 8,
          backgroundColor: theme.bgSecondary.color,
          borderBottomWidth: 1,
          borderBottomColor: theme.border.color,
        }}
      >
        {/* Row 1: preset buttons */}
        <layoutContainer
          layout={{
            height: 28,
            flexDirection: 'row',
            alignItems: 'center',
            gap: 4,
          }}
        >
          <PixiLabel text="PRESET:" size="xs" weight="bold" color="textMuted" />
          {PRESETS.map(({ key, label }) => (
            <PixiButton
              key={key}
              label={label}
              variant={preset === key ? 'primary' : 'ghost'}
              size="sm"
              onClick={() => applyPreset(key)}
            />
          ))}
        </layoutContainer>
        {/* Row 2: cutoff slider */}
        <layoutContainer
          layout={{
            height: 28,
            flexDirection: 'row',
            alignItems: 'center',
            gap: 8,
          }}
        >
          <PixiLabel text="CUTOFF:" size="xs" weight="bold" color="textMuted" />
          <PixiSlider
            value={cutoff}
            min={20}
            max={20000}
            onChange={handleCutoffChange}
            orientation="horizontal"
            length={width - 120}
            handleWidth={12}
            handleHeight={12}
            thickness={4}
          />
          <PixiLabel
            text={cutoff >= 1000 ? `${(cutoff / 1000).toFixed(1)}kHz` : `${cutoff}Hz`}
            size="xs"
            color="textMuted"
          />
        </layoutContainer>
      </layoutContainer>

      {/* Graphics canvas — spectrum + curve editor */}
      <pixiGraphics
        draw={drawCurveEditor}
        layout={{ width, height: PANEL_H }}
        eventMode="static"
        cursor={draggingIdx !== null ? 'grabbing' : 'crosshair'}
        onPointerDown={handlePointerDown}
        onGlobalPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerUpOutside={handlePointerUp}
      />

      {/* Action bar */}
      <layoutContainer
        layout={{
          height: ACTION_BAR_H,
          flexDirection: 'row',
          alignItems: 'center',
          gap: 6,
          paddingLeft: 8,
          paddingRight: 8,
          backgroundColor: theme.bgSecondary.color,
          borderTopWidth: 1,
          borderTopColor: theme.border.color,
        }}
      >
        <PixiLabel
          text="Click to add  ·  Drag to move  ·  Right-click to delete"
          size="xs"
          color="textMuted"
        />
        <layoutContainer layout={{ flex: 1 }} />
        <PixiButton
          label="Cancel"
          variant="ghost"
          size="sm"
          onClick={onClose}
        />
        <PixiButton
          label={isPreviewing ? 'Stop' : 'Preview'}
          variant={isPreviewing ? 'primary' : 'ghost'}
          size="sm"
          disabled={!audioBuffer}
          onClick={handlePreview}
        />
        <PixiButton
          label="Apply"
          variant="primary"
          size="sm"
          disabled={!audioBuffer}
          onClick={handleApply}
        />
      </layoutContainer>
    </layoutContainer>
  );
};
