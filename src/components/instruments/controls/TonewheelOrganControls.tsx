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
import { Loader } from 'lucide-react';
import { useThemeStore } from '@stores';
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

  const currentThemeId = useThemeStore((state) => state.currentThemeId);
  const isCyanTheme = currentThemeId === 'cyan-lineart';
  const accentColor = isCyanTheme ? '#00ffff' : '#d4a017';
  const knobColor = isCyanTheme ? '#00ffff' : '#d4a017';

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

  // Fallback to VSTBridgePanel if synth not ready after a reasonable wait
  if (!synthReady) {
    return (
      <div className="flex flex-col gap-4 p-4">
        <div className="flex items-center justify-center gap-2 p-4 text-gray-400">
          <Loader size={16} className="animate-spin" />
          <span className="text-sm">Loading Tonewheel Organ...</span>
        </div>
        <VSTBridgePanel instrument={instrument} onChange={onChange} />
      </div>
    );
  }

  const panelBg = isCyanTheme
    ? 'bg-[#051515] border-cyan-900/50'
    : 'bg-[#1a1a1a] border-amber-900/30';

  return (
    <div className="flex flex-col gap-4 p-4 overflow-y-auto">
      {/* ═══ DRAWBARS ═══ */}
      <div className={`p-4 rounded-xl border ${panelBg}`}>
        <h3
          className="font-bold uppercase tracking-tight text-sm mb-4"
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
      <div className={`p-4 rounded-xl border ${panelBg}`}>
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
                    : 'bg-gray-800 text-gray-400 hover:bg-gray-700'
                }`}
                style={Math.round(params[P.PERCUSSION]) === i ? { backgroundColor: accentColor } : {}}
              >
                {label}
              </button>
            ))}
          </div>

          <div className="w-px h-8 bg-gray-700" />

          {/* Fast / Slow toggle */}
          <div className="flex gap-1">
            {['SLOW', 'FAST'].map((label, i) => (
              <button
                key={label}
                onClick={() => setParam(P.PERC_FAST, i)}
                className={`px-3 py-1.5 text-xs font-bold rounded transition-all ${
                  Math.round(params[P.PERC_FAST]) === i
                    ? 'text-black'
                    : 'bg-gray-800 text-gray-400 hover:bg-gray-700'
                }`}
                style={Math.round(params[P.PERC_FAST]) === i ? { backgroundColor: accentColor } : {}}
              >
                {label}
              </button>
            ))}
          </div>

          <div className="w-px h-8 bg-gray-700" />

          {/* Soft / Normal toggle */}
          <div className="flex gap-1">
            {['NORM', 'SOFT'].map((label, i) => (
              <button
                key={label}
                onClick={() => setParam(P.PERC_SOFT, i)}
                className={`px-3 py-1.5 text-xs font-bold rounded transition-all ${
                  Math.round(params[P.PERC_SOFT]) === i
                    ? 'text-black'
                    : 'bg-gray-800 text-gray-400 hover:bg-gray-700'
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
      <div className={`p-4 rounded-xl border ${panelBg}`}>
        <h3
          className="font-bold uppercase tracking-tight text-sm mb-3"
          style={{ color: accentColor }}
        >
          Vibrato / Chorus
        </h3>
        <div className="flex flex-wrap items-start gap-6">
          {/* V/C selector buttons */}
          <div className="flex gap-1">
            {VIBRATO_LABELS.map((label, i) => (
              <button
                key={label}
                onClick={() => setParam(P.VIBRATO_TYPE, i)}
                className={`px-3 py-1.5 text-xs font-bold rounded transition-all ${
                  Math.round(params[P.VIBRATO_TYPE]) === i
                    ? 'text-black'
                    : 'bg-gray-800 text-gray-400 hover:bg-gray-700'
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
            size="sm"
            color={knobColor}
          />
        </div>
      </div>

      {/* ═══ TONE & OUTPUT ═══ */}
      <div className={`p-4 rounded-xl border ${panelBg}`}>
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
            size="sm"
            color={knobColor}
          />
          <Knob
            label="Overdrive"
            value={params[P.OVERDRIVE]}
            min={0}
            max={1}
            defaultValue={0}
            onChange={(v) => setParam(P.OVERDRIVE, v)}
            size="sm"
            color={knobColor}
          />
          <Knob
            label="Volume"
            value={params[P.VOLUME]}
            min={0}
            max={1}
            defaultValue={0.8}
            onChange={(v) => setParam(P.VOLUME, v)}
            size="sm"
            color={knobColor}
          />
        </div>
      </div>
    </div>
  );
};

// ============================================================================
// Drawbar Slider - vertical slider styled like a Hammond drawbar
// ============================================================================

interface DrawbarSliderProps {
  label: string;
  value: number;
  color: string;
  accentColor: string;
  onChange: (value: number) => void;
}

const DrawbarSlider: React.FC<DrawbarSliderProps> = React.memo(({
  label,
  value,
  color,
  accentColor,
  onChange,
}) => {
  const sliderRef = useRef<HTMLDivElement>(null);
  const isDraggingRef = useRef(false);

  const handlePointerDown = useCallback((e: React.PointerEvent) => {
    isDraggingRef.current = true;
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
    updateValue(e.clientY);
  }, []);

  const handlePointerMove = useCallback((e: React.PointerEvent) => {
    if (!isDraggingRef.current) return;
    updateValue(e.clientY);
  }, []);

  const handlePointerUp = useCallback(() => {
    isDraggingRef.current = false;
  }, []);

  const updateValue = useCallback((clientY: number) => {
    if (!sliderRef.current) return;
    const rect = sliderRef.current.getBoundingClientRect();
    // Invert: top = 8 (max), bottom = 0
    const pct = 1 - Math.max(0, Math.min(1, (clientY - rect.top) / rect.height));
    const stepped = Math.round(pct * 8);
    onChange(stepped);
  }, [onChange]);

  const fillPct = (value / 8) * 100;

  return (
    <div className="flex flex-col items-center gap-1 select-none">
      {/* Value display */}
      <div
        className="text-xs font-bold font-mono w-5 text-center"
        style={{ color: accentColor }}
      >
        {Math.round(value)}
      </div>
      {/* Slider track */}
      <div
        ref={sliderRef}
        className="relative w-6 h-28 rounded bg-gray-900 border border-gray-700 cursor-pointer"
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
      >
        {/* Fill from bottom */}
        <div
          className="absolute bottom-0 left-0 right-0 rounded-b transition-all duration-75"
          style={{
            height: `${fillPct}%`,
            backgroundColor: color,
            opacity: 0.8,
          }}
        />
        {/* Tick marks */}
        {[1, 2, 3, 4, 5, 6, 7].map(tick => (
          <div
            key={tick}
            className="absolute left-0 right-0 h-px bg-gray-600 pointer-events-none"
            style={{ bottom: `${(tick / 8) * 100}%` }}
          />
        ))}
        {/* Thumb */}
        <div
          className="absolute left-0 right-0 h-2 rounded transition-all duration-75"
          style={{
            bottom: `calc(${fillPct}% - 4px)`,
            backgroundColor: color,
            boxShadow: `0 0 6px ${color}88`,
          }}
        />
      </div>
      {/* Label */}
      <div className="text-[10px] text-gray-500 font-mono whitespace-nowrap">
        {label}
      </div>
    </div>
  );
});

DrawbarSlider.displayName = 'DrawbarSlider';
