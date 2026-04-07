/**
 * JamCrackerControls.tsx — JamCracker Pro full AM instrument editor
 *
 * Provides edit access to every AM synthesis parameter on a JamCracker
 * instrument:
 *   • Click-and-drag waveform editor (writes signed bytes 0..63 of the
 *     64-byte AM waveformData buffer in place)
 *   • Quick-fill presets: sine / triangle / square / saw / noise / clear
 *   • Phase delta knob (modulation speed)
 *   • Volume knob
 *   • Loop and AM flags toggles
 *
 * Edits go through onChange and replace `waveformData` with a fresh
 * Uint8Array so React detects the change and the on-screen waveform redraws.
 *
 * PCM (non-AM) instruments still show their sample info but no waveform
 * editor — only AM instruments have a programmable waveform.
 *
 * Pattern reference for other Amiga synth formats: this component is the
 * template for adding full editor support to Hippel CoSo, Sonic Arranger,
 * and Future Composer (each has a similar AM waveform + parameter model).
 */

import React, { useRef, useEffect, useCallback, useState, useMemo } from 'react';
import type { JamCrackerConfig } from '@/types/instrument';
import { writeWaveformByte } from '@/lib/jamcracker/waveformDraw';
import { Knob } from '@components/controls/Knob';
import { useInstrumentStore } from '@stores/useInstrumentStore';

interface JamCrackerControlsProps {
  config: JamCrackerConfig;
  onChange: (updates: Partial<JamCrackerConfig>) => void;
  /** Runtime id of the instrument being edited — used by Find Usage to scan patterns. */
  instrumentId?: number;
}

/** Fill the first WAVE_SIZE bytes of a JamCracker waveform with a preset shape. */
function generateWaveformPreset(
  kind: 'sine' | 'triangle' | 'square' | 'saw' | 'noise' | 'clear',
  size = 64,
): Uint8Array {
  const buf = new Uint8Array(size);
  for (let i = 0; i < size; i++) {
    let s = 0; // signed -127..127
    switch (kind) {
      case 'sine':     s = Math.round(Math.sin((i / size) * Math.PI * 2) * 120); break;
      case 'triangle': {
        const half = size / 2;
        const phase = i < half ? i / half : 1 - (i - half) / half;
        s = Math.round((phase * 2 - 1) * 120);
        break;
      }
      case 'square':   s = i < size / 2 ? 120 : -120; break;
      case 'saw':      s = Math.round(((i / size) * 2 - 1) * 120); break;
      case 'noise':    s = Math.round((Math.random() * 2 - 1) * 120); break;
      case 'clear':    s = 0; break;
    }
    // Store as two's-complement byte
    buf[i] = s < 0 ? s + 256 : s;
  }
  return buf;
}

/** Draw the AM waveform into a canvas (DPR-aware) */
function drawWaveform(
  canvas: HTMLCanvasElement,
  waveformData: Uint8Array | undefined,
  phaseDelta: number,
): void {
  const ctx = canvas.getContext('2d');
  if (!ctx) return;

  const dpr = window.devicePixelRatio || 1;
  const cssW = canvas.clientWidth || 320;
  const cssH = canvas.clientHeight || 120;
  canvas.width = cssW * dpr;
  canvas.height = cssH * dpr;
  ctx.scale(dpr, dpr);

  const w = cssW;
  const h = cssH;
  const mid = h / 2;

  ctx.clearRect(0, 0, w, h);

  // Background
  ctx.fillStyle = '#0a0e14';
  ctx.fillRect(0, 0, w, h);

  // Center line
  ctx.strokeStyle = '#1a2a3a';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(0, mid);
  ctx.lineTo(w, mid);
  ctx.stroke();

  if (!waveformData || waveformData.length < 64) {
    // No waveform — draw "No Data" text
    ctx.fillStyle = '#4a5a6a';
    ctx.font = '12px monospace';
    ctx.textAlign = 'center';
    ctx.fillText('No AM waveform data', w / 2, mid);
    return;
  }

  const WAVE_SIZE = 64;

  // Draw the blended waveform (two phase-offset copies averaged)
  ctx.strokeStyle = '#00ff88';
  ctx.lineWidth = 2;
  ctx.beginPath();

  let phase = 0;
  for (let x = 0; x < w; x++) {
    const idx = Math.floor((x / w) * WAVE_SIZE) % WAVE_SIZE;
    const phaseIdx = (idx + Math.floor(phase / 4)) % WAVE_SIZE;

    const s1 = waveformData[idx] > 127 ? waveformData[idx] - 256 : waveformData[idx];
    const s2 = waveformData[phaseIdx] > 127 ? waveformData[phaseIdx] - 256 : waveformData[phaseIdx];
    const blended = (s1 + s2) / 2;
    const y = mid - (blended / 128) * (mid - 4);

    if (x === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);

    phase = (phase + Math.floor(phaseDelta * WAVE_SIZE / w)) & 0xFF;
  }
  ctx.stroke();

  // Draw the raw waveform (dimmer, for reference)
  ctx.strokeStyle = '#00ff8840';
  ctx.lineWidth = 1;
  ctx.beginPath();
  for (let x = 0; x < w; x++) {
    const idx = Math.floor((x / w) * WAVE_SIZE) % WAVE_SIZE;
    const s = waveformData[idx] > 127 ? waveformData[idx] - 256 : waveformData[idx];
    const y = mid - (s / 128) * (mid - 4);
    if (x === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  }
  ctx.stroke();
}

export const JamCrackerControls: React.FC<JamCrackerControlsProps> = ({
  config,
  onChange,
}) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const configRef = useRef(config);

  useEffect(() => {
    configRef.current = config;
  }, [config]);

  // Redraw waveform when config changes or canvas resizes
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    // Defer initial draw to after layout so clientWidth > 0
    const raf = requestAnimationFrame(() => {
      drawWaveform(canvas, configRef.current.waveformData, configRef.current.phaseDelta);
    });

    const obs = new ResizeObserver(() => {
      drawWaveform(canvas, configRef.current.waveformData, configRef.current.phaseDelta);
    });
    obs.observe(canvas);
    return () => {
      cancelAnimationFrame(raf);
      obs.disconnect();
    };
  }, [config.waveformData, config.phaseDelta]);

  const updateParam = useCallback((key: keyof JamCrackerConfig, value: number) => {
    onChange({ ...configRef.current, [key]: value });
  }, [onChange]);

  // ── Waveform draw editor ─────────────────────────────────────────────────
  // Click+drag on the canvas to set bytes 0..63 of the AM waveform.
  // Each x position maps to a byte index; vertical position becomes a signed
  // 8-bit value (-127..127, stored as two's complement).
  const isDrawingRef = useRef(false);
  const lastIdxRef = useRef(-1);

  const writeWaveformByteFromEvent = useCallback((e: React.PointerEvent<HTMLCanvasElement>) => {
    const cur = configRef.current;
    if (!cur.isAM || !cur.waveformData) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const { next, idx } = writeWaveformByte(
      cur.waveformData,
      e.clientX - rect.left,
      e.clientY - rect.top,
      rect.width,
      rect.height,
      lastIdxRef.current,
    );
    lastIdxRef.current = idx;
    onChange({ ...cur, waveformData: next });
  }, [onChange]);

  const handlePointerDown = useCallback((e: React.PointerEvent<HTMLCanvasElement>) => {
    if (!configRef.current.isAM) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    isDrawingRef.current = true;
    lastIdxRef.current = -1;
    writeWaveformByteFromEvent(e);
  }, [writeWaveformByteFromEvent]);

  const handlePointerMove = useCallback((e: React.PointerEvent<HTMLCanvasElement>) => {
    if (!isDrawingRef.current) return;
    writeWaveformByteFromEvent(e);
  }, [writeWaveformByteFromEvent]);

  const handlePointerUp = useCallback((e: React.PointerEvent<HTMLCanvasElement>) => {
    isDrawingRef.current = false;
    lastIdxRef.current = -1;
    try { e.currentTarget.releasePointerCapture(e.pointerId); } catch { /* noop */ }
  }, []);

  const applyPreset = useCallback((kind: 'sine' | 'triangle' | 'square' | 'saw' | 'noise' | 'clear') => {
    const cur = configRef.current;
    const size = Math.max(64, cur.waveformData?.length ?? 64);
    onChange({ ...cur, waveformData: generateWaveformPreset(kind, size) });
  }, [onChange]);

  // ── Sample browser pane ──────────────────────────────────────────────────
  // JamCracker stores its sample/waveform on the per-instrument config itself
  // (either `waveformData` for AM or an external PCM buffer referenced by
  // sampleSize). Walk all JamCracker instruments in the store and list each
  // as one row — the sole user of each sample is the instrument it lives on.
  const [showSamplePane, setShowSamplePane] = useState(false);
  const allInstruments = useInstrumentStore((s) => s.instruments);
  const sampleRows = useMemo(() => {
    return allInstruments
      .filter((inst) => inst.synthType === 'JamCrackerSynth' && inst.jamCracker)
      .map((inst) => {
        const c = inst.jamCracker!;
        return {
          id: inst.id,
          instrName: inst.name || c.name || `#${inst.id}`,
          sampleName: c.name || '(unnamed)',
          size: c.isAM ? (c.waveformData?.length ?? 64) : c.sampleSize,
          isAM: c.isAM,
          hasLoop: c.hasLoop,
          isCurrent: c === config,
        };
      });
  }, [allInstruments, config]);

  return (
    <div className="flex h-full">
      <div className="p-4 space-y-4 synth-controls-flow flex-1 min-w-0 overflow-y-auto">
      {/* Header */}
      <div className="flex items-center gap-3 text-sm">
        <span className="text-accent-highlight font-mono font-bold">JamCracker Pro</span>
        <span className="text-text-muted">|</span>
        <span className="text-text-secondary">{config.name}</span>
        <div className="flex gap-2 ml-auto">
          {config.isAM && (
            <span className="px-2 py-0.5 bg-purple-900/50 text-purple-300 rounded text-xs font-mono">
              AM SYNTH
            </span>
          )}
          {config.hasLoop && (
            <span className="px-2 py-0.5 bg-green-900/50 text-green-300 rounded text-xs font-mono">
              LOOP
            </span>
          )}
          {!config.isAM && (
            <span className="px-2 py-0.5 bg-blue-900/50 text-blue-300 rounded text-xs font-mono">
              PCM ({config.sampleSize} bytes)
            </span>
          )}
          <button
            onClick={() => setShowSamplePane((v) => !v)}
            title={`${showSamplePane ? 'Hide' : 'Show'} sample browser`}
            className={`px-2 py-0.5 rounded text-[10px] font-mono border ${
              showSamplePane
                ? 'bg-accent-primary/20 text-accent-primary border-accent-primary/60'
                : 'bg-dark-bg text-text-secondary border-dark-border hover:text-accent-primary hover:border-accent-primary/50'
            }`}
          >
            SMP
          </button>
        </div>
      </div>

      {/* AM Waveform Editor (click+drag to draw) */}
      {config.isAM && (
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <div className="text-xs text-text-muted font-mono uppercase tracking-wider">
              AM Waveform — click + drag to draw
            </div>
            <div className="flex gap-1">
              {(['sine', 'triangle', 'square', 'saw', 'noise', 'clear'] as const).map((k) => (
                <button
                  key={k}
                  onClick={() => applyPreset(k)}
                  className="text-[9px] font-mono px-1.5 py-0.5 rounded border border-dark-border text-text-secondary hover:text-accent-primary hover:border-accent-primary/50 uppercase"
                  title={`Fill waveform with ${k}`}
                >
                  {k}
                </button>
              ))}
            </div>
          </div>
          <canvas
            ref={canvasRef}
            className="w-full rounded border border-dark-border bg-[#0a0e14] cursor-crosshair"
            style={{ height: 120, touchAction: 'none' }}
            onPointerDown={handlePointerDown}
            onPointerMove={handlePointerMove}
            onPointerUp={handlePointerUp}
            onPointerCancel={handlePointerUp}
          />
        </div>
      )}

      {/* Controls */}
      <div className="flex gap-3 items-start">
        <div className="flex flex-col items-center gap-1">
          <Knob
            value={config.volume / 64}
            onChange={(v) => updateParam('volume', Math.round(v * 64))}
            size="md"
            label="Volume"
            min={0}
            max={1}
            bipolar={false}
          />
          <span className="text-[10px] text-text-muted font-mono">{config.volume}</span>
        </div>

        {config.isAM && (
          <div className="flex flex-col items-center gap-1">
            <Knob
              value={config.phaseDelta / 255}
              onChange={(v) => updateParam('phaseDelta', Math.round(v * 255))}
              size="md"
              label="Phase Δ"
              min={0}
              max={1}
              bipolar={false}
            />
            <span className="text-[10px] text-text-muted font-mono">{config.phaseDelta}</span>
          </div>
        )}
      </div>

      {/* Info */}
      <div className="text-[10px] text-text-muted font-mono">
        Flags: 0x{config.flags.toString(16).padStart(2, '0')}
        {config.isAM ? ' (AM synthesis — 64-byte waveform loop with phase modulation)' : ' (PCM sample)'}
      </div>
      </div>

      {/* Sample browser pane (toggle via SMP button) */}
      {showSamplePane && (
        <div className="w-[220px] flex-shrink-0 border-l border-dark-border bg-dark-bgSecondary overflow-y-auto">
          <div className="px-2 py-1 font-bold text-xs text-accent-primary border-b border-dark-border bg-dark-bgSecondary sticky top-0">
            SAMPLES ({sampleRows.length})
          </div>
          {sampleRows.length === 0 && (
            <div className="p-2 text-[10px] text-text-muted italic">
              No JamCracker instruments loaded.
            </div>
          )}
          {sampleRows.map((s) => (
            <div
              key={s.id}
              className={`px-2 py-1.5 border-b border-dark-border text-[10px] ${
                s.isCurrent ? 'bg-accent-primary/10' : ''
              }`}
              title={`Instrument #${s.id}: ${s.instrName}`}
            >
              <div className={`font-mono truncate ${s.isCurrent ? 'text-accent-primary' : 'text-text-primary'}`}>
                {String(s.id).padStart(2, '0')}. {s.sampleName}
              </div>
              <div className="text-text-muted mt-0.5">
                {s.size} bytes
                {s.hasLoop && <span className="ml-1 text-accent-success">·loop</span>}
              </div>
              <div className="mt-0.5 text-[9px]">
                <span className={s.isAM ? 'text-accent-highlight' : 'text-accent-secondary'}>
                  {s.isAM ? 'AM SYNTH' : 'PCM'}
                </span>
                {s.isCurrent && <span className="ml-1 text-accent-primary">(this instrument)</span>}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};
