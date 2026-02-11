/**
 * Odin2Controls - Custom panel for Odin2 Semi-Modular Hybrid Synth
 *
 * 44 parameters organized into 5 sections:
 * Oscillators (3x), Filters (2x), Envelopes (2x), Routing, Master.
 * Interacts with VSTBridge synth via setParameter().
 * Falls back to VSTBridgePanel if synth not yet loaded.
 */

import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Knob } from '@components/controls/Knob';
import { Loader } from 'lucide-react';
import { useThemeStore } from '@stores';
import { getToneEngine } from '@engine/ToneEngine';
import type { InstrumentConfig } from '@typedefs/instrument';
import type { VSTBridgeSynth } from '@engine/vstbridge/VSTBridgeSynth';
import { VSTBridgePanel } from './VSTBridgePanel';

// Parameter IDs matching Odin2WASM.cpp
const P = {
  OSC1_TYPE: 0, OSC1_VOL: 1, OSC1_OCT: 2, OSC1_SEMI: 3, OSC1_FINE: 4,
  OSC2_TYPE: 5, OSC2_VOL: 6, OSC2_OCT: 7, OSC2_SEMI: 8, OSC2_FINE: 9,
  OSC3_TYPE: 10, OSC3_VOL: 11, OSC3_OCT: 12, OSC3_SEMI: 13, OSC3_FINE: 14,
  FIL1_TYPE: 15, FIL1_FREQ: 16, FIL1_RES: 17, FIL1_GAIN: 18,
  FIL1_OSC1: 19, FIL1_OSC2: 20, FIL1_OSC3: 21,
  FIL2_TYPE: 22, FIL2_FREQ: 23, FIL2_RES: 24, FIL2_GAIN: 25,
  FIL2_OSC1: 26, FIL2_OSC2: 27, FIL2_OSC3: 28, FIL2_FIL1: 29,
  ENV1_A: 30, ENV1_D: 31, ENV1_S: 32, ENV1_R: 33,
  ENV2_A: 34, ENV2_D: 35, ENV2_S: 36, ENV2_R: 37,
  FIL1_ENV_AMT: 38, FIL2_ENV_AMT: 39,
  FIL1_AMP: 40, FIL2_AMP: 41, MASTER_VOL: 42, GLIDE: 43,
} as const;

const OSC_TYPE_LABELS = [
  'Analog', 'Wavetable', 'Multi', 'Vector', 'Chip',
  'FM', 'PM', 'Noise', 'WaveDraw', 'ChipDraw', 'SpecDraw',
];

const FILTER_TYPE_LABELS = [
  'None', 'LP24', 'LP12', 'BP24', 'BP12', 'HP24', 'HP12',
  'SEM12', 'Korg LP', 'Korg HP', 'Diode', 'Formant', 'Comb', 'Ring',
];

interface Odin2ControlsProps {
  instrument: InstrumentConfig;
  onChange: (updates: Partial<InstrumentConfig>) => void;
}

export const Odin2Controls: React.FC<Odin2ControlsProps> = ({
  instrument,
  onChange,
}) => {
  const [params, setParams] = useState<number[]>(new Array(44).fill(0));
  const [synthReady, setSynthReady] = useState(false);
  const synthRef = useRef<VSTBridgeSynth | null>(null);

  const currentThemeId = useThemeStore((state) => state.currentThemeId);
  const isCyanTheme = currentThemeId === 'cyan-lineart';
  const accentColor = isCyanTheme ? '#00ffff' : '#4a9eff';
  const knobColor = isCyanTheme ? '#00ffff' : '#4a9eff';

  // Connect to the VSTBridge synth
  useEffect(() => {
    let cancelled = false;

    const connect = async () => {
      try {
        const engine = getToneEngine();
        const key = `${instrument.id}--1`;
        const synth = engine.instruments?.get(key) as VSTBridgeSynth | null;
        if (!synth || !('setParameter' in synth)) {
          setTimeout(() => { if (!cancelled) connect(); }, 500);
          return;
        }
        if ('ensureInitialized' in synth) {
          await (synth as VSTBridgeSynth).ensureInitialized();
        }
        synthRef.current = synth;
        if ('getParams' in synth) {
          const wasmParams = synth.getParams();
          const vals = wasmParams.map(p => p.defaultValue);
          if (!cancelled) {
            setParams(vals);
            setSynthReady(true);
          }
        } else {
          if (!cancelled) setSynthReady(true);
        }
      } catch (_e) {
        setTimeout(() => { if (!cancelled) connect(); }, 1000);
      }
    };

    connect();
    return () => { cancelled = true; };
  }, [instrument.id]);

  const setParam = useCallback((id: number, value: number) => {
    setParams(prev => {
      const next = [...prev];
      next[id] = value;
      return next;
    });
    if (synthRef.current) {
      synthRef.current.setParameter(id, value);
    }
  }, []);

  if (!synthReady) {
    return (
      <div className="flex flex-col gap-4 p-4">
        <div className="flex items-center justify-center gap-2 p-4 text-gray-400">
          <Loader size={16} className="animate-spin" />
          <span className="text-sm">Loading Odin2...</span>
        </div>
        <VSTBridgePanel instrument={instrument} onChange={onChange} />
      </div>
    );
  }

  const panelBg = isCyanTheme
    ? 'bg-[#051515] border-cyan-900/50'
    : 'bg-[#1a1a1a] border-blue-900/30';

  return (
    <div className="flex flex-col gap-4 p-4 overflow-y-auto">
      {/* ═══ OSCILLATORS ═══ */}
      <div className={`p-4 rounded-xl border ${panelBg}`}>
        <h3
          className="font-bold uppercase tracking-tight text-sm mb-4"
          style={{ color: accentColor }}
        >
          Oscillators
        </h3>
        <div className="flex flex-col gap-4">
          {[0, 1, 2].map(oscIdx => {
            const typeId = P.OSC1_TYPE + oscIdx * 5;
            const volId = typeId + 1;
            const octId = typeId + 2;
            const semiId = typeId + 3;
            const fineId = typeId + 4;

            return (
              <div key={oscIdx} className="flex flex-wrap items-center gap-3">
                <span
                  className="text-xs font-bold w-10 shrink-0"
                  style={{ color: accentColor }}
                >
                  OSC {oscIdx + 1}
                </span>
                {/* Type selector */}
                <div className="flex flex-wrap gap-1">
                  {OSC_TYPE_LABELS.map((label, i) => (
                    <button
                      key={label}
                      onClick={() => setParam(typeId, i)}
                      className={`px-1.5 py-1 text-[9px] font-bold rounded transition-all ${
                        Math.round(params[typeId]) === i
                          ? 'text-black'
                          : 'bg-gray-800 text-gray-400 hover:bg-gray-700'
                      }`}
                      style={Math.round(params[typeId]) === i ? { backgroundColor: accentColor } : {}}
                    >
                      {label}
                    </button>
                  ))}
                </div>
                <div className="flex gap-2 ml-auto">
                  <Knob label="Vol" value={params[volId]} min={0} max={1} defaultValue={0.8}
                    onChange={(v) => setParam(volId, v)} size="sm" color={knobColor} />
                  <Knob label="Oct" value={params[octId]} min={-4} max={4} defaultValue={0} step={1}
                    onChange={(v) => setParam(octId, Math.round(v))} size="sm" color={knobColor}
                    formatValue={(v) => `${v > 0 ? '+' : ''}${Math.round(v)}`} />
                  <Knob label="Semi" value={params[semiId]} min={-12} max={12} defaultValue={0} step={1}
                    onChange={(v) => setParam(semiId, Math.round(v))} size="sm" color={knobColor} bipolar
                    formatValue={(v) => `${v > 0 ? '+' : ''}${Math.round(v)}`} />
                  <Knob label="Fine" value={params[fineId]} min={-1} max={1} defaultValue={0}
                    onChange={(v) => setParam(fineId, v)} size="sm" color={knobColor} bipolar
                    formatValue={(v) => `${(v * 100).toFixed(0)}ct`} />
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* ═══ FILTERS ═══ */}
      <div className={`p-4 rounded-xl border ${panelBg}`}>
        <h3
          className="font-bold uppercase tracking-tight text-sm mb-4"
          style={{ color: accentColor }}
        >
          Filters
        </h3>
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {/* Filter 1 */}
          <div className="flex flex-col gap-3">
            <div className="flex items-center gap-2">
              <span className="text-xs font-bold" style={{ color: accentColor }}>FILTER 1</span>
              <Knob label="Env Amt" value={params[P.FIL1_ENV_AMT]} min={0} max={1} defaultValue={0.5}
                onChange={(v) => setParam(P.FIL1_ENV_AMT, v)} size="sm" color={knobColor}
                formatValue={(v) => `${Math.round(v * 100)}%`} />
            </div>
            <div className="flex flex-wrap gap-1">
              {FILTER_TYPE_LABELS.map((label, i) => (
                <button
                  key={label}
                  onClick={() => setParam(P.FIL1_TYPE, i)}
                  className={`px-1.5 py-1 text-[9px] font-bold rounded transition-all ${
                    Math.round(params[P.FIL1_TYPE]) === i
                      ? 'text-black'
                      : 'bg-gray-800 text-gray-400 hover:bg-gray-700'
                  }`}
                  style={Math.round(params[P.FIL1_TYPE]) === i ? { backgroundColor: accentColor } : {}}
                >
                  {label}
                </button>
              ))}
            </div>
            <div className="flex gap-2 justify-center">
              <Knob label="Freq" value={params[P.FIL1_FREQ]} min={20} max={20000} defaultValue={1000}
                onChange={(v) => setParam(P.FIL1_FREQ, v)} size="sm" color={knobColor} logarithmic
                formatValue={(v) => v >= 1000 ? `${(v/1000).toFixed(1)}k` : `${Math.round(v)}`} />
              <Knob label="Res" value={params[P.FIL1_RES]} min={0} max={1} defaultValue={0}
                onChange={(v) => setParam(P.FIL1_RES, v)} size="sm" color={knobColor} />
              <Knob label="Gain" value={params[P.FIL1_GAIN]} min={0} max={2} defaultValue={1}
                onChange={(v) => setParam(P.FIL1_GAIN, v)} size="sm" color={knobColor}
                formatValue={(v) => `x${v.toFixed(2)}`} />
            </div>
            {/* Source routing */}
            <div className="flex gap-1 justify-center">
              {['Osc1', 'Osc2', 'Osc3'].map((label, i) => {
                const id = P.FIL1_OSC1 + i;
                return (
                  <button
                    key={label}
                    onClick={() => setParam(id, params[id] > 0.5 ? 0 : 1)}
                    className={`px-2 py-1 text-[10px] font-bold rounded transition-all ${
                      params[id] > 0.5
                        ? 'text-black'
                        : 'bg-gray-800 text-gray-500 hover:bg-gray-700'
                    }`}
                    style={params[id] > 0.5 ? { backgroundColor: accentColor } : {}}
                  >
                    {label}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Filter 2 */}
          <div className="flex flex-col gap-3">
            <div className="flex items-center gap-2">
              <span className="text-xs font-bold" style={{ color: accentColor }}>FILTER 2</span>
              <Knob label="Env Amt" value={params[P.FIL2_ENV_AMT]} min={0} max={1} defaultValue={0}
                onChange={(v) => setParam(P.FIL2_ENV_AMT, v)} size="sm" color={knobColor}
                formatValue={(v) => `${Math.round(v * 100)}%`} />
            </div>
            <div className="flex flex-wrap gap-1">
              {FILTER_TYPE_LABELS.map((label, i) => (
                <button
                  key={label}
                  onClick={() => setParam(P.FIL2_TYPE, i)}
                  className={`px-1.5 py-1 text-[9px] font-bold rounded transition-all ${
                    Math.round(params[P.FIL2_TYPE]) === i
                      ? 'text-black'
                      : 'bg-gray-800 text-gray-400 hover:bg-gray-700'
                  }`}
                  style={Math.round(params[P.FIL2_TYPE]) === i ? { backgroundColor: accentColor } : {}}
                >
                  {label}
                </button>
              ))}
            </div>
            <div className="flex gap-2 justify-center">
              <Knob label="Freq" value={params[P.FIL2_FREQ]} min={20} max={20000} defaultValue={1000}
                onChange={(v) => setParam(P.FIL2_FREQ, v)} size="sm" color={knobColor} logarithmic
                formatValue={(v) => v >= 1000 ? `${(v/1000).toFixed(1)}k` : `${Math.round(v)}`} />
              <Knob label="Res" value={params[P.FIL2_RES]} min={0} max={1} defaultValue={0}
                onChange={(v) => setParam(P.FIL2_RES, v)} size="sm" color={knobColor} />
              <Knob label="Gain" value={params[P.FIL2_GAIN]} min={0} max={2} defaultValue={1}
                onChange={(v) => setParam(P.FIL2_GAIN, v)} size="sm" color={knobColor}
                formatValue={(v) => `x${v.toFixed(2)}`} />
            </div>
            {/* Source routing — includes Fil1 cascade */}
            <div className="flex gap-1 justify-center">
              {['Osc1', 'Osc2', 'Osc3', 'Fil1'].map((label, i) => {
                const id = P.FIL2_OSC1 + i;
                return (
                  <button
                    key={label}
                    onClick={() => setParam(id, params[id] > 0.5 ? 0 : 1)}
                    className={`px-2 py-1 text-[10px] font-bold rounded transition-all ${
                      params[id] > 0.5
                        ? 'text-black'
                        : 'bg-gray-800 text-gray-500 hover:bg-gray-700'
                    }`}
                    style={params[id] > 0.5 ? { backgroundColor: accentColor } : {}}
                  >
                    {label}
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      </div>

      {/* ═══ ENVELOPES ═══ */}
      <div className={`p-4 rounded-xl border ${panelBg}`}>
        <h3
          className="font-bold uppercase tracking-tight text-sm mb-4"
          style={{ color: accentColor }}
        >
          Envelopes
        </h3>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {/* Amp EG */}
          <div>
            <span className="text-xs font-bold block mb-2" style={{ color: accentColor }}>
              AMP EG
            </span>
            <div className="flex gap-2 justify-center">
              <Knob label="A" value={params[P.ENV1_A]} min={0} max={5} defaultValue={0.01}
                onChange={(v) => setParam(P.ENV1_A, v)} size="sm" color={knobColor}
                formatValue={(v) => `${(v * 1000).toFixed(0)}ms`} />
              <Knob label="D" value={params[P.ENV1_D]} min={0} max={5} defaultValue={0.3}
                onChange={(v) => setParam(P.ENV1_D, v)} size="sm" color={knobColor}
                formatValue={(v) => `${(v * 1000).toFixed(0)}ms`} />
              <Knob label="S" value={params[P.ENV1_S]} min={0} max={1} defaultValue={0.7}
                onChange={(v) => setParam(P.ENV1_S, v)} size="sm" color={knobColor}
                formatValue={(v) => `${Math.round(v * 100)}%`} />
              <Knob label="R" value={params[P.ENV1_R]} min={0} max={10} defaultValue={0.5}
                onChange={(v) => setParam(P.ENV1_R, v)} size="sm" color={knobColor}
                formatValue={(v) => `${(v * 1000).toFixed(0)}ms`} />
            </div>
          </div>

          {/* Filter EG */}
          <div>
            <span className="text-xs font-bold block mb-2" style={{ color: accentColor }}>
              FILTER EG
            </span>
            <div className="flex gap-2 justify-center">
              <Knob label="A" value={params[P.ENV2_A]} min={0} max={5} defaultValue={0.01}
                onChange={(v) => setParam(P.ENV2_A, v)} size="sm" color={knobColor}
                formatValue={(v) => `${(v * 1000).toFixed(0)}ms`} />
              <Knob label="D" value={params[P.ENV2_D]} min={0} max={5} defaultValue={0.3}
                onChange={(v) => setParam(P.ENV2_D, v)} size="sm" color={knobColor}
                formatValue={(v) => `${(v * 1000).toFixed(0)}ms`} />
              <Knob label="S" value={params[P.ENV2_S]} min={0} max={1} defaultValue={0.5}
                onChange={(v) => setParam(P.ENV2_S, v)} size="sm" color={knobColor}
                formatValue={(v) => `${Math.round(v * 100)}%`} />
              <Knob label="R" value={params[P.ENV2_R]} min={0} max={10} defaultValue={0.5}
                onChange={(v) => setParam(P.ENV2_R, v)} size="sm" color={knobColor}
                formatValue={(v) => `${(v * 1000).toFixed(0)}ms`} />
            </div>
          </div>
        </div>
      </div>

      {/* ═══ ROUTING ═══ */}
      <div className={`p-4 rounded-xl border ${panelBg}`}>
        <h3
          className="font-bold uppercase tracking-tight text-sm mb-3"
          style={{ color: accentColor }}
        >
          Routing
        </h3>
        <div className="flex gap-2 justify-center">
          {['Fil1 → Amp', 'Fil2 → Amp'].map((label, i) => {
            const id = P.FIL1_AMP + i;
            return (
              <button
                key={label}
                onClick={() => setParam(id, params[id] > 0.5 ? 0 : 1)}
                className={`px-3 py-1.5 text-xs font-bold rounded transition-all ${
                  params[id] > 0.5
                    ? 'text-black'
                    : 'bg-gray-800 text-gray-400 hover:bg-gray-700'
                }`}
                style={params[id] > 0.5 ? { backgroundColor: accentColor } : {}}
              >
                {label}
              </button>
            );
          })}
        </div>
      </div>

      {/* ═══ MASTER ═══ */}
      <div className={`p-4 rounded-xl border ${panelBg}`}>
        <h3
          className="font-bold uppercase tracking-tight text-sm mb-3"
          style={{ color: accentColor }}
        >
          Master
        </h3>
        <div className="flex gap-4 justify-center">
          <Knob label="Volume" value={params[P.MASTER_VOL]} min={0} max={1} defaultValue={0.8}
            onChange={(v) => setParam(P.MASTER_VOL, v)} size="md" color={knobColor} />
          <Knob label="Glide" value={params[P.GLIDE]} min={0} max={1} defaultValue={0}
            onChange={(v) => setParam(P.GLIDE, v)} size="md" color={knobColor}
            formatValue={(v) => `${Math.round(v * 1000)}ms`} />
        </div>
      </div>
    </div>
  );
};
