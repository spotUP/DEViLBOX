/**
 * VitalControls - Custom tabbed panel for Vital Wavetable Synth
 *
 * 774 parameters organized into 6 tabs: OSC, FILTER, ENV, LFO, FX, MASTER.
 * Uses name→id lookup from WASM getParams() metadata.
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
import type { VSTBridgeParam } from '@engine/vstbridge/synth-registry';
import { VSTBridgePanel } from './VSTBridgePanel';

type VitalTab = 'osc' | 'filter' | 'env' | 'lfo' | 'fx' | 'master' | 'other';

const TABS: { id: VitalTab; label: string }[] = [
  { id: 'osc', label: 'OSC' },
  { id: 'filter', label: 'FILTER' },
  { id: 'env', label: 'ENV' },
  { id: 'lfo', label: 'LFO' },
  { id: 'fx', label: 'FX' },
  { id: 'master', label: 'MASTER' },
  { id: 'other', label: 'OTHER' },
];

/** Prefixes/names covered by the categorized tabs */
const CATEGORIZED_PREFIXES = [
  'osc_1_', 'osc_2_', 'osc_3_',
  'filter_1_', 'filter_2_', 'filter_fx_',
  'env_1_', 'env_2_', 'env_3_', 'env_4_', 'env_5_', 'env_6_',
  'lfo_1_', 'lfo_2_', 'lfo_3_', 'lfo_4_', 'lfo_5_', 'lfo_6_', 'lfo_7_', 'lfo_8_',
  'chorus_', 'delay_', 'distortion_', 'reverb_', 'compressor_', 'flanger_', 'phaser_', 'eq_',
];

const CATEGORIZED_EXACT = new Set([
  'volume', 'polyphony', 'portamento_time', 'pitch_bend_range',
  'velocity_track', 'oversampling',
  'macro_control_1', 'macro_control_2', 'macro_control_3', 'macro_control_4',
]);

function isParamCategorized(name: string): boolean {
  if (CATEGORIZED_EXACT.has(name)) return true;
  return CATEGORIZED_PREFIXES.some(prefix => name.startsWith(prefix));
}

interface VitalControlsProps {
  instrument: InstrumentConfig;
  onChange: (updates: Partial<InstrumentConfig>) => void;
}

export const VitalControls: React.FC<VitalControlsProps> = ({
  instrument,
  onChange,
}) => {
  const [activeTab, setActiveTab] = useState<VitalTab>('osc');
  const [paramValues, setParamValues] = useState<Map<number, number>>(new Map());
  const [paramByName, setParamByName] = useState<Map<string, VSTBridgeParam>>(new Map());
  const [allParams, setAllParams] = useState<VSTBridgeParam[]>([]);
  const [synthReady, setSynthReady] = useState(false);
  const synthRef = useRef<VSTBridgeSynth | null>(null);

  const currentThemeId = useThemeStore((state) => state.currentThemeId);
  const isCyanTheme = currentThemeId === 'cyan-lineart';
  const accentColor = isCyanTheme ? '#00ffff' : '#b84eff';
  const knobColor = isCyanTheme ? '#00ffff' : '#b84eff';

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
          const nameMap = new Map<string, VSTBridgeParam>();
          const valMap = new Map<number, number>();
          for (const p of wasmParams) {
            nameMap.set(p.name, p);
            valMap.set(p.id, p.defaultValue);
          }
          if (!cancelled) {
            setParamByName(nameMap);
            setParamValues(valMap);
            setAllParams(wasmParams);
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
    setParamValues(prev => {
      const next = new Map(prev);
      next.set(id, value);
      return next;
    });
    if (synthRef.current) {
      synthRef.current.setParameter(id, value);
    }
  }, []);

  /** Render a knob for a named parameter */
  const ParamKnob = useCallback(({ name, label, min, max, fmt, logarithmic, bipolar, size }: {
    name: string;
    label: string;
    min?: number;
    max?: number;
    fmt?: (v: number) => string;
    logarithmic?: boolean;
    bipolar?: boolean;
    size?: 'sm' | 'md';
  }) => {
    const p = paramByName.get(name);
    if (!p) return null;
    return (
      <Knob
        label={label}
        value={paramValues.get(p.id) ?? p.defaultValue}
        min={min ?? p.min}
        max={max ?? p.max}
        defaultValue={p.defaultValue}
        onChange={(v) => setParam(p.id, v)}
        size={size || 'sm'}
        color={knobColor}
        logarithmic={logarithmic}
        bipolar={bipolar}
        formatValue={fmt}
      />
    );
  }, [paramByName, paramValues, setParam, knobColor]);

  if (!synthReady) {
    return (
      <div className="flex flex-col gap-4 p-4">
        <div className="flex items-center justify-center gap-2 p-4 text-gray-400">
          <Loader size={16} className="animate-spin" />
          <span className="text-sm">Loading Vital...</span>
        </div>
        <VSTBridgePanel instrument={instrument} onChange={onChange} />
      </div>
    );
  }

  const panelBg = isCyanTheme
    ? 'bg-[#051515] border-cyan-900/50'
    : 'bg-[#1a1a1a] border-purple-900/30';

  const tabBarBg = isCyanTheme ? 'bg-[#061818]' : 'bg-[#111]';

  return (
    <div className="flex flex-col gap-0 overflow-y-auto">
      {/* Tab bar */}
      <div className={`flex gap-1 px-4 py-2 ${tabBarBg} border-b border-gray-800`}>
        {TABS.map(tab => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={`px-3 py-1.5 text-xs font-bold rounded transition-all ${
              activeTab === tab.id
                ? 'text-black'
                : 'bg-gray-800 text-gray-400 hover:bg-gray-700'
            }`}
            style={activeTab === tab.id ? { backgroundColor: accentColor } : {}}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Tab content */}
      <div className="p-4 flex flex-col gap-4">
        {activeTab === 'osc' && (
          <>
            {[1, 2, 3].map(n => (
              <div key={n} className={`p-4 rounded-xl border ${panelBg}`}>
                <h3 className="font-bold uppercase tracking-tight text-sm mb-3" style={{ color: accentColor }}>
                  Oscillator {n}
                </h3>
                <div className="flex flex-wrap gap-3 justify-center">
                  <ParamKnob name={`osc_${n}_transpose`} label="Transpose" min={-48} max={48} bipolar
                    fmt={(v) => `${v > 0 ? '+' : ''}${Math.round(v)}st`} />
                  <ParamKnob name={`osc_${n}_tune`} label="Tune" min={-1} max={1} bipolar
                    fmt={(v) => `${(v * 100).toFixed(0)}ct`} />
                  <ParamKnob name={`osc_${n}_level`} label="Level" />
                  <ParamKnob name={`osc_${n}_pan`} label="Pan" min={-1} max={1} bipolar
                    fmt={(v) => v === 0 ? 'C' : v < 0 ? `L${Math.round(Math.abs(v) * 100)}` : `R${Math.round(v * 100)}`} />
                  <ParamKnob name={`osc_${n}_unison_voices`} label="Voices"
                    fmt={(v) => `${Math.round(v)}`} />
                  <ParamKnob name={`osc_${n}_unison_detune`} label="Detune" />
                  <ParamKnob name={`osc_${n}_wave_frame`} label="Frame" />
                  <ParamKnob name={`osc_${n}_spectral_morph_amount`} label="Spec Morph" />
                  <ParamKnob name={`osc_${n}_distortion_amount`} label="Distortion" />
                </div>
              </div>
            ))}
          </>
        )}

        {activeTab === 'filter' && (
          <>
            {[1, 2].map(n => (
              <div key={n} className={`p-4 rounded-xl border ${panelBg}`}>
                <h3 className="font-bold uppercase tracking-tight text-sm mb-3" style={{ color: accentColor }}>
                  Filter {n}
                </h3>
                <div className="flex flex-wrap gap-3 justify-center">
                  <ParamKnob name={`filter_${n}_cutoff`} label="Cutoff"
                    fmt={(v) => {
                      const hz = 20 * Math.pow(2, v * 10);
                      return hz >= 1000 ? `${(hz/1000).toFixed(1)}k` : `${Math.round(hz)}`;
                    }} />
                  <ParamKnob name={`filter_${n}_resonance`} label="Resonance" />
                  <ParamKnob name={`filter_${n}_drive`} label="Drive" />
                  <ParamKnob name={`filter_${n}_blend`} label="Blend" />
                  <ParamKnob name={`filter_${n}_keytrack`} label="Keytrack" bipolar />
                  <ParamKnob name={`filter_${n}_mix`} label="Mix" />
                </div>
              </div>
            ))}
            <div className={`p-4 rounded-xl border ${panelBg}`}>
              <h3 className="font-bold uppercase tracking-tight text-sm mb-3" style={{ color: accentColor }}>
                FX Filter
              </h3>
              <div className="flex flex-wrap gap-3 justify-center">
                <ParamKnob name="filter_fx_cutoff" label="Cutoff" />
                <ParamKnob name="filter_fx_resonance" label="Resonance" />
                <ParamKnob name="filter_fx_drive" label="Drive" />
                <ParamKnob name="filter_fx_blend" label="Blend" />
                <ParamKnob name="filter_fx_mix" label="Mix" />
              </div>
            </div>
          </>
        )}

        {activeTab === 'env' && (
          <>
            {[1, 2, 3, 4, 5, 6].map(n => (
              <div key={n} className={`p-4 rounded-xl border ${panelBg}`}>
                <h3 className="font-bold uppercase tracking-tight text-sm mb-3" style={{ color: accentColor }}>
                  Envelope {n} {n === 1 ? '(Amp)' : n === 2 ? '(Filter)' : ''}
                </h3>
                <div className="flex flex-wrap gap-3 justify-center">
                  <ParamKnob name={`env_${n}_delay`} label="Delay"
                    fmt={(v) => `${(v * 1000).toFixed(0)}ms`} />
                  <ParamKnob name={`env_${n}_attack`} label="Attack"
                    fmt={(v) => `${(v * 1000).toFixed(0)}ms`} />
                  <ParamKnob name={`env_${n}_hold`} label="Hold"
                    fmt={(v) => `${(v * 1000).toFixed(0)}ms`} />
                  <ParamKnob name={`env_${n}_decay`} label="Decay"
                    fmt={(v) => `${(v * 1000).toFixed(0)}ms`} />
                  <ParamKnob name={`env_${n}_sustain`} label="Sustain"
                    fmt={(v) => `${Math.round(v * 100)}%`} />
                  <ParamKnob name={`env_${n}_release`} label="Release"
                    fmt={(v) => `${(v * 1000).toFixed(0)}ms`} />
                  <ParamKnob name={`env_${n}_attack_power`} label="A Curve" bipolar />
                  <ParamKnob name={`env_${n}_decay_power`} label="D Curve" bipolar />
                  <ParamKnob name={`env_${n}_release_power`} label="R Curve" bipolar />
                </div>
              </div>
            ))}
          </>
        )}

        {activeTab === 'lfo' && (
          <LfoTabContent
            paramByName={paramByName}
            paramValues={paramValues}
            setParam={setParam}
            knobColor={knobColor}
            accentColor={accentColor}
            panelBg={panelBg}
          />
        )}

        {activeTab === 'fx' && (
          <>
            {[
              { name: 'chorus', label: 'Chorus', params: ['chorus_voices', 'chorus_frequency', 'chorus_depth', 'chorus_feedback', 'chorus_dry_wet', 'chorus_mod_depth'] },
              { name: 'delay', label: 'Delay', params: ['delay_frequency', 'delay_feedback', 'delay_dry_wet', 'delay_filter_cutoff', 'delay_filter_spread'] },
              { name: 'distortion', label: 'Distortion', params: ['distortion_drive', 'distortion_mix', 'distortion_filter_cutoff', 'distortion_filter_resonance'] },
              { name: 'reverb', label: 'Reverb', params: ['reverb_size', 'reverb_decay_time', 'reverb_pre_low_cutoff', 'reverb_pre_high_cutoff', 'reverb_dry_wet', 'reverb_chorus_amount'] },
              { name: 'compressor', label: 'Compressor', params: ['compressor_attack', 'compressor_release', 'compressor_low_gain', 'compressor_band_gain', 'compressor_high_gain', 'compressor_mix'] },
              { name: 'flanger', label: 'Flanger', params: ['flanger_frequency', 'flanger_feedback', 'flanger_center', 'flanger_dry_wet', 'flanger_mod_depth'] },
              { name: 'phaser', label: 'Phaser', params: ['phaser_frequency', 'phaser_feedback', 'phaser_center', 'phaser_dry_wet', 'phaser_mod_depth'] },
              { name: 'eq', label: 'EQ', params: ['eq_low_cutoff', 'eq_low_gain', 'eq_band_cutoff', 'eq_band_gain', 'eq_high_cutoff', 'eq_high_gain'] },
            ].map(fx => (
              <div key={fx.name} className={`p-4 rounded-xl border ${panelBg}`}>
                <div className="flex items-center gap-3 mb-3">
                  <ToggleButton
                    name={`${fx.name}_on`}
                    paramByName={paramByName}
                    paramValues={paramValues}
                    setParam={setParam}
                    accentColor={accentColor}
                  />
                  <h3 className="font-bold uppercase tracking-tight text-sm" style={{ color: accentColor }}>
                    {fx.label}
                  </h3>
                </div>
                <div className="flex flex-wrap gap-3 justify-center">
                  {fx.params.map(pName => {
                    const p = paramByName.get(pName);
                    if (!p) return null;
                    const shortLabel = pName.replace(`${fx.name}_`, '').replace(/_/g, ' ');
                    return (
                      <Knob
                        key={pName}
                        label={shortLabel.length > 10 ? shortLabel.substring(0, 10) : shortLabel}
                        value={paramValues.get(p.id) ?? p.defaultValue}
                        min={p.min}
                        max={p.max}
                        defaultValue={p.defaultValue}
                        onChange={(v) => setParam(p.id, v)}
                        size="sm"
                        color={knobColor}
                      />
                    );
                  })}
                </div>
              </div>
            ))}
          </>
        )}

        {activeTab === 'master' && (
          <div className={`p-4 rounded-xl border ${panelBg}`}>
            <h3 className="font-bold uppercase tracking-tight text-sm mb-3" style={{ color: accentColor }}>
              Master
            </h3>
            <div className="flex flex-wrap gap-4 justify-center">
              <ParamKnob name="volume" label="Volume" size="md" />
              <ParamKnob name="polyphony" label="Polyphony" size="md"
                fmt={(v) => `${Math.round(v)}`} />
              <ParamKnob name="portamento_time" label="Porta Time" size="md" />
              <ParamKnob name="pitch_bend_range" label="PB Range" size="md"
                fmt={(v) => `${Math.round(v)}st`} />
              <ParamKnob name="velocity_track" label="Vel Track" size="md" />
              <ParamKnob name="oversampling" label="Oversample" size="md"
                fmt={(v) => `${Math.round(v)}x`} />
            </div>
            <h3 className="font-bold uppercase tracking-tight text-sm mb-3 mt-6" style={{ color: accentColor }}>
              Macros
            </h3>
            <div className="flex flex-wrap gap-4 justify-center">
              <ParamKnob name="macro_control_1" label="Macro 1" size="md" />
              <ParamKnob name="macro_control_2" label="Macro 2" size="md" />
              <ParamKnob name="macro_control_3" label="Macro 3" size="md" />
              <ParamKnob name="macro_control_4" label="Macro 4" size="md" />
            </div>
          </div>
        )}

        {activeTab === 'other' && (
          <OtherParamsTab
            allParams={allParams}
            paramValues={paramValues}
            setParam={setParam}
            knobColor={knobColor}
            accentColor={accentColor}
            panelBg={panelBg}
          />
        )}
      </div>
    </div>
  );
};

// ============================================================================
// LFO Tab with sub-selector for LFO 1-8
// ============================================================================

interface LfoTabContentProps {
  paramByName: Map<string, VSTBridgeParam>;
  paramValues: Map<number, number>;
  setParam: (id: number, value: number) => void;
  knobColor: string;
  accentColor: string;
  panelBg: string;
}

const LfoTabContent: React.FC<LfoTabContentProps> = ({
  paramByName, paramValues, setParam, knobColor, accentColor, panelBg,
}) => {
  const [activeLfo, setActiveLfo] = useState(1);

  const lfoParams = [
    'frequency', 'sync', 'tempo', 'fade_time',
    'smooth_mode', 'delay_time', 'stereo', 'phase',
  ];

  return (
    <>
      {/* LFO sub-selector */}
      <div className="flex gap-1 mb-2">
        {[1, 2, 3, 4, 5, 6, 7, 8].map(n => (
          <button
            key={n}
            onClick={() => setActiveLfo(n)}
            className={`px-2.5 py-1 text-xs font-bold rounded transition-all ${
              activeLfo === n
                ? 'text-black'
                : 'bg-gray-800 text-gray-400 hover:bg-gray-700'
            }`}
            style={activeLfo === n ? { backgroundColor: accentColor } : {}}
          >
            LFO {n}
          </button>
        ))}
      </div>

      <div className={`p-4 rounded-xl border ${panelBg}`}>
        <h3 className="font-bold uppercase tracking-tight text-sm mb-3" style={{ color: accentColor }}>
          LFO {activeLfo}
        </h3>
        <div className="flex flex-wrap gap-3 justify-center">
          {lfoParams.map(paramSuffix => {
            const name = `lfo_${activeLfo}_${paramSuffix}`;
            const p = paramByName.get(name);
            if (!p) return null;
            const label = paramSuffix.replace(/_/g, ' ');
            return (
              <Knob
                key={name}
                label={label.length > 10 ? label.substring(0, 10) : label}
                value={paramValues.get(p.id) ?? p.defaultValue}
                min={p.min}
                max={p.max}
                defaultValue={p.defaultValue}
                onChange={(v) => setParam(p.id, v)}
                size="sm"
                color={knobColor}
              />
            );
          })}
        </div>
      </div>
    </>
  );
};

// ============================================================================
// Toggle button for on/off params
// ============================================================================

interface ToggleButtonProps {
  name: string;
  paramByName: Map<string, VSTBridgeParam>;
  paramValues: Map<number, number>;
  setParam: (id: number, value: number) => void;
  accentColor: string;
}

const ToggleButton: React.FC<ToggleButtonProps> = ({
  name, paramByName, paramValues, setParam, accentColor,
}) => {
  const p = paramByName.get(name);
  if (!p) return null;
  const val = paramValues.get(p.id) ?? p.defaultValue;
  const isOn = val > 0.5;

  return (
    <button
      onClick={() => setParam(p.id, isOn ? 0 : 1)}
      className={`px-2 py-1 text-[10px] font-bold rounded transition-all ${
        isOn ? 'text-black' : 'bg-gray-800 text-gray-500 hover:bg-gray-700'
      }`}
      style={isOn ? { backgroundColor: accentColor } : {}}
    >
      {isOn ? 'ON' : 'OFF'}
    </button>
  );
};

// ============================================================================
// Other (uncategorized) params tab
// ============================================================================

interface OtherParamsTabProps {
  allParams: VSTBridgeParam[];
  paramValues: Map<number, number>;
  setParam: (id: number, value: number) => void;
  knobColor: string;
  accentColor: string;
  panelBg: string;
}

const OtherParamsTab: React.FC<OtherParamsTabProps> = ({
  allParams, paramValues, setParam, knobColor, accentColor, panelBg,
}) => {
  const uncategorized = allParams.filter(p => !isParamCategorized(p.name));

  if (uncategorized.length === 0) {
    return (
      <div className={`p-4 rounded-xl border ${panelBg}`}>
        <p className="text-sm text-gray-500">All parameters are shown in the categorized tabs.</p>
      </div>
    );
  }

  // Group uncategorized params by prefix (first word before underscore)
  const groups = new Map<string, VSTBridgeParam[]>();
  for (const p of uncategorized) {
    const prefix = p.name.split('_').slice(0, 2).join('_');
    if (!groups.has(prefix)) groups.set(prefix, []);
    groups.get(prefix)!.push(p);
  }

  return (
    <>
      <div className={`p-3 rounded-lg border ${panelBg}`}>
        <p className="text-xs text-gray-500 mb-1">
          {uncategorized.length} additional parameters not shown in other tabs
        </p>
      </div>
      {Array.from(groups.entries()).map(([prefix, params]) => (
        <div key={prefix} className={`p-4 rounded-xl border ${panelBg}`}>
          <h3 className="font-bold uppercase tracking-tight text-sm mb-3" style={{ color: accentColor }}>
            {prefix.replace(/_/g, ' ')}
          </h3>
          <div className="flex flex-wrap gap-3 justify-center">
            {params.map(p => {
              const shortLabel = p.name.replace(`${prefix}_`, '').replace(/_/g, ' ');
              return (
                <Knob
                  key={p.id}
                  label={shortLabel.length > 12 ? shortLabel.substring(0, 12) : shortLabel}
                  value={paramValues.get(p.id) ?? p.defaultValue}
                  min={p.min}
                  max={p.max}
                  defaultValue={p.defaultValue}
                  onChange={(v) => setParam(p.id, v)}
                  size="sm"
                  color={knobColor}
                />
              );
            })}
          </div>
        </div>
      ))}
    </>
  );
};
