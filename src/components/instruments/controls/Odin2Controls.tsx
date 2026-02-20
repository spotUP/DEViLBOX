/**
 * Odin2Controls - Custom panel for Odin2 Semi-Modular Hybrid Synth
 *
 * 119 parameters organized into sections:
 * Master, Oscillators (3x), Filters (2x), Routing, Envelopes (3x),
 * LFOs (3x), Distortion, Delay, Phaser, Flanger, Chorus, Reverb.
 * Interacts with VSTBridge synth via setParameter().
 * Falls back to VSTBridgePanel if synth not yet loaded.
 */

import React, { useState, useEffect, useRef, useCallback, memo } from 'react';
import { Knob } from '@components/controls/Knob';
import { Loader } from 'lucide-react';
import { useThemeStore } from '@stores';
import { getToneEngine } from '@engine/ToneEngine';
import type { InstrumentConfig } from '@typedefs/instrument';
import type { VSTBridgeSynth } from '@engine/vstbridge/VSTBridgeSynth';
import { VSTBridgePanel } from './VSTBridgePanel';

// ============================================================================
// Module-scope sub-components (extracted to satisfy react-hooks/static-components)
// ============================================================================

/** Toggle button helper */
const Toggle = memo(({ id, label, params, accentColor, setParam }: {
  id: number; label: string; params: number[]; accentColor: string;
  setParam: (id: number, value: number) => void;
}) => (
  <button
    onClick={() => setParam(id, params[id] > 0.5 ? 0 : 1)}
    className={`px-2 py-1 text-[10px] font-bold rounded transition-all ${
      params[id] > 0.5 ? 'text-black' : 'bg-gray-800 text-gray-500 hover:bg-gray-700'
    }`}
    style={params[id] > 0.5 ? { backgroundColor: accentColor } : {}}
  >
    {label}
  </button>
));
Toggle.displayName = 'Toggle';

/** FX toggle */
const FxToggle = memo(({ id, label, params, fxAccent, setParam }: {
  id: number; label: string; params: number[]; fxAccent: string;
  setParam: (id: number, value: number) => void;
}) => (
  <button
    onClick={() => setParam(id, params[id] > 0.5 ? 0 : 1)}
    className={`px-2 py-1 text-[10px] font-bold rounded transition-all ${
      params[id] > 0.5 ? 'text-black' : 'bg-gray-800 text-gray-500 hover:bg-gray-700'
    }`}
    style={params[id] > 0.5 ? { backgroundColor: fxAccent } : {}}
  >
    {label}
  </button>
));
FxToggle.displayName = 'FxToggle';

/** Type selector helper */
const TypeSelect = memo(({ id, labels, params, accentColor, setParam }: {
  id: number; labels: string[]; params: number[]; accentColor: string;
  setParam: (id: number, value: number) => void;
}) => (
  <div className="flex flex-wrap gap-1">
    {labels.map((label, i) => (
      <button
        key={label}
        onClick={() => setParam(id, i)}
        className={`px-1.5 py-1 text-[9px] font-bold rounded transition-all ${
          Math.round(params[id]) === i ? 'text-black' : 'bg-gray-800 text-gray-400 hover:bg-gray-700'
        }`}
        style={Math.round(params[id]) === i ? { backgroundColor: accentColor } : {}}
      >
        {label}
      </button>
    ))}
  </div>
));
TypeSelect.displayName = 'TypeSelect';

/** Section header */
const Section = memo(({ title, color, bg, panelBg, accentColor, children }: {
  title: string; color?: string; bg?: string; panelBg: string; accentColor: string;
  children: React.ReactNode;
}) => (
  <div className={`p-4 rounded-xl border ${bg || panelBg}`}>
    <h3 className="font-bold uppercase tracking-tight text-sm mb-4" style={{ color: color || accentColor }}>
      {title}
    </h3>
    {children}
  </div>
));
Section.displayName = 'Section';

// Parameter IDs matching Odin2WASM.cpp (119 params)
const P = {
  // Master (6)
  MASTER_VOL: 0, MASTER_GAIN: 1, MASTER_PAN: 2, MASTER_GLIDE: 3,
  MASTER_VELOCITY: 4, MASTER_UNISON_DETUNE: 5,
  // Osc1 (11)
  OSC1_TYPE: 6, OSC1_VOL: 7, OSC1_OCT: 8, OSC1_SEMI: 9, OSC1_FINE: 10,
  OSC1_WAVE: 11, OSC1_PW: 12, OSC1_POS: 13, OSC1_FM: 14, OSC1_DRIFT: 15, OSC1_RESET: 16,
  // Osc2 (12)
  OSC2_TYPE: 17, OSC2_VOL: 18, OSC2_OCT: 19, OSC2_SEMI: 20, OSC2_FINE: 21,
  OSC2_WAVE: 22, OSC2_PW: 23, OSC2_POS: 24, OSC2_FM: 25, OSC2_DRIFT: 26,
  OSC2_SYNC: 27, OSC2_RESET: 28,
  // Osc3 (12)
  OSC3_TYPE: 29, OSC3_VOL: 30, OSC3_OCT: 31, OSC3_SEMI: 32, OSC3_FINE: 33,
  OSC3_WAVE: 34, OSC3_PW: 35, OSC3_POS: 36, OSC3_FM: 37, OSC3_DRIFT: 38,
  OSC3_SYNC: 39, OSC3_RESET: 40,
  // Filter1 (11)
  FIL1_TYPE: 41, FIL1_FREQ: 42, FIL1_RES: 43, FIL1_GAIN: 44,
  FIL1_ENV: 45, FIL1_SAT: 46, FIL1_VEL: 47, FIL1_KBD: 48,
  FIL1_OSC1: 49, FIL1_OSC2: 50, FIL1_OSC3: 51,
  // Filter2 (12)
  FIL2_TYPE: 52, FIL2_FREQ: 53, FIL2_RES: 54, FIL2_GAIN: 55,
  FIL2_ENV: 56, FIL2_SAT: 57, FIL2_VEL: 58, FIL2_KBD: 59,
  FIL2_OSC1: 60, FIL2_OSC2: 61, FIL2_OSC3: 62, FIL2_FIL1: 63,
  // Routing (2)
  FIL1_AMP: 64, FIL2_AMP: 65,
  // Env1 (5)
  ENV1_A: 66, ENV1_D: 67, ENV1_S: 68, ENV1_R: 69, ENV1_LOOP: 70,
  // Env2 (5)
  ENV2_A: 71, ENV2_D: 72, ENV2_S: 73, ENV2_R: 74, ENV2_LOOP: 75,
  // Env3 (5)
  ENV3_A: 76, ENV3_D: 77, ENV3_S: 78, ENV3_R: 79, ENV3_LOOP: 80,
  // LFO1 (3)
  LFO1_FREQ: 81, LFO1_WAVE: 82, LFO1_DEPTH: 83,
  // LFO2 (3)
  LFO2_FREQ: 84, LFO2_WAVE: 85, LFO2_DEPTH: 86,
  // LFO3 (3)
  LFO3_FREQ: 87, LFO3_WAVE: 88, LFO3_DEPTH: 89,
  // Distortion (3)
  DIST_ON: 90, DIST_BOOST: 91, DIST_DRYWET: 92,
  // Delay (6)
  DELAY_ON: 93, DELAY_TIME: 94, DELAY_FB: 95, DELAY_HP: 96, DELAY_DRY: 97, DELAY_WET: 98,
  // Phaser (5)
  PHASER_ON: 99, PHASER_RATE: 100, PHASER_MOD: 101, PHASER_FB: 102, PHASER_DW: 103,
  // Flanger (5)
  FLANGER_ON: 104, FLANGER_RATE: 105, FLANGER_AMT: 106, FLANGER_FB: 107, FLANGER_DW: 108,
  // Chorus (5)
  CHORUS_ON: 109, CHORUS_RATE: 110, CHORUS_AMT: 111, CHORUS_FB: 112, CHORUS_DW: 113,
  // Reverb (5)
  REVERB_ON: 114, REVERB_HALL: 115, REVERB_DAMP: 116, REVERB_PRE: 117, REVERB_DW: 118,
} as const;

const PARAM_COUNT = 119;

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
  const [params, setParams] = useState<number[]>(new Array(PARAM_COUNT).fill(0));
  const [synthReady, setSynthReady] = useState(false);
  const synthRef = useRef<VSTBridgeSynth | null>(null);

  const currentThemeId = useThemeStore((state) => state.currentThemeId);
  const isCyanTheme = currentThemeId === 'cyan-lineart';
  const accentColor = isCyanTheme ? '#00ffff' : '#4a9eff';
  const knobColor = isCyanTheme ? '#00ffff' : '#4a9eff';
  const fxAccent = isCyanTheme ? '#00ccaa' : '#7c3aed';

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
          <span className="text-sm">Loading Odin2...</span>
        </div>
        <VSTBridgePanel instrument={instrument} onChange={onChange} />
      </div>
    );
  }

  const panelBg = isCyanTheme
    ? 'bg-[#051515] border-cyan-900/50'
    : 'bg-[#1a1a1a] border-blue-900/30';
  const fxBg = isCyanTheme
    ? 'bg-[#041210] border-teal-900/40'
    : 'bg-[#151020] border-purple-900/30';

  // Oscillator row data
  const oscData = [
    { idx: 0, typeId: P.OSC1_TYPE, volId: P.OSC1_VOL, octId: P.OSC1_OCT, semiId: P.OSC1_SEMI, fineId: P.OSC1_FINE, pwId: P.OSC1_PW, posId: P.OSC1_POS, fmId: P.OSC1_FM, driftId: P.OSC1_DRIFT, resetId: P.OSC1_RESET, syncId: -1 },
    { idx: 1, typeId: P.OSC2_TYPE, volId: P.OSC2_VOL, octId: P.OSC2_OCT, semiId: P.OSC2_SEMI, fineId: P.OSC2_FINE, pwId: P.OSC2_PW, posId: P.OSC2_POS, fmId: P.OSC2_FM, driftId: P.OSC2_DRIFT, resetId: P.OSC2_RESET, syncId: P.OSC2_SYNC },
    { idx: 2, typeId: P.OSC3_TYPE, volId: P.OSC3_VOL, octId: P.OSC3_OCT, semiId: P.OSC3_SEMI, fineId: P.OSC3_FINE, pwId: P.OSC3_PW, posId: P.OSC3_POS, fmId: P.OSC3_FM, driftId: P.OSC3_DRIFT, resetId: P.OSC3_RESET, syncId: P.OSC3_SYNC },
  ];

  return (
    <div className="flex flex-col gap-4 p-4 overflow-y-auto">
      {/* ═══ MASTER ═══ */}
      <Section title="Master" panelBg={panelBg} accentColor={accentColor}>
        <div className="flex gap-4 justify-center flex-wrap">
          <Knob label="Volume" value={params[P.MASTER_VOL]} min={0} max={1} defaultValue={0.7}
            onChange={(v) => setParam(P.MASTER_VOL, v)} size="md" color={knobColor} />
          <Knob label="Gain" value={params[P.MASTER_GAIN]} min={-24} max={12} defaultValue={0}
            onChange={(v) => setParam(P.MASTER_GAIN, v)} size="sm" color={knobColor} bipolar
            formatValue={(v) => `${v > 0 ? '+' : ''}${v.toFixed(1)}dB`} />
          <Knob label="Pan" value={params[P.MASTER_PAN]} min={-1} max={1} defaultValue={0}
            onChange={(v) => setParam(P.MASTER_PAN, v)} size="sm" color={knobColor} bipolar />
          <Knob label="Glide" value={params[P.MASTER_GLIDE]} min={0} max={1} defaultValue={0}
            onChange={(v) => setParam(P.MASTER_GLIDE, v)} size="sm" color={knobColor}
            formatValue={(v) => `${Math.round(v * 1000)}ms`} />
          <Knob label="Velocity" value={params[P.MASTER_VELOCITY]} min={0} max={1} defaultValue={1}
            onChange={(v) => setParam(P.MASTER_VELOCITY, v)} size="sm" color={knobColor} />
          <Knob label="Uni Det" value={params[P.MASTER_UNISON_DETUNE]} min={0} max={1} defaultValue={0}
            onChange={(v) => setParam(P.MASTER_UNISON_DETUNE, v)} size="sm" color={knobColor} />
        </div>
      </Section>

      {/* ═══ OSCILLATORS ═══ */}
      <Section title="Oscillators" panelBg={panelBg} accentColor={accentColor}>
        <div className="flex flex-col gap-4">
          {oscData.map(osc => (
            <div key={osc.idx} className="flex flex-col gap-2">
              <div className="flex items-center gap-2">
                <span className="text-xs font-bold w-10 shrink-0" style={{ color: accentColor }}>
                  OSC {osc.idx + 1}
                </span>
                <TypeSelect id={osc.typeId} labels={OSC_TYPE_LABELS} params={params} accentColor={accentColor} setParam={setParam} />
              </div>
              <div className="flex gap-2 flex-wrap justify-center">
                <Knob label="Vol" value={params[osc.volId]} min={0} max={1} defaultValue={0.7}
                  onChange={(v) => setParam(osc.volId, v)} size="sm" color={knobColor} />
                <Knob label="Oct" value={params[osc.octId]} min={-4} max={4} defaultValue={0} step={1}
                  onChange={(v) => setParam(osc.octId, Math.round(v))} size="sm" color={knobColor}
                  formatValue={(v) => `${v > 0 ? '+' : ''}${Math.round(v)}`} />
                <Knob label="Semi" value={params[osc.semiId]} min={-12} max={12} defaultValue={0} step={1}
                  onChange={(v) => setParam(osc.semiId, Math.round(v))} size="sm" color={knobColor} bipolar
                  formatValue={(v) => `${v > 0 ? '+' : ''}${Math.round(v)}`} />
                <Knob label="Fine" value={params[osc.fineId]} min={-100} max={100} defaultValue={0}
                  onChange={(v) => setParam(osc.fineId, v)} size="sm" color={knobColor} bipolar
                  formatValue={(v) => `${v.toFixed(0)}ct`} />
                <Knob label="PW" value={params[osc.pwId]} min={0.02} max={0.98} defaultValue={0.5}
                  onChange={(v) => setParam(osc.pwId, v)} size="sm" color={knobColor} />
                <Knob label="Pos" value={params[osc.posId]} min={0} max={1} defaultValue={0}
                  onChange={(v) => setParam(osc.posId, v)} size="sm" color={knobColor} />
                <Knob label="FM" value={params[osc.fmId]} min={0} max={1} defaultValue={0}
                  onChange={(v) => setParam(osc.fmId, v)} size="sm" color={knobColor} />
                <Knob label="Drift" value={params[osc.driftId]} min={0} max={1} defaultValue={0}
                  onChange={(v) => setParam(osc.driftId, v)} size="sm" color={knobColor} />
                <Toggle id={osc.resetId} label="Reset" params={params} accentColor={accentColor} setParam={setParam} />
                {osc.syncId >= 0 && <Toggle id={osc.syncId} label="Sync" params={params} accentColor={accentColor} setParam={setParam} />}
              </div>
            </div>
          ))}
        </div>
      </Section>

      {/* ═══ FILTERS ═══ */}
      <Section title="Filters" panelBg={panelBg} accentColor={accentColor}>
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {/* Filter 1 */}
          <div className="flex flex-col gap-3">
            <span className="text-xs font-bold" style={{ color: accentColor }}>FILTER 1</span>
            <TypeSelect id={P.FIL1_TYPE} labels={FILTER_TYPE_LABELS} params={params} accentColor={accentColor} setParam={setParam} />
            <div className="flex gap-2 justify-center flex-wrap">
              <Knob label="Freq" value={params[P.FIL1_FREQ]} min={20} max={20000} defaultValue={10000}
                onChange={(v) => setParam(P.FIL1_FREQ, v)} size="sm" color={knobColor} logarithmic
                formatValue={(v) => v >= 1000 ? `${(v/1000).toFixed(1)}k` : `${Math.round(v)}`} />
              <Knob label="Res" value={params[P.FIL1_RES]} min={0} max={1} defaultValue={0.2}
                onChange={(v) => setParam(P.FIL1_RES, v)} size="sm" color={knobColor} />
              <Knob label="Gain" value={params[P.FIL1_GAIN]} min={0} max={2} defaultValue={1}
                onChange={(v) => setParam(P.FIL1_GAIN, v)} size="sm" color={knobColor} />
              <Knob label="Env" value={params[P.FIL1_ENV]} min={-1} max={1} defaultValue={0.5}
                onChange={(v) => setParam(P.FIL1_ENV, v)} size="sm" color={knobColor} bipolar />
              <Knob label="Sat" value={params[P.FIL1_SAT]} min={0} max={1} defaultValue={0}
                onChange={(v) => setParam(P.FIL1_SAT, v)} size="sm" color={knobColor} />
              <Knob label="Vel" value={params[P.FIL1_VEL]} min={0} max={1} defaultValue={0}
                onChange={(v) => setParam(P.FIL1_VEL, v)} size="sm" color={knobColor} />
              <Knob label="Kbd" value={params[P.FIL1_KBD]} min={0} max={1} defaultValue={0}
                onChange={(v) => setParam(P.FIL1_KBD, v)} size="sm" color={knobColor} />
            </div>
            <div className="flex gap-1 justify-center">
              <Toggle id={P.FIL1_OSC1} label="Osc1" params={params} accentColor={accentColor} setParam={setParam} />
              <Toggle id={P.FIL1_OSC2} label="Osc2" params={params} accentColor={accentColor} setParam={setParam} />
              <Toggle id={P.FIL1_OSC3} label="Osc3" params={params} accentColor={accentColor} setParam={setParam} />
            </div>
          </div>

          {/* Filter 2 */}
          <div className="flex flex-col gap-3">
            <span className="text-xs font-bold" style={{ color: accentColor }}>FILTER 2</span>
            <TypeSelect id={P.FIL2_TYPE} labels={FILTER_TYPE_LABELS} params={params} accentColor={accentColor} setParam={setParam} />
            <div className="flex gap-2 justify-center flex-wrap">
              <Knob label="Freq" value={params[P.FIL2_FREQ]} min={20} max={20000} defaultValue={10000}
                onChange={(v) => setParam(P.FIL2_FREQ, v)} size="sm" color={knobColor} logarithmic
                formatValue={(v) => v >= 1000 ? `${(v/1000).toFixed(1)}k` : `${Math.round(v)}`} />
              <Knob label="Res" value={params[P.FIL2_RES]} min={0} max={1} defaultValue={0}
                onChange={(v) => setParam(P.FIL2_RES, v)} size="sm" color={knobColor} />
              <Knob label="Gain" value={params[P.FIL2_GAIN]} min={0} max={2} defaultValue={1}
                onChange={(v) => setParam(P.FIL2_GAIN, v)} size="sm" color={knobColor} />
              <Knob label="Env" value={params[P.FIL2_ENV]} min={-1} max={1} defaultValue={0}
                onChange={(v) => setParam(P.FIL2_ENV, v)} size="sm" color={knobColor} bipolar />
              <Knob label="Sat" value={params[P.FIL2_SAT]} min={0} max={1} defaultValue={0}
                onChange={(v) => setParam(P.FIL2_SAT, v)} size="sm" color={knobColor} />
              <Knob label="Vel" value={params[P.FIL2_VEL]} min={0} max={1} defaultValue={0}
                onChange={(v) => setParam(P.FIL2_VEL, v)} size="sm" color={knobColor} />
              <Knob label="Kbd" value={params[P.FIL2_KBD]} min={0} max={1} defaultValue={0}
                onChange={(v) => setParam(P.FIL2_KBD, v)} size="sm" color={knobColor} />
            </div>
            <div className="flex gap-1 justify-center">
              <Toggle id={P.FIL2_OSC1} label="Osc1" params={params} accentColor={accentColor} setParam={setParam} />
              <Toggle id={P.FIL2_OSC2} label="Osc2" params={params} accentColor={accentColor} setParam={setParam} />
              <Toggle id={P.FIL2_OSC3} label="Osc3" params={params} accentColor={accentColor} setParam={setParam} />
              <Toggle id={P.FIL2_FIL1} label="Fil1" params={params} accentColor={accentColor} setParam={setParam} />
            </div>
          </div>
        </div>
      </Section>

      {/* ═══ ROUTING ═══ */}
      <Section title="Routing" panelBg={panelBg} accentColor={accentColor}>
        <div className="flex gap-2 justify-center">
          <Toggle id={P.FIL1_AMP} label="Fil1 → Amp" params={params} accentColor={accentColor} setParam={setParam} />
          <Toggle id={P.FIL2_AMP} label="Fil2 → Amp" params={params} accentColor={accentColor} setParam={setParam} />
        </div>
      </Section>

      {/* ═══ ENVELOPES ═══ */}
      <Section title="Envelopes" panelBg={panelBg} accentColor={accentColor}>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          {[
            { label: 'AMP EG', a: P.ENV1_A, d: P.ENV1_D, s: P.ENV1_S, r: P.ENV1_R, loop: P.ENV1_LOOP },
            { label: 'FILTER EG', a: P.ENV2_A, d: P.ENV2_D, s: P.ENV2_S, r: P.ENV2_R, loop: P.ENV2_LOOP },
            { label: 'MOD EG', a: P.ENV3_A, d: P.ENV3_D, s: P.ENV3_S, r: P.ENV3_R, loop: P.ENV3_LOOP },
          ].map(env => (
            <div key={env.label}>
              <span className="text-xs font-bold block mb-2" style={{ color: accentColor }}>
                {env.label}
              </span>
              <div className="flex gap-2 justify-center flex-wrap">
                <Knob label="A" value={params[env.a]} min={0.001} max={5} defaultValue={0.01}
                  onChange={(v) => setParam(env.a, v)} size="sm" color={knobColor}
                  formatValue={(v) => v < 0.1 ? `${(v * 1000).toFixed(0)}ms` : `${v.toFixed(2)}s`} />
                <Knob label="D" value={params[env.d]} min={0.001} max={5} defaultValue={0.3}
                  onChange={(v) => setParam(env.d, v)} size="sm" color={knobColor}
                  formatValue={(v) => v < 0.1 ? `${(v * 1000).toFixed(0)}ms` : `${v.toFixed(2)}s`} />
                <Knob label="S" value={params[env.s]} min={0} max={1} defaultValue={0.7}
                  onChange={(v) => setParam(env.s, v)} size="sm" color={knobColor}
                  formatValue={(v) => `${Math.round(v * 100)}%`} />
                <Knob label="R" value={params[env.r]} min={0.001} max={5} defaultValue={0.3}
                  onChange={(v) => setParam(env.r, v)} size="sm" color={knobColor}
                  formatValue={(v) => v < 0.1 ? `${(v * 1000).toFixed(0)}ms` : `${v.toFixed(2)}s`} />
                <Toggle id={env.loop} label="Loop" params={params} accentColor={accentColor} setParam={setParam} />
              </div>
            </div>
          ))}
        </div>
      </Section>

      {/* ═══ LFOs ═══ */}
      <Section title="LFOs" panelBg={panelBg} accentColor={accentColor}>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          {[
            { label: 'LFO1 → Filter', freq: P.LFO1_FREQ, depth: P.LFO1_DEPTH },
            { label: 'LFO2 → Pitch', freq: P.LFO2_FREQ, depth: P.LFO2_DEPTH },
            { label: 'LFO3 → Amp', freq: P.LFO3_FREQ, depth: P.LFO3_DEPTH },
          ].map(lfo => (
            <div key={lfo.label}>
              <span className="text-xs font-bold block mb-2" style={{ color: accentColor }}>
                {lfo.label}
              </span>
              <div className="flex gap-2 justify-center">
                <Knob label="Freq" value={params[lfo.freq]} min={0.01} max={20} defaultValue={2}
                  onChange={(v) => setParam(lfo.freq, v)} size="sm" color={knobColor}
                  formatValue={(v) => `${v.toFixed(1)}Hz`} />
                <Knob label="Depth" value={params[lfo.depth]} min={0} max={1} defaultValue={0}
                  onChange={(v) => setParam(lfo.depth, v)} size="sm" color={knobColor}
                  formatValue={(v) => `${Math.round(v * 100)}%`} />
              </div>
            </div>
          ))}
        </div>
      </Section>

      {/* ═══ DISTORTION ═══ */}
      <Section title="Distortion" color={fxAccent} bg={fxBg} panelBg={panelBg} accentColor={accentColor}>
        <div className="flex gap-3 items-center justify-center flex-wrap">
          <FxToggle id={P.DIST_ON} label="ON" params={params} fxAccent={fxAccent} setParam={setParam} />
          <Knob label="Boost" value={params[P.DIST_BOOST]} min={0} max={1} defaultValue={0.5}
            onChange={(v) => setParam(P.DIST_BOOST, v)} size="sm" color={fxAccent} />
          <Knob label="Dry/Wet" value={params[P.DIST_DRYWET]} min={0} max={1} defaultValue={1}
            onChange={(v) => setParam(P.DIST_DRYWET, v)} size="sm" color={fxAccent} />
        </div>
      </Section>

      {/* ═══ FX CHAIN ═══ */}
      <Section title="Effects" color={fxAccent} bg={fxBg} panelBg={panelBg} accentColor={accentColor}>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {/* Delay */}
          <div>
            <div className="flex items-center gap-2 mb-2">
              <FxToggle id={P.DELAY_ON} label="DELAY" params={params} fxAccent={fxAccent} setParam={setParam} />
            </div>
            <div className="flex gap-2 flex-wrap justify-center">
              <Knob label="Time" value={params[P.DELAY_TIME]} min={0.01} max={2} defaultValue={0.3}
                onChange={(v) => setParam(P.DELAY_TIME, v)} size="sm" color={fxAccent}
                formatValue={(v) => `${(v * 1000).toFixed(0)}ms`} />
              <Knob label="Feedback" value={params[P.DELAY_FB]} min={0} max={1} defaultValue={0.4}
                onChange={(v) => setParam(P.DELAY_FB, v)} size="sm" color={fxAccent} />
              <Knob label="HP" value={params[P.DELAY_HP]} min={20} max={2000} defaultValue={80}
                onChange={(v) => setParam(P.DELAY_HP, v)} size="sm" color={fxAccent} logarithmic />
              <Knob label="Dry" value={params[P.DELAY_DRY]} min={0} max={1} defaultValue={1}
                onChange={(v) => setParam(P.DELAY_DRY, v)} size="sm" color={fxAccent} />
              <Knob label="Wet" value={params[P.DELAY_WET]} min={0} max={1} defaultValue={0.3}
                onChange={(v) => setParam(P.DELAY_WET, v)} size="sm" color={fxAccent} />
            </div>
          </div>

          {/* Chorus */}
          <div>
            <div className="flex items-center gap-2 mb-2">
              <FxToggle id={P.CHORUS_ON} label="CHORUS" params={params} fxAccent={fxAccent} setParam={setParam} />
            </div>
            <div className="flex gap-2 flex-wrap justify-center">
              <Knob label="Rate" value={params[P.CHORUS_RATE]} min={0.01} max={10} defaultValue={0.3}
                onChange={(v) => setParam(P.CHORUS_RATE, v)} size="sm" color={fxAccent} />
              <Knob label="Amount" value={params[P.CHORUS_AMT]} min={0} max={1} defaultValue={0.5}
                onChange={(v) => setParam(P.CHORUS_AMT, v)} size="sm" color={fxAccent} />
              <Knob label="FB" value={params[P.CHORUS_FB]} min={-0.98} max={0.98} defaultValue={0}
                onChange={(v) => setParam(P.CHORUS_FB, v)} size="sm" color={fxAccent} bipolar />
              <Knob label="D/W" value={params[P.CHORUS_DW]} min={0} max={1} defaultValue={0.5}
                onChange={(v) => setParam(P.CHORUS_DW, v)} size="sm" color={fxAccent} />
            </div>
          </div>

          {/* Phaser */}
          <div>
            <div className="flex items-center gap-2 mb-2">
              <FxToggle id={P.PHASER_ON} label="PHASER" params={params} fxAccent={fxAccent} setParam={setParam} />
            </div>
            <div className="flex gap-2 flex-wrap justify-center">
              <Knob label="Rate" value={params[P.PHASER_RATE]} min={0.01} max={10} defaultValue={0.5}
                onChange={(v) => setParam(P.PHASER_RATE, v)} size="sm" color={fxAccent} />
              <Knob label="Mod" value={params[P.PHASER_MOD]} min={0} max={1.5} defaultValue={0.5}
                onChange={(v) => setParam(P.PHASER_MOD, v)} size="sm" color={fxAccent} />
              <Knob label="FB" value={params[P.PHASER_FB]} min={0} max={0.97} defaultValue={0.3}
                onChange={(v) => setParam(P.PHASER_FB, v)} size="sm" color={fxAccent} />
              <Knob label="D/W" value={params[P.PHASER_DW]} min={0} max={1} defaultValue={0.5}
                onChange={(v) => setParam(P.PHASER_DW, v)} size="sm" color={fxAccent} />
            </div>
          </div>

          {/* Flanger */}
          <div>
            <div className="flex items-center gap-2 mb-2">
              <FxToggle id={P.FLANGER_ON} label="FLANGER" params={params} fxAccent={fxAccent} setParam={setParam} />
            </div>
            <div className="flex gap-2 flex-wrap justify-center">
              <Knob label="Rate" value={params[P.FLANGER_RATE]} min={0.01} max={10} defaultValue={0.3}
                onChange={(v) => setParam(P.FLANGER_RATE, v)} size="sm" color={fxAccent} />
              <Knob label="Amount" value={params[P.FLANGER_AMT]} min={0} max={1} defaultValue={0.5}
                onChange={(v) => setParam(P.FLANGER_AMT, v)} size="sm" color={fxAccent} />
              <Knob label="FB" value={params[P.FLANGER_FB]} min={-0.98} max={0.98} defaultValue={0.3}
                onChange={(v) => setParam(P.FLANGER_FB, v)} size="sm" color={fxAccent} bipolar />
              <Knob label="D/W" value={params[P.FLANGER_DW]} min={0} max={1} defaultValue={0.5}
                onChange={(v) => setParam(P.FLANGER_DW, v)} size="sm" color={fxAccent} />
            </div>
          </div>

          {/* Reverb */}
          <div>
            <div className="flex items-center gap-2 mb-2">
              <FxToggle id={P.REVERB_ON} label="REVERB" params={params} fxAccent={fxAccent} setParam={setParam} />
            </div>
            <div className="flex gap-2 flex-wrap justify-center">
              <Knob label="Hall" value={params[P.REVERB_HALL]} min={0.2} max={10} defaultValue={2}
                onChange={(v) => setParam(P.REVERB_HALL, v)} size="sm" color={fxAccent}
                formatValue={(v) => `${v.toFixed(1)}s`} />
              <Knob label="Damp" value={params[P.REVERB_DAMP]} min={500} max={20000} defaultValue={6000}
                onChange={(v) => setParam(P.REVERB_DAMP, v)} size="sm" color={fxAccent} logarithmic
                formatValue={(v) => v >= 1000 ? `${(v/1000).toFixed(1)}k` : `${Math.round(v)}`} />
              <Knob label="Pre-D" value={params[P.REVERB_PRE]} min={0.001} max={0.5} defaultValue={0.04}
                onChange={(v) => setParam(P.REVERB_PRE, v)} size="sm" color={fxAccent}
                formatValue={(v) => `${(v * 1000).toFixed(0)}ms`} />
              <Knob label="D/W" value={params[P.REVERB_DW]} min={0} max={1} defaultValue={0.3}
                onChange={(v) => setParam(P.REVERB_DW, v)} size="sm" color={fxAccent} />
            </div>
          </div>
        </div>
      </Section>
    </div>
  );
};
