/**
 * SonixControls.tsx — live editor for Sonix synth instruments.
 *
 * Sonix synth instruments carry the SNX1 synth params (blend/ring, filter bank sweep,
 * envelope). The params are mirrored from the WASM into config.parameters.sonix by the
 * param bridge; editing a knob writes them back through updateInstrument, which re-routes
 * to the live SonixSynth voice (applyConfig → SonixEngine.setSynthParams), so the running
 * song and the preview morph immediately.
 *
 * Panel order follows the Aegis SONIX V2.0 layout:
 *   Waveform (3 drawable tabs) · Amplitude · Freq · Filter · LFO · Phase · Envelope Generator
 *
 * configRef pattern: `params` is read straight from the `instrument` prop each render via
 * `readSonixSynthParams(instrument)` (no useMemo, no ref read during render). `paramsRef`
 * mirrors it — synced in a ref-only `useEffect` and written optimistically inside `commit()`
 * so rapid successive edits chain off the latest value; callbacks read `paramsRef.current`,
 * never the captured `params`. Keeps react-hooks/refs and set-state-in-effect quiet.
 */

import React, {
  useCallback,
  useEffect,
  useRef,
  useState,
} from 'react';
import type { InstrumentConfig } from '@/types';
import { Knob } from '@components/controls/Knob';
import { Toggle } from '@components/controls/Toggle';
import { Button } from '@components/ui/Button';
import { CustomSelect } from '@components/common/CustomSelect';
import { useInstrumentColors } from '@/hooks/useInstrumentColors';
import { SectionLabel } from '@components/instruments/shared';
import { useInstrumentStore } from '@/stores/useInstrumentStore';
import {
  readSonixSynthParams,
  addHarmonic,
  SONIX_PARAM_META,
} from '@/engine/sonix/sonixInstrument';
import type { SonixSynthParams } from '@/engine/sonix/SonixEngine';

// ─── Constants ────────────────────────────────────────────────────────────────

const WAVE_H = 88;

type WaveTab = 'wave' | 'lfoWave' | 'envTable';

// ─── Helpers ──────────────────────────────────────────────────────────────────

/** Look up metadata for a scalar param (label, min, max). */
const metaFor = (key: keyof SonixSynthParams) =>
  SONIX_PARAM_META.find((m) => m.key === key) ?? { key, label: String(key), min: 0, max: 255 };

/**
 * Decode a raw EG rate value into a human-readable tick count.
 * Format: bits[4:0] = base index; bits[7:5] = shift; ticks = (base+0x21)*8 >> (shift^7).
 */
const decodeRateStep = (raw: number): number => {
  const base = (raw & 0x1f) + 0x21;
  const shift = (raw >> 5) & 0x7;
  return (base * 8) >> (shift ^ 7);
};

// ─── DrawableCanvas ───────────────────────────────────────────────────────────

/**
 * Editable canvas for a 128-sample signed int8 array.
 * Pointer-drag paints into the waveform. `onDraw(x, y, w, h)` is called on every
 * pointer sample; caller maps coordinates to array index + value.
 */
const DrawableCanvas: React.FC<{
  data: number[];
  color: string;
  height: number;
  onDrawStart: () => void;
  onDraw: (x: number, y: number, w: number, h: number) => void;
}> = ({ data, color, height, onDrawStart, onDraw }) => {
  const ref = useRef<HTMLCanvasElement>(null);
  const isDown = useRef(false);

  // Redraw whenever data changes.
  React.useEffect(() => {
    const cvs = ref.current;
    if (!cvs) return;
    const draw = () => {
      const w = cvs.clientWidth || 600;
      const h = height;
      const dpr = window.devicePixelRatio || 1;
      cvs.width = Math.round(w * dpr);
      cvs.height = Math.round(h * dpr);
      const ctx = cvs.getContext('2d');
      if (!ctx) return;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, w, h);
      ctx.strokeStyle = 'rgba(128,128,160,0.22)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(0, h / 2);
      ctx.lineTo(w, h / 2);
      ctx.stroke();
      if (data.length > 1) {
        ctx.strokeStyle = color;
        ctx.lineWidth = 1.25;
        ctx.beginPath();
        for (let i = 0; i < data.length; i++) {
          const x = (i / (data.length - 1)) * w;
          const y = (1 - (data[i] + 128) / 255) * (h - 2) + 1;
          if (i === 0) ctx.moveTo(x, y);
          else ctx.lineTo(x, y);
        }
        ctx.stroke();
      }
    };
    draw();
    const ro = new ResizeObserver(draw);
    ro.observe(cvs);
    return () => ro.disconnect();
  }, [data, color, height]);

  const getCoords = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const cvs = ref.current;
    if (!cvs) return null;
    const rect = cvs.getBoundingClientRect();
    return { x: e.clientX - rect.left, y: e.clientY - rect.top, w: rect.width, h: rect.height };
  };

  return (
    <canvas
      ref={ref}
      style={{ width: '100%', height: `${height}px`, display: 'block', cursor: 'crosshair' }}
      onPointerDown={(e) => {
        isDown.current = true;
        (e.currentTarget as HTMLCanvasElement).setPointerCapture(e.pointerId);
        onDrawStart();
        const c = getCoords(e);
        if (c) onDraw(c.x, c.y, c.w, c.h);
      }}
      onPointerMove={(e) => {
        if (!isDown.current) return;
        const c = getCoords(e);
        if (c) onDraw(c.x, c.y, c.w, c.h);
      }}
      onPointerUp={() => { isDown.current = false; }}
      onPointerCancel={() => { isDown.current = false; }}
    />
  );
};

// ─── Panel wrapper ─────────────────────────────────────────────────────────────

/** Compact labelled panel card using design tokens. */
const Panel: React.FC<{
  label: string;
  accent: string;
  children: React.ReactNode;
}> = ({ label, accent, children }) => (
  <div className="bg-dark-bgSecondary rounded-lg border border-dark-borderLight p-3 flex flex-col gap-2">
    <SectionLabel color={accent} label={label} />
    {children}
  </div>
);

// ─── SonixControls ─────────────────────────────────────────────────────────────

interface SonixControlsProps {
  instrument: InstrumentConfig;
}

const SYNC_OPTIONS = [
  { value: '-1', label: 'Off' },
  { value: '0', label: 'Once' },
  { value: '1', label: 'On' },
];

export const SonixControls: React.FC<SonixControlsProps> = ({ instrument }) => {
  const { accent, knob } = useInstrumentColors('#33cc99', {
    knob: '#66ddbb',
    dim: '#002419',
  });

  const updateInstrument = useInstrumentStore((s) => s.updateInstrument);
  const updateInstrumentRealtime = useInstrumentStore((s) => s.updateInstrumentRealtime);

  // ── Params derivation ─────────────────────────────────────────────────────
  // `params` drives render — read directly from the prop, zero ref access during render.
  // `paramsRef` is written in a ref-only useEffect (no setState → no cascading render) and
  // read only inside callbacks, giving them optimistic state between store round-trips.
  const params = readSonixSynthParams(instrument);
  const paramsRef = useRef<SonixSynthParams | null>(params);
  const idRef = useRef(instrument.id);
  useEffect(() => {
    paramsRef.current = readSonixSynthParams(instrument);
    idRef.current = instrument.id;
  }, [instrument]);

  // ── Waveform tab + Undo snapshot ─────────────────────────────────────────
  const [waveTab, setWaveTab] = useState<WaveTab>('wave');
  const snapshotRef = useRef<number[] | null>(null);

  // ── Harmonic bake amount ─────────────────────────────────────────────────
  const [harmAmt, setHarmAmt] = useState(40);

  // ── Commit helper ─────────────────────────────────────────────────────────
  // Updates paramsRef optimistically so rapid callbacks see fresh state, then routes to the
  // audio engine via the REALTIME store path (rAF-batched state write, no WASM re-export, no
  // cascading editor re-render). The heavy updateInstrument (immediate set + re-export +
  // persistence) runs only once, debounced after the drag settles — otherwise it fired
  // 60×/sec during a knob pull, re-rendering the editor and churning audio.
  const persistTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const commit = useCallback((next: SonixSynthParams) => {
    paramsRef.current = next;
    const payload = {
      parameters: { sonixIndex: next.index, sonix: next },
    } as Parameters<typeof updateInstrument>[1];
    updateInstrumentRealtime(idRef.current, payload);
    if (persistTimer.current) clearTimeout(persistTimer.current);
    persistTimer.current = setTimeout(() => {
      persistTimer.current = null;
      updateInstrument(idRef.current, payload);
    }, 250);
  }, [updateInstrument, updateInstrumentRealtime]);

  // Flush a pending persist on unmount so a change made just before closing isn't lost.
  useEffect(() => () => {
    if (persistTimer.current) {
      clearTimeout(persistTimer.current);
      persistTimer.current = null;
      updateInstrument(idRef.current, {
        parameters: { sonixIndex: paramsRef.current?.index ?? 0, sonix: paramsRef.current },
      } as Parameters<typeof updateInstrument>[1]);
    }
  }, [updateInstrument]);

  // ── Scalar handler ────────────────────────────────────────────────────────
  const handleChange = useCallback((key: keyof SonixSynthParams, value: number) => {
    const cur = paramsRef.current;
    if (!cur) return;
    commit({ ...cur, [key]: Math.round(value) });
  }, [commit]);

  // ── Array handler ─────────────────────────────────────────────────────────
  const handleArrayChange = useCallback(
    (key: 'wave' | 'lfoWave' | 'envTable' | 'egLevels' | 'egRates', arr: number[]) => {
      const cur = paramsRef.current;
      if (!cur) return;
      commit({ ...cur, [key]: arr } as SonixSynthParams);
    },
    [commit],
  );

  // ── EG knob handler ───────────────────────────────────────────────────────
  const handleEgChange = useCallback(
    (bank: 'egLevels' | 'egRates', slot: number, value: number) => {
      const cur = paramsRef.current;
      if (!cur) return;
      const arr = (cur[bank] as number[]).slice();
      arr[slot] = Math.round(value);
      handleArrayChange(bank, arr);
    },
    [handleArrayChange],
  );

  // ── Draw callback ─────────────────────────────────────────────────────────
  const drawAt = useCallback(
    (tab: WaveTab, x: number, y: number, w: number, h: number) => {
      const cur = paramsRef.current;
      if (!cur) return;
      const arr = (cur[tab] as number[]).slice();
      const idx = Math.max(0, Math.min(127, Math.floor((x / w) * 128)));
      const val = Math.max(-128, Math.min(127, Math.round((0.5 - y / h) * 255)));
      arr[idx] = val;
      handleArrayChange(tab, arr);
    },
    [handleArrayChange],
  );

  // ── Harmonic bake ─────────────────────────────────────────────────────────
  const bake = useCallback(
    (h: 2 | 3) => {
      const cur = paramsRef.current;
      if (!cur) return;
      handleArrayChange('wave', addHarmonic(cur.wave, h, harmAmt / 127));
    },
    [handleArrayChange, harmAmt],
  );

  if (!params) {
    return (
      <div className="p-4 text-text-muted text-sm font-mono">
        This instrument has no Sonix synth parameters (sample-based instrument).
      </div>
    );
  }

  // Current waveform array for the active tab.
  const activeWave = params[waveTab] as number[];

  // Meta lookups for scalar panels.
  const mBaseVol     = metaFor('baseVol');
  const mEnvVolScale = metaFor('envVolScale');
  const mSlideRate   = metaFor('slideRate');
  const mEnvPitch    = metaFor('envPitchScale');
  const mFilterBase  = metaFor('filterBase');
  const mFilterEnvS  = metaFor('filterEnvSens');
  const mFilterRange = metaFor('filterRange');
  const mEnvScanRate = metaFor('envScanRate');
  const mEnvDelay    = metaFor('envDelayInit');
  const mC2          = metaFor('c2');
  const mC4          = metaFor('c4');

  return (
    <div
      className="flex flex-col gap-3 p-3 overflow-y-auto synth-controls-flow"
      style={{ maxHeight: 'calc(100vh - 280px)' }}
    >
      {/* ── Waveform ──────────────────────────────────────────────────────── */}
      <Panel label="Waveform" accent={accent}>
        {/* Tab buttons */}
        <div className="flex gap-1">
          {(
            [
              { id: 'wave' as WaveTab, label: 'Oscillator' },
              { id: 'lfoWave' as WaveTab, label: 'LFO' },
              { id: 'envTable' as WaveTab, label: 'Filter Envelope' },
            ] as const
          ).map(({ id, label }) => (
            <Button
              key={id}
              variant={waveTab === id ? 'primary' : 'ghost'}
              onClick={() => setWaveTab(id)}
            >
              {label}
            </Button>
          ))}
        </div>

        {/* Drawable canvas */}
        <DrawableCanvas
          data={activeWave}
          color={knob}
          height={WAVE_H}
          onDrawStart={() => { snapshotRef.current = [...activeWave]; }}
          onDraw={(x, y, w, h) => drawAt(waveTab, x, y, w, h)}
        />

        {/* Ok / Undo */}
        <div className="flex gap-2 items-center">
          <Button
            variant="ghost"
            onClick={() => { snapshotRef.current = null; }}
          >
            Ok
          </Button>
          <Button
            variant="ghost"
            onClick={() => {
              if (snapshotRef.current) {
                handleArrayChange(waveTab, snapshotRef.current);
                snapshotRef.current = null;
              }
            }}
          >
            Undo
          </Button>
        </div>

        {/* Harmonic bake — Oscillator tab only */}
        {waveTab === 'wave' && (
          <div className="flex gap-2 items-center flex-wrap border-t border-dark-borderLight pt-2">
            <span className="text-[10px] font-mono text-text-muted">Add Harmonic:</span>
            <Button variant="ghost" onClick={() => bake(2)}>+2nd</Button>
            <Button variant="ghost" onClick={() => bake(3)}>+3rd</Button>
            <Knob
              value={harmAmt}
              min={0}
              max={127}
              step={1}
              onChange={(v: number) => setHarmAmt(Math.round(v))}
              color={knob}
              label="Amt"
              formatValue={(v: number) => String(Math.round(v))}
            />
          </div>
        )}
      </Panel>

      {/* ── Amplitude ─────────────────────────────────────────────────────── */}
      <Panel label="Amplitude" accent={accent}>
        <div className="flex gap-3 flex-wrap items-center">
          <Knob
            value={params.baseVol}
            min={mBaseVol.min}
            max={mBaseVol.max}
            step={1}
            onChange={(v: number) => handleChange('baseVol', v)}
            color={knob}
            label={mBaseVol.label}
            formatValue={(v: number) => String(Math.round(v))}
          />
          <Knob
            value={params.envVolScale}
            min={mEnvVolScale.min}
            max={mEnvVolScale.max}
            step={1}
            onChange={(v: number) => handleChange('envVolScale', v)}
            color={knob}
            label={mEnvVolScale.label}
            formatValue={(v: number) => String(Math.round(v))}
          />
          <Toggle
            label="Porta → Volume"
            value={params.portFlag === 1}
            onChange={(on: boolean) => handleChange('portFlag', on ? 1 : 0)}
          />
        </div>
      </Panel>

      {/* ── Frequency ─────────────────────────────────────────────────────── */}
      <Panel label="Frequency" accent={accent}>
        <div className="flex gap-3 flex-wrap items-center">
          <Knob
            value={params.slideRate}
            min={mSlideRate.min}
            max={mSlideRate.max}
            step={1}
            onChange={(v: number) => handleChange('slideRate', v)}
            color={knob}
            label={mSlideRate.label}
            formatValue={(v: number) => String(Math.round(v))}
          />
          <Knob
            value={params.envPitchScale}
            min={mEnvPitch.min}
            max={mEnvPitch.max}
            step={1}
            onChange={(v: number) => handleChange('envPitchScale', v)}
            color={knob}
            label={mEnvPitch.label}
            formatValue={(v: number) => String(Math.round(v))}
          />
        </div>
      </Panel>

      {/* ── Filter ────────────────────────────────────────────────────────── */}
      <Panel label="Filter" accent={accent}>
        <div className="flex gap-3 flex-wrap items-center">
          <Knob
            value={params.filterBase}
            min={mFilterBase.min}
            max={mFilterBase.max}
            step={1}
            onChange={(v: number) => handleChange('filterBase', v)}
            color={knob}
            label={mFilterBase.label}
            formatValue={(v: number) => String(Math.round(v))}
          />
          <Knob
            value={params.filterEnvSens}
            min={mFilterEnvS.min}
            max={mFilterEnvS.max}
            step={1}
            onChange={(v: number) => handleChange('filterEnvSens', v)}
            color={knob}
            label={mFilterEnvS.label}
            formatValue={(v: number) => String(Math.round(v))}
          />
          <Knob
            value={params.filterRange}
            min={mFilterRange.min}
            max={mFilterRange.max}
            step={1}
            onChange={(v: number) => handleChange('filterRange', v)}
            color={knob}
            label={mFilterRange.label}
            formatValue={(v: number) => String(Math.round(v))}
          />
        </div>
      </Panel>

      {/* ── LFO ───────────────────────────────────────────────────────────── */}
      <Panel label="LFO" accent={accent}>
        <div className="flex gap-3 flex-wrap items-center">
          <Knob
            value={params.envScanRate}
            min={mEnvScanRate.min}
            max={mEnvScanRate.max}
            step={1}
            onChange={(v: number) => handleChange('envScanRate', v)}
            color={knob}
            label={mEnvScanRate.label}
            formatValue={(v: number) => String(Math.round(v))}
          />
          <div className="flex flex-col gap-1">
            <span className="text-[10px] font-mono text-text-muted">Sync</span>
            <CustomSelect
              value={String(params.envLoopMode)}
              options={SYNC_OPTIONS}
              onChange={(v: string) => handleChange('envLoopMode', parseInt(v, 10))}
            />
          </div>
          <Knob
            value={params.envDelayInit}
            min={mEnvDelay.min}
            max={mEnvDelay.max}
            step={1}
            onChange={(v: number) => handleChange('envDelayInit', v)}
            color={knob}
            label={mEnvDelay.label}
            formatValue={(v: number) => String(Math.round(v))}
          />
        </div>
      </Panel>

      {/* ── Phase ─────────────────────────────────────────────────────────── */}
      <Panel label="Phase" accent={accent}>
        <div className="flex gap-3 flex-wrap items-center">
          <Knob
            value={params.c2}
            min={mC2.min}
            max={mC2.max}
            step={1}
            onChange={(v: number) => handleChange('c2', v)}
            color={knob}
            label={mC2.label}
            formatValue={(v: number) => String(Math.round(v))}
          />
          <Knob
            value={params.c4}
            min={mC4.min}
            max={mC4.max}
            step={1}
            onChange={(v: number) => handleChange('c4', v)}
            color={knob}
            label={mC4.label}
            formatValue={(v: number) => String(Math.round(v))}
          />
        </div>
      </Panel>

      {/* ── Envelope Generator ────────────────────────────────────────────── */}
      <Panel label="Envelope Generator" accent={accent}>
        <div className="flex flex-col gap-2">
          {/* Levels row */}
          <div className="flex flex-col gap-1">
            <span className="text-[10px] font-mono text-text-secondary">Levels</span>
            <div className="flex gap-3 flex-wrap items-center">
              {([0, 1, 2, 3] as const).map((i) => (
                <Knob
                  key={`egLevel-${i}`}
                  value={params.egLevels[i] ?? 0}
                  min={0}
                  max={255}
                  step={1}
                  onChange={(v: number) => handleEgChange('egLevels', i, v)}
                  color={knob}
                  label={`Level ${i + 1}`}
                  formatValue={(v: number) => String(Math.round(v))}
                />
              ))}
            </div>
          </div>
          {/* Rates row */}
          <div className="flex flex-col gap-1">
            <span className="text-[10px] font-mono text-text-secondary">Rates</span>
            <div className="flex gap-3 flex-wrap items-center">
              {([0, 1, 2, 3] as const).map((i) => {
                const raw = params.egRates[i] ?? 0;
                return (
                  <Knob
                    key={`egRate-${i}`}
                    value={raw}
                    min={0}
                    max={255}
                    step={1}
                    onChange={(v: number) => handleEgChange('egRates', i, v)}
                    color={knob}
                    label={`Rate ${i + 1}`}
                    formatValue={(v: number) => String(decodeRateStep(Math.round(v)))}
                  />
                );
              })}
            </div>
          </div>
        </div>
      </Panel>
    </div>
  );
};
