/**
 * TB303KnobPanel - Live filter control knobs for TB-303 synthesizer
 * Includes Devil Fish mod controls for extended modulation
 * Manual knob changes override automation for one pattern cycle
 * Knobs animate during playback to show live filter modulation
 */

import React, { useState, useCallback, useEffect, useRef, useReducer } from 'react';
import * as Tone from 'tone';
import { Save, ChevronDown, ChevronUp, Radio } from 'lucide-react';
import { Knob } from '@components/controls/Knob';
import { Toggle } from '@components/controls/Toggle';
import { Switch3Way } from '@components/controls/Switch3Way';
import { useInstrumentStore, useTrackerStore, useTransportStore, useAutomationStore, useUIStore } from '@stores';
import { useShallow } from 'zustand/react/shallow';
import { useMIDIStore } from '@stores/useMIDIStore';
import { getToneEngine } from '@engine/ToneEngine';
import { TB303Synth } from '@engine/TB303Engine';
import { getManualOverrideManager } from '@engine/ManualOverrideManager';
import { TB303_PRESETS } from '@constants/tb303Presets';
import type { DevilFishConfig } from '@typedefs/instrument';
import { DEFAULT_DEVIL_FISH } from '@typedefs/instrument';

interface TB303Params {
  cutoff: number;
  resonance: number;
  envMod: number;
  decay: number;
  accent: number;
  overdrive: number;
}

const DEFAULT_PARAMS: TB303Params = {
  cutoff: 800,
  resonance: 65,
  envMod: 60,
  decay: 200,
  accent: 70,
  overdrive: 0,
};

// Live modulation state - consolidated for better performance
interface LiveModulationState {
  cutoff?: number;
  resonance?: number;
  envMod?: number;
  decay?: number;
  accent?: number;
  overdrive?: number;
  normalDecay?: number;
  accentDecay?: number;
  vegDecay?: number;
  vegSustain?: number;
  softAttack?: number;
  filterTracking?: number;
  filterFM?: number;
}

type LiveModulationAction =
  | { type: 'SET_VALUE'; key: keyof LiveModulationState; value: number }
  | { type: 'SET_MULTIPLE'; values: Partial<LiveModulationState> }
  | { type: 'RESET' };

const liveModulationReducer = (
  state: LiveModulationState,
  action: LiveModulationAction
): LiveModulationState => {
  switch (action.type) {
    case 'SET_VALUE':
      return { ...state, [action.key]: action.value };
    case 'SET_MULTIPLE':
      return { ...state, ...action.values };
    case 'RESET':
      return {};
    default:
      return state;
  }
};

const TB303KnobPanelComponent: React.FC = () => {
  // Use selectors to minimize re-renders - only subscribe to needed state
  const { instruments, updateInstrument } = useInstrumentStore(
    useShallow((state) => ({ instruments: state.instruments, updateInstrument: state.updateInstrument }))
  );
  const { patterns, currentPatternIndex } = useTrackerStore(
    useShallow((state) => ({ patterns: state.patterns, currentPatternIndex: state.currentPatternIndex }))
  );
  const isPlaying = useTransportStore((state) => state.isPlaying);
  const curves = useAutomationStore((state) => state.curves);
  const { tb303Collapsed, toggleTB303Collapsed } = useUIStore(
    useShallow((state) => ({ tb303Collapsed: state.tb303Collapsed, toggleTB303Collapsed: state.toggleTB303Collapsed }))
  );
  // MIDI store for CC handlers and synth selection
  const { registerCCHandler, unregisterCCHandler, controlledInstrumentId, setControlledInstrument } = useMIDIStore();

  const [params, setParams] = useState<TB303Params>(DEFAULT_PARAMS);
  const [showPresetMenu, setShowPresetMenu] = useState(false);
  const [showSaveDialog, setShowSaveDialog] = useState(false);
  const [presetName, setPresetName] = useState('');

  // Consolidated live modulation state using useReducer for better performance
  const [liveModulation, dispatchLiveModulation] = useReducer(liveModulationReducer, {});
  const animationRef = useRef<number | null>(null);

  // Destructure live values for easier access
  const {
    cutoff: liveCutoff,
    resonance: liveResonance,
    envMod: liveEnvMod,
    decay: liveDecay,
    accent: liveAccent,
    overdrive: liveOverdrive,
    normalDecay: liveNormalDecay,
    accentDecay: liveAccentDecay,
    vegDecay: liveVegDecay,
    vegSustain: liveVegSustain,
    softAttack: liveSoftAttack,
    filterTracking: liveFilterTracking,
    filterFM: liveFilterFM,
  } = liveModulation;

  // Devil Fish state
  const [devilFishConfig, setDevilFishConfig] = useState<DevilFishConfig>({ ...DEFAULT_DEVIL_FISH });

  // Find all TB303 instruments
  const tb303Instruments = instruments.filter(i => i.synthType === 'TB303');

  // Check which parameters have automation for any TB303 channel
  const hasAutomation = (param: string) => curves.some((curve: { parameter: string; enabled: boolean; points: unknown[] }) =>
    curve.parameter === param &&
    curve.enabled &&
    curve.points.length > 0
  );

  const hasCutoffAutomation = hasAutomation('cutoff');
  const hasResonanceAutomation = hasAutomation('resonance');
  const hasEnvModAutomation = hasAutomation('envMod');
  const hasDecayAutomation = hasAutomation('decay');
  const hasAccentAutomation = hasAutomation('accent');
  const hasOverdriveAutomation = hasAutomation('overdrive');

  // Devil Fish automation checks
  const hasNormalDecayAutomation = hasAutomation('normalDecay');
  const hasAccentDecayAutomation = hasAutomation('accentDecay');
  const hasVegDecayAutomation = hasAutomation('vegDecay');
  const hasVegSustainAutomation = hasAutomation('vegSustain');
  const hasSoftAttackAutomation = hasAutomation('softAttack');
  const hasFilterTrackingAutomation = hasAutomation('filterTracking');
  const hasFilterFMAutomation = hasAutomation('filterFM');

  const hasAnyAutomation = hasCutoffAutomation || hasResonanceAutomation || hasEnvModAutomation ||
    hasDecayAutomation || hasAccentAutomation || hasOverdriveAutomation ||
    hasNormalDecayAutomation || hasAccentDecayAutomation || hasVegDecayAutomation ||
    hasVegSustainAutomation || hasSoftAttackAutomation || hasFilterTrackingAutomation || hasFilterFMAutomation;

  // Get the engine instance
  const engine = getToneEngine();
  const overrideManager = getManualOverrideManager();

  // Update override manager timing when BPM or pattern length changes
  useEffect(() => {
    const pattern = patterns[currentPatternIndex];
    if (pattern) {
      const bpm = Tone.getTransport().bpm.value;
      overrideManager.updateTiming(bpm, pattern.length);
    }
  }, [patterns, currentPatternIndex, overrideManager]);

  // Sync params from first TB303 instrument config (on load or when instruments change)
  // Use a stable key based on the first TB303's config to detect changes
  const firstTB303Config = tb303Instruments[0]?.tb303;
  const tb303ConfigKey = firstTB303Config ? JSON.stringify(firstTB303Config) : '';

  useEffect(() => {
    if (firstTB303Config) {
      setParams({
        cutoff: firstTB303Config.filter?.cutoff ?? DEFAULT_PARAMS.cutoff,
        resonance: firstTB303Config.filter?.resonance ?? DEFAULT_PARAMS.resonance,
        envMod: firstTB303Config.filterEnvelope?.envMod ?? DEFAULT_PARAMS.envMod,
        decay: firstTB303Config.filterEnvelope?.decay ?? DEFAULT_PARAMS.decay,
        accent: firstTB303Config.accent?.amount ?? DEFAULT_PARAMS.accent,
        overdrive: firstTB303Config.overdrive?.amount ?? DEFAULT_PARAMS.overdrive,
      });
      // Sync Devil Fish config
      if (firstTB303Config.devilFish) {
        setDevilFishConfig({ ...DEFAULT_DEVIL_FISH, ...firstTB303Config.devilFish });
      } else {
        setDevilFishConfig({ ...DEFAULT_DEVIL_FISH });
      }
    }
  }, [tb303ConfigKey]); // eslint-disable-line react-hooks/exhaustive-deps

  // Ensure synth instances have Devil Fish config when enabled
  useEffect(() => {
    if (devilFishConfig.enabled) {
      const engineInstruments = (engine as any).instruments as Map<string, any>;
      if (engineInstruments) {
        engineInstruments.forEach((instrument) => {
          if (instrument instanceof TB303Synth) {
            instrument.enableDevilFish(true, devilFishConfig);
          }
        });
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [devilFishConfig.enabled]);

  // Interpolate automation curve value at fractional row position
  const interpolateAutomation = useCallback((curve: typeof curves[0] | undefined, row: number): number | null => {
    if (!curve || !curve.enabled || curve.points.length === 0) return null;

    const points = curve.points;
    if (points.length === 1) return points[0].value;

    // Find surrounding points
    let before = points[0];
    let after = points[points.length - 1];

    for (let i = 0; i < points.length - 1; i++) {
      if (points[i].row <= row && points[i + 1].row >= row) {
        before = points[i];
        after = points[i + 1];
        break;
      }
    }

    // If before first point or after last point
    if (row <= points[0].row) return points[0].value;
    if (row >= points[points.length - 1].row) return points[points.length - 1].value;

    // Interpolate
    const t = (row - before.row) / (after.row - before.row);
    return before.value + (after.value - before.value) * t;
  }, []);

  // Convert normalized 0-1 automation value to parameter value
  const automationToParam = useCallback((value: number, param: string): number => {
    switch (param) {
      case 'cutoff':
        return 50 * Math.pow(360, value); // 50-18000 Hz (log)
      case 'resonance':
      case 'envMod':
      case 'accent':
      case 'overdrive':
        return value * 100; // 0-100%
      case 'decay':
      case 'normalDecay':
      case 'accentDecay':
        return 30 * Math.pow(100, value); // 30-3000ms (log)
      case 'vegDecay':
        return 16 * Math.pow(187.5, value); // 16-3000ms (log)
      case 'vegSustain':
      case 'filterFM':
        return value * 100; // 0-100%
      case 'softAttack':
        return 0.3 * Math.pow(100, value); // 0.3-30ms (log)
      case 'filterTracking':
        return value * 200; // 0-200%
      default:
        return value;
    }
  }, []);

  // Poll live filter values during playback for knob animation (only when automation is active)
  useEffect(() => {
    // Only animate when playing AND there's any automation
    if (!isPlaying || !hasAnyAutomation) {
      // Reset all live values when stopped or no automation
      dispatchLiveModulation({ type: 'RESET' });
      if (animationRef.current) {
        cancelAnimationFrame(animationRef.current);
        animationRef.current = null;
      }
      return;
    }

    const pattern = patterns[currentPatternIndex];
    if (!pattern) return;

    // Calculate seconds per row based on BPM
    const bpm = engine.getBPM();
    const ticksPerRow = 6; // Default tracker speed
    const secondsPerTick = 2.5 / bpm;
    const secondsPerRow = secondsPerTick * ticksPerRow;

    const pollLiveValues = () => {
      // Get current transport position and calculate fractional row
      const transport = Tone.getTransport();
      const transportSeconds = transport.seconds;
      const fractionalRow = transportSeconds / secondsPerRow;
      // Wrap to pattern length for looping
      const currentRow = fractionalRow % pattern.length;

      // Find automation curves for channel 0 (or first TB303 channel)
      const getCurve = (param: string) => curves.find(c =>
        c.patternId === pattern.id && c.parameter === param && c.enabled && c.points.length > 0
      );

      // Batch all live value updates into a single dispatch for better performance
      const updates: Partial<LiveModulationState> = {};

      // Interpolate each parameter with automation
      if (hasCutoffAutomation) {
        const curve = getCurve('cutoff');
        const value = interpolateAutomation(curve, currentRow);
        if (value !== null) {
          updates.cutoff = automationToParam(value, 'cutoff');
        }
      }
      if (hasResonanceAutomation) {
        const curve = getCurve('resonance');
        const value = interpolateAutomation(curve, currentRow);
        if (value !== null) {
          updates.resonance = automationToParam(value, 'resonance');
        }
      }
      if (hasEnvModAutomation) {
        const curve = getCurve('envMod');
        const value = interpolateAutomation(curve, currentRow);
        if (value !== null) {
          updates.envMod = automationToParam(value, 'envMod');
        }
      }
      if (hasDecayAutomation) {
        const curve = getCurve('decay');
        const value = interpolateAutomation(curve, currentRow);
        if (value !== null) {
          updates.decay = automationToParam(value, 'decay');
        }
      }
      if (hasAccentAutomation) {
        const curve = getCurve('accent');
        const value = interpolateAutomation(curve, currentRow);
        if (value !== null) {
          updates.accent = automationToParam(value, 'accent');
        }
      }
      if (hasOverdriveAutomation) {
        const curve = getCurve('overdrive');
        const value = interpolateAutomation(curve, currentRow);
        if (value !== null) {
          updates.overdrive = automationToParam(value, 'overdrive');
        }
      }

      // Devil Fish parameter automation
      if (hasNormalDecayAutomation) {
        const curve = getCurve('normalDecay');
        const value = interpolateAutomation(curve, currentRow);
        if (value !== null) {
          updates.normalDecay = automationToParam(value, 'normalDecay');
        }
      }
      if (hasAccentDecayAutomation) {
        const curve = getCurve('accentDecay');
        const value = interpolateAutomation(curve, currentRow);
        if (value !== null) {
          updates.accentDecay = automationToParam(value, 'accentDecay');
        }
      }
      if (hasVegDecayAutomation) {
        const curve = getCurve('vegDecay');
        const value = interpolateAutomation(curve, currentRow);
        if (value !== null) {
          updates.vegDecay = automationToParam(value, 'vegDecay');
        }
      }
      if (hasVegSustainAutomation) {
        const curve = getCurve('vegSustain');
        const value = interpolateAutomation(curve, currentRow);
        if (value !== null) {
          updates.vegSustain = automationToParam(value, 'vegSustain');
        }
      }
      if (hasSoftAttackAutomation) {
        const curve = getCurve('softAttack');
        const value = interpolateAutomation(curve, currentRow);
        if (value !== null) {
          updates.softAttack = automationToParam(value, 'softAttack');
        }
      }
      if (hasFilterTrackingAutomation) {
        const curve = getCurve('filterTracking');
        const value = interpolateAutomation(curve, currentRow);
        if (value !== null) {
          updates.filterTracking = automationToParam(value, 'filterTracking');
        }
      }
      if (hasFilterFMAutomation) {
        const curve = getCurve('filterFM');
        const value = interpolateAutomation(curve, currentRow);
        if (value !== null) {
          updates.filterFM = automationToParam(value, 'filterFM');
        }
      }

      // Batch dispatch all updates in one action for better performance
      if (Object.keys(updates).length > 0) {
        dispatchLiveModulation({ type: 'SET_MULTIPLE', values: updates });
      }

      animationRef.current = requestAnimationFrame(pollLiveValues);
    };

    // Start polling
    animationRef.current = requestAnimationFrame(pollLiveValues);

    return () => {
      if (animationRef.current) {
        cancelAnimationFrame(animationRef.current);
        animationRef.current = null;
      }
    };
  }, [isPlaying, hasAnyAutomation, hasCutoffAutomation, hasResonanceAutomation, hasEnvModAutomation,
      hasDecayAutomation, hasAccentAutomation, hasOverdriveAutomation,
      hasNormalDecayAutomation, hasAccentDecayAutomation, hasVegDecayAutomation, hasVegSustainAutomation,
      hasSoftAttackAutomation, hasFilterTrackingAutomation, hasFilterFMAutomation,
      engine, patterns, currentPatternIndex, curves, interpolateAutomation, automationToParam]);

  // Update TB303 instruments (all or just the selected one based on controlledInstrumentId)
  const updateAllTB303 = useCallback((setter: (synth: TB303Synth) => void) => {
    // Access internal instruments map
    const engineInstruments = (engine as any).instruments as Map<number, any>;
    if (!engineInstruments) return;

    engineInstruments.forEach((instrument, id) => {
      if (instrument instanceof TB303Synth) {
        // If controlledInstrumentId is set, only update that instrument
        // If null, update all TB303 instruments
        if (controlledInstrumentId === null || controlledInstrumentId === id) {
          setter(instrument);
        }
      }
    });
  }, [engine, controlledInstrumentId]);

  // Persist TB303 params to instrument store (so they get saved with the tune)
  const persistToStore = useCallback((paramUpdates: Partial<TB303Params>) => {
    tb303Instruments.forEach(inst => {
      const currentTb303 = inst.tb303;
      if (!currentTb303) return; // Skip if no TB303 config

      updateInstrument(inst.id, {
        tb303: {
          ...currentTb303,
          filter: {
            ...currentTb303.filter,
            cutoff: paramUpdates.cutoff ?? currentTb303.filter?.cutoff ?? 800,
            resonance: paramUpdates.resonance ?? currentTb303.filter?.resonance ?? 65,
          },
          filterEnvelope: {
            ...currentTb303.filterEnvelope,
            envMod: paramUpdates.envMod ?? currentTb303.filterEnvelope?.envMod ?? 60,
            decay: paramUpdates.decay ?? currentTb303.filterEnvelope?.decay ?? 200,
          },
          accent: {
            ...currentTb303.accent,
            amount: paramUpdates.accent ?? currentTb303.accent?.amount ?? 70,
          },
          overdrive: {
            ...currentTb303.overdrive,
            amount: paramUpdates.overdrive ?? currentTb303.overdrive?.amount ?? 0,
          },
        },
      });
    });
  }, [tb303Instruments, updateInstrument]);

  // Parameter change handlers - each registers a manual override AND persists to store
  const handleCutoffChange = useCallback((value: number) => {
    setParams(p => ({ ...p, cutoff: value }));
    updateAllTB303(synth => synth.setCutoff(value));
    persistToStore({ cutoff: value });
    // Register override - automation won't apply for one pattern cycle
    overrideManager.setOverride('cutoff', value / 18000); // Normalize to 0-1
  }, [updateAllTB303, overrideManager, persistToStore]);

  const handleResonanceChange = useCallback((value: number) => {
    setParams(p => ({ ...p, resonance: value }));
    updateAllTB303(synth => synth.setResonance(value));
    persistToStore({ resonance: value });
    overrideManager.setOverride('resonance', value / 100);
  }, [updateAllTB303, overrideManager, persistToStore]);

  const handleEnvModChange = useCallback((value: number) => {
    setParams(p => ({ ...p, envMod: value }));
    updateAllTB303(synth => synth.setEnvMod(value));
    persistToStore({ envMod: value });
    overrideManager.setOverride('envMod', value / 100);
  }, [updateAllTB303, overrideManager, persistToStore]);

  const handleDecayChange = useCallback((value: number) => {
    setParams(p => ({ ...p, decay: value }));
    updateAllTB303(synth => synth.setDecay(value));
    persistToStore({ decay: value });
    overrideManager.setOverride('decay', (value - 30) / 2970); // Normalize 30-3000 to 0-1
  }, [updateAllTB303, overrideManager, persistToStore]);

  const handleAccentChange = useCallback((value: number) => {
    setParams(p => ({ ...p, accent: value }));
    updateAllTB303(synth => synth.setAccentAmount(value));
    persistToStore({ accent: value });
    overrideManager.setOverride('accent', value / 100);
  }, [updateAllTB303, overrideManager, persistToStore]);

  const handleOverdriveChange = useCallback((value: number) => {
    setParams(p => ({ ...p, overdrive: value }));
    updateAllTB303(synth => synth.setOverdrive(value));
    persistToStore({ overdrive: value });
    overrideManager.setOverride('overdrive', value / 100);
  }, [updateAllTB303, overrideManager, persistToStore]);

  // Devil Fish handlers
  const handleDevilFishEnableChange = useCallback((enabled: boolean) => {
    const newConfig = { ...devilFishConfig, enabled };
    setDevilFishConfig(newConfig);

    // Ensure synth instances exist and update them
    tb303Instruments.forEach(inst => {
      const synth = engine.getInstrument(inst.id, inst, -1);
      if (synth instanceof TB303Synth) {
        synth.enableDevilFish(enabled, newConfig);
      }
    });

    // Also update any existing per-channel instances
    updateAllTB303(synth => synth.enableDevilFish(enabled, newConfig));
  }, [updateAllTB303, devilFishConfig, engine, tb303Instruments]);

  const handleNormalDecayChange = useCallback((value: number) => {
    setDevilFishConfig(c => ({ ...c, normalDecay: value }));
    updateAllTB303(synth => synth.setNormalDecay(value));
  }, [updateAllTB303]);

  const handleAccentDecayChange = useCallback((value: number) => {
    setDevilFishConfig(c => ({ ...c, accentDecay: value }));
    updateAllTB303(synth => synth.setAccentDecay(value));
  }, [updateAllTB303]);

  const handleVegDecayChange = useCallback((value: number) => {
    setDevilFishConfig(c => ({ ...c, vegDecay: value }));
    updateAllTB303(synth => synth.setVegDecay(value));
  }, [updateAllTB303]);

  const handleVegSustainChange = useCallback((value: number) => {
    setDevilFishConfig(c => ({ ...c, vegSustain: value }));
    updateAllTB303(synth => synth.setVegSustain(value));
  }, [updateAllTB303]);

  const handleSoftAttackChange = useCallback((value: number) => {
    setDevilFishConfig(c => ({ ...c, softAttack: value }));
    updateAllTB303(synth => synth.setSoftAttack(value));
  }, [updateAllTB303]);

  const handleFilterTrackingChange = useCallback((value: number) => {
    setDevilFishConfig(c => ({ ...c, filterTracking: value }));
    updateAllTB303(synth => synth.setFilterTracking(value));
  }, [updateAllTB303]);

  const handleFilterFMChange = useCallback((value: number) => {
    setDevilFishConfig(c => ({ ...c, filterFM: value }));
    updateAllTB303(synth => synth.setFilterFM(value));
  }, [updateAllTB303]);

  const handleSweepSpeedChange = useCallback((value: 'fast' | 'normal' | 'slow') => {
    setDevilFishConfig(c => ({ ...c, sweepSpeed: value }));
    updateAllTB303(synth => synth.setSweepSpeed(value));
  }, [updateAllTB303]);

  const handleMufflerChange = useCallback((value: 'off' | 'soft' | 'hard') => {
    setDevilFishConfig(c => ({ ...c, muffler: value }));
    updateAllTB303(synth => synth.setMuffler(value));
  }, [updateAllTB303]);

  const handleHighResonanceChange = useCallback((enabled: boolean) => {
    setDevilFishConfig(c => ({ ...c, highResonance: enabled }));
    updateAllTB303(synth => synth.setHighResonance(enabled));
  }, [updateAllTB303]);

  const handleAccentSweepChange = useCallback((enabled: boolean) => {
    setDevilFishConfig(c => ({ ...c, accentSweepEnabled: enabled }));
    updateAllTB303(synth => synth.setAccentSweepEnabled(enabled));
  }, [updateAllTB303]);

  // MIDI CC handler registration
  useEffect(() => {
    // Register handlers for MIDI CC control
    registerCCHandler('cutoff', handleCutoffChange);
    registerCCHandler('resonance', handleResonanceChange);
    registerCCHandler('envMod', handleEnvModChange);
    registerCCHandler('decay', handleDecayChange);
    registerCCHandler('accent', handleAccentChange);
    registerCCHandler('overdrive', handleOverdriveChange);

    // Cleanup on unmount
    return () => {
      unregisterCCHandler('cutoff');
      unregisterCCHandler('resonance');
      unregisterCCHandler('envMod');
      unregisterCCHandler('decay');
      unregisterCCHandler('accent');
      unregisterCCHandler('overdrive');
    };
  }, [
    registerCCHandler,
    unregisterCCHandler,
    handleCutoffChange,
    handleResonanceChange,
    handleEnvModChange,
    handleDecayChange,
    handleAccentChange,
    handleOverdriveChange,
  ]);

  // Load a factory preset
  const handleLoadPreset = useCallback((preset: typeof TB303_PRESETS[0]) => {
    if (!preset.tb303) return;

    const newParams: TB303Params = {
      cutoff: preset.tb303.filter?.cutoff ?? DEFAULT_PARAMS.cutoff,
      resonance: preset.tb303.filter?.resonance ?? DEFAULT_PARAMS.resonance,
      envMod: preset.tb303.filterEnvelope?.envMod ?? DEFAULT_PARAMS.envMod,
      decay: preset.tb303.filterEnvelope?.decay ?? DEFAULT_PARAMS.decay,
      accent: preset.tb303.accent?.amount ?? DEFAULT_PARAMS.accent,
      overdrive: preset.tb303.overdrive?.amount ?? DEFAULT_PARAMS.overdrive,
    };

    setParams(newParams);

    // Determine if this preset enables Devil Fish mode
    const devilFishEnabled = preset.tb303.devilFish?.enabled ?? false;
    const devilFishConfig = preset.tb303.devilFish;

    // Update all TB303 synths
    updateAllTB303(synth => {
      synth.setCutoff(newParams.cutoff);
      synth.setResonance(newParams.resonance);
      synth.setEnvMod(newParams.envMod);
      synth.setDecay(newParams.decay);
      synth.setAccentAmount(newParams.accent);
      synth.setOverdrive(newParams.overdrive);
      // Enable/disable Devil Fish mode based on preset
      synth.enableDevilFish(devilFishEnabled, devilFishConfig);
    });

    // Persist to store
    tb303Instruments.forEach(inst => {
      updateInstrument(inst.id, {
        name: preset.name,
        tb303: preset.tb303,
      });
    });

    setShowPresetMenu(false);
  }, [updateAllTB303, tb303Instruments, updateInstrument]);

  // Get user presets from localStorage with validation
  const getUserPresets = useCallback((): Array<{ name: string; params: TB303Params }> => {
    try {
      const stored = localStorage.getItem('tb303-user-presets');
      if (!stored) return [];

      const parsed = JSON.parse(stored);
      // Validate structure: must be array of objects with name and params
      if (!Array.isArray(parsed)) return [];

      return parsed.filter(
        (p): p is { name: string; params: TB303Params } =>
          p !== null &&
          typeof p === 'object' &&
          typeof p.name === 'string' &&
          p.params !== null &&
          typeof p.params === 'object'
      );
    } catch {
      return [];
    }
  }, []);

  // Save current settings as user preset
  const handleSavePreset = useCallback(() => {
    if (!presetName.trim()) return;

    const userPresets = getUserPresets();
    userPresets.push({ name: presetName.trim(), params: { ...params } });
    localStorage.setItem('tb303-user-presets', JSON.stringify(userPresets));

    setPresetName('');
    setShowSaveDialog(false);
  }, [presetName, params, getUserPresets]);

  // Load user preset
  const handleLoadUserPreset = useCallback((preset: { name: string; params: TB303Params }) => {
    setParams(preset.params);

    updateAllTB303(synth => {
      synth.setCutoff(preset.params.cutoff);
      synth.setResonance(preset.params.resonance);
      synth.setEnvMod(preset.params.envMod);
      synth.setDecay(preset.params.decay);
      synth.setAccentAmount(preset.params.accent);
      synth.setOverdrive(preset.params.overdrive);
    });

    // Persist to store
    persistToStore(preset.params);

    setShowPresetMenu(false);
  }, [updateAllTB303, persistToStore]);

  // Delete user preset
  const handleDeleteUserPreset = useCallback((presetName: string) => {
    const userPresets = getUserPresets().filter(p => p.name !== presetName);
    localStorage.setItem('tb303-user-presets', JSON.stringify(userPresets));
  }, [getUserPresets]);

  const userPresets = getUserPresets();

  // Format value for display
  const formatValue = (value: number, unit: string) => {
    if (unit === 'Hz') {
      return value >= 1000 ? `${(value / 1000).toFixed(1)}k` : `${Math.round(value)}`;
    }
    if (unit === 'ms') {
      return value >= 1000 ? `${(value / 1000).toFixed(1)}s` : `${Math.round(value)}`;
    }
    return `${Math.round(value)}%`;
  };

  // Don't render if no TB303 instruments
  if (tb303Instruments.length === 0) {
    return null;
  }

  return (
    <div className={`tb303-knob-panel ${tb303Collapsed ? 'tb303-knob-panel-collapsed' : ''}`}>
      {/* Single Collapse/Expand Toggle */}
      <button
        className="panel-collapse-toggle"
        onClick={toggleTB303Collapsed}
        title={tb303Collapsed ? 'Expand synth panel' : 'Collapse synth panel'}
      >
        {tb303Collapsed ? <ChevronDown size={12} /> : <ChevronUp size={12} />}
      </button>

      <div className="tb303-knob-panel-header">
        <div className="tb303-knob-panel-label">
          TB-303
          {devilFishConfig.enabled && <span className="devilfish-badge">+DF</span>}
        </div>

        {/* Synth Target Selector - choose which instrument MIDI knobs control */}
        {tb303Instruments.length > 1 && (
          <div className="tb303-synth-selector">
            <Radio size={12} className="text-text-muted" />
            <select
              value={controlledInstrumentId ?? 'all'}
              onChange={(e) => setControlledInstrument(e.target.value === 'all' ? null : Number(e.target.value))}
              className="tb303-synth-select"
              title="Select which TB-303 to control with MIDI knobs"
            >
              <option value="all">All TB-303</option>
              {tb303Instruments.map((inst) => (
                <option key={inst.id} value={inst.id}>
                  CH{String(instruments.indexOf(inst) + 1).padStart(2, '0')} {inst.name || 'TB-303'}
                </option>
              ))}
            </select>
          </div>
        )}

        {/* Preset Dropdown */}
        <div className="tb303-preset-controls">
          <div className="tb303-preset-dropdown">
            <button
              className="tb303-preset-button"
              onClick={() => setShowPresetMenu(!showPresetMenu)}
              title="Load preset"
            >
              <span>Presets</span>
              <ChevronDown size={12} />
            </button>

            {showPresetMenu && (
              <div className="tb303-preset-menu">
                {userPresets.length > 0 && (
                  <>
                    <div className="tb303-preset-category">User Presets</div>
                    {userPresets.map((preset) => (
                      <div key={preset.name} className="tb303-preset-item tb303-preset-item-user">
                        <span onClick={() => handleLoadUserPreset(preset)}>{preset.name}</span>
                        <button
                          className="tb303-preset-delete"
                          onClick={(e) => { e.stopPropagation(); handleDeleteUserPreset(preset.name); }}
                          title="Delete preset"
                        >×</button>
                      </div>
                    ))}
                    <div className="tb303-preset-divider" />
                  </>
                )}
                <div className="tb303-preset-category">Factory Presets</div>
                {TB303_PRESETS.slice(0, 20).map((preset) => (
                  <div key={preset.name} className="tb303-preset-item" onClick={() => handleLoadPreset(preset)}>
                    {preset.name}
                  </div>
                ))}
              </div>
            )}
          </div>

          <button className="tb303-save-button" onClick={() => setShowSaveDialog(true)} title="Save preset">
            <Save size={12} />
          </button>
        </div>
      </div>

      {/* Collapsed view - inline values */}
      {tb303Collapsed && (
        <div className="tb303-collapsed-values">
          <span className="tb303-param-inline" style={{ color: 'var(--color-synth-filter)' }}>Cut: {formatValue(liveCutoff ?? params.cutoff, 'Hz')}</span>
          <span className="tb303-param-inline" style={{ color: 'var(--color-synth-filter)' }}>Res: {formatValue(liveResonance ?? params.resonance, '%')}</span>
          <span className="tb303-param-inline" style={{ color: 'var(--color-synth-envelope)' }}>Env: {formatValue(liveEnvMod ?? params.envMod, '%')}</span>
          <span className="tb303-param-inline" style={{ color: 'var(--color-synth-envelope)' }}>Dec: {formatValue(liveDecay ?? params.decay, 'ms')}</span>
          <span className="tb303-param-inline" style={{ color: 'var(--color-synth-accent)' }}>Acc: {formatValue(liveAccent ?? params.accent, '%')}</span>
          <span className="tb303-param-inline" style={{ color: 'var(--color-synth-drive)' }}>Drv: {formatValue(liveOverdrive ?? params.overdrive, '%')}</span>
        </div>
      )}

      {/* Save Dialog */}
      {showSaveDialog && (
        <div className="tb303-save-dialog">
          <input
            type="text"
            placeholder="Preset name..."
            value={presetName}
            onChange={(e) => setPresetName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') handleSavePreset();
              if (e.key === 'Escape') setShowSaveDialog(false);
            }}
            autoFocus
          />
          <button onClick={handleSavePreset}>Save</button>
          <button onClick={() => setShowSaveDialog(false)}>Cancel</button>
        </div>
      )}

      {/* Expanded view - all controls */}
      {!tb303Collapsed && (
        <div className="tb303-expanded-content">
          {/* TB-303 Knobs */}
          <div className="tb303-knobs-container">
            <Knob label="Cutoff" value={params.cutoff} min={50} max={18000} unit="Hz" onChange={handleCutoffChange} logarithmic defaultValue={800} color="var(--color-synth-filter)" displayValue={liveCutoff} isActive={isPlaying && liveCutoff !== undefined} />
            <Knob label="Reso" value={params.resonance} min={0} max={100} unit="%" onChange={handleResonanceChange} defaultValue={65} color="var(--color-synth-filter)" displayValue={liveResonance} isActive={isPlaying && liveResonance !== undefined} />
            <Knob label="EnvMod" value={params.envMod} min={0} max={100} unit="%" onChange={handleEnvModChange} defaultValue={60} color="var(--color-synth-envelope)" displayValue={liveEnvMod} isActive={isPlaying && liveEnvMod !== undefined} />
            <Knob label="Decay" value={params.decay} min={30} max={3000} unit="ms" onChange={handleDecayChange} logarithmic defaultValue={200} color="var(--color-synth-envelope)" displayValue={liveDecay} isActive={isPlaying && liveDecay !== undefined} />
            <Knob label="Accent" value={params.accent} min={0} max={100} unit="%" onChange={handleAccentChange} defaultValue={70} color="var(--color-synth-accent)" displayValue={liveAccent} isActive={isPlaying && liveAccent !== undefined} />
            <Knob label="Drive" value={params.overdrive} min={0} max={100} unit="%" onChange={handleOverdriveChange} defaultValue={0} color="var(--color-synth-drive)" displayValue={liveOverdrive} isActive={isPlaying && liveOverdrive !== undefined} />
          </div>

          {/* Devil Fish Section */}
          <div className="devilfish-row">
            <div className="devilfish-row-header">
              <span className="devilfish-label">Devil Fish</span>
              <Toggle label="" value={devilFishConfig.enabled} onChange={handleDevilFishEnableChange} color="var(--color-synth-drive)" size="sm" />
            </div>

            {devilFishConfig.enabled && (
              <div className="devilfish-knobs">
                <Knob label="Norm Dec" value={devilFishConfig.normalDecay} min={30} max={3000} unit="ms" onChange={handleNormalDecayChange} logarithmic defaultValue={200} color="var(--color-synth-envelope)" displayValue={liveNormalDecay} isActive={isPlaying && liveNormalDecay !== undefined} />
                <Knob label="Acc Dec" value={devilFishConfig.accentDecay} min={30} max={3000} unit="ms" onChange={handleAccentDecayChange} logarithmic defaultValue={200} color="var(--color-synth-accent)" displayValue={liveAccentDecay} isActive={isPlaying && liveAccentDecay !== undefined} />
                <Knob label="Soft Atk" value={devilFishConfig.softAttack} min={0.3} max={30} unit="ms" onChange={handleSoftAttackChange} logarithmic defaultValue={3} color="var(--color-synth-envelope)" displayValue={liveSoftAttack} isActive={isPlaying && liveSoftAttack !== undefined} />
                <Knob label="VEG Dec" value={devilFishConfig.vegDecay} min={16} max={3000} unit="ms" onChange={handleVegDecayChange} logarithmic defaultValue={300} color="var(--color-synth-filter)" displayValue={liveVegDecay} isActive={isPlaying && liveVegDecay !== undefined} />
                <Knob label="VEG Sus" value={devilFishConfig.vegSustain} min={0} max={100} unit="%" onChange={handleVegSustainChange} defaultValue={0} color="var(--color-synth-filter)" displayValue={liveVegSustain} isActive={isPlaying && liveVegSustain !== undefined} />
                <Knob label="Tracking" value={devilFishConfig.filterTracking} min={0} max={200} unit="%" onChange={handleFilterTrackingChange} defaultValue={0} color="var(--color-synth-modulation)" displayValue={liveFilterTracking} isActive={isPlaying && liveFilterTracking !== undefined} />
                <Knob label="FM" value={devilFishConfig.filterFM} min={0} max={100} unit="%" onChange={handleFilterFMChange} defaultValue={0} color="var(--color-synth-modulation)" displayValue={liveFilterFM} isActive={isPlaying && liveFilterFM !== undefined} />
                <Switch3Way label="Sweep" value={devilFishConfig.sweepSpeed} options={['fast', 'normal', 'slow']} labels={['F', 'N', 'S']} onChange={handleSweepSpeedChange} color="var(--color-synth-accent)" />
                <Switch3Way label="Muffler" value={devilFishConfig.muffler} options={['off', 'soft', 'hard']} labels={['Off', 'Sft', 'Hrd']} onChange={handleMufflerChange} color="var(--color-synth-drive)" />
                <Toggle label="Hi Reso" value={devilFishConfig.highResonance} onChange={handleHighResonanceChange} color="var(--color-synth-filter)" size="sm" />
                <Toggle label="Acc Swp" value={devilFishConfig.accentSweepEnabled} onChange={handleAccentSweepChange} color="var(--color-synth-accent)" size="sm" />
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

// Memoize to prevent unnecessary re-renders from parent component updates
export const TB303KnobPanel = React.memo(TB303KnobPanelComponent);
TB303KnobPanel.displayName = 'TB303KnobPanel';
