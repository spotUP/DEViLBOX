/**
 * GTSoundDesigner — Noob-friendly visual SID instrument editor.
 *
 * Alternative to the hex-based Tables tab. Provides drag-to-draw canvases,
 * waveform step timelines, preset cards, and arpeggio grids — all reading
 * and writing the same underlying GT store table data.
 */

import React, { useState, useCallback, useMemo, useRef, useEffect } from 'react';
import { useGTUltraStore } from '@/stores/useGTUltraStore';
import { useInstrumentColors } from '@/hooks/useInstrumentColors';
import {
  SID_PRESETS,
  getPresetCategories,
  getPresetsByCategory,
  applyPresetToInstrument,
  type GTSIDPreset,
} from '@/constants/gtultraPresets';
import {
  ATTACK_MS, DECAY_MS, WAVEFORMS,
  encodeAD, encodeSR,
} from '@/lib/gtultra/GTVisualMapping';
import {
  decodeWaveSequence, encodeWaveSequence, waveformName, waveCommandLabel,
  decodePulseSequence, encodePulseSequence,
  decodeFilterSequence, encodeFilterSequence,
  type WaveStep, type FilterStep,
} from '@/lib/gtultra/GTTableCodec';

// ── Constants ──────────────────────────────────────────────────────────────

const TABLE_COLORS = {
  wave: '#60e060',
  pulse: '#ff8866',
  filter: '#ffcc00',
  speed: '#6699ff',
};

const CATEGORY_LABELS: Record<string, string> = {
  bass: 'Bass', lead: 'Lead', pad: 'Pad', arp: 'Arp',
  drum: 'Drum', fx: 'FX', classic: 'Classic', template: 'Template',
};

const ARP_CHORDS: { label: string; semitones: number[] }[] = [
  { label: 'Major', semitones: [0, 4, 7] },
  { label: 'Minor', semitones: [0, 3, 7] },
  { label: 'Oct', semitones: [0, 12] },
  { label: 'Power', semitones: [0, 7] },
  { label: 'Dim', semitones: [0, 3, 6] },
  { label: '7th', semitones: [0, 4, 7, 10] },
  { label: 'Sus4', semitones: [0, 5, 7] },
];

// ── Draw Canvas — shared drag-to-draw pattern ──────────────────────────────

const DRAW_H = 100;
const DRAW_STEPS = 32;

interface DrawCanvasProps {
  values: number[]; // 0-1 normalized, length = DRAW_STEPS
  color: string;
  label?: string;
  onDraw: (values: number[]) => void;
}

const DrawCanvas: React.FC<DrawCanvasProps> = ({ values, color, label, onDraw }) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const isDragging = useRef(false);
  const localValues = useRef<number[]>([...values]);

  useEffect(() => { localValues.current = [...values]; }, [values]);

  const draw = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    const w = canvas.width, h = canvas.height;
    const dpr = window.devicePixelRatio || 1;
    ctx.clearRect(0, 0, w, h);

    // Background grid
    ctx.strokeStyle = '#1a1a1a';
    ctx.lineWidth = dpr;
    for (let i = 0; i <= 4; i++) {
      const y = (i / 4) * h;
      ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(w, y); ctx.stroke();
    }

    // Bars
    const vals = localValues.current;
    const barW = w / DRAW_STEPS;
    for (let i = 0; i < DRAW_STEPS; i++) {
      const v = vals[i] ?? 0;
      const barH = v * h;
      ctx.fillStyle = color + '80';
      ctx.fillRect(i * barW + 1 * dpr, h - barH, barW - 2 * dpr, barH);
    }

    // Line
    ctx.beginPath();
    ctx.strokeStyle = color;
    ctx.lineWidth = 1.5 * dpr;
    for (let i = 0; i < DRAW_STEPS; i++) {
      const x = (i + 0.5) * barW;
      const y = h - (vals[i] ?? 0) * h;
      i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
    }
    ctx.stroke();

    // Label
    if (label) {
      ctx.font = `${9 * dpr}px monospace`;
      ctx.fillStyle = '#555';
      ctx.fillText(label, 4 * dpr, 10 * dpr);
    }
  }, [color, label]);

  useEffect(() => { draw(); }, [draw, values]);

  const getStep = useCallback((e: React.MouseEvent) => {
    const canvas = canvasRef.current;
    if (!canvas) return null;
    const rect = canvas.getBoundingClientRect();
    const x = (e.clientX - rect.left) / rect.width;
    const y = 1 - (e.clientY - rect.top) / rect.height;
    const step = Math.floor(x * DRAW_STEPS);
    return { step: Math.max(0, Math.min(DRAW_STEPS - 1, step)), value: Math.max(0, Math.min(1, y)) };
  }, []);

  const handlePointerDown = useCallback((e: React.MouseEvent) => {
    isDragging.current = true;
    const pt = getStep(e);
    if (pt) { localValues.current[pt.step] = pt.value; draw(); }
    (e.target as HTMLElement).setPointerCapture((e as unknown as PointerEvent).pointerId);
  }, [getStep, draw]);

  const handlePointerMove = useCallback((e: React.MouseEvent) => {
    if (!isDragging.current) return;
    const pt = getStep(e);
    if (pt) { localValues.current[pt.step] = pt.value; draw(); }
  }, [getStep, draw]);

  const handlePointerUp = useCallback(() => {
    if (!isDragging.current) return;
    isDragging.current = false;
    onDraw([...localValues.current]);
  }, [onDraw]);

  const dpr = typeof window !== 'undefined' ? window.devicePixelRatio || 1 : 1;

  return (
    <canvas
      ref={canvasRef}
      width={Math.round(280 * dpr)}
      height={Math.round(DRAW_H * dpr)}
      style={{ width: '100%', height: DRAW_H, borderRadius: 4, background: '#060a08', border: '1px solid #1a1a1a', cursor: 'crosshair' }}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
    />
  );
};

// ── Pulse Draw Canvas wrapper ───────────────────────────────────────────────

function pulseStepsToValues(steps: { type: string; value: number; speed: number }[]): number[] {
  // Simple: expand to 32 values (0-1 normalized from 0-4095)
  const vals = new Array(DRAW_STEPS).fill(0.5);
  if (steps.length === 0) return vals;
  let pw = 2048; // default
  let idx = 0;
  for (const step of steps) {
    if (step.type === 'set') {
      pw = step.value;
      if (idx < DRAW_STEPS) vals[idx] = pw / 4095;
      idx++;
    } else {
      // Modulation: fill frames
      for (let f = 0; f < step.value && idx < DRAW_STEPS; f++) {
        const speed = step.speed < 0x80 ? step.speed : step.speed - 256;
        pw = Math.max(0, Math.min(4095, pw + speed));
        vals[idx] = pw / 4095;
        idx++;
      }
    }
  }
  // Fill remaining with last value
  for (; idx < DRAW_STEPS; idx++) vals[idx] = pw / 4095;
  return vals;
}

function valuesToPulseSteps(values: number[]): { type: 'set'; value: number; speed: number }[] {
  // Convert drawn values to simple absolute-set steps
  return values.filter((_, i) => i === 0 || Math.abs(values[i] - values[i - 1]) > 0.01)
    .map(v => ({ type: 'set' as const, value: Math.round(v * 4095), speed: 0 }));
}

const PulseDrawCanvas: React.FC<{
  pulseSteps: { type: string; value: number; speed: number }[];
  color: string;
  onDraw: (values: number[]) => void;
}> = ({ pulseSteps, color, onDraw }) => {
  const values = useMemo(() => pulseStepsToValues(pulseSteps), [pulseSteps]);
  return <DrawCanvas values={values} color={color} label="Pulse Width" onDraw={onDraw} />;
};

// ── Filter Draw Canvas wrapper ──────────────────────────────────────────────

function filterStepsToValues(steps: FilterStep[]): number[] {
  const vals = new Array(DRAW_STEPS).fill(0.5);
  if (steps.length === 0) return vals;
  let cutoff = 128;
  let idx = 0;
  for (const step of steps) {
    if (step.type === 'set') {
      cutoff = step.param;
      if (idx < DRAW_STEPS) vals[idx] = cutoff / 255;
      idx++;
    } else {
      for (let f = 0; f < step.value && idx < DRAW_STEPS; f++) {
        const speed = step.param < 0x80 ? step.param : step.param - 256;
        cutoff = Math.max(0, Math.min(255, cutoff + speed));
        vals[idx] = cutoff / 255;
        idx++;
      }
    }
  }
  for (; idx < DRAW_STEPS; idx++) vals[idx] = cutoff / 255;
  return vals;
}

function valuesToFilterSteps(values: number[]): FilterStep[] {
  return values.filter((_, i) => i === 0 || Math.abs(values[i] - values[i - 1]) > 0.01)
    .map(v => ({ type: 'set' as const, value: 0x90, param: Math.round(v * 255) }));
}

const FilterDrawCanvas: React.FC<{
  filterSteps: FilterStep[];
  color: string;
  onDraw: (values: number[]) => void;
}> = ({ filterSteps, color, onDraw }) => {
  const values = useMemo(() => filterStepsToValues(filterSteps), [filterSteps]);
  return <DrawCanvas values={values} color={color} label="Filter Cutoff" onDraw={onDraw} />;
};

// ── Arpeggio Step Grid ──────────────────────────────────────────────────────

const ARP_GRID_ROWS = 24; // 2 octaves
const ARP_GRID_COLS = 8;  // 8 steps

const ArpGrid: React.FC<{ color: string }> = ({ color }) => {
  const [steps, setSteps] = useState<boolean[][]>(
    () => Array.from({ length: ARP_GRID_COLS }, () => new Array(ARP_GRID_ROWS).fill(false))
  );

  const toggleCell = useCallback((col: number, row: number) => {
    setSteps(prev => {
      const next = prev.map(c => [...c]);
      // Clear column first (one note per step)
      next[col] = new Array(ARP_GRID_ROWS).fill(false);
      next[col][row] = !prev[col][row];
      return next;
    });
  }, []);

  const cellSize = 14;
  const noteNames = ['C', '', 'D', '', 'E', 'F', '', 'G', '', 'A', '', 'B'];

  return (
    <div style={{ overflowX: 'auto' }}>
      <div style={{ display: 'grid', gridTemplateColumns: `20px repeat(${ARP_GRID_COLS}, ${cellSize}px)`, gap: 1, fontSize: 10 }}>
        {/* Header */}
        <div />
        {Array.from({ length: ARP_GRID_COLS }, (_, c) => (
          <div key={c} style={{ textAlign: 'center', color: '#555', fontSize: 10 }}>{c + 1}</div>
        ))}
        {/* Grid rows (top = highest note) */}
        {Array.from({ length: ARP_GRID_ROWS }, (_, rowIdx) => {
          const semitone = ARP_GRID_ROWS - 1 - rowIdx;
          const noteName = noteNames[semitone % 12];
          const isBlackKey = !noteName;
          return (
            <React.Fragment key={rowIdx}>
              <div style={{ color: '#555', textAlign: 'right', paddingRight: 2, fontSize: 10, lineHeight: `${cellSize}px` }}>
                {noteName || '·'}{semitone % 12 === 0 ? Math.floor(semitone / 12) : ''}
              </div>
              {Array.from({ length: ARP_GRID_COLS }, (_, col) => (
                <div
                  key={col}
                  onClick={() => toggleCell(col, semitone)}
                  style={{
                    width: cellSize, height: cellSize,
                    background: steps[col][semitone] ? color : (isBlackKey ? '#0a0a0a' : '#111'),
                    border: `1px solid ${steps[col][semitone] ? color : '#222'}`,
                    borderRadius: 1,
                    cursor: 'pointer',
                  }}
                />
              ))}
            </React.Fragment>
          );
        })}
      </div>
    </div>
  );
};

// ── Component ──────────────────────────────────────────────────────────────

export const GTSoundDesigner: React.FC = () => {
  const { accent: accentColor, panelBg } = useInstrumentColors('#44ff88', { dim: '#1a3328' });

  // GT store state
  const currentInstrument = useGTUltraStore((s) => s.currentInstrument);
  const instrumentData = useGTUltraStore((s) => s.instrumentData);
  const tableData = useGTUltraStore((s) => s.tableData);
  const engine = useGTUltraStore((s) => s.engine);
  const inst = instrumentData[currentInstrument];

  // Local UI state
  const [activeCategory, setActiveCategory] = useState<string>('all');
  const [isAuditioning, setIsAuditioning] = useState(false);

  // Derived instrument values
  const attack = (inst?.ad ?? 0) >> 4;
  const decay = (inst?.ad ?? 0) & 0xF;
  const sustain = (inst?.sr ?? 0) >> 4;
  const release = (inst?.sr ?? 0) & 0xF;
  const waveform = (inst?.firstwave ?? 0) & 0xFE;
  const gate = !!((inst?.firstwave ?? 0) & 0x01);
  const gateTimerValue = (inst?.gatetimer ?? 0) & 0x3F;
  const hardRestart = !((inst?.gatetimer ?? 0) & 0x40);
  const vibdelay = inst?.vibdelay ?? 0;

  // Decoded table sequences
  const waveSteps = useMemo(() => {
    if (!tableData?.wave || !inst?.wavePtr) return [];
    return decodeWaveSequence(tableData.wave.left, tableData.wave.right, inst.wavePtr);
  }, [tableData?.wave, inst?.wavePtr]);

  const pulseSteps = useMemo(() => {
    if (!tableData?.pulse || !inst?.pulsePtr) return [];
    return decodePulseSequence(tableData.pulse.left, tableData.pulse.right, inst.pulsePtr);
  }, [tableData?.pulse, inst?.pulsePtr]);

  const filterSteps = useMemo(() => {
    if (!tableData?.filter || !inst?.filterPtr) return [];
    return decodeFilterSequence(tableData.filter.left, tableData.filter.right, inst.filterPtr);
  }, [tableData?.filter, inst?.filterPtr]);

  // ── ADSR Callbacks ──

  const setADSR = useCallback((a: number, d: number, s: number, r: number) => {
    if (!engine) return;
    engine.setInstrumentAD(currentInstrument, encodeAD(a, d));
    engine.setInstrumentSR(currentInstrument, encodeSR(s, r));
    useGTUltraStore.getState().refreshAllInstruments();
  }, [engine, currentInstrument]);

  // ── Waveform Toggle ──

  const toggleWaveBit = useCallback((bit: number) => {
    if (!engine) return;
    const newWave = ((inst?.firstwave ?? 0) ^ bit);
    engine.setInstrumentFirstwave(currentInstrument, newWave);
    useGTUltraStore.getState().refreshAllInstruments();
  }, [engine, currentInstrument, inst?.firstwave]);

  // ── Preset Application ──

  const applyPreset = useCallback((preset: GTSIDPreset) => {
    if (!engine) return;
    applyPresetToInstrument(preset, currentInstrument, engine, tableData);
    useGTUltraStore.getState().refreshAllInstruments();
    useGTUltraStore.getState().refreshAllTables();
  }, [engine, currentInstrument, tableData]);

  // ── Audition ──

  const toggleAudition = useCallback(() => {
    if (!engine) return;
    if (isAuditioning) {
      engine.jamNoteOff(0);
      setIsAuditioning(false);
    } else {
      engine.jamNoteOn(0, 37, currentInstrument); // C-3
      setIsAuditioning(true);
    }
  }, [engine, isAuditioning, currentInstrument]);

  // ── Wave Step Editing ──

  const writeWaveSteps = useCallback((steps: WaveStep[]) => {
    if (!engine || !inst?.wavePtr) return;
    const { left, right } = encodeWaveSequence(steps);
    const ptr = inst.wavePtr - 1; // Convert 1-based to 0-based
    for (let i = 0; i < left.length; i++) {
      engine.setTableEntry(0, 0, ptr + i, left[i]);
      engine.setTableEntry(0, 1, ptr + i, right[i]);
    }
    useGTUltraStore.getState().refreshAllTables();
  }, [engine, inst?.wavePtr]);

  const addWaveStep = useCallback(() => {
    const newSteps = [...waveSteps, {
      waveform: 0x40, gate: true, sync: false, ring: false,
      delay: 0, noteOffset: 0x80,
    }];
    writeWaveSteps(newSteps);
  }, [waveSteps, writeWaveSteps]);

  const removeWaveStep = useCallback((idx: number) => {
    const newSteps = waveSteps.filter((_, i) => i !== idx);
    writeWaveSteps(newSteps);
  }, [waveSteps, writeWaveSteps]);

  // ── Settings Callbacks ──

  const setGateTimer = useCallback((v: number) => {
    if (!engine) return;
    const current = inst?.gatetimer ?? 0;
    engine.setInstrumentGatetimer?.(currentInstrument, (current & 0xC0) | (v & 0x3F));
    useGTUltraStore.getState().refreshAllInstruments();
  }, [engine, currentInstrument, inst?.gatetimer]);

  const setVibDelay = useCallback((v: number) => {
    if (!engine) return;
    engine.setInstrumentVibdelay?.(currentInstrument, v);
    useGTUltraStore.getState().refreshAllInstruments();
  }, [engine, currentInstrument]);

  // ── Helpers ──

  const SectionLabel = ({ label, color }: { label: string; color?: string }) => (
    <div className="text-sm font-bold uppercase tracking-widest mb-1.5"
      style={{ color: color ?? accentColor, opacity: 0.7 }}>{label}</div>
  );

  // Filter presets
  const filteredPresets = activeCategory === 'all'
    ? SID_PRESETS
    : getPresetsByCategory(activeCategory as GTSIDPreset['category']);

  // ADSR envelope SVG path
  const envPath = useMemo(() => {
    const ams = ATTACK_MS[attack], dms = DECAY_MS[decay], rms = DECAY_MS[release];
    const sLevel = sustain / 15;
    const totalMs = ams + dms + Math.max(rms, 200);
    if (totalMs === 0) return '';
    const w = 200, h = 60, scale = w / totalMs;
    const x1 = ams * scale, x2 = x1 + dms * scale, x3 = x2 + 200 * scale, x4 = x3 + rms * scale;
    return `M0,${h} L${x1.toFixed(1)},2 L${x2.toFixed(1)},${(h * (1 - sLevel)).toFixed(1)} L${x3.toFixed(1)},${(h * (1 - sLevel)).toFixed(1)} L${x4.toFixed(1)},${h}`;
  }, [attack, decay, sustain, release]);

  // ════════════════════════════════════════════════════════════════════════
  //  RENDER
  // ════════════════════════════════════════════════════════════════════════

  return (
    <div className="flex flex-col gap-3 p-3 overflow-y-auto synth-controls-flow" style={{ maxHeight: 'calc(100vh - 280px)' }}>

      {/* ── Preset Bar ── */}
      <div className={`rounded-lg border p-2 ${panelBg}`}>
        <div className="flex items-center gap-2 mb-2">
          <SectionLabel label="Presets" />
          <button
            onClick={toggleAudition}
            className="px-3 py-1 text-sm font-bold rounded ml-auto"
            style={{
              background: isAuditioning ? '#ff4444' : accentColor,
              color: '#000',
            }}
          >
            {isAuditioning ? 'STOP' : '▶ PLAY'}
          </button>
        </div>

        {/* Category filter */}
        <div className="flex gap-1 mb-2 flex-wrap">
          <button
            className="px-2 py-0.5 text-xs font-mono rounded"
            style={{
              background: activeCategory === 'all' ? accentColor : 'transparent',
              color: activeCategory === 'all' ? '#000' : '#666',
              border: `1px solid ${activeCategory === 'all' ? accentColor : '#333'}`,
            }}
            onClick={() => setActiveCategory('all')}
          >All</button>
          {getPresetCategories().map(cat => (
            <button
              key={cat}
              className="px-2 py-0.5 text-xs font-mono rounded"
              style={{
                background: activeCategory === cat ? accentColor : 'transparent',
                color: activeCategory === cat ? '#000' : '#666',
                border: `1px solid ${activeCategory === cat ? accentColor : '#333'}`,
              }}
              onClick={() => setActiveCategory(cat)}
            >{CATEGORY_LABELS[cat] || cat}</button>
          ))}
        </div>

        {/* Preset cards */}
        <div className="flex gap-2 overflow-x-auto pb-1" style={{ scrollbarWidth: 'thin' }}>
          {filteredPresets.map((preset, i) => (
            <button
              key={i}
              onClick={() => applyPreset(preset)}
              className="flex-shrink-0 px-3 py-2 rounded text-left"
              style={{
                background: '#111',
                border: '1px solid #333',
                minWidth: 120,
              }}
            >
              <div className="text-sm font-bold" style={{ color: accentColor }}>{preset.name}</div>
              <div className="text-xs text-text-secondary mt-0.5">{preset.description}</div>
            </button>
          ))}
        </div>
      </div>

      {/* ── 3-Column Grid ── */}
      <div className="grid gap-3" style={{ gridTemplateColumns: 'repeat(3, 1fr)' }}>

        {/* ════ Column 1: ADSR + Waveform Sequence ════ */}
        <div className="flex flex-col gap-3">

          {/* ADSR */}
          <div className={`rounded-lg border p-3 ${panelBg}`}>
            <SectionLabel label="ADSR Envelope" />
            <div className="rounded px-1 mb-2" style={{ background: '#060a08' }}>
              <svg viewBox="0 0 200 60" width="100%" height={60} preserveAspectRatio="none">
                {envPath && <path d={envPath} fill="none" stroke={accentColor} strokeWidth={1.5} opacity={0.8} />}
              </svg>
            </div>
            <div className="grid grid-cols-4 gap-2">
              {[
                { label: 'A', value: attack, table: ATTACK_MS, set: (v: number) => setADSR(v, decay, sustain, release) },
                { label: 'D', value: decay, table: DECAY_MS, set: (v: number) => setADSR(attack, v, sustain, release) },
                { label: 'S', value: sustain, table: null, set: (v: number) => setADSR(attack, decay, v, release) },
                { label: 'R', value: release, table: DECAY_MS, set: (v: number) => setADSR(attack, decay, sustain, v) },
              ].map(({ label, value, table, set }) => (
                <div key={label} className="flex flex-col items-center gap-0.5">
                  <span className="text-xs font-bold text-text-secondary">{label}</span>
                  <input type="range" min={0} max={15} value={value}
                    onChange={(e) => set(parseInt(e.target.value))}
                    style={{ width: '100%', accentColor }} />
                  <span className="text-xs font-mono" style={{ color: accentColor }}>
                    {table ? (table[value] >= 1000 ? `${(table[value] / 1000).toFixed(1)}s` : `${table[value]}ms`) : `${Math.round(value / 15 * 100)}%`}
                  </span>
                </div>
              ))}
            </div>
          </div>

          {/* Waveform Sequence */}
          <div className={`rounded-lg border p-3 ${panelBg}`}>
            <SectionLabel label="Waveform Sequence" color={TABLE_COLORS.wave} />

            {/* Waveform buttons for firstwave */}
            <div className="flex gap-1.5 mb-3">
              {WAVEFORMS.map(wf => {
                const active = !!(waveform & wf.bit);
                return (
                  <button key={wf.bit} onClick={() => toggleWaveBit(wf.bit)}
                    className="px-2 py-1 text-sm font-mono rounded"
                    style={{
                      background: active ? TABLE_COLORS.wave : '#111',
                      color: active ? '#000' : '#555',
                      border: `1px solid ${active ? TABLE_COLORS.wave : '#333'}`,
                    }}>
                    {wf.shortName}
                  </button>
                );
              })}
              <button onClick={() => toggleWaveBit(0x01)}
                className="px-2 py-1 text-sm font-mono rounded"
                style={{
                  background: gate ? TABLE_COLORS.wave + '40' : '#111',
                  color: gate ? TABLE_COLORS.wave : '#555',
                  border: `1px solid ${gate ? TABLE_COLORS.wave : '#333'}`,
                }}>
                GATE
              </button>
            </div>

            {/* Wave table steps */}
            {waveSteps.length > 0 ? (
              <div className="flex flex-col gap-1">
                {waveSteps.map((step, i) => (
                  <div key={i} className="flex items-center gap-2 px-2 py-1 rounded"
                    style={{ background: '#0a0f0c', border: '1px solid #1a3328' }}>
                    <span className="text-xs font-mono w-4" style={{ color: '#555' }}>{i + 1}</span>
                    {step.isCommand ? (
                      <span className="text-xs font-mono" style={{ color: '#888' }}>
                        {waveCommandLabel(step.cmdByte ?? 0)} ${(step.cmdParam ?? 0).toString(16).toUpperCase().padStart(2, '0')}
                      </span>
                    ) : (
                      <>
                        <span className="text-sm font-bold" style={{ color: TABLE_COLORS.wave }}>
                          {waveformName(step.waveform)}
                        </span>
                        {step.gate && <span className="text-xs" style={{ color: TABLE_COLORS.wave }}>G</span>}
                        {step.delay > 0 && (
                          <span className="text-xs font-mono text-text-secondary">
                            +{step.delay}f
                          </span>
                        )}
                        {step.noteOffset !== 0x80 && step.noteOffset !== 0 && (
                          <span className="text-xs font-mono" style={{ color: TABLE_COLORS.speed }}>
                            n:{step.noteOffset.toString(16).toUpperCase()}
                          </span>
                        )}
                      </>
                    )}
                    <button onClick={() => removeWaveStep(i)}
                      className="ml-auto text-xs text-text-secondary hover:text-red-400"
                    >x</button>
                  </div>
                ))}
                <button onClick={addWaveStep}
                  className="text-xs font-mono py-1 rounded"
                  style={{ color: TABLE_COLORS.wave, border: `1px dashed ${TABLE_COLORS.wave}40` }}>
                  + Add Step
                </button>
              </div>
            ) : (
              <div className="text-xs text-text-secondary text-center py-4">
                {inst?.wavePtr ? 'No wave table data at this pointer' : 'No wave table assigned'}
                <br />
                <button onClick={addWaveStep} className="mt-2 text-xs font-mono py-1 px-3 rounded"
                  style={{ color: TABLE_COLORS.wave, border: `1px dashed ${TABLE_COLORS.wave}40` }}>
                  + Create Wave Sequence
                </button>
              </div>
            )}
          </div>
        </div>

        {/* ════ Column 2: Pulse Width + Filter ════ */}
        <div className="flex flex-col gap-3">

          {/* Pulse Width — drag-to-draw canvas */}
          <div className={`rounded-lg border p-3 ${panelBg}`}>
            <SectionLabel label="Pulse Width" color={TABLE_COLORS.pulse} />
            <PulseDrawCanvas
              pulseSteps={pulseSteps}
              color={TABLE_COLORS.pulse}
              onDraw={(values) => {
                if (!engine || !inst?.pulsePtr) return;
                const steps = valuesToPulseSteps(values);
                const { left, right } = encodePulseSequence(steps);
                const ptr = inst.pulsePtr - 1;
                for (let i = 0; i < left.length; i++) {
                  engine.setTableEntry(1, 0, ptr + i, left[i]);
                  engine.setTableEntry(1, 1, ptr + i, right[i]);
                }
                useGTUltraStore.getState().refreshAllTables();
              }}
            />
            {/* Quick PWM presets */}
            <div className="flex gap-1 mt-2 flex-wrap">
              {[
                { label: '50%', steps: [{ type: 'set' as const, value: 2048, speed: 0 }] },
                { label: 'Sweep ↑', steps: [{ type: 'set' as const, value: 512, speed: 0 }, { type: 'mod' as const, value: 64, speed: 8 }] },
                { label: 'Sweep ↓', steps: [{ type: 'set' as const, value: 3584, speed: 0 }, { type: 'mod' as const, value: 64, speed: 0xF8 }] },
                { label: 'Wobble', steps: [{ type: 'set' as const, value: 2048, speed: 0 }, { type: 'mod' as const, value: 32, speed: 6 }, { type: 'mod' as const, value: 32, speed: 0xFA }] },
              ].map(preset => (
                <button key={preset.label}
                  className="px-2 py-0.5 text-xs font-mono rounded"
                  style={{ color: TABLE_COLORS.pulse, border: `1px solid ${TABLE_COLORS.pulse}40` }}
                  onClick={() => {
                    if (!engine || !inst?.pulsePtr) return;
                    const { left, right } = encodePulseSequence(preset.steps);
                    const ptr = inst.pulsePtr - 1;
                    for (let i = 0; i < left.length; i++) {
                      engine.setTableEntry(1, 0, ptr + i, left[i]);
                      engine.setTableEntry(1, 1, ptr + i, right[i]);
                    }
                    useGTUltraStore.getState().refreshAllTables();
                  }}
                >{preset.label}</button>
              ))}
            </div>
          </div>

          {/* Filter — cutoff draw + mode/resonance */}
          <div className={`rounded-lg border p-3 ${panelBg}`}>
            <SectionLabel label="Filter" color={TABLE_COLORS.filter} />
            {/* Mode selector */}
            <div className="flex gap-1 mb-2">
              {['LP', 'BP', 'HP'].map(mode => (
                <button key={mode}
                  className="px-3 py-1 text-xs font-mono rounded"
                  style={{
                    color: TABLE_COLORS.filter,
                    border: `1px solid ${TABLE_COLORS.filter}40`,
                    background: '#111',
                  }}>
                  {mode}
                </button>
              ))}
              <div className="flex items-center gap-1 ml-auto">
                <span className="text-xs text-text-secondary">Res</span>
                <input type="range" min={0} max={15} defaultValue={8}
                  style={{ width: 60, accentColor: TABLE_COLORS.filter }} />
              </div>
            </div>
            {/* Cutoff draw canvas */}
            <FilterDrawCanvas
              filterSteps={filterSteps}
              color={TABLE_COLORS.filter}
              onDraw={(values) => {
                if (!engine || !inst?.filterPtr) return;
                const steps = valuesToFilterSteps(values);
                const { left, right } = encodeFilterSequence(steps);
                const ptr = inst.filterPtr - 1;
                for (let i = 0; i < left.length; i++) {
                  engine.setTableEntry(2, 0, ptr + i, left[i]);
                  engine.setTableEntry(2, 1, ptr + i, right[i]);
                }
                useGTUltraStore.getState().refreshAllTables();
              }}
            />
            {/* Filter presets */}
            <div className="flex gap-1 mt-2 flex-wrap">
              {[
                { label: 'Sweep ↓', steps: [{ type: 'set' as const, value: 0x90, param: 0xFF }, { type: 'mod' as const, value: 64, param: 0xFC }] },
                { label: 'Sweep ↑', steps: [{ type: 'set' as const, value: 0x90, param: 0x20 }, { type: 'mod' as const, value: 64, param: 0x04 }] },
                { label: 'Wah', steps: [{ type: 'set' as const, value: 0x90, param: 0x40 }, { type: 'mod' as const, value: 16, param: 0x08 }, { type: 'mod' as const, value: 16, param: 0xF8 }] },
              ].map(preset => (
                <button key={preset.label}
                  className="px-2 py-0.5 text-xs font-mono rounded"
                  style={{ color: TABLE_COLORS.filter, border: `1px solid ${TABLE_COLORS.filter}40` }}
                  onClick={() => {
                    if (!engine || !inst?.filterPtr) return;
                    const { left, right } = encodeFilterSequence(preset.steps);
                    const ptr = inst.filterPtr - 1;
                    for (let i = 0; i < left.length; i++) {
                      engine.setTableEntry(2, 0, ptr + i, left[i]);
                      engine.setTableEntry(2, 1, ptr + i, right[i]);
                    }
                    useGTUltraStore.getState().refreshAllTables();
                  }}
                >{preset.label}</button>
              ))}
            </div>
          </div>
        </div>

        {/* ════ Column 3: Arpeggio + Settings ════ */}
        <div className="flex flex-col gap-3">

          {/* Arpeggio — step grid + chord presets */}
          <div className={`rounded-lg border p-3 ${panelBg}`}>
            <SectionLabel label="Arpeggio" color={TABLE_COLORS.speed} />
            <ArpGrid color={TABLE_COLORS.speed} />
            <div className="flex gap-1 mt-2 flex-wrap">
              {ARP_CHORDS.map(chord => (
                <button key={chord.label}
                  className="px-2 py-0.5 text-xs font-mono rounded"
                  style={{ color: TABLE_COLORS.speed, border: `1px solid ${TABLE_COLORS.speed}40` }}
                  onClick={() => {
                    if (!engine || !inst?.speedPtr) return;
                    const ptr = inst.speedPtr - 1;
                    for (let i = 0; i < chord.semitones.length; i++) {
                      engine.setTableEntry(3, 0, ptr + i, 0);
                      engine.setTableEntry(3, 1, ptr + i, chord.semitones[i]);
                    }
                    // End marker
                    engine.setTableEntry(3, 0, ptr + chord.semitones.length, 0xFF);
                    engine.setTableEntry(3, 1, ptr + chord.semitones.length, ptr + 1); // loop back
                    useGTUltraStore.getState().refreshAllTables();
                  }}
                >{chord.label}</button>
              ))}
            </div>
          </div>

          {/* Instrument Settings */}
          <div className={`rounded-lg border p-3 ${panelBg}`}>
            <SectionLabel label="Settings" />
            <div className="flex flex-col gap-3">

              {/* Gate Timer */}
              <div>
                <div className="flex items-center justify-between mb-1">
                  <span className="text-xs text-text-secondary">Gate Timer</span>
                  <span className="text-xs font-mono" style={{ color: accentColor }}>{gateTimerValue}</span>
                </div>
                <input type="range" min={0} max={63} value={gateTimerValue}
                  onChange={(e) => setGateTimer(parseInt(e.target.value))}
                  style={{ width: '100%', accentColor }} />
                <div className="text-xs text-text-secondary opacity-60">
                  Note duration in frames (0 = default)
                </div>
              </div>

              {/* Vibrato Delay */}
              <div>
                <div className="flex items-center justify-between mb-1">
                  <span className="text-xs text-text-secondary">Vibrato Delay</span>
                  <span className="text-xs font-mono" style={{ color: accentColor }}>{vibdelay}</span>
                </div>
                <input type="range" min={0} max={255} value={vibdelay}
                  onChange={(e) => setVibDelay(parseInt(e.target.value))}
                  style={{ width: '100%', accentColor }} />
                <div className="text-xs text-text-secondary opacity-60">
                  Frames before vibrato starts (0 = off)
                </div>
              </div>

              {/* Hard Restart */}
              <label className="flex items-center gap-2 cursor-pointer">
                <input type="checkbox" checked={hardRestart}
                  onChange={() => {
                    if (!engine) return;
                    const gt = inst?.gatetimer ?? 0;
                    engine.setInstrumentGatetimer?.(currentInstrument, gt ^ 0x40);
                    useGTUltraStore.getState().refreshAllInstruments();
                  }}
                  style={{ accentColor }} />
                <span className="text-xs text-text-secondary">Hard Restart</span>
              </label>
            </div>
          </div>
        </div>

      </div>
    </div>
  );
};
