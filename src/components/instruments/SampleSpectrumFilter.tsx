/**
 * SampleSpectrumFilter — interactive frequency-curve editor panel.
 *
 * Rendered as an inline panel (not a modal) below the waveform canvas.
 * Shows the sample's FFT spectrum as a background, overlaid with a
 * user-editable gain curve built from draggable control points.
 */

import React, { useRef, useEffect, useState, useCallback } from 'react';
import { Button } from '@components/ui/Button';
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
const CANVAS_W = 1120;
const CANVAS_H = 200;
const FFT_SIZE = 4096;

// Canvas colors — derived from design tokens via CSS custom properties
function getCssVar(name: string, fallback: string): string {
  if (typeof document === 'undefined') return fallback;
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim() || fallback;
}

function getCanvasColors() {
  return {
    bg: getCssVar('--color-bg-primary', '#0a0a0f'),
    spectrumBars: `rgba(99,102,241,0.25)`, // accent-primary at 25% opacity
    grid: `rgba(255,255,255,0.06)`,
    gridLabel: `rgba(255,255,255,0.25)`,
    zeroLine: `rgba(255,255,255,0.15)`,
    curve: getCssVar('--color-accent-primary', 'rgba(59,130,246,0.9)'),
    curveFill: `rgba(59,130,246,0.08)`,
    pointActive: getCssVar('--color-accent-primary', '#3b82f6'),
    pointIdle: getCssVar('--color-accent-secondary', '#60a5fa'),
    pointStroke: getCssVar('--color-text-primary', '#fff'),
  };
}
const POINT_RADIUS = 6;

// Frequency grid lines (Hz)
const FREQ_GRID = [100, 1000, 10000];
// dB grid lines
const DB_GRID = [-48, -36, -24, -12, 0];

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

function dbToY(db: number, height: number): number {
  // MAX_DB at top (y=0), MIN_DB at bottom (y=height)
  return ((MAX_DB - db) / (MAX_DB - MIN_DB)) * height;
}

function yToDb(y: number, height: number): number {
  return MAX_DB - (y / height) * (MAX_DB - MIN_DB);
}

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

interface SampleSpectrumFilterProps {
  audioBuffer: AudioBuffer | null;
  selectionStart: number; // sample index, -1 = no selection
  selectionEnd: number;
  onApply: (newBuffer: AudioBuffer) => void;
  onClose: () => void;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export const SampleSpectrumFilter: React.FC<SampleSpectrumFilterProps> = ({
  audioBuffer,
  selectionStart,
  selectionEnd,
  onApply,
  onClose,
}) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  const [preset, setPreset] = useState<FilterPreset>('custom');
  const [cutoff, setCutoff] = useState(2000);
  const [points, setPoints] = useState<FilterPoint[]>(() => getPresetPoints('custom'));
  const [draggingIdx, setDraggingIdx] = useState<number | null>(null);
  const [isPreviewing, setIsPreviewing] = useState(false);
  const previewSourceRef = useRef<AudioBufferSourceNode | null>(null);

  // spectrum cache
  const spectrumRef = useRef<Float32Array | null>(null);
  useEffect(() => {
    if (!audioBuffer) { spectrumRef.current = null; return; }
    const ch0 = audioBuffer.getChannelData(0);
    // Use the selected region if available, else full buffer
    const hasSelection = selectionStart >= 0 && selectionEnd > selectionStart;
    const data = hasSelection ? ch0.slice(selectionStart, selectionEnd) : ch0;
    spectrumRef.current = computeSpectrum(data, FFT_SIZE);
  }, [audioBuffer, selectionStart, selectionEnd]);

  // ── Draw ─────────────────────────────────────────────────────────────
  const draw = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const dpr = window.devicePixelRatio || 1;
    if (canvas.width !== CANVAS_W * dpr) {
      canvas.width = CANVAS_W * dpr;
      canvas.height = CANVAS_H * dpr;
      ctx.scale(dpr, dpr);
    }

    const W = CANVAS_W;
    const H = CANVAS_H;
    const colors = getCanvasColors();

    // Background
    ctx.fillStyle = colors.bg;
    ctx.fillRect(0, 0, W, H);

    // Spectrum bars
    const spectrum = spectrumRef.current;
    if (spectrum) {
      const sampleRate = audioBuffer?.sampleRate ?? 44100;
      const numBins = spectrum.length;
      ctx.fillStyle = colors.spectrumBars;
      for (let b = 1; b < numBins; b++) {
        const freq = (b * sampleRate) / FFT_SIZE;
        if (freq < MIN_FREQ || freq > MAX_FREQ) continue;
        const x = freqToX(freq, W);
        const nextFreq = ((b + 1) * sampleRate) / FFT_SIZE;
        const x2 = freqToX(nextFreq, W);
        const dB = spectrum[b];
        // Clamp to [-96, 0] for display, then map to bar height
        const clamped = Math.max(-96, Math.min(0, dB));
        const barH = ((clamped + 96) / 96) * H;
        ctx.fillRect(x, H - barH, Math.max(1, x2 - x), barH);
      }
    }

    // dB grid
    ctx.strokeStyle = colors.grid;
    ctx.lineWidth = 1;
    ctx.setLineDash([3, 4]);
    ctx.fillStyle = colors.gridLabel;
    ctx.font = '10px monospace';
    for (const db of DB_GRID) {
      const y = dbToY(db, H);
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(W, y);
      ctx.stroke();
      ctx.fillText(`${db}dB`, 4, y - 2);
    }

    // Freq grid
    for (const freq of FREQ_GRID) {
      const x = freqToX(freq, W);
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, H);
      ctx.stroke();
      const label = freq >= 1000 ? `${freq / 1000}k` : `${freq}`;
      ctx.fillText(label, x + 3, H - 4);
    }
    ctx.setLineDash([]);

    // 0 dB reference line
    const y0 = dbToY(0, H);
    ctx.strokeStyle = colors.zeroLine;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(0, y0);
    ctx.lineTo(W, y0);
    ctx.stroke();

    // Filter curve
    const sorted = [...points].sort((a, b) => a.frequency - b.frequency);
    if (sorted.length >= 2) {
      ctx.beginPath();
      ctx.strokeStyle = colors.curve;
      ctx.lineWidth = 2;
      // Sample the curve at many x positions
      for (let px = 0; px <= W; px += 2) {
        const freq = xToFreq(px, W);
        const db = interpolateGain(sorted, freq);
        const y = dbToY(db, H);
        if (px === 0) ctx.moveTo(px, y);
        else ctx.lineTo(px, y);
      }
      ctx.stroke();

      // Fill area under curve
      ctx.beginPath();
      ctx.fillStyle = colors.curveFill;
      ctx.moveTo(0, H);
      for (let px = 0; px <= W; px += 2) {
        const freq = xToFreq(px, W);
        const db = interpolateGain(sorted, freq);
        const y = dbToY(db, H);
        ctx.lineTo(px, y);
      }
      ctx.lineTo(W, H);
      ctx.closePath();
      ctx.fill();
    }

    // Control points
    for (let i = 0; i < points.length; i++) {
      const p = points[i];
      const x = freqToX(p.frequency, W);
      const y = dbToY(p.gain, H);
      ctx.beginPath();
      ctx.arc(x, y, POINT_RADIUS, 0, Math.PI * 2);
      ctx.fillStyle = draggingIdx === i ? colors.pointActive : colors.pointIdle;
      ctx.fill();
      ctx.strokeStyle = colors.pointStroke;
      ctx.lineWidth = 1.5;
      ctx.stroke();
    }
  }, [points, draggingIdx, audioBuffer]);

  useEffect(() => { draw(); }, [draw]);

  // ── Canvas coordinate helpers ────────────────────────────────────────
  const canvasPos = useCallback((e: React.MouseEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return { x: 0, y: 0 };
    const rect = canvas.getBoundingClientRect();
    return {
      x: (e.clientX - rect.left) * (canvas.width / rect.width / (window.devicePixelRatio || 1)),
      y: (e.clientY - rect.top) * (canvas.height / rect.height / (window.devicePixelRatio || 1)),
    };
  }, []);

  const hitTestPoint = useCallback((x: number, y: number): number => {
    for (let i = 0; i < points.length; i++) {
      const p = points[i];
      const px = freqToX(p.frequency, CANVAS_W);
      const py = dbToY(p.gain, CANVAS_H);
      const dist = Math.sqrt((px - x) ** 2 + (py - y) ** 2);
      if (dist <= POINT_RADIUS + 4) return i;
    }
    return -1;
  }, [points]);

  // ── Mouse handlers ───────────────────────────────────────────────────
  const handleMouseDown = useCallback((e: React.MouseEvent<HTMLCanvasElement>) => {
    e.preventDefault();
    const { x, y } = canvasPos(e);
    const idx = hitTestPoint(x, y);

    if (e.button === 2) {
      // Right-click: delete point (keep min 2)
      if (idx >= 0 && points.length > 2) {
        setPoints(prev => prev.filter((_, i) => i !== idx));
        setPreset('custom');
      }
      return;
    }

    if (idx >= 0) {
      // Start dragging
      setDraggingIdx(idx);
    } else {
      // Add a new point
      const freq = Math.max(MIN_FREQ, Math.min(MAX_FREQ, xToFreq(x, CANVAS_W)));
      const db = Math.max(MIN_DB, Math.min(MAX_DB, yToDb(y, CANVAS_H)));
      setPoints(prev => [...prev, { frequency: freq, gain: db }]);
      setPreset('custom');
      setDraggingIdx(points.length); // new point is at the end
    }
  }, [canvasPos, hitTestPoint, points]);

  const handleMouseMove = useCallback((e: React.MouseEvent<HTMLCanvasElement>) => {
    if (draggingIdx === null) return;
    const { x, y } = canvasPos(e);
    const freq = Math.max(MIN_FREQ, Math.min(MAX_FREQ, xToFreq(x, CANVAS_W)));
    const db = Math.max(MIN_DB, Math.min(MAX_DB, yToDb(y, CANVAS_H)));
    setPoints(prev => prev.map((p, i) => i === draggingIdx ? { frequency: freq, gain: db } : p));
    setPreset('custom');
  }, [draggingIdx, canvasPos]);

  const handleMouseUp = useCallback(() => {
    setDraggingIdx(null);
  }, []);

  // Prevent context menu on canvas right-click
  const handleContextMenu = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
  }, []);

  // ── Preset handlers ──────────────────────────────────────────────────
  const applyPreset = useCallback((p: FilterPreset) => {
    setPreset(p);
    setPoints(getPresetPoints(p, cutoff));
  }, [cutoff]);

  const handleCutoffChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const hz = Number(e.target.value);
    setCutoff(hz);
    if (preset !== 'custom') {
      setPoints(getPresetPoints(preset, hz));
    }
  }, [preset]);

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
    const filtered = filterAudioBuffer(audioBuffer, points, FFT_SIZE, selStart, selEnd);

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
  }, [audioBuffer, points, selectionStart, selectionEnd]);

  // Stop preview on unmount
  useEffect(() => {
    return () => {
      if (previewSourceRef.current) {
        try { previewSourceRef.current.stop(); } catch { /* ignore */ }
      }
    };
  }, []);

  // ── Apply ────────────────────────────────────────────────────────────
  const handleApply = useCallback(() => {
    if (!audioBuffer) return;
    const selStart = selectionStart >= 0 ? selectionStart : undefined;
    const selEnd = selectionEnd > (selectionStart ?? 0) ? selectionEnd : undefined;
    const filtered = filterAudioBuffer(audioBuffer, points, FFT_SIZE, selStart, selEnd);
    onApply(filtered);
  }, [audioBuffer, points, selectionStart, selectionEnd, onApply]);

  // ── Render ───────────────────────────────────────────────────────────
  const PRESETS: { key: FilterPreset; label: string }[] = [
    { key: 'lowpass',  label: 'Low-Pass' },
    { key: 'highpass', label: 'High-Pass' },
    { key: 'bandpass', label: 'Band-Pass' },
    { key: 'notch',    label: 'Notch' },
    { key: 'custom',   label: 'Custom' },
  ];

  return (
    <div className="mt-2 border border-blue-500/20 rounded bg-surface-raised/50">
      {/* ── Preset bar ──────────────────────────────────────────── */}
      <div className="flex items-center gap-2 px-3 py-2 border-b border-blue-500/10">
        <span className="text-[10px] font-bold uppercase text-text-muted mr-1">Preset:</span>
        {PRESETS.map(({ key, label }) => (
          <button
            key={key}
            onClick={() => applyPreset(key)}
            className={
              'px-2 py-0.5 rounded text-[10px] font-bold uppercase transition-colors ' +
              (preset === key
                ? 'bg-blue-500 text-text-primary'
                : 'bg-blue-500/10 text-blue-400 border border-blue-500/30 hover:bg-blue-500/20')
            }
          >
            {label}
          </button>
        ))}
        <div className="flex items-center gap-2 ml-4">
          <span className="text-[10px] text-text-muted">Cutoff:</span>
          <input
            type="range"
            min={MIN_FREQ}
            max={MAX_FREQ}
            step={1}
            value={cutoff}
            onChange={handleCutoffChange}
            className="w-32 accent-blue-500"
          />
          <span className="text-[10px] font-mono text-blue-400 w-14 text-right">
            {cutoff >= 1000 ? `${(cutoff / 1000).toFixed(1)} kHz` : `${cutoff} Hz`}
          </span>
        </div>
      </div>

      {/* ── Canvas ──────────────────────────────────────────────── */}
      <canvas
        ref={canvasRef}
        width={CANVAS_W}
        height={CANVAS_H}
        style={{ width: CANVAS_W, height: CANVAS_H, display: 'block', cursor: 'crosshair' }}
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onMouseLeave={handleMouseUp}
        onContextMenu={handleContextMenu}
      />

      {/* ── Action bar ──────────────────────────────────────────── */}
      <div className="flex items-center justify-between px-3 py-2 border-t border-blue-500/10">
        <span className="text-[10px] text-text-muted">
          Click to add point &nbsp;·&nbsp; Drag to move &nbsp;·&nbsp; Right-click to delete
        </span>
        <div className="flex items-center gap-2">
          <Button variant="ghost" size="sm" onClick={onClose}>
            Cancel
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={handlePreview}
            disabled={!audioBuffer}
            className={isPreviewing ? 'text-blue-400' : ''}
          >
            {isPreviewing ? 'Stop' : 'Preview'}
          </Button>
          <Button
            variant="primary"
            size="sm"
            onClick={handleApply}
            disabled={!audioBuffer}
          >
            Apply
          </Button>
        </div>
      </div>
    </div>
  );
};
