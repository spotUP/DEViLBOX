/**
 * Cinter4Controls.tsx — live editor for Cinter 4 synth instruments
 *
 * Cinter is a two-oscillator phase-modulation synth. Unlike ProTracker (which can
 * only play a static sample), DEViLBOX edits the 12 synth parameters in realtime:
 * every change re-renders the voice's PCM (cinter4SynthCore) and updates the
 * playable sample, so you hear the result immediately. The 12 params and their
 * display text are 1:1 with the original Cinter GUI; on export they become the
 * ProTracker sample name the Amiga replayer regenerates from.
 */

import React, { useCallback, useEffect, useReducer, useRef } from 'react';
import type { InstrumentConfig } from '@/types';
import { Knob } from '@components/controls/Knob';
import { useInstrumentColors } from '@/hooks/useInstrumentColors';
import { SectionLabel } from '@components/instruments/shared';
import { useInstrumentStore } from '@/stores/useInstrumentStore';
import {
  CINTER4_PARAM_NAMES,
  cinter4ParamMax,
  cinter4ParamDisplay,
  cinter4ParamsToSampleName,
} from '@/lib/import/formats/cinter4Params';
import {
  buildCinter4SampleConfig,
  readCinter4InstrumentParams,
  type Cinter4InstrumentParams,
} from '@/engine/cinter4/cinter4Instrument';
import { renderCinter4Sample } from '@/engine/cinter4/cinter4SynthCore';

const PANEL_MIN_H = 150;
const WAVE_H = 96;
const WAVE_POINTS = 900;

/** Render the voice and decimate it to a fixed number of points spanning the
 *  whole sample, so the editor shows the full attack→decay envelope. */
function previewWaveform(p: Cinter4InstrumentParams): number[] {
  const lengthSamples = Math.max(2, Math.min(p.lengthWords * 2, 32768));
  const pcm = renderCinter4Sample(p.params, lengthSamples, null, p.version);
  const n = Math.min(WAVE_POINTS, pcm.length);
  const out = new Array<number>(n);
  for (let i = 0; i < n; i++) out[i] = pcm[Math.floor((i / n) * pcm.length)];
  return out;
}

/** Responsive, transparent waveform canvas — fills its panel width at a fixed
 *  height, no backdrop. */
const CinterWaveform: React.FC<{ data: number[]; color: string; height: number }> = ({ data, color, height }) => {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
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
      ctx.clearRect(0, 0, w, h); // transparent — let the panel show through
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
  return <canvas ref={ref} style={{ width: '100%', height: `${height}px`, display: 'block' }} />;
};

interface Cinter4ControlsProps {
  instrument: InstrumentConfig;
}

const PARAM_LABELS: Record<number, string> = {
  0: 'Attack', 1: 'Decay',
  2: 'Mod Pitch', 4: 'Base Pitch',
  3: 'M.Pitch Decay', 5: 'B.Pitch Decay',
  6: 'Mod', 7: 'Mod Decay',
  8: 'Mod Dist', 9: 'Base Dist', 10: 'V.Power', 11: 'Final Dist',
};

// Section groupings (param indices), matching the Cinter README.
const SECTIONS: { label: string; idx: number[] }[] = [
  { label: 'Envelope',    idx: [0, 1] },
  { label: 'Pitch',       idx: [2, 4] },
  { label: 'Pitch Decay', idx: [3, 5] },
  { label: 'Modulation',  idx: [6, 7] },
  { label: 'Distortion',  idx: [8, 9, 10, 11] },
];

export const Cinter4Controls: React.FC<Cinter4ControlsProps> = ({ instrument }) => {
  const { accent, knob, dim, panelBg, panelStyle } =
    useInstrumentColors('#3399ff', { knob: '#66bbff', dim: '#001433' });

  // Use the full update path (not the knob fast-path): regenerating the voice
  // means replacing the sample buffer, which only updateInstrument re-routes to
  // the audio engine (the realtime path is volume/param-only and skips samples).
  const updateInstrument = useInstrumentStore((s) => s.updateInstrument);

  // Mirror the editable params in a ref so knob callbacks never capture stale
  // state (configRef pattern — see docs/CONTROL_PATTERNS.md).
  const cfgRef = useRef<Cinter4InstrumentParams | null>(readCinter4InstrumentParams(instrument));
  const idRef = useRef(instrument.id);
  // Bump to redraw the waveform after a ref-based param change / instrument switch.
  const [, bumpTick] = useReducer((x: number) => x + 1, 0);
  useEffect(() => {
    cfgRef.current = readCinter4InstrumentParams(instrument);
    idRef.current = instrument.id;
    bumpTick();
  }, [instrument]);

  const handleChange = useCallback((index: number, value: number) => {
    const cur = cfgRef.current;
    if (!cur) return;
    const params = cur.params.slice();
    params[index] = Math.round(value);
    const next: Cinter4InstrumentParams = { ...cur, params };
    cfgRef.current = next;

    // Re-render the voice and push sample + params live (recreates the sampler).
    const sample = buildCinter4SampleConfig(next);
    updateInstrument(idRef.current, {
      sample,
      parameters: {
        [`p${index}`]: params[index],
        sampleName: cinter4ParamsToSampleName(params),
      } as Record<string, unknown>,
    });
    bumpTick(); // redraw the waveform preview
  }, [updateInstrument]);

  const params = cfgRef.current;
  if (!params) {
    return (
      <div className="p-4 text-text-muted text-sm font-mono">
        This instrument has no Cinter synth parameters.
      </div>
    );
  }

  const renderKnob = (i: number) => {
    const disp = cinter4ParamDisplay(i, params.params[i]);
    return (
      <Knob
        key={i}
        value={params.params[i]}
        min={0}
        max={cinter4ParamMax(i)}
        step={1}
        onChange={(v: number) => handleChange(i, v)}
        color={knob}
        label={PARAM_LABELS[i] ?? CINTER4_PARAM_NAMES[i]}
        formatValue={() => (disp.label ? `${disp.value} ${disp.label}` : disp.value)}
      />
    );
  };

  const wave = previewWaveform(params);

  return (
    <div className="flex flex-col gap-3 p-3 overflow-y-auto synth-controls-flow"
      style={{ maxHeight: 'calc(100vh - 280px)' }}>
      {/* Live voice waveform — reshapes as params change */}
      <div className={`rounded-lg border p-3 flex flex-col ${panelBg}`}
        style={{ ...panelStyle, minHeight: PANEL_MIN_H }}>
        <SectionLabel color={accent} label="Waveform" />
        <div className="flex-1 flex items-center">
          <CinterWaveform data={wave} color={knob} height={WAVE_H} />
        </div>
      </div>

      {SECTIONS.map((sec) => (
        <div key={sec.label} className={`rounded-lg border p-3 flex flex-col ${panelBg}`}
          style={{ ...panelStyle, minHeight: PANEL_MIN_H }}>
          <SectionLabel color={accent} label={sec.label} />
          <div className="flex-1 flex items-center gap-3 flex-wrap">
            {sec.idx.map(renderKnob)}
          </div>
        </div>
      ))}

      <div className="text-[9px] font-mono px-1" style={{ color: dim }}>
        Live Cinter synth — params regenerate the voice and export as the sample
        name <span style={{ color: knob }}>{params && cinter4ParamsToSampleName(params.params)}</span>
      </div>
    </div>
  );
};
