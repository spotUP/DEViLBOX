/**
 * TB303KnobPanel - Live filter control knobs for TB-303 synthesizer
 * Manual knob changes override automation for one pattern cycle
 * Knobs animate during playback to show live filter modulation
 */

import React, { useState, useCallback, useEffect, useRef } from 'react';
import * as Tone from 'tone';
import { Knob } from '@components/controls/Knob';
import { useInstrumentStore, useTrackerStore, useTransportStore, useAutomationStore } from '@stores';
import { getToneEngine } from '@engine/ToneEngine';
import { TB303Synth } from '@engine/TB303Engine';
import { getManualOverrideManager } from '@engine/ManualOverrideManager';

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

export const TB303KnobPanel: React.FC = () => {
  const { instruments } = useInstrumentStore();
  const { patterns, currentPatternIndex } = useTrackerStore();
  const { isPlaying } = useTransportStore();
  const { curves } = useAutomationStore();
  const [params, setParams] = useState<TB303Params>(DEFAULT_PARAMS);

  // Live modulation values (for visual feedback during playback)
  const [liveCutoff, setLiveCutoff] = useState<number | undefined>(undefined);
  const [liveResonance, setLiveResonance] = useState<number | undefined>(undefined);
  const [liveEnvMod, setLiveEnvMod] = useState<number | undefined>(undefined);
  const [liveDecay, setLiveDecay] = useState<number | undefined>(undefined);
  const [liveAccent, setLiveAccent] = useState<number | undefined>(undefined);
  const [liveOverdrive, setLiveOverdrive] = useState<number | undefined>(undefined);
  const animationRef = useRef<number | null>(null);

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
  const hasAnyAutomation = hasCutoffAutomation || hasResonanceAutomation || hasEnvModAutomation ||
    hasDecayAutomation || hasAccentAutomation || hasOverdriveAutomation;

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

  // Sync initial params from first TB303 instrument config
  useEffect(() => {
    const firstTB303 = tb303Instruments[0];
    if (firstTB303?.tb303) {
      setParams({
        cutoff: firstTB303.tb303.filter?.cutoff ?? DEFAULT_PARAMS.cutoff,
        resonance: firstTB303.tb303.filter?.resonance ?? DEFAULT_PARAMS.resonance,
        envMod: firstTB303.tb303.filterEnvelope?.envMod ?? DEFAULT_PARAMS.envMod,
        decay: firstTB303.tb303.filterEnvelope?.decay ?? DEFAULT_PARAMS.decay,
        accent: firstTB303.tb303.accent?.amount ?? DEFAULT_PARAMS.accent,
        overdrive: firstTB303.tb303.overdrive?.amount ?? DEFAULT_PARAMS.overdrive,
      });
    }
  }, [tb303Instruments.length]);

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
        return 30 * Math.pow(100, value); // 30-3000ms (log)
      default:
        return value;
    }
  }, []);

  // Poll live filter values during playback for knob animation (only when automation is active)
  useEffect(() => {
    // Only animate when playing AND there's any automation
    if (!isPlaying || !hasAnyAutomation) {
      // Reset live values when stopped or no automation
      setLiveCutoff(undefined);
      setLiveResonance(undefined);
      setLiveEnvMod(undefined);
      setLiveDecay(undefined);
      setLiveAccent(undefined);
      setLiveOverdrive(undefined);
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

      // Interpolate each parameter with automation
      if (hasCutoffAutomation) {
        const curve = getCurve('cutoff');
        const value = interpolateAutomation(curve, currentRow);
        if (value !== null) {
          setLiveCutoff(automationToParam(value, 'cutoff'));
        }
      }
      if (hasResonanceAutomation) {
        const curve = getCurve('resonance');
        const value = interpolateAutomation(curve, currentRow);
        if (value !== null) {
          setLiveResonance(automationToParam(value, 'resonance'));
        }
      }
      if (hasEnvModAutomation) {
        const curve = getCurve('envMod');
        const value = interpolateAutomation(curve, currentRow);
        if (value !== null) {
          setLiveEnvMod(automationToParam(value, 'envMod'));
        }
      }
      if (hasDecayAutomation) {
        const curve = getCurve('decay');
        const value = interpolateAutomation(curve, currentRow);
        if (value !== null) {
          setLiveDecay(automationToParam(value, 'decay'));
        }
      }
      if (hasAccentAutomation) {
        const curve = getCurve('accent');
        const value = interpolateAutomation(curve, currentRow);
        if (value !== null) {
          setLiveAccent(automationToParam(value, 'accent'));
        }
      }
      if (hasOverdriveAutomation) {
        const curve = getCurve('overdrive');
        const value = interpolateAutomation(curve, currentRow);
        if (value !== null) {
          setLiveOverdrive(automationToParam(value, 'overdrive'));
        }
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
      hasDecayAutomation, hasAccentAutomation, hasOverdriveAutomation, engine, patterns, currentPatternIndex,
      curves, interpolateAutomation, automationToParam]);

  // Update all TB303 instruments
  const updateAllTB303 = useCallback((setter: (synth: TB303Synth) => void) => {
    // Access internal instruments map
    const engineInstruments = (engine as any).instruments as Map<number, any>;
    if (!engineInstruments) return;

    engineInstruments.forEach((instrument) => {
      if (instrument instanceof TB303Synth) {
        setter(instrument);
      }
    });
  }, [engine]);

  // Parameter change handlers - each registers a manual override
  const handleCutoffChange = useCallback((value: number) => {
    setParams(p => ({ ...p, cutoff: value }));
    updateAllTB303(synth => synth.setCutoff(value));
    // Register override - automation won't apply for one pattern cycle
    overrideManager.setOverride('cutoff', value / 18000); // Normalize to 0-1
  }, [updateAllTB303, overrideManager]);

  const handleResonanceChange = useCallback((value: number) => {
    setParams(p => ({ ...p, resonance: value }));
    updateAllTB303(synth => synth.setResonance(value));
    overrideManager.setOverride('resonance', value / 100);
  }, [updateAllTB303, overrideManager]);

  const handleEnvModChange = useCallback((value: number) => {
    setParams(p => ({ ...p, envMod: value }));
    updateAllTB303(synth => synth.setEnvMod(value));
    overrideManager.setOverride('envMod', value / 100);
  }, [updateAllTB303, overrideManager]);

  const handleDecayChange = useCallback((value: number) => {
    setParams(p => ({ ...p, decay: value }));
    updateAllTB303(synth => synth.setDecay(value));
    overrideManager.setOverride('decay', (value - 30) / 2970); // Normalize 30-3000 to 0-1
  }, [updateAllTB303, overrideManager]);

  const handleAccentChange = useCallback((value: number) => {
    setParams(p => ({ ...p, accent: value }));
    updateAllTB303(synth => synth.setAccentAmount(value));
    overrideManager.setOverride('accent', value / 100);
  }, [updateAllTB303, overrideManager]);

  const handleOverdriveChange = useCallback((value: number) => {
    setParams(p => ({ ...p, overdrive: value }));
    updateAllTB303(synth => synth.setOverdrive(value));
    overrideManager.setOverride('overdrive', value / 100);
  }, [updateAllTB303, overrideManager]);

  // Don't render if no TB303 instruments
  if (tb303Instruments.length === 0) {
    return null;
  }

  return (
    <div className="tb303-knob-panel">
      <div className="tb303-knob-panel-label">TB-303</div>

      <Knob
        label="Cutoff"
        value={params.cutoff}
        min={50}
        max={18000}
        unit="Hz"
        onChange={handleCutoffChange}
        logarithmic
        defaultValue={800}
        color="#00d4aa"
        displayValue={liveCutoff}
        isActive={isPlaying && liveCutoff !== undefined}
      />

      <Knob
        label="Reso"
        value={params.resonance}
        min={0}
        max={100}
        unit="%"
        onChange={handleResonanceChange}
        defaultValue={65}
        color="#00d4aa"
        displayValue={liveResonance}
        isActive={isPlaying && liveResonance !== undefined}
      />

      <Knob
        label="EnvMod"
        value={params.envMod}
        min={0}
        max={100}
        unit="%"
        onChange={handleEnvModChange}
        defaultValue={60}
        color="#7c3aed"
        displayValue={liveEnvMod}
        isActive={isPlaying && liveEnvMod !== undefined}
      />

      <Knob
        label="Decay"
        value={params.decay}
        min={30}
        max={3000}
        unit="ms"
        onChange={handleDecayChange}
        logarithmic
        defaultValue={200}
        color="#7c3aed"
        displayValue={liveDecay}
        isActive={isPlaying && liveDecay !== undefined}
      />

      <Knob
        label="Accent"
        value={params.accent}
        min={0}
        max={100}
        unit="%"
        onChange={handleAccentChange}
        defaultValue={70}
        color="#f59e0b"
        displayValue={liveAccent}
        isActive={isPlaying && liveAccent !== undefined}
      />

      <Knob
        label="Drive"
        value={params.overdrive}
        min={0}
        max={100}
        unit="%"
        onChange={handleOverdriveChange}
        defaultValue={0}
        color="#ef4444"
        displayValue={liveOverdrive}
        isActive={isPlaying && liveOverdrive !== undefined}
      />
    </div>
  );
};
