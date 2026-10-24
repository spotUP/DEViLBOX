/**
 * Odin2Controls - panel for the real Odin2 synth (OdinAudioProcessor compiled to WASM).
 *
 * Every knob is looked up by engine parameter NAME from getParams() (osc1_vol, fil1_freq, ...), with the
 * engine's own ranges. Oscillator and filter type selectors are ValueTree properties, driven through the
 * 'setValueTreeProperty' command. Presets are the plugin's native .odin state, loaded through 'loadPreset'
 * (bundled picker and file import share one path, see engine/vstbridge/odin2Preset.ts).
 * Falls back to VSTBridgePanel while the synth is not loaded.
 */

import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Knob } from '@components/controls/Knob';
import { Toggle } from '@components/controls/Toggle';
import { Loader } from 'lucide-react';
import { useInstrumentColors } from '@/hooks/useInstrumentColors';
import { getToneEngine } from '@engine/ToneEngine';
import type { InstrumentConfig } from '@typedefs/instrument';
import type { VSTBridgeSynth } from '@engine/vstbridge/VSTBridgeSynth';
import type { VSTBridgeParam } from '@engine/vstbridge/synth-registry';
import { VSTBridgePanel } from './VSTBridgePanel';
import { PatchLoadButton } from './PatchLoadButton';
import { CustomSelect, type SelectOptionGroup } from '@components/common/CustomSelect';
import { notify } from '@stores/useNotificationStore';
import { ODIN2_PRESETS } from '@constants/odin2PresetIndex';
import {
  ODIN2_PRESET_PARAM_KEY, fetchBundledOdin2Preset, findOdin2Preset,
  loadOdin2PresetBytes, setOdin2Selector, type Odin2SelectorTree,
} from '@engine/vstbridge/odin2Preset';
import { odinPresetValues } from '@engine/vstbridge/odinState';

/** Pack, then category: "Factory / Bass", "Lukas Lundh", "PSY-LION". */
const PRESET_GROUPS: SelectOptionGroup[] = Array.from(
  ODIN2_PRESETS.reduce((map, p) => {
    const group = p.pack === 'factory' ? `Factory / ${p.category}` : p.category;
    const list = map.get(group) ?? [];
    list.push({ value: p.id, label: p.name });
    return map.set(group, list);
  }, new Map<string, { value: string; label: string }[]>()),
).map(([label, options]) => ({ label, options }));

/** Selector values are the engine's enum numbers (GlobalIncludes.h), not list positions. */
const OSC_TYPES = [
  { value: '2', label: 'Analog' }, { value: '3', label: 'Wavetable' }, { value: '4', label: 'Multi' },
  { value: '5', label: 'Vector' }, { value: '6', label: 'Chiptune' }, { value: '7', label: 'FM' },
  { value: '8', label: 'Phase Modulation' }, { value: '15', label: 'Noise' }, { value: '20', label: 'Wave Draw' },
  { value: '21', label: 'Chip Draw' }, { value: '22', label: 'Spectral Draw' },
];
const FILTER_TYPES = [
  { value: '1', label: 'Off' }, { value: '2', label: 'Low Pass 24' }, { value: '3', label: 'Low Pass 12' },
  { value: '4', label: 'Band Pass 24' }, { value: '5', label: 'Band Pass 12' }, { value: '6', label: 'High Pass 24' },
  { value: '7', label: 'High Pass 12' }, { value: '15', label: 'SEM 12' }, { value: '19', label: 'Diode' },
  { value: '24', label: 'Korg Low Pass' }, { value: '25', label: 'Korg High Pass' }, { value: '30', label: 'Comb' },
  { value: '35', label: 'Formant' }, { value: '40', label: 'Ring Modulator' },
];

interface KnobSpec { name: string; label: string; min?: number; max?: number; bipolar?: boolean; logarithmic?: boolean; unit?: string; step?: number }
interface ToggleSpec { name: string; label: string }

const k = (name: string, label: string, extra: Partial<KnobSpec> = {}): KnobSpec => ({ name, label, ...extra });

const oscKnobs = (n: number): KnobSpec[] => [
  k(`osc${n}_vol`, 'Volume', { unit: 'dB' }), k(`osc${n}_oct`, 'Octave', { step: 1 }), k(`osc${n}_semi`, 'Semitone', { bipolar: true, step: 1 }),
  k(`osc${n}_fine`, 'Fine', { bipolar: true, unit: 'ct' }), k(`osc${n}_position`, 'Position'), k(`osc${n}_pulsewidth`, 'Pulse Width'),
  k(`osc${n}_detune`, 'Detune'), k(`osc${n}_spread`, 'Spread'), k(`osc${n}_fm`, 'FM Amount'), k(`osc${n}_drift`, 'Drift'),
];
const filKnobs = (n: number): KnobSpec[] => [
  k(`fil${n}_freq`, 'Frequency', { logarithmic: true, unit: 'Hz' }), k(`fil${n}_res`, 'Resonance'), k(`fil${n}_gain`, 'Gain', { unit: 'dB' }),
  k(`fil${n}_env`, 'Envelope', { bipolar: true }), k(`fil${n}_kbd`, 'Key Track'), k(`fil${n}_vel`, 'Velocity'), k(`fil${n}_saturation`, 'Saturation'),
];
const envKnobs = (n: number): KnobSpec[] => [
  k(`env${n}_attack`, 'Attack', { logarithmic: true, unit: 's' }), k(`env${n}_decay`, 'Decay', { logarithmic: true, unit: 's' }),
  k(`env${n}_sustain`, 'Sustain'), k(`env${n}_release`, 'Release', { logarithmic: true, unit: 's' }),
];

const MASTER_KNOBS: KnobSpec[] = [
  k('master', 'Master', { unit: 'dB' }), k('amp_gain', 'Amp Gain', { unit: 'dB' }), k('amp_pan', 'Amp Pan', { bipolar: true }),
  k('amp_velocity', 'Amp Velocity'), k('glide', 'Glide'), k('unison_detune', 'Unison Detune'), k('unison_width', 'Unison Width'),
  k('dist_boost', 'Distortion Boost'), k('dist_drywet', 'Distortion Mix'),
];
const LFO_KNOBS: KnobSpec[] = [1, 2, 3, 4].map((n) => k(`lfo${n}_freq`, `LFO ${n} Rate`, { logarithmic: true, unit: 'Hz' }));
const FX_GROUPS: { title: string; on: string; knobs: KnobSpec[] }[] = [
  { title: 'Delay', on: 'delay_on', knobs: [k('delay_time', 'Time', { unit: 's' }), k('delay_feedback', 'Feedback'), k('delay_hp', 'High Pass'), k('delay_ducking', 'Ducking'), k('delay_dry', 'Dry'), k('delay_wet', 'Wet')] },
  { title: 'Reverb', on: 'reverb_on', knobs: [k('rev_delay', 'Pre Delay'), k('rev_mid_hall', 'Hall'), k('rev_hf_damp', 'Damping'), k('rev_eqgain', 'EQ Gain'), k('rev_eqfreq', 'EQ Frequency'), k('rev_drywet', 'Mix')] },
  { title: 'Phaser', on: 'phaser_on', knobs: [k('phaser_freq', 'Frequency'), k('phaser_feedback', 'Feedback'), k('phaser_rate', 'Rate'), k('phaser_mod', 'Depth'), k('phaser_drywet', 'Mix')] },
  { title: 'Flanger', on: 'flanger_on', knobs: [k('flanger_rate', 'Rate'), k('flanger_feedback', 'Feedback'), k('flanger_amount', 'Amount'), k('flanger_drywet', 'Mix')] },
  { title: 'Chorus', on: 'chorus_on', knobs: [k('chorus_rate', 'Rate'), k('chorus_amount', 'Amount'), k('chorus_feedback', 'Feedback'), k('chorus_drywet', 'Mix')] },
];

interface ControlsContext {
  paramByName: Map<string, VSTBridgeParam>;
  values: Map<number, number>;
  setParam: (id: number, value: number) => void;
  knobColor: string;
}

const NamedKnobs: React.FC<{ specs: KnobSpec[]; ctx: ControlsContext }> = ({ specs, ctx }) => (
  <>
    {specs.map((s) => {
      const p = ctx.paramByName.get(s.name);
      if (!p) return null;
      const unit = s.unit;
      return (
        <Knob
          key={s.name}
          label={s.label}
          value={ctx.values.get(p.id) ?? p.defaultValue}
          min={s.min ?? p.min}
          max={s.max ?? p.max}
          defaultValue={p.defaultValue}
          step={s.step}
          onChange={(v) => ctx.setParam(p.id, s.step ? Math.round(v) : v)}
          color={ctx.knobColor}
          bipolar={s.bipolar}
          logarithmic={s.logarithmic}
          formatValue={unit ? (v) => `${v >= 100 ? v.toFixed(0) : v.toFixed(2)} ${unit}` : undefined}
        />
      );
    })}
  </>
);

const NamedToggle: React.FC<{ spec: ToggleSpec; ctx: ControlsContext }> = ({ spec, ctx }) => {
  const p = ctx.paramByName.get(spec.name);
  if (!p) return null;
  return (
    <Toggle label={spec.label} value={(ctx.values.get(p.id) ?? p.defaultValue) > 0.5} onChange={(on) => ctx.setParam(p.id, on ? 1 : 0)} />
  );
};

interface Odin2ControlsProps {
  instrument: InstrumentConfig;
  onChange: (updates: Partial<InstrumentConfig>) => void;
}

export const Odin2Controls: React.FC<Odin2ControlsProps> = ({ instrument, onChange }) => {
  const [values, setValues] = useState<Map<number, number>>(new Map());
  const [paramByName, setParamByName] = useState<Map<string, VSTBridgeParam>>(new Map());
  const [selectors, setSelectors] = useState<Record<string, number>>({});
  const [synthReady, setSynthReady] = useState(false);
  const synthRef = useRef<VSTBridgeSynth | null>(null);

  const { accent: accentColor, knob: knobColor, panelBg, panelStyle } = useInstrumentColors('#4a9eff');

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
        await synth.ensureInitialized();
        synthRef.current = synth;
        const wasmParams = synth.getParams();
        const nameMap = new Map<string, VSTBridgeParam>();
        const valMap = new Map<number, number>();
        for (const p of wasmParams) {
          nameMap.set(p.name, p);
          // The synth already holds the instrument's preset: show its live values, not the defaults.
          valMap.set(p.id, synth.getParameter(p.id) ?? p.defaultValue);
        }
        if (!cancelled) {
          setParamByName(nameMap);
          setValues(valMap);
          setSynthReady(true);
        }
      } catch {
        setTimeout(() => { if (!cancelled) connect(); }, 1000);
      }
    };
    connect();
    return () => { cancelled = true; };
  }, [instrument.id]);

  const setParam = useCallback((id: number, value: number) => {
    setValues((prev) => new Map(prev).set(id, value));
    synthRef.current?.setParameter(id, value);
  }, []);

  const setSelector = useCallback((tree: Odin2SelectorTree, property: string, value: number) => {
    const synth = synthRef.current;
    if (!synth) return;
    setSelectors((prev) => ({ ...prev, [`${tree}.${property}`]: value }));
    void setOdin2Selector(synth, tree, property, value).then((ok) => {
      if (!ok) notify.error(`Odin2 rejected ${tree}.${property}`);
    });
  }, []);

  const storedPresetId = (instrument.parameters as Record<string, unknown> | undefined)?.[ODIN2_PRESET_PARAM_KEY];
  const [presetId, setPresetId] = useState<string>(typeof storedPresetId === 'string' ? storedPresetId : '');
  const [presetBusy, setPresetBusy] = useState(false);

  /** Single UI load path: send the bytes to the synth, then mirror the file's values into the knobs. */
  const applyPresetBytes = useCallback(async (bytes: Uint8Array, label: string, gainTrimDb: number): Promise<boolean> => {
    const synth = synthRef.current;
    if (!synth) return false;
    setPresetBusy(true);
    try {
      const preset = odinPresetValues(bytes);
      const ok = await loadOdin2PresetBytes(synth, bytes);
      if (!ok) {
        notify.error(`Odin2 could not load preset "${label}"`);
        return false;
      }
      synth.setPresetGainTrimDb(gainTrimDb);
      setValues(() => {
        const next = new Map<number, number>();
        for (const [name, p] of paramByName) next.set(p.id, preset.params[name] ?? p.defaultValue);
        return next;
      });
      setSelectors(preset.selectors);
      return true;
    } catch (err) {
      notify.error(`Odin2 preset "${label}": ${err instanceof Error ? err.message : String(err)}`);
      return false;
    } finally {
      setPresetBusy(false);
    }
  }, [paramByName]);

  const handlePickPreset = useCallback(async (id: string) => {
    const entry = findOdin2Preset(id);
    if (!entry) return;
    setPresetId(id);
    try {
      const ok = await applyPresetBytes(await fetchBundledOdin2Preset(entry), entry.name, entry.gainTrimDb);
      if (ok) onChange({ parameters: { ...(instrument.parameters ?? {}), [ODIN2_PRESET_PARAM_KEY]: id } });
    } catch (err) {
      notify.error(`Odin2 preset "${entry.name}": ${err instanceof Error ? err.message : String(err)}`);
    }
  }, [applyPresetBytes, instrument.parameters, onChange]);

  const handleImportFile = useCallback(async (bytes: Uint8Array, fileName: string) => {
    const ok = await applyPresetBytes(bytes, fileName, 0);
    if (ok) setPresetId('');
  }, [applyPresetBytes]);

  if (!synthReady) {
    return (
      <div className="grid grid-cols-4 gap-2 p-2">
        <div className="flex items-center justify-center gap-2 p-4 text-text-secondary">
          <Loader size={16} className="animate-spin" />
          <span className="text-sm">Loading Odin2...</span>
        </div>
        <VSTBridgePanel instrument={instrument} onChange={onChange} />
      </div>
    );
  }

  const ctx: ControlsContext = { paramByName, values, setParam, knobColor };
  const section = (title: string, children: React.ReactNode, extra?: React.ReactNode) => (
    <div key={title} className={`p-2 rounded-lg border ${panelBg}`} style={panelStyle}>
      <div className="flex items-center gap-2 mb-2">
        <h3 className="font-bold uppercase tracking-tight text-sm" style={{ color: accentColor }}>{title}</h3>
        {extra}
      </div>
      <div className="flex gap-2 flex-wrap">{children}</div>
    </div>
  );
  const selector = (tree: Odin2SelectorTree, property: string, options: { value: string; label: string }[]) => (
    <CustomSelect
      value={String(selectors[`${tree}.${property}`] ?? '')}
      onChange={(v) => setSelector(tree, property, Number(v))}
      options={options}
      placeholder="Type"
      className="w-40"
    />
  );

  return (
    <div className="flex flex-col gap-0 overflow-y-auto">
      <div className="flex items-center gap-2 px-4 py-2 border-b border-dark-border">
        <CustomSelect
          value={presetId}
          onChange={handlePickPreset}
          options={PRESET_GROUPS}
          placeholder="Select Preset"
          disabled={presetBusy}
          className="w-72"
        />
        <PatchLoadButton synthType="Odin2" label="Import Preset File" busy={presetBusy} onLoad={(buffer, name) => handleImportFile(new Uint8Array(buffer), name)} />
      </div>
      <div className="p-4 grid grid-cols-1 xl:grid-cols-2 gap-3">
        {section('Master', <NamedKnobs specs={MASTER_KNOBS} ctx={ctx} />)}
        {[1, 2, 3].map((n) => section(
          `Oscillator ${n}`,
          <>
            <NamedKnobs specs={oscKnobs(n)} ctx={ctx} />
            <NamedToggle spec={{ name: `osc${n}_reset`, label: 'Reset' }} ctx={ctx} />
            {n > 1 && <NamedToggle spec={{ name: `osc${n}_sync`, label: 'Sync' }} ctx={ctx} />}
          </>,
          selector('osc', `osc${n}_type`, OSC_TYPES),
        ))}
        {[1, 2].map((n) => section(
          `Filter ${n}`,
          <NamedKnobs specs={filKnobs(n)} ctx={ctx} />,
          selector('misc', `fil${n}_type`, FILTER_TYPES),
        ))}
        {[1, 2, 3, 4].map((n) => section(`Envelope ${n}`, <>
          <NamedKnobs specs={envKnobs(n)} ctx={ctx} />
          <NamedToggle spec={{ name: `env${n}_loop`, label: 'Loop' }} ctx={ctx} />
        </>))}
        {section('LFOs', <NamedKnobs specs={LFO_KNOBS} ctx={ctx} />)}
        {section('Arpeggiator', <>
          <NamedToggle spec={{ name: 'arp_on', label: 'Arpeggiator' }} ctx={ctx} />
          <NamedToggle spec={{ name: 'arp_one_shot', label: 'One Shot' }} ctx={ctx} />
        </>)}
        {FX_GROUPS.map((fx) => section(fx.title, <NamedKnobs specs={fx.knobs} ctx={ctx} />, <NamedToggle spec={{ name: fx.on, label: 'On' }} ctx={ctx} />))}
      </div>
    </div>
  );
};
