/**
 * SunTronicSynthControls.tsx — full editor + visualizer for a decoded
 * SunTronic V1.3 synth instrument (`synthType: 'SunTronicSynth'`).
 *
 * The parser decodes each 0x24-byte synth record into a serializable
 * `SunTronicConfig` (wave1/wave2 tables, volume + frequency envelopes, arp
 * table, vibrato-depth table, synthesis type). Until now those params had no UI
 * — the instrument fell through SynthControlsRouter to the generic fallback, so
 * the decoded sound was neither visible nor editable. This panel surfaces them:
 *
 *   • Synthesis-type selector (morph / pulse-noise / splice / resample / smooth)
 *   • Click-and-drag editors for wave1, wave2, the volume envelope and the
 *     vibrato-depth table (shared `SignedTableCanvas`, writes signed bytes)
 *   • Arp-table step editor with a loop marker
 *   • Loop-point + envelope-speed steppers
 *   • A live rendered-output scope (renderSunSynthPreview) so an edit's timbre
 *     is visible immediately
 *
 * Edits flow through `onChange(Partial<SunTronicConfig>)`. The router wires that
 * to `onUpdateLive`, which both persists the config and pushes it to the running
 * `SunTronicSynth` voice via `updateConfig` — so tweaks are realtime.
 */

import React, { useRef, useEffect, useCallback, useMemo } from 'react';
import type { SunTronicConfig } from '@typedefs/sunTronicInstrument';
import { writeSignedByte } from '@/lib/suntronic/waveDraw';
import { sunSynthTypeLabel } from '@/lib/suntronic/synthName';
import { sunConfigToInstrument } from '@/lib/import/formats/SunTronicV13';
import { renderSunSynthPreview } from '@/engine/suntronic/SunTronicVoiceRenderer';
import { CustomSelect } from '@components/common/CustomSelect';
import { Knob } from '@components/controls/Knob';

interface SunTronicSynthControlsProps {
  config: SunTronicConfig;
  onChange: (updates: Partial<SunTronicConfig>) => void;
  instrumentId?: number;
}

const WAVE_COLOR = '#00ff88';
const ENV_COLOR = '#ffb300';
const VIB_COLOR = '#4ea1ff';
const ARP_COLOR = '#ff5c8a';
const PREVIEW_COLOR = '#c084fc';

const SYNTH_TYPE_OPTIONS = [
  { value: '0', label: 'Morph' },
  { value: '1', label: 'Pulse-Noise' },
  { value: '2', label: 'Splice' },
  { value: '3', label: 'Resample' },
  { value: '4', label: 'Smooth' },
];

/** Fill a signed-byte table with a preset shape (length preserved). */
function presetTable(
  kind: 'sine' | 'triangle' | 'square' | 'saw' | 'noise' | 'clear',
  length: number,
): number[] {
  const out = new Array<number>(length);
  for (let i = 0; i < length; i++) {
    switch (kind) {
      case 'sine': out[i] = Math.round(Math.sin((i / length) * Math.PI * 2) * 120); break;
      case 'triangle': {
        const half = length / 2;
        const phase = i < half ? i / half : 1 - (i - half) / half;
        out[i] = Math.round((phase * 2 - 1) * 120);
        break;
      }
      case 'square': out[i] = i < length / 2 ? 120 : -120; break;
      case 'saw': out[i] = Math.round(((i / length) * 2 - 1) * 120); break;
      case 'noise': out[i] = Math.round(Math.random() * 254 - 127); break;
      case 'clear': out[i] = 0; break;
    }
  }
  return out;
}

// ─── Signed-byte draw canvas ──────────────────────────────────────────────────

interface SignedTableCanvasProps {
  table: number[];
  length: number;
  color: string;
  height?: number;
  /** Loop index to mark with a vertical line, or undefined for none. */
  loop?: number;
  /** Scale to the table's own peak instead of the full signed-8 range. */
  autoScale?: boolean;
  onEdit?: (next: number[]) => void;
}

const SignedTableCanvas: React.FC<SignedTableCanvasProps> = ({
  table, length, color, height = 88, loop, autoScale = false, onEdit,
}) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const tableRef = useRef(table);
  const lengthRef = useRef(length);
  useEffect(() => { tableRef.current = table; }, [table]);
  useEffect(() => { lengthRef.current = length; }, [length]);

  const draw = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    const dpr = window.devicePixelRatio || 1;
    const cssW = canvas.clientWidth || 320;
    const cssH = canvas.clientHeight || height;
    canvas.width = cssW * dpr;
    canvas.height = cssH * dpr;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    const w = cssW, h = cssH, mid = h / 2;
    ctx.clearRect(0, 0, w, h);
    ctx.fillStyle = '#0a0e14';
    ctx.fillRect(0, 0, w, h);
    ctx.strokeStyle = '#1a2a3a';
    ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(0, mid); ctx.lineTo(w, mid); ctx.stroke();

    const len = Math.max(1, lengthRef.current);
    const cur = tableRef.current;
    let peak = 127;
    if (autoScale) {
      peak = 1;
      for (let i = 0; i < len; i++) peak = Math.max(peak, Math.abs(cur[i] ?? 0));
    }

    // Loop marker
    if (loop !== undefined && loop >= 0 && loop < len) {
      const lx = (loop / len) * w;
      ctx.strokeStyle = '#ffffff30';
      ctx.setLineDash([3, 3]);
      ctx.beginPath(); ctx.moveTo(lx, 0); ctx.lineTo(lx, h); ctx.stroke();
      ctx.setLineDash([]);
    }

    ctx.strokeStyle = color;
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    for (let i = 0; i < len; i++) {
      const x = (i / len) * w;
      const s = Math.max(-peak, Math.min(peak, cur[i] ?? 0));
      const y = mid - (s / peak) * (mid - 3);
      if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
    }
    ctx.stroke();
  }, [color, height, loop, autoScale]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const raf = requestAnimationFrame(draw);
    const obs = new ResizeObserver(draw);
    obs.observe(canvas);
    return () => { cancelAnimationFrame(raf); obs.disconnect(); };
  }, [draw, table, length]);

  // ── Draw editing ──
  const drawingRef = useRef(false);
  const lastIdxRef = useRef(-1);
  const writeFromEvent = useCallback((e: React.PointerEvent<HTMLCanvasElement>) => {
    if (!onEdit) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    // Edit only within the active length; pad/truncate to it first.
    const len = Math.max(1, lengthRef.current);
    const base = tableRef.current.slice(0, len);
    while (base.length < len) base.push(0);
    const { next, idx } = writeSignedByte(
      base, e.clientX - rect.left, e.clientY - rect.top, rect.width, rect.height, lastIdxRef.current,
    );
    lastIdxRef.current = idx;
    onEdit(next);
  }, [onEdit]);

  const onDown = useCallback((e: React.PointerEvent<HTMLCanvasElement>) => {
    if (!onEdit) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    drawingRef.current = true;
    lastIdxRef.current = -1;
    writeFromEvent(e);
  }, [onEdit, writeFromEvent]);
  const onMove = useCallback((e: React.PointerEvent<HTMLCanvasElement>) => {
    if (drawingRef.current) writeFromEvent(e);
  }, [writeFromEvent]);
  const onUp = useCallback((e: React.PointerEvent<HTMLCanvasElement>) => {
    drawingRef.current = false;
    lastIdxRef.current = -1;
    try { e.currentTarget.releasePointerCapture(e.pointerId); } catch { /* noop */ }
  }, []);

  return (
    <canvas
      ref={canvasRef}
      className={`w-full rounded border border-dark-border bg-[#0a0e14] ${onEdit ? 'cursor-crosshair' : ''}`}
      style={{ height, touchAction: 'none' }}
      onPointerDown={onEdit ? onDown : undefined}
      onPointerMove={onEdit ? onMove : undefined}
      onPointerUp={onEdit ? onUp : undefined}
      onPointerCancel={onEdit ? onUp : undefined}
    />
  );
};

// ─── Rendered-output preview scope ────────────────────────────────────────────

const PreviewScope: React.FC<{ config: SunTronicConfig }> = ({ config }) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  // Render a short PCM preview at a low sample rate; recomputed on config change.
  const pcm = useMemo(() => {
    if (config.waveWordLen <= 0) return new Float32Array(0);
    try {
      return renderSunSynthPreview(sunConfigToInstrument(config), {
        periodIndex: 24, // ~C-3 in the SunTronic period table
        seconds: 0.4,
        sampleRate: 11025,
      });
    } catch {
      return new Float32Array(0);
    }
  }, [config]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const raf = requestAnimationFrame(() => {
      const ctx = canvas.getContext('2d');
      if (!ctx) return;
      const dpr = window.devicePixelRatio || 1;
      const cssW = canvas.clientWidth || 320;
      const cssH = canvas.clientHeight || 96;
      canvas.width = cssW * dpr;
      canvas.height = cssH * dpr;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      const w = cssW, h = cssH, mid = h / 2;
      ctx.clearRect(0, 0, w, h);
      ctx.fillStyle = '#0a0e14';
      ctx.fillRect(0, 0, w, h);
      ctx.strokeStyle = '#1a2a3a';
      ctx.beginPath(); ctx.moveTo(0, mid); ctx.lineTo(w, mid); ctx.stroke();
      if (pcm.length === 0) {
        ctx.fillStyle = '#4a5a6a';
        ctx.font = '11px monospace';
        ctx.textAlign = 'center';
        ctx.fillText('No output (empty wave buffer)', w / 2, mid);
        return;
      }
      ctx.strokeStyle = PREVIEW_COLOR;
      ctx.lineWidth = 1;
      ctx.beginPath();
      for (let x = 0; x < w; x++) {
        const i = Math.floor((x / w) * pcm.length);
        const y = mid - Math.max(-1, Math.min(1, pcm[i])) * (mid - 3);
        if (x === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
      }
      ctx.stroke();
    });
    return () => cancelAnimationFrame(raf);
  }, [pcm]);

  return (
    <canvas
      ref={canvasRef}
      className="w-full rounded border border-dark-border bg-[#0a0e14]"
      style={{ height: 96 }}
    />
  );
};

// ─── Section wrapper ──────────────────────────────────────────────────────────

const Section: React.FC<{ title: string; extra?: React.ReactNode; children: React.ReactNode }> = ({ title, extra, children }) => (
  <div className="space-y-1.5">
    <div className="flex items-center justify-between">
      <div className="text-[10px] text-text-muted font-mono uppercase tracking-wider">{title}</div>
      {extra}
    </div>
    {children}
  </div>
);

const PresetRow: React.FC<{ onPick: (k: 'sine' | 'triangle' | 'square' | 'saw' | 'noise' | 'clear') => void }> = ({ onPick }) => (
  <div className="flex gap-1">
    {(['sine', 'triangle', 'square', 'saw', 'noise', 'clear'] as const).map((k) => (
      <button
        key={k}
        onClick={() => onPick(k)}
        title={`Fill with ${k}`}
        className="text-[9px] font-mono px-1.5 py-0.5 rounded border border-dark-border text-text-secondary hover:text-accent-primary hover:border-accent-primary/50 uppercase"
      >
        {k}
      </button>
    ))}
  </div>
);

// ─── Main component ───────────────────────────────────────────────────────────

export const SunTronicSynthControls: React.FC<SunTronicSynthControlsProps> = ({ config, onChange }) => {
  const cfgRef = useRef(config);
  useEffect(() => { cfgRef.current = config; }, [config]);

  const setLoop = useCallback((key: keyof SunTronicConfig, len: number, delta: number) => {
    const cur = cfgRef.current[key] as number;
    const nextVal = Math.max(0, Math.min(Math.max(0, len - 1), cur + delta));
    onChange({ [key]: nextVal } as Partial<SunTronicConfig>);
  }, [onChange]);

  const wave1Len = config.wave1.length;
  const wave2Len = config.wave2.length;

  return (
    <div className="p-4 space-y-4 synth-controls-flow flex-1 min-w-0 overflow-y-auto">
      {/* Header */}
      <div className="flex items-center gap-3 text-sm flex-wrap">
        <span className="text-accent-highlight font-mono font-bold">SunTronic Synth</span>
        <span className="text-text-muted">|</span>
        <div className="flex items-center gap-1.5">
          <span className="text-[10px] text-text-muted font-mono uppercase">Type</span>
          <CustomSelect
            value={String(Math.min(4, Math.max(0, config.synthType)))}
            onChange={(v) => onChange({ synthType: parseInt(v, 10) })}
            options={SYNTH_TYPE_OPTIONS}
          />
        </div>
        <span className="px-2 py-0.5 bg-dark-bgTertiary text-text-secondary rounded text-[10px] font-mono">
          {sunSynthTypeLabel(config.synthType)}
        </span>
        <span className="px-2 py-0.5 bg-dark-bgTertiary text-text-muted rounded text-[10px] font-mono ml-auto">
          buffer {config.waveWordLen} words
        </span>
      </div>

      {/* Rendered-output preview */}
      <Section title="Rendered Output — live preview at C-3">
        <PreviewScope config={config} />
      </Section>

      {/* Wave 1 */}
      <Section title="Wavetable 1 — click + drag to draw" extra={
        <PresetRow onPick={(k) => onChange({ wave1: presetTable(k, wave1Len) })} />
      }>
        <SignedTableCanvas
          table={config.wave1} length={wave1Len} color={WAVE_COLOR}
          onEdit={(next) => onChange({ wave1: next })}
        />
      </Section>

      {/* Wave 2 (used by morph / splice types) */}
      <Section title="Wavetable 2 — morph / splice partner" extra={
        <PresetRow onPick={(k) => onChange({ wave2: presetTable(k, wave2Len) })} />
      }>
        <SignedTableCanvas
          table={config.wave2} length={wave2Len} color={WAVE_COLOR}
          onEdit={(next) => onChange({ wave2: next })}
        />
      </Section>

      {/* Volume envelope */}
      <Section title="Volume Envelope" extra={
        <div className="flex items-center gap-2 text-[10px] font-mono text-text-muted">
          <span>loop {config.volEnvLoop}/{config.volEnvLen}</span>
          <button className="px-1.5 rounded border border-dark-border hover:border-accent-primary/50 text-text-secondary" onClick={() => setLoop('volEnvLoop', config.volEnvLen, -1)}>-</button>
          <button className="px-1.5 rounded border border-dark-border hover:border-accent-primary/50 text-text-secondary" onClick={() => setLoop('volEnvLoop', config.volEnvLen, +1)}>+</button>
        </div>
      }>
        <SignedTableCanvas
          table={config.volEnv} length={config.volEnvLen} color={ENV_COLOR}
          loop={config.volEnvLoop} height={72}
          onEdit={(next) => onChange({ volEnv: next })}
        />
      </Section>

      {/* Arp table */}
      <Section title="Arpeggio / Pitch Table" extra={
        <div className="flex items-center gap-2 text-[10px] font-mono text-text-muted">
          <span>loop {config.arpLoop}/{config.arpLen}</span>
          <button className="px-1.5 rounded border border-dark-border hover:border-accent-primary/50 text-text-secondary" onClick={() => setLoop('arpLoop', config.arpLen, -1)}>-</button>
          <button className="px-1.5 rounded border border-dark-border hover:border-accent-primary/50 text-text-secondary" onClick={() => setLoop('arpLoop', config.arpLen, +1)}>+</button>
        </div>
      }>
        <SignedTableCanvas
          table={config.arpTable} length={config.arpLen} color={ARP_COLOR}
          loop={config.arpLoop} height={64} autoScale
          onEdit={(next) => onChange({ arpTable: next })}
        />
      </Section>

      {/* Vibrato depth + freq-env speed */}
      <div className="flex gap-4 items-start">
        <div className="flex-1 min-w-0">
          <Section title="Vibrato Depth">
            <SignedTableCanvas
              table={config.vibDepth} length={config.freqEnvLen} color={VIB_COLOR}
              loop={config.freqEnvLoop} height={56} autoScale
              onEdit={(next) => onChange({ vibDepth: next })}
            />
          </Section>
        </div>
        <div className="flex flex-col items-center gap-1 pt-4">
          <Knob
            value={config.freqEnvSpeed}
            onChange={(v) => onChange({ freqEnvSpeed: Math.round(v) })}
            size="md" label="Freq Env Speed" min={0} max={255} bipolar={false}
          />
          <span className="text-[10px] text-text-muted font-mono">{config.freqEnvSpeed}</span>
        </div>
      </div>
    </div>
  );
};
