/**
 * SonixControls.tsx — live editor for Sonix synth instruments.
 *
 * Sonix synth instruments carry the SNX1 synth params (blend/ring, filter bank sweep,
 * envelope). The params are mirrored from the WASM into config.parameters.sonix by the
 * param bridge; editing a knob writes them back through updateInstrument, which re-routes
 * to the live SonixSynth voice (applyConfig → SonixEngine.setSynthParams), so the running
 * song and the preview morph immediately. The base waveform and filter-envelope table are
 * shown as 128-sample canvases.
 */

import React, { useCallback, useEffect, useReducer, useRef } from 'react';
import type { InstrumentConfig } from '@/types';
import { Knob } from '@components/controls/Knob';
import { useInstrumentColors } from '@/hooks/useInstrumentColors';
import { SectionLabel } from '@components/instruments/shared';
import { useInstrumentStore } from '@/stores/useInstrumentStore';
import { readSonixSynthParams, SONIX_PARAM_META } from '@/engine/sonix/sonixInstrument';
import type { SonixSynthParams } from '@/engine/sonix/SonixEngine';

const PANEL_MIN_H = 130;
const WAVE_H = 88;

/** Transparent canvas for a 128-sample signed int8 array (waveform or envelope). */
const ByteCanvas: React.FC<{ data: number[]; color: string; height: number }> = ({ data, color, height }) => {
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
  return <canvas ref={ref} style={{ width: '100%', height: `${height}px`, display: 'block' }} />;
};

interface SonixControlsProps {
  instrument: InstrumentConfig;
}

export const SonixControls: React.FC<SonixControlsProps> = ({ instrument }) => {
  const { accent, knob, panelBg, panelStyle } =
    useInstrumentColors('#33cc99', { knob: '#66ddbb', dim: '#002419' });

  const updateInstrument = useInstrumentStore((s) => s.updateInstrument);

  // configRef pattern — knob callbacks read the current params without stale capture.
  const paramsRef = useRef<SonixSynthParams | null>(readSonixSynthParams(instrument));
  const idRef = useRef(instrument.id);
  const [, bump] = useReducer((x: number) => x + 1, 0);
  useEffect(() => {
    paramsRef.current = readSonixSynthParams(instrument);
    idRef.current = instrument.id;
    bump();
  }, [instrument]);

  const handleChange = useCallback((key: keyof SonixSynthParams, value: number) => {
    const cur = paramsRef.current;
    if (!cur) return;
    const next: SonixSynthParams = { ...cur, [key]: Math.round(value) };
    paramsRef.current = next;
    updateInstrument(idRef.current, {
      parameters: { sonixIndex: next.index, sonix: next },
    } as Parameters<typeof updateInstrument>[1]);
    bump();
  }, [updateInstrument]);

  const params = paramsRef.current;
  if (!params) {
    return (
      <div className="p-4 text-text-muted text-sm font-mono">
        This instrument has no Sonix synth parameters (sample-based instrument).
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-3 p-3 overflow-y-auto synth-controls-flow"
      style={{ maxHeight: 'calc(100vh - 280px)' }}>
      <div className={`rounded-lg border p-3 flex flex-col ${panelBg}`}
        style={{ ...panelStyle, minHeight: PANEL_MIN_H }}>
        <SectionLabel color={accent} label="Base Waveform" />
        <div className="flex-1 flex items-center">
          <ByteCanvas data={params.wave} color={knob} height={WAVE_H} />
        </div>
      </div>

      <div className={`rounded-lg border p-3 flex flex-col ${panelBg}`}
        style={{ ...panelStyle, minHeight: PANEL_MIN_H }}>
        <SectionLabel color={accent} label="Filter Envelope" />
        <div className="flex-1 flex items-center">
          <ByteCanvas data={params.envTable} color={knob} height={WAVE_H} />
        </div>
      </div>

      <div className={`rounded-lg border p-3 flex flex-col ${panelBg}`}
        style={{ ...panelStyle, minHeight: PANEL_MIN_H }}>
        <SectionLabel color={accent} label="Synth Parameters" />
        <div className="flex-1 flex items-center gap-3 flex-wrap">
          {SONIX_PARAM_META.map((m) => (
            <Knob
              key={m.key}
              value={(params[m.key] as number) ?? 0}
              min={m.min}
              max={m.max}
              step={1}
              onChange={(v: number) => handleChange(m.key, v)}
              color={knob}
              label={m.label}
              formatValue={() => String(params[m.key] ?? 0)}
            />
          ))}
        </div>
      </div>
    </div>
  );
};
