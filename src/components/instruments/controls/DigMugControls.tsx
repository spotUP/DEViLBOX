/**
 * DigMugControls.tsx -- Digital Mugician (V1/V2) instrument editor
 *
 * Exposes all DigMugConfig parameters: 4-wave selector, blend position,
 * morph speed, volume, vibrato, and arpeggio table.
 *
 * Enhanced with:
 *  - WaveformThumbnail: mini visual previews on each of the 4 wave slots
 *  - PatternEditorCanvas: vertical tracker-style arpeggio table editor
 */

import React, { useRef, useEffect, useCallback, useState, useMemo } from 'react';
import type { DigMugConfig, UADEChipRamInfo } from '@/types/instrument';
import { Knob } from '@components/controls/Knob';
import { CustomSelect } from '@components/common/CustomSelect';
import { useInstrumentColors } from '@/hooks/useInstrumentColors';
import { SectionLabel, WaveformThumbnail } from '@components/instruments/shared';
import { PatternEditorCanvas } from '@/components/tracker/PatternEditorCanvas';
import type { ColumnDef, FormatChannel, FormatCell, OnCellChange } from '@/components/shared/format-editor-types';
import { UADEChipEditor } from '@/engine/uade/UADEChipEditor';
import { UADEEngine } from '@/engine/uade/UADEEngine';
import { DigMugEngine } from '@/engine/digmug/DigMugEngine';
import { writeWaveformByte } from '@/lib/jamcracker/waveformDraw';

interface DigMugControlsProps {
  config: DigMugConfig;
  onChange: (updates: Partial<DigMugConfig>) => void;
  arpPlaybackPosition?: number;
  /** Present when this instrument was loaded via UADE's native DigMug parser. */
  uadeChipRam?: UADEChipRamInfo;
}

type DMTab = 'main' | 'arpeggio' | 'sample';

// Built-in Digital Mugician waveform names + shape hints
const DM_WAVES: { name: string; type: 'sine' | 'triangle' | 'saw' | 'square' | 'pulse25' | 'pulse12' | 'noise' }[] = [
  { name: 'Sine',      type: 'sine'     },
  { name: 'Triangle',  type: 'triangle' },
  { name: 'Sawtooth',  type: 'saw'      },
  { name: 'Square',    type: 'square'   },
  { name: 'Pulse 25%', type: 'pulse25'  },
  { name: 'Pulse 12%', type: 'pulse12'  },
  { name: 'Noise',     type: 'noise'    },
  { name: 'Organ 1',   type: 'sine'     },
  { name: 'Organ 2',   type: 'sine'     },
  { name: 'Brass',     type: 'saw'      },
  { name: 'String',    type: 'saw'      },
  { name: 'Bell',      type: 'sine'     },
  { name: 'Piano',     type: 'triangle' },
  { name: 'Flute',     type: 'sine'     },
  { name: 'Reed',      type: 'square'   },
];

// -- Arpeggio adapter (inline -- single column) ---

function signedHex2(val: number): string {
  if (val === 0) return ' 00';
  const abs = Math.abs(val);
  const sign = val < 0 ? '-' : '+';
  return `${sign}${abs.toString(16).toUpperCase().padStart(2, '0')}`;
}

const ARP_COLUMN: ColumnDef[] = [
  {
    key: 'semitone',
    label: 'ST',
    charWidth: 3,
    type: 'hex',
    color: '#aaff44',
    emptyColor: 'var(--color-border-light)',
    emptyValue: 0,
    hexDigits: 2,
    formatter: signedHex2,
  },
];

function arpToFormatChannel(data: number[]): FormatChannel[] {
  const rows: FormatCell[] = data.map((v) => ({ semitone: v }));
  return [{ label: 'Arp', patternLength: data.length, rows, isPatternChannel: false }];
}

function makeArpCellChange(
  data: number[],
  onChangeData: (d: number[]) => void,
): OnCellChange {
  return (_ch: number, row: number, _col: string, value: number) => {
    const next = [...data];
    next[row] = value > 127 ? value - 256 : (value > 63 ? value - 128 : value);
    onChangeData(next);
  };
}

// -- Component ---

export const DigMugControls: React.FC<DigMugControlsProps> = ({
  config,
  onChange,
  arpPlaybackPosition,
  uadeChipRam,
}) => {
  const [activeTab, setActiveTab] = useState<DMTab>('main');

  const configRef = useRef(config);
  useEffect(() => { configRef.current = config; }, [config]);

  const chipEditorRef = useRef<UADEChipEditor | null>(null);
  const getEditor = useCallback(() => {
    if (!chipEditorRef.current) {
      chipEditorRef.current = new UADEChipEditor(UADEEngine.getInstance());
    }
    return chipEditorRef.current;
  }, []);

  const { isCyan, accent, knob, dim, panelBg, panelStyle } = useInstrumentColors('#aaff44', { knob: '#bbff66', dim: '#1a3300' });

  const upd = useCallback(<K extends keyof DigMugConfig>(key: K, value: DigMugConfig[K]) => {
    onChange({ [key]: value } as Partial<DigMugConfig>);
    // Push numeric params to WASM engine if running
    if (typeof value === 'number' && DigMugEngine.hasInstance()) {
      const paramMap: Record<string, string> = {
        volume: 'volume', vibSpeed: 'vibSpeed', vibDepth: 'vibDepth',
        waveBlend: 'waveBlend', waveSpeed: 'waveSpeed', arpSpeed: 'arpSpeed',
      };
      const wasmKey = paramMap[key as string];
      if (wasmKey) DigMugEngine.getInstance().setInstrumentParam(0, wasmKey, value);
    }
  }, [onChange]);

  const updWithChipRam = useCallback(
    (key: keyof DigMugConfig, value: number, byteOffset: number) => {
      upd(key as Parameters<typeof upd>[0], value as Parameters<typeof upd>[1]);
      if (uadeChipRam) {
        void getEditor().writeU8(uadeChipRam.instrBase + byteOffset, value & 0xFF);
      }
    },
    [upd, uadeChipRam, getEditor],
  );

  const handleExport = useCallback(async () => {
    if (!uadeChipRam) return;
    try {
      await getEditor().exportModule(
        uadeChipRam.moduleBase,
        uadeChipRam.moduleSize,
        'digmug_module.dm',
      );
    } catch (e) { console.error('[DigMugControls] Export failed:', e); }
  }, [uadeChipRam, getEditor]);

  const updateWavetable = useCallback((slot: 0 | 1 | 2 | 3, value: number) => {
    const wt: [number, number, number, number] = [...configRef.current.wavetable] as [number, number, number, number];
    wt[slot] = value;
    onChange({ wavetable: wt });

    if (uadeChipRam) {
      const byteOffset = slot === 0 ? 0 : slot === 2 ? 12 : slot === 3 ? 13 : -1;
      if (byteOffset >= 0) {
        void getEditor().writeU8(uadeChipRam.instrBase + byteOffset, value & 0xFF);
      }
    }
  }, [onChange, uadeChipRam, getEditor]);

  // -- MAIN TAB ---
  const renderMain = () => (
    <div className="flex flex-col gap-3 p-3 overflow-y-auto" style={{ maxHeight: 'calc(100vh - 280px)' }}>
      <div className={`rounded-lg border p-3 ${panelBg}`} style={panelStyle}>
        <SectionLabel color={accent} label="Wavetable Slots (4 waves)" />
        <div className="grid grid-cols-4 gap-2 mb-3">
          {([0, 1, 2, 3] as const).map((slot) => {
            const waveIdx = config.wavetable[slot];
            const waveDef = DM_WAVES[waveIdx] ?? DM_WAVES[0];
            return (
              <div key={slot} className="flex flex-col gap-1">
                <span className="text-[10px] text-text-muted text-center">Wave {slot + 1}</span>
                <div className="rounded overflow-hidden border" style={{ borderColor: dim }}>
                  <WaveformThumbnail type={waveDef.type} width={72} height={28} color={accent} style="line" />
                </div>
                <CustomSelect
                  value={String(waveIdx)}
                  onChange={(v) => updateWavetable(slot, parseInt(v))}
                  options={DM_WAVES.map((w, i) => ({ value: String(i), label: `${i}: ${w.name}` }))}
                  className="text-[9px] font-mono border rounded px-1 py-0.5"
                  style={{ background: '#0a0f00', borderColor: dim, color: accent }}
                />
              </div>
            );
          })}
        </div>
        <div className="flex gap-4">
          <Knob value={config.waveBlend} min={0} max={63} step={1}
            onChange={(v) => updWithChipRam('waveBlend', Math.round(v), 6)}
            label="Blend Pos" color={knob} formatValue={(v) => Math.round(v).toString()} />
          <Knob value={config.waveSpeed} min={0} max={63} step={1}
            onChange={(v) => updWithChipRam('waveSpeed', Math.round(v), 14)}
            label="Morph Spd" color={knob} formatValue={(v) => Math.round(v).toString()} />
        </div>
        <div className="mt-2 h-3 rounded overflow-hidden" style={{ background: 'var(--color-bg-secondary)', border: `1px solid ${dim}` }}>
          <div className="h-full transition-all" style={{
            width: `${(config.waveBlend / 63) * 100}%`,
            background: `linear-gradient(to right, ${accent}88, ${accent})`,
          }} />
        </div>
        <div className="flex justify-between text-[9px] text-text-muted mt-0.5">
          <span>W1</span><span>W2</span><span>W3</span><span>W4</span>
        </div>
      </div>
      <div className={`rounded-lg border p-3 ${panelBg}`} style={panelStyle}>
        <SectionLabel color={accent} label="Volume & Vibrato" />
        <div className="flex gap-4">
          <Knob value={config.volume} min={0} max={64} step={1}
            onChange={(v) => updWithChipRam('volume', Math.round(v), 2)}
            label="Volume" color={knob} size="md" formatValue={(v) => Math.round(v).toString()} />
          <Knob value={config.vibSpeed} min={0} max={63} step={1}
            onChange={(v) => updWithChipRam('vibSpeed', Math.round(v), 5)}
            label="Vib Speed" color={knob} formatValue={(v) => Math.round(v).toString()} />
          <Knob value={config.vibDepth} min={0} max={63} step={1}
            onChange={(v) => updWithChipRam('vibDepth', Math.round(v), 7)}
            label="Vib Depth" color={knob} formatValue={(v) => Math.round(v).toString()} />
        </div>
      </div>
    </div>
  );

  // -- SAMPLE TAB ---
  // DigMug instruments are either:
  //   * synth   → 128-byte signed waveformData (drawable)
  //   * PCM     → raw pcmData buffer + loopStart / loopLength (read-only preview)
  // Discriminator: presence of waveformData vs pcmData on the config.
  const hasWaveform = !!config.waveformData;
  const hasPcm      = !!config.pcmData;

  const waveCanvasRef = useRef<HTMLCanvasElement>(null);
  const pcmCanvasRef  = useRef<HTMLCanvasElement>(null);
  const isDrawingRef  = useRef(false);
  const lastIdxRef    = useRef(-1);

  // --- Draw the synth waveform editor canvas ---
  const drawWave = useCallback(() => {
    const canvas = waveCanvasRef.current;
    const wf = configRef.current.waveformData;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    const dpr = window.devicePixelRatio || 1;
    const cssW = canvas.clientWidth || 320;
    const cssH = canvas.clientHeight || 120;
    canvas.width  = cssW * dpr;
    canvas.height = cssH * dpr;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.scale(dpr, dpr);
    const w = cssW, h = cssH, mid = h / 2;
    ctx.clearRect(0, 0, w, h);
    ctx.fillStyle = '#0a0f00';
    ctx.fillRect(0, 0, w, h);
    ctx.strokeStyle = dim;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(0, mid); ctx.lineTo(w, mid);
    ctx.stroke();
    if (!wf || wf.length === 0) {
      ctx.fillStyle = '#4a5a3a';
      ctx.font = '11px monospace';
      ctx.textAlign = 'center';
      ctx.fillText('No waveform data', w / 2, mid);
      return;
    }
    ctx.strokeStyle = accent;
    ctx.lineWidth = 2;
    ctx.beginPath();
    for (let x = 0; x < w; x++) {
      const idx = Math.floor((x / w) * wf.length) % wf.length;
      const s = wf[idx] > 127 ? wf[idx] - 256 : wf[idx];
      const y = mid - (s / 128) * (mid - 4);
      if (x === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.stroke();
  }, [accent, dim]);

  useEffect(() => {
    if (activeTab !== 'sample' || !hasWaveform) return;
    const raf = requestAnimationFrame(() => drawWave());
    const obs = new ResizeObserver(() => drawWave());
    if (waveCanvasRef.current) obs.observe(waveCanvasRef.current);
    return () => { cancelAnimationFrame(raf); obs.disconnect(); };
  }, [activeTab, hasWaveform, drawWave, config.waveformData]);

  const writeWaveByteFromEvent = useCallback((e: React.PointerEvent<HTMLCanvasElement>) => {
    const cur = configRef.current;
    if (!cur.waveformData) return;
    const canvas = waveCanvasRef.current;
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
    onChange({ waveformData: next });
  }, [onChange]);

  const handleWavePointerDown = useCallback((e: React.PointerEvent<HTMLCanvasElement>) => {
    if (!configRef.current.waveformData) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    isDrawingRef.current = true;
    lastIdxRef.current = -1;
    writeWaveByteFromEvent(e);
  }, [writeWaveByteFromEvent]);

  const handleWavePointerMove = useCallback((e: React.PointerEvent<HTMLCanvasElement>) => {
    if (!isDrawingRef.current) return;
    writeWaveByteFromEvent(e);
  }, [writeWaveByteFromEvent]);

  const handleWavePointerUp = useCallback((e: React.PointerEvent<HTMLCanvasElement>) => {
    isDrawingRef.current = false;
    lastIdxRef.current = -1;
    try { e.currentTarget.releasePointerCapture(e.pointerId); } catch { /* noop */ }
  }, []);

  // Built-in waveform shape presets so users can quickly fill the buffer.
  const applyWavePreset = useCallback((kind: 'sine' | 'triangle' | 'square' | 'saw' | 'noise' | 'clear') => {
    const cur = configRef.current;
    const size = Math.max(1, cur.waveformData?.length ?? 128);
    const out = new Uint8Array(size);
    for (let i = 0; i < size; i++) {
      const t = i / size;
      let v = 0;
      switch (kind) {
        case 'sine':     v = Math.round(Math.sin(t * Math.PI * 2) * 127); break;
        case 'triangle': v = Math.round((t < 0.25 ? 4*t : t < 0.75 ? 2 - 4*t : -4 + 4*t) * 127); break;
        case 'square':   v = t < 0.5 ? 127 : -127; break;
        case 'saw':      v = Math.round((2 * t - 1) * 127); break;
        case 'noise':    v = Math.round((Math.random() * 2 - 1) * 127); break;
        case 'clear':    v = 0; break;
      }
      out[i] = v < 0 ? v + 256 : v;
    }
    onChange({ waveformData: out });
  }, [onChange]);

  // --- Draw the PCM read-only preview ---
  const drawPcm = useCallback(() => {
    const canvas = pcmCanvasRef.current;
    const pcm = configRef.current.pcmData;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    const dpr = window.devicePixelRatio || 1;
    const cssW = canvas.clientWidth || 320;
    const cssH = canvas.clientHeight || 120;
    canvas.width  = cssW * dpr;
    canvas.height = cssH * dpr;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.scale(dpr, dpr);
    const w = cssW, h = cssH, mid = h / 2;
    ctx.clearRect(0, 0, w, h);
    ctx.fillStyle = '#0a0f00';
    ctx.fillRect(0, 0, w, h);
    ctx.strokeStyle = dim;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(0, mid); ctx.lineTo(w, mid);
    ctx.stroke();
    if (!pcm || pcm.length === 0) {
      ctx.fillStyle = '#4a5a3a';
      ctx.font = '11px monospace';
      ctx.textAlign = 'center';
      ctx.fillText('No PCM data', w / 2, mid);
      return;
    }

    // Loop region shading
    const loopStart  = configRef.current.loopStart  ?? 0;
    const loopLength = configRef.current.loopLength ?? 0;
    if (loopLength > 0) {
      const x0 = Math.floor((loopStart / pcm.length) * w);
      const x1 = Math.min(w, Math.floor(((loopStart + loopLength) / pcm.length) * w));
      ctx.fillStyle = `${accent}22`;
      ctx.fillRect(x0, 0, Math.max(1, x1 - x0), h);
      ctx.strokeStyle = accent;
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(x0 + 0.5, 0); ctx.lineTo(x0 + 0.5, h);
      ctx.moveTo(x1 - 0.5, 0); ctx.lineTo(x1 - 0.5, h);
      ctx.stroke();
    }

    // PCM is signed 8-bit (two's complement) per the parser.
    ctx.strokeStyle = accent;
    ctx.lineWidth = 1;
    ctx.beginPath();
    const step = Math.max(1, Math.floor(pcm.length / w));
    for (let x = 0; x < w; x++) {
      let min = 127, max = -128;
      const start = Math.floor((x / w) * pcm.length);
      const end   = Math.min(pcm.length, start + step);
      for (let i = start; i < end; i++) {
        const s = pcm[i] > 127 ? pcm[i] - 256 : pcm[i];
        if (s < min) min = s;
        if (s > max) max = s;
      }
      const yMin = mid - (max / 128) * (mid - 2);
      const yMax = mid - (min / 128) * (mid - 2);
      ctx.moveTo(x + 0.5, yMin);
      ctx.lineTo(x + 0.5, yMax);
    }
    ctx.stroke();
  }, [accent, dim]);

  useEffect(() => {
    if (activeTab !== 'sample' || !hasPcm) return;
    const raf = requestAnimationFrame(() => drawPcm());
    const obs = new ResizeObserver(() => drawPcm());
    if (pcmCanvasRef.current) obs.observe(pcmCanvasRef.current);
    return () => { cancelAnimationFrame(raf); obs.disconnect(); };
  }, [activeTab, hasPcm, drawPcm, config.pcmData, config.loopStart, config.loopLength]);

  const pcmLen = config.pcmData?.length ?? 0;
  const updateLoopStart = useCallback((raw: number) => {
    const max = configRef.current.pcmData?.length ?? 0;
    const v = Math.max(0, Math.min(max, Math.floor(raw)));
    onChange({ loopStart: v });
  }, [onChange]);
  const updateLoopLength = useCallback((raw: number) => {
    const max = configRef.current.pcmData?.length ?? 0;
    const start = configRef.current.loopStart ?? 0;
    const v = Math.max(0, Math.min(Math.max(0, max - start), Math.floor(raw)));
    onChange({ loopLength: v });
  }, [onChange]);

  const renderSample = () => (
    <div className="flex flex-col gap-3 p-3 overflow-y-auto" style={{ maxHeight: 'calc(100vh - 280px)' }}>
      {hasWaveform && (
        <div className={`rounded-lg border p-3 ${panelBg}`} style={panelStyle}>
          <div className="flex items-center justify-between mb-2">
            <SectionLabel color={accent} label="Synth Waveform — click + drag to draw" />
            <div className="flex gap-1">
              {(['sine','triangle','square','saw','noise','clear'] as const).map((k) => (
                <button
                  key={k}
                  onClick={() => applyWavePreset(k)}
                  className="text-[9px] font-mono px-1.5 py-0.5 rounded border uppercase"
                  style={{ borderColor: dim, color: accent, background: 'rgba(40,80,20,0.2)' }}
                  title={`Fill waveform with ${k}`}
                >{k}</button>
              ))}
            </div>
          </div>
          <canvas
            ref={waveCanvasRef}
            className="w-full rounded border cursor-crosshair"
            style={{ height: 140, borderColor: dim, background: '#0a0f00', touchAction: 'none' }}
            onPointerDown={handleWavePointerDown}
            onPointerMove={handleWavePointerMove}
            onPointerUp={handleWavePointerUp}
            onPointerCancel={handleWavePointerUp}
          />
          <div className="mt-1 text-[9px] font-mono text-text-muted">
            {config.waveformData?.length ?? 0} bytes (signed 8-bit)
          </div>
        </div>
      )}

      {hasPcm && (
        <div className={`rounded-lg border p-3 ${panelBg}`} style={panelStyle}>
          <div className="flex items-center justify-between mb-2">
            <SectionLabel color={accent} label="PCM Sample (read-only)" />
            <span className="text-[9px] font-mono text-text-muted">
              {pcmLen.toLocaleString()} bytes
            </span>
          </div>
          <canvas
            ref={pcmCanvasRef}
            className="w-full rounded border"
            style={{ height: 140, borderColor: dim, background: '#0a0f00' }}
          />
          <div className="grid grid-cols-2 gap-3 mt-3">
            <label className="flex flex-col gap-1">
              <span className="text-[10px] font-mono uppercase tracking-wider" style={{ color: accent }}>
                Loop Start
              </span>
              <input
                type="number"
                min={0}
                max={pcmLen}
                step={1}
                value={config.loopStart ?? 0}
                onChange={(e) => updateLoopStart(parseInt(e.target.value || '0', 10))}
                className="text-xs font-mono border rounded px-2 py-1"
                style={{ background: '#0a0f00', borderColor: dim, color: accent }}
              />
            </label>
            <label className="flex flex-col gap-1">
              <span className="text-[10px] font-mono uppercase tracking-wider" style={{ color: accent }}>
                Loop Length
              </span>
              <input
                type="number"
                min={0}
                max={Math.max(0, pcmLen - (config.loopStart ?? 0))}
                step={1}
                value={config.loopLength ?? 0}
                onChange={(e) => updateLoopLength(parseInt(e.target.value || '0', 10))}
                className="text-xs font-mono border rounded px-2 py-1"
                style={{ background: '#0a0f00', borderColor: dim, color: accent }}
              />
            </label>
          </div>
          <div className="text-[9px] font-mono text-text-muted mt-1">
            Loop end: {((config.loopStart ?? 0) + (config.loopLength ?? 0)).toLocaleString()} / {pcmLen.toLocaleString()}
          </div>
        </div>
      )}

      {!hasWaveform && !hasPcm && (
        <div className={`rounded-lg border p-6 ${panelBg} text-center text-xs font-mono text-text-muted`} style={panelStyle}>
          No sample data on this instrument.
        </div>
      )}
    </div>
  );

  // -- ARPEGGIO TAB ---
  const arpChannels = useMemo(() => arpToFormatChannel(config.arpTable), [config.arpTable]);
  const arpCellChange = useMemo(
    () => makeArpCellChange(config.arpTable, (d) => upd('arpTable', d)),
    [config.arpTable, upd],
  );

  const renderArpeggio = () => (
    <div className="flex flex-col gap-3 p-3" style={{ height: 'calc(100vh - 280px)' }}>
      <div className={`rounded-lg border p-3 ${panelBg} flex flex-col`} style={{ ...panelStyle, flex: 1, minHeight: 0 }}>
        <div className="flex items-center justify-between mb-3">
          <SectionLabel color={accent} label="Arpeggio Speed" />
          <Knob value={config.arpSpeed} min={0} max={15} step={1}
            onChange={(v) => {
              const val = Math.round(v);
              upd('arpSpeed', val);
              if (uadeChipRam) {
                void getEditor().writeU8(uadeChipRam.instrBase + 14, Math.round(val * 17) & 0xFF);
              }
            }}
            label="Speed" color={knob} formatValue={(v) => Math.round(v).toString()} />
        </div>
        <div style={{ flex: 1, minHeight: 120 }}>
          <PatternEditorCanvas
            formatColumns={ARP_COLUMN}
            formatChannels={arpChannels}
            formatCurrentRow={arpPlaybackPosition ?? 0}
            formatIsPlaying={arpPlaybackPosition !== undefined}
            onFormatCellChange={arpCellChange}
            hideVUMeters={true}
          />
        </div>
      </div>
    </div>
  );

  return (
    <div className="flex flex-col h-full">
      <div className="flex border-b" style={{ borderColor: dim }}>
        {([['main', 'Parameters'], ['arpeggio', 'Arpeggio'], ['sample', 'Sample']] as const).map(([id, label]) => (
          <button key={id}
            onClick={() => setActiveTab(id)}
            className="px-4 py-2 text-xs font-bold uppercase tracking-wider transition-colors"
            style={{
              color: activeTab === id ? accent : '#666',
              borderBottom: activeTab === id ? `2px solid ${accent}` : '2px solid transparent',
              background: activeTab === id ? (isCyan ? '#041510' : '#0a1400') : 'transparent',
            }}>
            {label}
          </button>
        ))}
      </div>
      {activeTab === 'main'     && renderMain()}
      {activeTab === 'arpeggio' && renderArpeggio()}
      {activeTab === 'sample'   && renderSample()}
      {uadeChipRam && (
        <div className="flex justify-end px-3 py-2 border-t border-opacity-30"
          style={{ borderColor: dim }}>
          <button
            className="text-[10px] px-2 py-1 rounded opacity-70 hover:opacity-100 transition-colors"
            style={{ background: 'rgba(40,80,20,0.3)', color: '#aaff44' }}
            onClick={() => void handleExport()}
          >
            Export .dm (Amiga)
          </button>
        </div>
      )}
    </div>
  );
};
