/**
 * TB303KnobPanel - Live filter control knobs for TB-303 synthesizer
 */

import React, { useState, useCallback, useEffect, useReducer, useRef } from 'react';
import * as Tone from 'tone';
import { Save, ChevronDown, ChevronUp, Radio } from 'lucide-react';
import { Knob } from '@components/controls/Knob';
import { Toggle } from '@components/controls/Toggle';
import { Switch3Way } from '@components/controls/Switch3Way';
import { useInstrumentStore, useUIStore, useTransportStore, useTrackerStore, useAutomationStore } from '@stores';
import { useShallow } from 'zustand/react/shallow';
import { useMIDIStore } from '@stores/useMIDIStore';
import { getToneEngine } from '@engine/ToneEngine';
import { TB303 } from '@engine/TB303Engine';
import { getManualOverrideManager } from '@engine/ManualOverrideManager';
import { TB303_PRESETS } from '@constants/tb303Presets';
import { NEURAL_MODELS } from '@constants/neuralModels';
import type { DevilFishConfig } from '@typedefs/instrument';
import { DEFAULT_DEVIL_FISH } from '@typedefs/instrument';

interface TB303Params {
  tuning: number; cutoff: number; resonance: number; envMod: number; decay: number; accent: number; overdrive: number; neuralModel?: string;
}

const DEFAULT_PARAMS: TB303Params = {
  tuning: 0, cutoff: 800, resonance: 65, envMod: 60, decay: 200, accent: 70, overdrive: 0, neuralModel: 'none',
};

interface LiveModulationState {
  tuning?: number; cutoff?: number; resonance?: number; envMod?: number; decay?: number; accent?: number; overdrive?: number;
  normalDecay?: number; accentDecay?: number; vegDecay?: number; vegSustain?: number; softAttack?: number; filterTracking?: number; filterFM?: number;
}

const liveModulationReducer = (state: LiveModulationState, action: any): LiveModulationState => {
  switch (action.type) {
    case 'SET_MULTIPLE': return { ...state, ...action.values };
    case 'RESET': return {};
    default: return state;
  }
};

const TB303KnobPanelComponent: React.FC = () => {
  const { instruments, updateInstrument } = useInstrumentStore(useShallow((state) => ({ instruments: state.instruments, updateInstrument: state.updateInstrument })));
  const { patterns, currentPatternIndex } = useTrackerStore(useShallow((state) => ({ patterns: state.patterns, currentPatternIndex: state.currentPatternIndex })));
  const isPlaying = useTransportStore((state) => state.isPlaying);
  const curves = useAutomationStore((state) => state.curves);
  const { tb303Collapsed, toggleTB303Collapsed } = useUIStore(useShallow((state) => ({ tb303Collapsed: state.tb303Collapsed, toggleTB303Collapsed: state.toggleTB303Collapsed })));
  const { registerCCHandler, unregisterCCHandler, controlledInstrumentId, setControlledInstrument } = useMIDIStore();

  const [params, setParams] = useState<TB303Params>(DEFAULT_PARAMS);
  const [showPresetMenu, setShowPresetMenu] = useState(false);
  const [showSaveDialog, setShowSaveDialog] = useState(false);
  const [presetName, setPresetName] = useState('');
  const [liveModulation, dispatchLiveModulation] = useReducer(liveModulationReducer, {});
  const animationRef = useRef<number | null>(null);

  const {
    tuning: liveTuning, cutoff: liveCutoff, resonance: liveResonance, envMod: liveEnvMod, decay: liveDecay, accent: liveAccent, overdrive: liveOverdrive,
    normalDecay: liveNormalDecay, accentDecay: liveAccentDecay, vegDecay: liveVegDecay, vegSustain: liveVegSustain, softAttack: liveSoftAttack, filterTracking: liveFilterTracking, filterFM: liveFilterFM,
  } = liveModulation;

  const [devilFishConfig, setDevilFishConfig] = useState<DevilFishConfig>({ ...DEFAULT_DEVIL_FISH });
  const tb303Instruments = instruments.filter(i => i.synthType === 'TB303');
  const engine = getToneEngine();
  const overrideManager = getManualOverrideManager();

  const updateAllTB303 = useCallback((setter: (synth: TB303) => void) => {
    const engineInstruments = (engine as any).instrumentManager.instruments;
    if (!engineInstruments) return;
    engineInstruments.forEach((instrument: any, key: string) => {
      if (instrument.isTB303) {
        const id = Number(key.split('-')[0]);
        if (controlledInstrumentId === null || controlledInstrumentId === id) setter(instrument);
      }
    });
  }, [engine, controlledInstrumentId]);

  const persistToStore = useCallback((paramUpdates: Partial<TB303Params>) => {
    tb303Instruments.forEach(inst => {
      const currentTb303 = inst.tb303;
      if (!currentTb303) return;
      updateInstrument(inst.id, {
        tb303: {
          ...currentTb303,
          tuning: paramUpdates.tuning ?? currentTb303.tuning ?? 0,
          filter: { ...currentTb303.filter, cutoff: paramUpdates.cutoff ?? currentTb303.filter?.cutoff ?? 800, resonance: paramUpdates.resonance ?? currentTb303.filter?.resonance ?? 65 },
          filterEnvelope: { ...currentTb303.filterEnvelope, envMod: paramUpdates.envMod ?? currentTb303.filterEnvelope?.envMod ?? 60, decay: paramUpdates.decay ?? currentTb303.filterEnvelope?.decay ?? 200 },
          accent: { ...currentTb303.accent, amount: paramUpdates.accent ?? currentTb303.accent?.amount ?? 70 },
          overdrive: { ...currentTb303.overdrive, amount: paramUpdates.overdrive ?? currentTb303.overdrive?.amount ?? 0 },
          neuralModel: paramUpdates.neuralModel ?? currentTb303.neuralModel ?? 'none',
        },
      });
    });
  }, [tb303Instruments, updateInstrument]);

  // LIVE POLL
  useEffect(() => {
    if (!isPlaying) { dispatchLiveModulation({ type: 'RESET' }); return; }
    const pattern = patterns[currentPatternIndex];
    if (!pattern) return;
    const poll = () => {
      const transport = Tone.getTransport();
      const bpm = engine.getBPM();
      const secondsPerRow = (2.5 / bpm) * 6;
      const row = (transport.seconds / secondsPerRow) % pattern.length;
      const getV = (p: string) => {
        const c = curves.find(c => c.patternId === pattern.id && c.parameter === p && c.enabled && c.points.length > 0);
        if (!c) return null;
        const pts = [...c.points].sort((a, b) => a.row - b.row);
        if (row <= pts[0].row) return pts[0].value;
        if (row >= pts[pts.length-1].row) return pts[pts.length-1].value;
        let b = pts[0], a = pts[pts.length-1];
        for (let i=0; i<pts.length-1; i++) { if (pts[i].row <= row && pts[i+1].row >= row) { b = pts[i]; a = pts[i+1]; break; } }
        const t = (row - b.row) / (a.row - b.row);
        return b.value + (a.value - b.value) * t;
      };
      const updates: any = {};
      const cV = getV('cutoff'); if (cV !== null) updates.cutoff = 50 * Math.pow(360, cV);
      const rV = getV('resonance'); if (rV !== null) updates.resonance = rV * 100;
      const eMV = getV('envMod'); if (eMV !== null) updates.envMod = eMV * 100;
      const dV = getV('decay'); if (dV !== null) updates.decay = 30 * Math.pow(100, dV);
      const aV = getV('accent'); if (aV !== null) updates.accent = aV * 100;
      const oV = getV('overdrive'); if (oV !== null) updates.overdrive = oV * 100;
      const tV = getV('tuning'); if (tV !== null) updates.tuning = (tV - 0.5) * 2400;
      
      const nDV = getV('normalDecay'); if (nDV !== null) updates.normalDecay = 30 * Math.pow(100, nDV);
      const aDV = getV('accentDecay'); if (aDV !== null) updates.accentDecay = 30 * Math.pow(100, aDV);
      const sAV = getV('softAttack'); if (sAV !== null) updates.softAttack = 0.3 * Math.pow(100, sAV);
      const vDV = getV('vegDecay'); if (vDV !== null) updates.vegDecay = 16 * Math.pow(187.5, vDV);
      const vSV = getV('vegSustain'); if (vSV !== null) updates.vegSustain = vSV * 100;
      const fTV = getV('filterTracking'); if (fTV !== null) updates.filterTracking = fTV * 200;
      const fFMV = getV('filterFM'); if (fFMV !== null) updates.filterFM = fFMV * 100;

      dispatchLiveModulation({ type: 'SET_MULTIPLE', values: updates });
      animationRef.current = requestAnimationFrame(poll);
    };
    animationRef.current = requestAnimationFrame(poll);
    return () => { if (animationRef.current) cancelAnimationFrame(animationRef.current); };
  }, [isPlaying, engine, patterns, currentPatternIndex, curves]);

  const handleTuningChange = useCallback((value: number) => { setParams(p => ({ ...p, tuning: value })); updateAllTB303(synth => synth.setTuning(value)); persistToStore({ tuning: value }); overrideManager.setOverride('tuning', (value + 1200) / 2400); }, [updateAllTB303, overrideManager, persistToStore]);
  const handleCutoffChange = useCallback((value: number) => { setParams(p => ({ ...p, cutoff: value })); updateAllTB303(synth => synth.setCutoff(value)); persistToStore({ cutoff: value }); overrideManager.setOverride('cutoff', value / 18000); }, [updateAllTB303, overrideManager, persistToStore]);
  const handleResonanceChange = useCallback((value: number) => { setParams(p => ({ ...p, resonance: value })); updateAllTB303(synth => synth.setResonance(value)); persistToStore({ resonance: value }); overrideManager.setOverride('resonance', value / 100); }, [updateAllTB303, overrideManager, persistToStore]);
  const handleEnvModChange = useCallback((value: number) => { setParams(p => ({ ...p, envMod: value })); updateAllTB303(synth => synth.setEnvMod(value)); persistToStore({ envMod: value }); overrideManager.setOverride('envMod', value / 100); }, [updateAllTB303, overrideManager, persistToStore]);
  const handleDecayChange = useCallback((value: number) => { setParams(p => ({ ...p, decay: value })); updateAllTB303(synth => synth.setDecay(value)); persistToStore({ decay: value }); overrideManager.setOverride('decay', (value - 30) / 2970); }, [updateAllTB303, overrideManager, persistToStore]);
  const handleAccentChange = useCallback((value: number) => { setParams(p => ({ ...p, accent: value })); updateAllTB303(synth => synth.setAccentAmount(value)); persistToStore({ accent: value }); overrideManager.setOverride('accent', value / 100); }, [updateAllTB303, overrideManager, persistToStore]);
  const handleOverdriveChange = useCallback((value: number) => { setParams(p => ({ ...p, overdrive: value })); updateAllTB303(synth => synth.setOverdrive(value)); persistToStore({ overdrive: value }); overrideManager.setOverride('overdrive', value / 100); }, [updateAllTB303, overrideManager, persistToStore]);
  const handleNeuralModelChange = useCallback((value: string) => { setParams(p => ({ ...p, neuralModel: value })); updateAllTB303(synth => synth.loadNeuralModel(value)); persistToStore({ neuralModel: value }); }, [updateAllTB303, persistToStore]);

  const handleNormalDecayChange = useCallback((value: number) => { setDevilFishConfig(c => ({ ...c, normalDecay: value })); updateAllTB303(synth => synth.setNormalDecay(value)); }, [updateAllTB303]);
  const handleAccentDecayChange = useCallback((value: number) => { setDevilFishConfig(c => ({ ...c, accentDecay: value })); updateAllTB303(synth => synth.setAccentDecay(value)); }, [updateAllTB303]);
  const handleVegDecayChange = useCallback((value: number) => { setDevilFishConfig(c => ({ ...c, vegDecay: value })); updateAllTB303(synth => synth.setVegDecay(value)); }, [updateAllTB303]);
  const handleVegSustainChange = useCallback((value: number) => { setDevilFishConfig(c => ({ ...c, vegSustain: value })); updateAllTB303(synth => synth.setVegSustain(value)); }, [updateAllTB303]);
  const handleSoftAttackChange = useCallback((value: number) => { setDevilFishConfig(c => ({ ...c, softAttack: value })); updateAllTB303(synth => synth.setSoftAttack(value)); }, [updateAllTB303]);
  const handleFilterTrackingChange = useCallback((value: number) => { setDevilFishConfig(c => ({ ...c, filterTracking: value })); updateAllTB303(synth => synth.setFilterTracking(value)); }, [updateAllTB303]);
  const handleFilterFMChange = useCallback((value: number) => { setDevilFishConfig(c => ({ ...c, filterFM: value })); updateAllTB303(synth => synth.setFilterFM(value)); }, [updateAllTB303]);
  const handleSweepSpeedChange = useCallback((v: any) => { setDevilFishConfig(c => ({ ...c, sweepSpeed: v })); updateAllTB303(synth => synth.setSweepSpeed(v)); }, [updateAllTB303]);
  const handleMufflerChange = useCallback((v: any) => { setDevilFishConfig(c => ({ ...c, muffler: v })); updateAllTB303(synth => synth.setMuffler(v)); }, [updateAllTB303]);
  const handleHighResonanceChange = useCallback((v: boolean) => { setDevilFishConfig(c => ({ ...c, highResonance: v })); updateAllTB303(synth => synth.setHighResonance(v)); }, [updateAllTB303]);
  const handleAccentSweepChange = useCallback((v: boolean) => { setDevilFishConfig(c => ({ ...c, accentSweepEnabled: v })); updateAllTB303(synth => synth.setAccentSweepEnabled(v)); }, [updateAllTB303]);

  const handleDevilFishEnableChange = useCallback((enabled: boolean) => {
    const newConfig = { ...devilFishConfig, enabled };
    setDevilFishConfig(newConfig);
    tb303Instruments.forEach(inst => {
      const synth = engine.getInstrument(inst.id, inst, -1);
      if ((synth as any).isTB303) (synth as any).enableDevilFish(enabled, newConfig);
    });
    updateAllTB303(synth => synth.enableDevilFish(enabled, newConfig));
  }, [updateAllTB303, devilFishConfig, engine, tb303Instruments]);

  useEffect(() => {
    registerCCHandler('tuning', handleTuningChange); registerCCHandler('cutoff', handleCutoffChange); registerCCHandler('resonance', handleResonanceChange);
    registerCCHandler('envMod', handleEnvModChange); registerCCHandler('decay', handleDecayChange); registerCCHandler('accent', handleAccentChange);
    registerCCHandler('overdrive', handleOverdriveChange);
    return () => {
      unregisterCCHandler('tuning'); unregisterCCHandler('cutoff'); unregisterCCHandler('resonance'); unregisterCCHandler('envMod');
      unregisterCCHandler('decay'); unregisterCCHandler('accent'); unregisterCCHandler('overdrive');
    };
  }, [registerCCHandler, unregisterCCHandler, handleTuningChange, handleCutoffChange, handleResonanceChange, handleEnvModChange, handleDecayChange, handleAccentChange, handleOverdriveChange]);

  const handleLoadPreset = useCallback((preset: typeof TB303_PRESETS[0]) => {
    if (!preset.tb303) return;
    const newParams: TB303Params = {
      tuning: preset.tb303.tuning ?? DEFAULT_PARAMS.tuning, cutoff: preset.tb303.filter?.cutoff ?? DEFAULT_PARAMS.cutoff,
      resonance: preset.tb303.filter?.resonance ?? DEFAULT_PARAMS.resonance, envMod: preset.tb303.filterEnvelope?.envMod ?? DEFAULT_PARAMS.envMod,
      decay: preset.tb303.filterEnvelope?.decay ?? DEFAULT_PARAMS.decay, accent: preset.tb303.accent?.amount ?? DEFAULT_PARAMS.accent,
      overdrive: preset.tb303.overdrive?.amount ?? DEFAULT_PARAMS.overdrive,
    };
    setParams(newParams);
    const devilFishEnabled = preset.tb303.devilFish?.enabled ?? false;
    const dfConfig = preset.tb303.devilFish;
    updateAllTB303(synth => {
      synth.setTuning(newParams.tuning); synth.setCutoff(newParams.cutoff); synth.setResonance(newParams.resonance);
      synth.setEnvMod(newParams.envMod); synth.setDecay(newParams.decay); synth.setAccentAmount(newParams.accent);
      synth.setOverdrive(newParams.overdrive); synth.enableDevilFish(devilFishEnabled, dfConfig);
    });
    tb303Instruments.forEach(inst => updateInstrument(inst.id, { name: preset.name, tb303: preset.tb303 }));
    setShowPresetMenu(false);
  }, [updateAllTB303, tb303Instruments, updateInstrument]);

  const getUserPresets = useCallback((): Array<{ name: string; params: TB303Params }> => {
    try {
      const stored = localStorage.getItem('tb303-user-presets');
      if (!stored) return [];
      const parsed = JSON.parse(stored);
      if (!Array.isArray(parsed)) return [];
      return parsed.filter((p): p is { name: string; params: TB303Params } => p !== null && typeof p === 'object' && typeof p.name === 'string' && p.params !== null && typeof p.params === 'object');
    } catch { return []; }
  }, []);

  const handleSavePreset = useCallback(() => {
    if (!presetName.trim()) return;
    const userPresets = getUserPresets();
    userPresets.push({ name: presetName.trim(), params: { ...params } });
    localStorage.setItem('tb303-user-presets', JSON.stringify(userPresets));
    setPresetName(''); setShowSaveDialog(false);
  }, [presetName, params, getUserPresets]);

  const handleLoadUserPreset = useCallback((preset: { name: string; params: TB303Params }) => {
    setParams(preset.params);
    updateAllTB303(synth => {
      synth.setCutoff(preset.params.cutoff); synth.setResonance(preset.params.resonance); synth.setEnvMod(preset.params.envMod);
      synth.setDecay(preset.params.decay); synth.setAccentAmount(preset.params.accent); synth.setOverdrive(preset.params.overdrive);
    });
    persistToStore(preset.params);
    setShowPresetMenu(false);
  }, [updateAllTB303, persistToStore]);

  const handleDeleteUserPreset = useCallback((name: string) => {
    const userPresets = getUserPresets().filter(p => p.name !== name);
    localStorage.setItem('tb303-user-presets', JSON.stringify(userPresets));
  }, [getUserPresets]);

  const userPresets = getUserPresets();
  const formatValue = (value: number, unit: string) => {
    if (unit === 'Hz') return value >= 1000 ? `${(value / 1000).toFixed(1)}k` : `${Math.round(value)}`;
    if (unit === 'ms') return value >= 1000 ? `${(value / 1000).toFixed(1)}s` : `${Math.round(value)}`;
    if (unit === 'cents') return `${value > 0 ? '+' : ''}${Math.round(value)}`;
    return `${Math.round(value)}%`;
  };

  if (tb303Instruments.length === 0) return null;

  return (
    <div className={`tb303-knob-panel ${tb303Collapsed ? 'tb303-knob-panel-collapsed' : ''}`}>
      <button className="panel-collapse-toggle" onClick={toggleTB303Collapsed} title={tb303Collapsed ? 'Expand synth panel' : 'Collapse synth panel'}>
        {tb303Collapsed ? <ChevronDown size={12} /> : <ChevronUp size={12} />}
      </button>

      {tb303Collapsed && (
        <div className="tb303-collapsed-values">
          <span className="tb303-param-inline" style={{ color: 'var(--color-synth-modulation)' }}>Tun: {formatValue(liveTuning ?? params.tuning, 'cents')}</span>
          <span className="tb303-param-inline" style={{ color: 'var(--color-synth-filter)' }}>Cut: {formatValue(liveCutoff ?? params.cutoff, 'Hz')}</span>
          <span className="tb303-param-inline" style={{ color: 'var(--color-synth-filter)' }}>Res: {formatValue(liveResonance ?? params.resonance, '%')}</span>
          <span className="tb303-param-inline" style={{ color: 'var(--color-synth-envelope)' }}>Env: {formatValue(liveEnvMod ?? params.envMod, '%')}</span>
          <span className="tb303-param-inline" style={{ color: 'var(--color-synth-envelope)' }}>Dec: {formatValue(liveDecay ?? params.decay, 'ms')}</span>
          <span className="tb303-param-inline" style={{ color: 'var(--color-synth-accent)' }}>Acc: {formatValue(liveAccent ?? params.accent, '%')}</span>
          <span className="tb303-param-inline" style={{ color: 'var(--color-synth-drive)' }}>Drv: {formatValue(liveOverdrive ?? params.overdrive, '%')}</span>
        </div>
      )}

      {!tb303Collapsed && (
        <div className="tb303-expanded-content flex-1 min-w-0 overflow-x-auto scrollbar-modern pb-2">
          <div className="tb303-knobs-container">
            <Knob label="Tuning" value={params.tuning} min={-1200} max={1200} unit="cents" onChange={handleTuningChange} defaultValue={0} color="#3b82f6" displayValue={liveTuning} />
            <Knob label="Cutoff" value={params.cutoff} min={50} max={18000} unit="Hz" onChange={handleCutoffChange} logarithmic defaultValue={800} color="#00d4aa" displayValue={liveCutoff} />
            <Knob label="Reso" value={params.resonance} min={0} max={100} unit="%" onChange={handleResonanceChange} defaultValue={65} color="#00d4aa" displayValue={liveResonance} />
            <Knob label="EnvMod" value={params.envMod} min={0} max={100} unit="%" onChange={handleEnvModChange} defaultValue={60} color="#7c3aed" displayValue={liveEnvMod} />
            <Knob label="Decay" value={params.decay} min={30} max={3000} unit="ms" onChange={handleDecayChange} logarithmic defaultValue={200} color="#7c3aed" displayValue={liveDecay} />
            <Knob label="Accent" value={params.accent} min={0} max={100} unit="%" onChange={handleAccentChange} defaultValue={70} color="#f59e0b" displayValue={liveAccent} />
            <Knob label="Drive" value={params.overdrive} min={0} max={100} unit="%" onChange={handleOverdriveChange} defaultValue={0} color="#ef4444" displayValue={liveOverdrive} />
          </div>

          <div className="devilfish-row">
            <div className="devilfish-row-header">
              <span className="devilfish-label">Devil Fish</span>
              <Toggle label="" value={devilFishConfig.enabled} onChange={handleDevilFishEnableChange} color="var(--color-synth-drive)" size="sm" />
            </div>
            {devilFishConfig.enabled && (
              <div className="devilfish-knobs">
                <Knob label="Norm Dec" value={devilFishConfig.normalDecay} min={30} max={3000} unit="ms" onChange={handleNormalDecayChange} logarithmic defaultValue={200} color="var(--color-synth-envelope)" displayValue={liveNormalDecay} />
                <Knob label="Acc Dec" value={devilFishConfig.accentDecay} min={30} max={3000} unit="ms" onChange={handleAccentDecayChange} logarithmic defaultValue={200} color="var(--color-synth-accent)" displayValue={liveAccentDecay} />
                <Knob label="Soft Atk" value={devilFishConfig.softAttack} min={0.3} max={30} unit="ms" onChange={handleSoftAttackChange} logarithmic defaultValue={3} color="var(--color-synth-envelope)" displayValue={liveSoftAttack} />
                <Knob label="VEG Dec" value={devilFishConfig.vegDecay} min={16} max={3000} unit="ms" onChange={handleVegDecayChange} logarithmic defaultValue={300} color="var(--color-synth-filter)" displayValue={liveVegDecay} />
                <Knob label="VEG Sus" value={devilFishConfig.vegSustain} min={0} max={100} unit="%" onChange={handleVegSustainChange} defaultValue={0} color="var(--color-synth-filter)" displayValue={liveVegSustain} />
                <Knob label="Tracking" value={devilFishConfig.filterTracking} min={0} max={200} unit="%" onChange={handleFilterTrackingChange} defaultValue={0} color="var(--color-synth-modulation)" displayValue={liveFilterTracking} />
                <Knob label="FM" value={devilFishConfig.filterFM} min={0} max={100} unit="%" onChange={handleFilterFMChange} defaultValue={0} color="var(--color-synth-modulation)" displayValue={liveFilterFM} />
                <Switch3Way label="Sweep" value={devilFishConfig.sweepSpeed} options={['fast', 'normal', 'slow']} labels={['F', 'N', 'S']} onChange={handleSweepSpeedChange} color="var(--color-synth-accent)" />
                <Switch3Way label="Muffler" value={devilFishConfig.muffler} options={['off', 'soft', 'hard']} labels={['Off', 'Sft', 'Hrd']} onChange={handleMufflerChange} color="var(--color-synth-drive)" />
                <Toggle label="Hi Reso" value={devilFishConfig.highResonance} onChange={handleHighResonanceChange} color="var(--color-synth-filter)" size="sm" />
                <Toggle label="Acc Swp" value={devilFishConfig.accentSweepEnabled} onChange={handleAccentSweepChange} color="var(--color-synth-accent)" size="sm" />
              </div>
            )}
          </div>
        </div>
      )}

      {!tb303Collapsed && (
        <div className="tb303-knob-panel-header border-l border-dark-border pl-6 ml-auto">
          <div className="tb303-knob-panel-label">TB-303 {devilFishConfig.enabled && <span className="devilfish-badge">+DF</span>}</div>
          <div className="tb303-synth-selector">
            <Radio size={12} className="text-text-muted" />
            <select value={params.neuralModel ?? 'none'} onChange={(e) => handleNeuralModelChange(e.target.value)} className="tb303-synth-select" title="Select neural network saturation model">
              {NEURAL_MODELS.map((model) => (<option key={model.id} value={model.id}>{model.name}</option>))}
            </select>
          </div>
          {tb303Instruments.length > 1 && (
            <div className="tb303-synth-selector">
              <Radio size={12} className="text-text-muted" />
              <select value={controlledInstrumentId ?? 'all'} onChange={(e) => setControlledInstrument(e.target.value === 'all' ? null : Number(e.target.value))} className="tb303-synth-select" title="Select which TB-303 to control with MIDI knobs">
                <option value="all">All TB-303</option>
                {tb303Instruments.map((inst) => (<option key={inst.id} value={inst.id}>CH{String(instruments.indexOf(inst) + 1).padStart(2, '0')} {inst.name || 'TB-303'}</option>))}
              </select>
            </div>
          )}
          <div className="tb303-preset-controls">
            <div className="tb303-preset-dropdown">
              <button className="flex items-center gap-1.5 px-2 py-1 bg-dark-bgTertiary hover:bg-dark-bgHover text-text-secondary text-[10px] font-bold transition-colors rounded border border-dark-border" onClick={() => setShowPresetMenu(!showPresetMenu)} title="Load preset"><span className="uppercase">Presets</span><ChevronDown size={10} /></button>
              {showPresetMenu && (
                <div className="tb303-preset-menu">
                  {userPresets.length > 0 && (<><div className="tb303-preset-category">User Presets</div>{userPresets.map((preset) => (<div key={preset.name} className="tb303-preset-item tb303-preset-item-user"><span onClick={() => handleLoadUserPreset(preset)}>{preset.name}</span><button className="tb303-preset-delete" onClick={(e) => { e.stopPropagation(); handleDeleteUserPreset(preset.name); }} title="Delete preset">×</button></div>))}<div className="tb303-preset-divider" /></>)}
                  <div className="tb303-preset-category">Factory Presets</div>
                  {TB303_PRESETS.slice(0, 20).map((preset) => (<div key={preset.name} className="tb303-preset-item" onClick={() => handleLoadPreset(preset)}>{preset.name}</div>))}
                </div>
              )}
            </div>
            <button className="p-1 bg-dark-bgTertiary hover:bg-dark-bgHover text-accent-primary transition-colors rounded border border-accent-primary/30" onClick={() => setShowSaveDialog(true)} title="Save preset"><Save size={12} /></button>
          </div>
        </div>
      )}

      {showSaveDialog && (
        <div className="tb303-save-dialog">
          <input type="text" placeholder="Preset name..." value={presetName} onChange={(e) => setPresetName(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') handleSavePreset(); if (e.key === 'Escape') setShowSaveDialog(false); }} className="bg-dark-bg border border-dark-border text-text-primary px-2 py-1 rounded outline-none focus:border-accent-primary transition-colors text-xs font-mono" autoFocus />
          <div className="flex gap-1 mt-2"><button onClick={handleSavePreset} className="flex-1 px-3 py-1 bg-accent-primary text-text-inverse text-[10px] font-bold rounded uppercase hover:bg-accent-primary/80 transition-colors">Save</button><button onClick={() => setShowSaveDialog(false)} className="px-3 py-1 bg-dark-bgTertiary text-text-secondary text-[10px] font-bold rounded uppercase hover:bg-dark-bgHover transition-colors border border-dark-border">Cancel</button></div>
        </div>
      )}
    </div>
  );
};

export const TB303KnobPanel = React.memo(TB303KnobPanelComponent);
TB303KnobPanel.displayName = 'TB303KnobPanel';
