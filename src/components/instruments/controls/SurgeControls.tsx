/**
 * SurgeControls - Custom scene-based tabbed panel for Surge XT
 *
 * 766 parameters organized with a Scene A/B selector + 6 tabs:
 * OSC, FILTER, ENV, LFO, FX, GLOBAL.
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

type SurgeTab = 'osc' | 'filter' | 'env' | 'lfo' | 'fx' | 'global';
type Scene = 'A' | 'B';

const TABS: { id: SurgeTab; label: string }[] = [
  { id: 'osc', label: 'OSC' },
  { id: 'filter', label: 'FILTER' },
  { id: 'env', label: 'ENV' },
  { id: 'lfo', label: 'LFO' },
  { id: 'fx', label: 'FX' },
  { id: 'global', label: 'GLOBAL' },
];

interface SurgeControlsProps {
  instrument: InstrumentConfig;
  onChange: (updates: Partial<InstrumentConfig>) => void;
}

export const SurgeControls: React.FC<SurgeControlsProps> = ({
  instrument,
  onChange,
}) => {
  const [activeTab, setActiveTab] = useState<SurgeTab>('osc');
  const [activeScene, setActiveScene] = useState<Scene>('A');
  const [paramValues, setParamValues] = useState<Map<number, number>>(new Map());
  const [paramByName, setParamByName] = useState<Map<string, VSTBridgeParam>>(new Map());
  const [allParams, setAllParams] = useState<VSTBridgeParam[]>([]);
  const [synthReady, setSynthReady] = useState(false);
  const synthRef = useRef<VSTBridgeSynth | null>(null);

  const currentThemeId = useThemeStore((state) => state.currentThemeId);
  const isCyanTheme = currentThemeId === 'cyan-lineart';
  const accentColor = isCyanTheme ? '#00ffff' : '#ff8c00';
  const knobColor = isCyanTheme ? '#00ffff' : '#ff8c00';

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

  /** Get scene-prefixed params matching a pattern */
  const getSceneParams = useCallback((pattern: string): VSTBridgeParam[] => {
    const prefix = `${activeScene} ${pattern}`;
    return allParams.filter(p => p.name.startsWith(prefix));
  }, [allParams, activeScene]);

  if (!synthReady) {
    return (
      <div className="flex flex-col gap-4 p-4">
        <div className="flex items-center justify-center gap-2 p-4 text-gray-400">
          <Loader size={16} className="animate-spin" />
          <span className="text-sm">Loading Surge XT...</span>
        </div>
        <VSTBridgePanel instrument={instrument} onChange={onChange} />
      </div>
    );
  }

  const panelBg = isCyanTheme
    ? 'bg-[#051515] border-cyan-900/50'
    : 'bg-[#1a1a1a] border-orange-900/30';

  const tabBarBg = isCyanTheme ? 'bg-[#061818]' : 'bg-[#111]';

  return (
    <div className="flex flex-col gap-0 overflow-y-auto">
      {/* Scene selector + Tab bar */}
      <div className={`flex items-center gap-3 px-4 py-2 ${tabBarBg} border-b border-gray-800`}>
        {/* Scene buttons */}
        <div className="flex gap-1">
          {(['A', 'B'] as Scene[]).map(scene => (
            <button
              key={scene}
              onClick={() => setActiveScene(scene)}
              className={`px-3 py-1.5 text-xs font-bold rounded transition-all ${
                activeScene === scene
                  ? 'text-black'
                  : 'bg-gray-800 text-gray-400 hover:bg-gray-700'
              }`}
              style={activeScene === scene ? { backgroundColor: accentColor } : {}}
            >
              Scene {scene}
            </button>
          ))}
        </div>

        <div className="w-px h-6 bg-gray-700" />

        {/* Tab buttons */}
        <div className="flex gap-1">
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
      </div>

      {/* Tab content */}
      <div className="p-4 flex flex-col gap-4">
        {activeTab === 'osc' && (
          <>
            {[1, 2, 3].map(n => {
              const oscParams = getSceneParams(`Osc ${n}`);
              if (oscParams.length === 0) return null;

              return (
                <div key={n} className={`p-4 rounded-xl border ${panelBg}`}>
                  <h3 className="font-bold uppercase tracking-tight text-sm mb-3" style={{ color: accentColor }}>
                    {activeScene} - Oscillator {n}
                  </h3>
                  <div className="flex flex-wrap gap-3 justify-center">
                    <ParamKnob name={`${activeScene} Osc ${n} Pitch`} label="Pitch" bipolar
                      fmt={(v) => `${v > 0 ? '+' : ''}${Math.round(v)}st`} />
                    {oscParams
                      .filter(p => !p.name.includes('Pitch') && !p.name.includes('Type'))
                      .slice(0, 8)
                      .map(p => {
                        const shortName = p.name.replace(`${activeScene} Osc ${n} `, '');
                        return (
                          <Knob
                            key={p.id}
                            label={shortName.length > 10 ? shortName.substring(0, 10) : shortName}
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
              );
            })}
          </>
        )}

        {activeTab === 'filter' && (
          <>
            {[1, 2].map(n => {
              const filParams = getSceneParams(`Filter ${n}`);
              if (filParams.length === 0) return null;

              return (
                <div key={n} className={`p-4 rounded-xl border ${panelBg}`}>
                  <h3 className="font-bold uppercase tracking-tight text-sm mb-3" style={{ color: accentColor }}>
                    {activeScene} - Filter {n}
                  </h3>
                  <div className="flex flex-wrap gap-3 justify-center">
                    <ParamKnob name={`${activeScene} Filter ${n} Frequency`} label="Cutoff" logarithmic />
                    <ParamKnob name={`${activeScene} Filter ${n} Resonance`} label="Resonance" />
                    <ParamKnob name={`${activeScene} Filter ${n} Env Depth`} label="Env Depth" bipolar />
                    <ParamKnob name={`${activeScene} Filter ${n} Keytrack`} label="Keytrack" bipolar />
                    {filParams
                      .filter(p => {
                        const n = p.name.toLowerCase();
                        return !n.includes('frequency') && !n.includes('resonance') &&
                               !n.includes('env depth') && !n.includes('keytrack') && !n.includes('type');
                      })
                      .slice(0, 4)
                      .map(p => {
                        const shortName = p.name.replace(new RegExp(`${activeScene} Filter \\d+ `), '');
                        return (
                          <Knob
                            key={p.id}
                            label={shortName.length > 10 ? shortName.substring(0, 10) : shortName}
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
              );
            })}
          </>
        )}

        {activeTab === 'env' && (
          <>
            {['Amp EG', 'Filter EG'].map(egName => (
              <div key={egName} className={`p-4 rounded-xl border ${panelBg}`}>
                <h3 className="font-bold uppercase tracking-tight text-sm mb-3" style={{ color: accentColor }}>
                  {activeScene} - {egName}
                </h3>
                <div className="flex flex-wrap gap-3 justify-center">
                  <ParamKnob name={`${activeScene} ${egName} Attack`} label="Attack"
                    fmt={(v) => `${(v * 1000).toFixed(0)}ms`} />
                  <ParamKnob name={`${activeScene} ${egName} Decay`} label="Decay"
                    fmt={(v) => `${(v * 1000).toFixed(0)}ms`} />
                  <ParamKnob name={`${activeScene} ${egName} Sustain`} label="Sustain"
                    fmt={(v) => `${Math.round(v * 100)}%`} />
                  <ParamKnob name={`${activeScene} ${egName} Release`} label="Release"
                    fmt={(v) => `${(v * 1000).toFixed(0)}ms`} />
                  <ParamKnob name={`${activeScene} ${egName} Attack Shape`} label="A Shape" bipolar />
                  <ParamKnob name={`${activeScene} ${egName} Decay Shape`} label="D Shape" bipolar />
                  <ParamKnob name={`${activeScene} ${egName} Release Shape`} label="R Shape" bipolar />
                </div>
              </div>
            ))}
          </>
        )}

        {activeTab === 'lfo' && (
          <SurgeLfoTab
            activeScene={activeScene}
            paramValues={paramValues}
            setParam={setParam}
            knobColor={knobColor}
            accentColor={accentColor}
            panelBg={panelBg}
            allParams={allParams}
          />
        )}

        {activeTab === 'fx' && (
          <SurgeFxTab
            allParams={allParams}
            paramValues={paramValues}
            setParam={setParam}
            knobColor={knobColor}
            accentColor={accentColor}
            panelBg={panelBg}
          />
        )}

        {activeTab === 'global' && (
          <div className={`p-4 rounded-xl border ${panelBg}`}>
            <h3 className="font-bold uppercase tracking-tight text-sm mb-3" style={{ color: accentColor }}>
              Global
            </h3>
            <div className="flex flex-wrap gap-4 justify-center">
              <ParamKnob name="Volume" label="Volume" size="md" />
              <ParamKnob name="Active Scene" label="Scene"
                fmt={(v) => v < 0.5 ? 'A' : 'B'} />
              <ParamKnob name="Scene Mode" label="Mode"
                fmt={(v) => ['Single', 'Key Split', 'Dual', 'Ch Split'][Math.round(v)] || `${Math.round(v)}`} />
              <ParamKnob name="Split Point" label="Split" size="md"
                fmt={(v) => `${Math.round(v)}`} />
              <ParamKnob name="FX Return A" label="FX Ret A" size="md" />
              <ParamKnob name="FX Return B" label="FX Ret B" size="md" />
              <ParamKnob name="Polyphony" label="Poly"
                fmt={(v) => `${Math.round(v)}`} />
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

// ============================================================================
// LFO Tab with sub-selector
// ============================================================================

interface SurgeLfoTabProps {
  activeScene: Scene;
  paramValues: Map<number, number>;
  setParam: (id: number, value: number) => void;
  knobColor: string;
  accentColor: string;
  panelBg: string;
  allParams: VSTBridgeParam[];
}

const SurgeLfoTab: React.FC<SurgeLfoTabProps> = ({
  activeScene, paramValues, setParam, knobColor, accentColor, panelBg, allParams,
}) => {
  const [activeLfo, setActiveLfo] = useState(1);

  // Surge has voice LFOs 1-6 and scene LFOs 1-2 (S-LFO)
  const lfoLabels = ['LFO 1', 'LFO 2', 'LFO 3', 'LFO 4', 'LFO 5', 'LFO 6', 'S-LFO 1', 'S-LFO 2'];

  const currentLfoName = lfoLabels[activeLfo - 1] || 'LFO 1';
  const prefix = `${activeScene} ${currentLfoName}`;
  const lfoParams = allParams.filter(p => p.name.startsWith(prefix));

  return (
    <>
      <div className="flex gap-1 flex-wrap mb-2">
        {lfoLabels.map((label, i) => (
          <button
            key={label}
            onClick={() => setActiveLfo(i + 1)}
            className={`px-2 py-1 text-[10px] font-bold rounded transition-all ${
              activeLfo === i + 1
                ? 'text-black'
                : 'bg-gray-800 text-gray-400 hover:bg-gray-700'
            }`}
            style={activeLfo === i + 1 ? { backgroundColor: accentColor } : {}}
          >
            {label}
          </button>
        ))}
      </div>

      <div className={`p-4 rounded-xl border ${panelBg}`}>
        <h3 className="font-bold uppercase tracking-tight text-sm mb-3" style={{ color: accentColor }}>
          {activeScene} - {currentLfoName}
        </h3>
        <div className="flex flex-wrap gap-3 justify-center">
          {lfoParams.slice(0, 12).map(p => {
            const shortName = p.name.replace(`${prefix} `, '');
            return (
              <Knob
                key={p.id}
                label={shortName.length > 10 ? shortName.substring(0, 10) : shortName}
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
// FX Tab — Groups FX params by slot
// ============================================================================

interface SurgeFxTabProps {
  allParams: VSTBridgeParam[];
  paramValues: Map<number, number>;
  setParam: (id: number, value: number) => void;
  knobColor: string;
  accentColor: string;
  panelBg: string;
}

const SurgeFxTab: React.FC<SurgeFxTabProps> = ({
  allParams, paramValues, setParam, knobColor, accentColor, panelBg,
}) => {
  // Group FX params by slot prefix: FX A1, FX A2, etc.
  const fxSlots = ['A1', 'A2', 'A3', 'A4', 'B1', 'B2', 'B3', 'B4', 'S1', 'S2', 'S3', 'S4', 'G1', 'G2', 'G3', 'G4'];
  const fxGroups = fxSlots.map(slot => {
    const prefix = `FX ${slot}`;
    const params = allParams.filter(p => p.name.startsWith(prefix));
    return { slot, prefix, params };
  }).filter(g => g.params.length > 0);

  if (fxGroups.length === 0) {
    // Fallback: show all params starting with "FX"
    const fxParams = allParams.filter(p => p.name.startsWith('FX'));
    if (fxParams.length === 0) {
      return (
        <div className={`p-4 rounded-xl border ${panelBg}`}>
          <p className="text-sm text-gray-500">No FX parameters available.</p>
        </div>
      );
    }

    return (
      <div className={`p-4 rounded-xl border ${panelBg}`}>
        <h3 className="font-bold uppercase tracking-tight text-sm mb-3" style={{ color: accentColor }}>
          Effects
        </h3>
        <div className="flex flex-wrap gap-3 justify-center">
          {fxParams.slice(0, 40).map(p => (
            <Knob
              key={p.id}
              label={p.name.replace('FX ', '').substring(0, 10)}
              value={paramValues.get(p.id) ?? p.defaultValue}
              min={p.min}
              max={p.max}
              defaultValue={p.defaultValue}
              onChange={(v) => setParam(p.id, v)}
              size="sm"
              color={knobColor}
            />
          ))}
        </div>
      </div>
    );
  }

  return (
    <>
      {fxGroups.map(({ slot, prefix, params }) => (
        <div key={slot} className={`p-4 rounded-xl border ${panelBg}`}>
          <h3 className="font-bold uppercase tracking-tight text-sm mb-3" style={{ color: accentColor }}>
            FX {slot}
          </h3>
          <div className="flex flex-wrap gap-3 justify-center">
            {params.slice(0, 10).map(p => {
              const shortName = p.name.replace(`${prefix} `, '');
              return (
                <Knob
                  key={p.id}
                  label={shortName.length > 10 ? shortName.substring(0, 10) : shortName}
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
