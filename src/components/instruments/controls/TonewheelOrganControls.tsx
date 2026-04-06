/**
 * TonewheelOrganControls - Custom Hammond-style organ editor
 *
 * Features 9 vertical drawbar sliders, percussion toggles,
 * vibrato/chorus selector, click, overdrive, and volume.
 * Interacts with VSTBridge synth via setParameter().
 * Falls back to VSTBridgePanel if synth not yet loaded.
 */

import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Knob } from '@components/controls/Knob';
import { DrawbarSlider } from '@components/instruments/shared';
import { Loader } from 'lucide-react';
import { useInstrumentColors } from '@/hooks/useInstrumentColors';
import { getToneEngine } from '@engine/ToneEngine';
import type { InstrumentConfig } from '@typedefs/instrument';
import type { VSTBridgeSynth } from '@engine/vstbridge/VSTBridgeSynth';
import { VSTBridgePanel } from './VSTBridgePanel';

// Parameter IDs matching TonewheelOrganSynth.cpp
const P = {
  DRAWBAR_16:    0,
  DRAWBAR_513:   1,
  DRAWBAR_8:     2,
  DRAWBAR_4:     3,
  DRAWBAR_223:   4,
  DRAWBAR_2:     5,
  DRAWBAR_135:   6,
  DRAWBAR_113:   7,
  DRAWBAR_1:     8,
  PERCUSSION:    9,
  PERC_FAST:     10,
  PERC_SOFT:     11,
  CLICK:         12,
  VIBRATO_TYPE:  13,
  VIBRATO_DEPTH: 14,
  OVERDRIVE:     15,
  VOLUME:        16,
} as const;

const DRAWBAR_LABELS = ["16'", "5⅓'", "8'", "4'", "2⅔'", "2'", "1⅗'", "1⅓'", "1'"];
const DRAWBAR_COLORS = [
  '#a0522d', // brown
  '#a0522d', // brown
  '#f0f0f0', // white
  '#f0f0f0', // white
  '#222222', // black
  '#f0f0f0', // white
  '#222222', // black
  '#222222', // black
  '#f0f0f0', // white
];

const VIBRATO_LABELS = ['V1', 'V2', 'V3', 'C1', 'C2', 'C3'];
const PERC_LABELS = ['OFF', '2ND', '3RD'];

const DEFAULTS = [8, 8, 8, 0, 0, 0, 0, 0, 0, 0, 1, 0, 0.3, 2, 0.5, 0, 0.8];

interface TonewheelOrganControlsProps {
  instrument: InstrumentConfig;
  onChange: (updates: Partial<InstrumentConfig>) => void;
}

export const TonewheelOrganControls: React.FC<TonewheelOrganControlsProps> = ({
  instrument,
  onChange,
}) => {
  const [params, setParams] = useState<number[]>([...DEFAULTS]);
  const [synthReady, setSynthReady] = useState(false);
  const synthRef = useRef<VSTBridgeSynth | null>(null);

  const { accent: accentColor, knob: knobColor, panelBg, panelStyle } = useInstrumentColors('#d4a017');

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
        // Read current values from synth
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

  // Fallback to VSTBridgePanel if synth not ready after a reasonable wait
  if (!synthReady) {
    return (
      <div className="grid grid-cols-4 gap-2 p-2">
        <div className="flex items-center justify-center gap-2 p-4 text-text-secondary">
          <Loader size={16} className="animate-spin" />
          <span className="text-sm">Loading Tonewheel Organ...</span>
        </div>
        <VSTBridgePanel instrument={instrument} onChange={onChange} />
      </div>
    );
  }


  return (
    <div className="synth-controls-flow grid grid-cols-4 gap-2 p-2 overflow-y-auto">
      {/* ═══ DRAWBARS ═══ */}
      <div className={`p-2 rounded-lg border ${panelBg}`} style={panelStyle}>
        <h3
          className="font-bold uppercase tracking-tight text-sm mb-2"
          style={{ color: accentColor }}
        >
          Drawbars
        </h3>
        <div className="flex justify-center gap-1 sm:gap-2">
          {DRAWBAR_LABELS.map((label, i) => (
            <DrawbarSlider
              key={i}
              label={label}
              value={params[i]}
              color={DRAWBAR_COLORS[i]}
              accentColor={accentColor}
              onChange={(v) => setParam(i, v)}
            />
          ))}
        </div>
      </div>

      {/* ═══ PERCUSSION ═══ */}
      <div className={`p-2 rounded-lg border ${panelBg}`} style={panelStyle}>
        <h3
          className="font-bold uppercase tracking-tight text-sm mb-3"
          style={{ color: accentColor }}
        >
          Percussion
        </h3>
        <div className="flex flex-wrap items-center gap-4">
          {/* Percussion Mode: OFF / 2ND / 3RD */}
          <div className="flex gap-1">
            {PERC_LABELS.map((label, i) => (
              <button
                key={label}
                onClick={() => setParam(P.PERCUSSION, i)}
                className={`px-3 py-1.5 text-xs font-bold rounded transition-all ${
                  Math.round(params[P.PERCUSSION]) === i
                    ? 'text-black'
                    : 'bg-dark-bgTertiary text-text-secondary hover:bg-dark-bgHover'
                }`}
                style={Math.round(params[P.PERCUSSION]) === i ? { backgroundColor: accentColor } : {}}
              >
                {label}
              </button>
            ))}
          </div>

          <div className="w-px h-8 bg-dark-bgHover" />

          {/* Fast / Slow toggle */}
          <div className="flex gap-1">
            {['SLOW', 'FAST'].map((label, i) => (
              <button
                key={label}
                onClick={() => setParam(P.PERC_FAST, i)}
                className={`px-3 py-1.5 text-xs font-bold rounded transition-all ${
                  Math.round(params[P.PERC_FAST]) === i
                    ? 'text-black'
                    : 'bg-dark-bgTertiary text-text-secondary hover:bg-dark-bgHover'
                }`}
                style={Math.round(params[P.PERC_FAST]) === i ? { backgroundColor: accentColor } : {}}
              >
                {label}
              </button>
            ))}
          </div>

          <div className="w-px h-8 bg-dark-bgHover" />

          {/* Soft / Normal toggle */}
          <div className="flex gap-1">
            {['NORM', 'SOFT'].map((label, i) => (
              <button
                key={label}
                onClick={() => setParam(P.PERC_SOFT, i)}
                className={`px-3 py-1.5 text-xs font-bold rounded transition-all ${
                  Math.round(params[P.PERC_SOFT]) === i
                    ? 'text-black'
                    : 'bg-dark-bgTertiary text-text-secondary hover:bg-dark-bgHover'
                }`}
                style={Math.round(params[P.PERC_SOFT]) === i ? { backgroundColor: accentColor } : {}}
              >
                {label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* ═══ VIBRATO / CHORUS + CONTROLS ═══ */}
      <div className={`p-2 rounded-lg border ${panelBg}`} style={panelStyle}>
        <h3
          className="font-bold uppercase tracking-tight text-sm mb-3"
          style={{ color: accentColor }}
        >
          Vibrato / Chorus
        </h3>
        <div className="flex flex-wrap items-start gap-3">
          {/* V/C selector buttons */}
          <div className="flex gap-1">
            {VIBRATO_LABELS.map((label, i) => (
              <button
                key={label}
                onClick={() => setParam(P.VIBRATO_TYPE, i)}
                className={`px-3 py-1.5 text-xs font-bold rounded transition-all ${
                  Math.round(params[P.VIBRATO_TYPE]) === i
                    ? 'text-black'
                    : 'bg-dark-bgTertiary text-text-secondary hover:bg-dark-bgHover'
                }`}
                style={Math.round(params[P.VIBRATO_TYPE]) === i ? { backgroundColor: accentColor } : {}}
              >
                {label}
              </button>
            ))}
          </div>

          <Knob
            label="Depth"
            value={params[P.VIBRATO_DEPTH]}
            min={0}
            max={1}
            defaultValue={0.5}
            onChange={(v) => setParam(P.VIBRATO_DEPTH, v)}
            color={knobColor}
          />
        </div>
      </div>

      {/* ═══ TONE & OUTPUT ═══ */}
      <div className={`p-2 rounded-lg border ${panelBg}`} style={panelStyle}>
        <h3
          className="font-bold uppercase tracking-tight text-sm mb-3"
          style={{ color: accentColor }}
        >
          Tone & Output
        </h3>
        <div className="flex flex-wrap gap-4 justify-center">
          <Knob
            label="Click"
            value={params[P.CLICK]}
            min={0}
            max={1}
            defaultValue={0.3}
            onChange={(v) => setParam(P.CLICK, v)}
            color={knobColor}
          />
          <Knob
            label="Overdrive"
            value={params[P.OVERDRIVE]}
            min={0}
            max={1}
            defaultValue={0}
            onChange={(v) => setParam(P.OVERDRIVE, v)}
            color={knobColor}
          />
          <Knob
            label="Volume"
            value={params[P.VOLUME]}
            min={0}
            max={1}
            defaultValue={0.8}
            onChange={(v) => setParam(P.VOLUME, v)}
            color={knobColor}
          />
        </div>
      </div>
    </div>
  );
};

