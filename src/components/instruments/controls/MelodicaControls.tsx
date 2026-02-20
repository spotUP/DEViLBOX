/**
 * MelodicaControls - Custom melodica reed instrument editor
 *
 * Breath, tone, vibrato, playing controls with Knob components.
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

// Parameter IDs matching MelodicaSynth.cpp
const P = {
  BREATH:        0,
  BRIGHTNESS:    1,
  VIBRATO_RATE:  2,
  VIBRATO_DEPTH: 3,
  DETUNE:        4,
  NOISE:         5,
  PORTAMENTO:    6,
  ATTACK:        7,
  RELEASE:       8,
  VOLUME:        9,
} as const;

const DEFAULTS = [0.7, 0.5, 4.5, 0.2, 5.0, 0.15, 0.1, 0.15, 0.2, 0.8];

interface MelodicaControlsProps {
  instrument: InstrumentConfig;
  onChange: (updates: Partial<InstrumentConfig>) => void;
}

export const MelodicaControls: React.FC<MelodicaControlsProps> = ({
  instrument,
  onChange,
}) => {
  const [params, setParams] = useState<number[]>([...DEFAULTS]);
  const [synthReady, setSynthReady] = useState(false);
  const synthRef = useRef<VSTBridgeSynth | null>(null);

  const currentThemeId = useThemeStore((state) => state.currentThemeId);
  const isCyanTheme = currentThemeId === 'cyan-lineart';
  const accentColor = isCyanTheme ? '#00ffff' : '#2dd4bf';
  const knobColor = isCyanTheme ? '#00ffff' : '#2dd4bf';

  // Connect to the VSTBridge synth
  useEffect(() => {
    let cancelled = false;

    const connect = async () => {
      try {
        const engine = getToneEngine();
        const key = engine.getInstrumentKey(instrument.id, -1);
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
      } catch {
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
          <span className="text-sm">Loading Melodica...</span>
        </div>
        <VSTBridgePanel instrument={instrument} onChange={onChange} />
      </div>
    );
  }

  const panelBg = isCyanTheme
    ? 'bg-[#051515] border-cyan-900/50'
    : 'bg-[#1a1a1a] border-teal-900/30';

  return (
    <div className="flex flex-col gap-4 p-4 overflow-y-auto">
      {/* ═══ BREATH & DYNAMICS ═══ */}
      <div className={`p-4 rounded-xl border ${panelBg}`}>
        <h3
          className="font-bold uppercase tracking-tight text-sm mb-3"
          style={{ color: accentColor }}
        >
          Breath & Dynamics
        </h3>
        <div className="flex flex-wrap gap-4 justify-center">
          <Knob
            label="Breath"
            value={params[P.BREATH]}
            min={0}
            max={1}
            defaultValue={0.7}
            onChange={(v) => setParam(P.BREATH, v)}
            size="md"
            color={knobColor}
          />
          <Knob
            label="Attack"
            value={params[P.ATTACK]}
            min={0}
            max={1}
            defaultValue={0.15}
            onChange={(v) => setParam(P.ATTACK, v)}
            size="md"
            color={knobColor}
            formatValue={(v) => `${Math.round(v * 1000)}ms`}
          />
          <Knob
            label="Release"
            value={params[P.RELEASE]}
            min={0}
            max={1}
            defaultValue={0.2}
            onChange={(v) => setParam(P.RELEASE, v)}
            size="md"
            color={knobColor}
            formatValue={(v) => `${Math.round(v * 1000)}ms`}
          />
        </div>
      </div>

      {/* ═══ TONE ═══ */}
      <div className={`p-4 rounded-xl border ${panelBg}`}>
        <h3
          className="font-bold uppercase tracking-tight text-sm mb-3"
          style={{ color: accentColor }}
        >
          Tone
        </h3>
        <div className="flex flex-wrap gap-4 justify-center">
          <Knob
            label="Brightness"
            value={params[P.BRIGHTNESS]}
            min={0}
            max={1}
            defaultValue={0.5}
            onChange={(v) => setParam(P.BRIGHTNESS, v)}
            size="md"
            color={knobColor}
          />
          <Knob
            label="Noise"
            value={params[P.NOISE]}
            min={0}
            max={1}
            defaultValue={0.15}
            onChange={(v) => setParam(P.NOISE, v)}
            size="md"
            color={knobColor}
            formatValue={(v) => `${Math.round(v * 100)}%`}
          />
          <Knob
            label="Detune"
            value={params[P.DETUNE]}
            min={-50}
            max={50}
            defaultValue={5}
            onChange={(v) => setParam(P.DETUNE, v)}
            size="md"
            color={knobColor}
            bipolar
            formatValue={(v) => `${v > 0 ? '+' : ''}${Math.round(v)}ct`}
          />
        </div>
      </div>

      {/* ═══ VIBRATO ═══ */}
      <div className={`p-4 rounded-xl border ${panelBg}`}>
        <h3
          className="font-bold uppercase tracking-tight text-sm mb-3"
          style={{ color: accentColor }}
        >
          Vibrato
        </h3>
        <div className="flex flex-wrap gap-4 justify-center">
          <Knob
            label="Rate"
            value={params[P.VIBRATO_RATE]}
            min={0}
            max={10}
            defaultValue={4.5}
            onChange={(v) => setParam(P.VIBRATO_RATE, v)}
            size="md"
            color={knobColor}
            formatValue={(v) => `${v.toFixed(1)}Hz`}
          />
          <Knob
            label="Depth"
            value={params[P.VIBRATO_DEPTH]}
            min={0}
            max={1}
            defaultValue={0.2}
            onChange={(v) => setParam(P.VIBRATO_DEPTH, v)}
            size="md"
            color={knobColor}
          />
        </div>
      </div>

      {/* ═══ PLAYING & OUTPUT ═══ */}
      <div className={`p-4 rounded-xl border ${panelBg}`}>
        <h3
          className="font-bold uppercase tracking-tight text-sm mb-3"
          style={{ color: accentColor }}
        >
          Playing & Output
        </h3>
        <div className="flex flex-wrap gap-4 justify-center">
          <Knob
            label="Portamento"
            value={params[P.PORTAMENTO]}
            min={0}
            max={1}
            defaultValue={0.1}
            onChange={(v) => setParam(P.PORTAMENTO, v)}
            size="md"
            color={knobColor}
          />
          <Knob
            label="Volume"
            value={params[P.VOLUME]}
            min={0}
            max={1}
            defaultValue={0.8}
            onChange={(v) => setParam(P.VOLUME, v)}
            size="md"
            color={knobColor}
          />
        </div>
      </div>
    </div>
  );
};
