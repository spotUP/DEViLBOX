/**
 * DevilFishPanel - Controls for the TB-303 Devil Fish modification
 * Robin Whittle's famous mod that adds extra controls and capabilities
 */

import React, { useState, useCallback, useEffect, useRef } from 'react';
import * as Tone from 'tone';
import { Knob } from '@components/controls/Knob';
import { Toggle } from '@components/controls/Toggle';
import { Switch3Way } from '@components/controls/Switch3Way';
import { useInstrumentStore, useTransportStore, useAutomationStore, useTrackerStore } from '@stores';
import { getToneEngine } from '@engine/ToneEngine';
import { TB303Synth } from '@engine/TB303Engine';
import type { DevilFishConfig } from '@typedefs/instrument';
import { DEFAULT_DEVIL_FISH } from '@typedefs/instrument';

export const DevilFishPanel: React.FC = () => {
  const { instruments } = useInstrumentStore();
  const { isPlaying } = useTransportStore();
  const { curves } = useAutomationStore();
  const { patterns, currentPatternIndex } = useTrackerStore();
  const [config, setConfig] = useState<DevilFishConfig>({ ...DEFAULT_DEVIL_FISH });
  const [isExpanded, setIsExpanded] = useState(false);

  // Live modulation values (for visual feedback during playback)
  const [liveNormalDecay, setLiveNormalDecay] = useState<number | undefined>(undefined);
  const [liveAccentDecay, setLiveAccentDecay] = useState<number | undefined>(undefined);
  const [liveVegDecay, setLiveVegDecay] = useState<number | undefined>(undefined);
  const [liveVegSustain, setLiveVegSustain] = useState<number | undefined>(undefined);
  const [liveSoftAttack, setLiveSoftAttack] = useState<number | undefined>(undefined);
  const [liveFilterTracking, setLiveFilterTracking] = useState<number | undefined>(undefined);
  const [liveFilterFM, setLiveFilterFM] = useState<number | undefined>(undefined);
  const animationRef = useRef<number | null>(null);

  // Find TB303 instruments
  const tb303Instruments = instruments.filter(i => i.synthType === 'TB303');
  const engine = getToneEngine();

  // Check which Devil Fish parameters have automation
  const hasAutomation = (param: string) => curves.some((curve: { parameter: string; enabled: boolean; points: unknown[] }) =>
    curve.parameter === param &&
    curve.enabled &&
    curve.points.length > 0
  );

  const hasNormalDecayAutomation = hasAutomation('normalDecay');
  const hasAccentDecayAutomation = hasAutomation('accentDecay');
  const hasVegDecayAutomation = hasAutomation('vegDecay');
  const hasVegSustainAutomation = hasAutomation('vegSustain');
  const hasSoftAttackAutomation = hasAutomation('softAttack');
  const hasFilterTrackingAutomation = hasAutomation('filterTracking');
  const hasFilterFMAutomation = hasAutomation('filterFM');
  const hasAnyAutomation = hasNormalDecayAutomation || hasAccentDecayAutomation ||
    hasVegDecayAutomation || hasVegSustainAutomation || hasSoftAttackAutomation ||
    hasFilterTrackingAutomation || hasFilterFMAutomation;

  // Sync config from first TB303 instrument
  useEffect(() => {
    const firstTB303 = tb303Instruments[0];
    if (firstTB303?.tb303?.devilFish) {
      setConfig({ ...DEFAULT_DEVIL_FISH, ...firstTB303.tb303.devilFish });
    }
  }, [tb303Instruments.length]);

  // Ensure synth instances exist when panel is expanded and Devil Fish is enabled
  // Only run on expansion, not on every config change (that's handled by individual knob handlers)
  useEffect(() => {
    if (isExpanded && config.enabled) {
      // Update ALL existing TB303 instances, not just the default one
      const engineInstruments = (engine as any).instruments as Map<string, any>;
      if (engineInstruments) {
        engineInstruments.forEach((instrument) => {
          if (instrument instanceof TB303Synth) {
            instrument.enableDevilFish(true, config);
          }
        });
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isExpanded, config.enabled]); // Deliberately omit config to avoid re-running on every param change

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

  // Poll live values during playback for knob animation (only when automation is active)
  useEffect(() => {
    // Only animate when playing AND there's any automation
    if (!isPlaying || !hasAnyAutomation) {
      // Reset live values when stopped or no automation
      setLiveNormalDecay(undefined);
      setLiveAccentDecay(undefined);
      setLiveVegDecay(undefined);
      setLiveVegSustain(undefined);
      setLiveSoftAttack(undefined);
      setLiveFilterTracking(undefined);
      setLiveFilterFM(undefined);
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

      // Find automation curves for this pattern
      const getCurve = (param: string) => curves.find(c =>
        c.patternId === pattern.id && c.parameter === param && c.enabled && c.points.length > 0
      );

      // Interpolate each parameter with automation
      if (hasNormalDecayAutomation) {
        const curve = getCurve('normalDecay');
        const value = interpolateAutomation(curve, currentRow);
        if (value !== null) {
          setLiveNormalDecay(automationToParam(value, 'normalDecay'));
        }
      }
      if (hasAccentDecayAutomation) {
        const curve = getCurve('accentDecay');
        const value = interpolateAutomation(curve, currentRow);
        if (value !== null) {
          setLiveAccentDecay(automationToParam(value, 'accentDecay'));
        }
      }
      if (hasVegDecayAutomation) {
        const curve = getCurve('vegDecay');
        const value = interpolateAutomation(curve, currentRow);
        if (value !== null) {
          setLiveVegDecay(automationToParam(value, 'vegDecay'));
        }
      }
      if (hasVegSustainAutomation) {
        const curve = getCurve('vegSustain');
        const value = interpolateAutomation(curve, currentRow);
        if (value !== null) {
          setLiveVegSustain(automationToParam(value, 'vegSustain'));
        }
      }
      if (hasSoftAttackAutomation) {
        const curve = getCurve('softAttack');
        const value = interpolateAutomation(curve, currentRow);
        if (value !== null) {
          setLiveSoftAttack(automationToParam(value, 'softAttack'));
        }
      }
      if (hasFilterTrackingAutomation) {
        const curve = getCurve('filterTracking');
        const value = interpolateAutomation(curve, currentRow);
        if (value !== null) {
          setLiveFilterTracking(automationToParam(value, 'filterTracking'));
        }
      }
      if (hasFilterFMAutomation) {
        const curve = getCurve('filterFM');
        const value = interpolateAutomation(curve, currentRow);
        if (value !== null) {
          setLiveFilterFM(automationToParam(value, 'filterFM'));
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
  }, [isPlaying, hasAnyAutomation, hasNormalDecayAutomation, hasAccentDecayAutomation,
      hasVegDecayAutomation, hasVegSustainAutomation, hasSoftAttackAutomation,
      hasFilterTrackingAutomation, hasFilterFMAutomation, engine, patterns, currentPatternIndex,
      curves, interpolateAutomation, automationToParam]);

  // Update all TB303 synth instances
  const updateAllTB303 = useCallback((updater: (synth: TB303Synth) => void) => {
    const engineInstruments = (engine as any).instruments as Map<string, any>;
    if (!engineInstruments) {
      console.warn('[DevilFish] No instruments map found');
      return;
    }

    let found = 0;
    engineInstruments.forEach((instrument) => {
      if (instrument instanceof TB303Synth) {
        found++;
        updater(instrument);
      }
    });

    if (found === 0) {
      console.warn('[DevilFish] No TB303 synth instances found in engine');
    }
  }, [engine]);

  // Enable/disable Devil Fish
  const handleEnableChange = useCallback((enabled: boolean) => {
    const newConfig = { ...config, enabled };
    setConfig(newConfig);

    // Ensure synth instances exist and update them
    tb303Instruments.forEach(inst => {
      // Force-create synth instance if it doesn't exist
      const synth = engine.getInstrument(inst.id, inst, -1);
      if (synth instanceof TB303Synth) {
        synth.enableDevilFish(enabled, newConfig);
        console.log('[DevilFish] Updated instrument', inst.id, 'enabled:', enabled);
      }
    });

    // Also update any existing per-channel instances
    updateAllTB303(synth => synth.enableDevilFish(enabled, newConfig));
  }, [updateAllTB303, config, engine, tb303Instruments]);

  // Knob handlers
  const handleNormalDecayChange = useCallback((value: number) => {
    setConfig(c => ({ ...c, normalDecay: value }));
    updateAllTB303(synth => synth.setNormalDecay(value));
  }, [updateAllTB303]);

  const handleAccentDecayChange = useCallback((value: number) => {
    setConfig(c => ({ ...c, accentDecay: value }));
    updateAllTB303(synth => synth.setAccentDecay(value));
  }, [updateAllTB303]);

  const handleVegDecayChange = useCallback((value: number) => {
    setConfig(c => ({ ...c, vegDecay: value }));
    updateAllTB303(synth => synth.setVegDecay(value));
  }, [updateAllTB303]);

  const handleVegSustainChange = useCallback((value: number) => {
    setConfig(c => ({ ...c, vegSustain: value }));
    updateAllTB303(synth => synth.setVegSustain(value));
  }, [updateAllTB303]);

  const handleSoftAttackChange = useCallback((value: number) => {
    setConfig(c => ({ ...c, softAttack: value }));
    updateAllTB303(synth => synth.setSoftAttack(value));
  }, [updateAllTB303]);

  const handleFilterTrackingChange = useCallback((value: number) => {
    setConfig(c => ({ ...c, filterTracking: value }));
    updateAllTB303(synth => synth.setFilterTracking(value));
  }, [updateAllTB303]);

  const handleFilterFMChange = useCallback((value: number) => {
    setConfig(c => ({ ...c, filterFM: value }));
    updateAllTB303(synth => {
      console.log('[DevilFish] Setting Filter FM to:', value);
      synth.setFilterFM(value);
    });
  }, [updateAllTB303]);

  // Switch handlers
  const handleSweepSpeedChange = useCallback((value: 'fast' | 'normal' | 'slow') => {
    setConfig(c => ({ ...c, sweepSpeed: value }));
    updateAllTB303(synth => synth.setSweepSpeed(value));
  }, [updateAllTB303]);

  const handleMufflerChange = useCallback((value: 'off' | 'soft' | 'hard') => {
    setConfig(c => ({ ...c, muffler: value }));
    updateAllTB303(synth => {
      console.log('[DevilFish] Setting Muffler to:', value);
      synth.setMuffler(value);
    });
  }, [updateAllTB303]);

  // Toggle handlers
  const handleHighResonanceChange = useCallback((enabled: boolean) => {
    setConfig(c => ({ ...c, highResonance: enabled }));
    updateAllTB303(synth => {
      console.log('[DevilFish] Setting High Resonance to:', enabled);
      synth.setHighResonance(enabled);
    });
  }, [updateAllTB303]);

  const handleAccentSweepChange = useCallback((enabled: boolean) => {
    setConfig(c => ({ ...c, accentSweepEnabled: enabled }));
    updateAllTB303(synth => synth.setAccentSweepEnabled(enabled));
  }, [updateAllTB303]);

  // Don't render if no TB303 instruments
  if (tb303Instruments.length === 0) {
    return null;
  }

  return (
    <div className="devilfish-panel">
      <div className="devilfish-header">
        <div className="devilfish-title">
          <span className="devilfish-title-text">Devil Fish Mod</span>
          <Toggle
            label=""
            value={config.enabled}
            onChange={handleEnableChange}
            color="#ef4444"
            size="sm"
          />
        </div>
        <button
          onClick={() => setIsExpanded(!isExpanded)}
          style={{
            background: 'none',
            border: 'none',
            color: '#666',
            cursor: 'pointer',
            fontSize: '10px',
            fontFamily: 'JetBrains Mono, monospace',
          }}
        >
          {isExpanded ? '▼ COLLAPSE' : '▶ EXPAND'}
        </button>
      </div>

      {isExpanded && config.enabled && (
        <div className="devilfish-controls">
          {/* Envelope Section */}
          <div className="devilfish-section">
            <div className="devilfish-section-label">Envelope</div>
            <div className="devilfish-section-controls">
              <Knob
                label="Norm Dec"
                value={config.normalDecay}
                min={30}
                max={3000}
                unit="ms"
                onChange={handleNormalDecayChange}
                logarithmic
                defaultValue={200}
                color="#7c3aed"
                size="sm"
                displayValue={liveNormalDecay}
                isActive={isPlaying && liveNormalDecay !== undefined}
              />
              <Knob
                label="Acc Dec"
                value={config.accentDecay}
                min={30}
                max={3000}
                unit="ms"
                onChange={handleAccentDecayChange}
                logarithmic
                defaultValue={200}
                color="#f59e0b"
                size="sm"
                displayValue={liveAccentDecay}
                isActive={isPlaying && liveAccentDecay !== undefined}
              />
              <Knob
                label="Soft Atk"
                value={config.softAttack}
                min={0.3}
                max={30}
                unit="ms"
                onChange={handleSoftAttackChange}
                logarithmic
                defaultValue={3}
                color="#7c3aed"
                size="sm"
                displayValue={liveSoftAttack}
                isActive={isPlaying && liveSoftAttack !== undefined}
              />
            </div>
          </div>

          {/* VEG Section */}
          <div className="devilfish-section">
            <div className="devilfish-section-label">VEG (Volume)</div>
            <div className="devilfish-section-controls">
              <Knob
                label="Decay"
                value={config.vegDecay}
                min={16}
                max={3000}
                unit="ms"
                onChange={handleVegDecayChange}
                logarithmic
                defaultValue={300}
                color="#00d4aa"
                size="sm"
                displayValue={liveVegDecay}
                isActive={isPlaying && liveVegDecay !== undefined}
              />
              <Knob
                label="Sustain"
                value={config.vegSustain}
                min={0}
                max={100}
                unit="%"
                onChange={handleVegSustainChange}
                defaultValue={0}
                color="#00d4aa"
                size="sm"
                displayValue={liveVegSustain}
                isActive={isPlaying && liveVegSustain !== undefined}
              />
            </div>
          </div>

          {/* Filter Section */}
          <div className="devilfish-section">
            <div className="devilfish-section-label">Filter Mods</div>
            <div className="devilfish-section-controls">
              <Knob
                label="Tracking"
                value={config.filterTracking}
                min={0}
                max={200}
                unit="%"
                onChange={handleFilterTrackingChange}
                defaultValue={0}
                color="#3b82f6"
                size="sm"
                displayValue={liveFilterTracking}
                isActive={isPlaying && liveFilterTracking !== undefined}
              />
              <Knob
                label="FM"
                value={config.filterFM}
                min={0}
                max={100}
                unit="%"
                onChange={handleFilterFMChange}
                defaultValue={0}
                color="#3b82f6"
                size="sm"
                displayValue={liveFilterFM}
                isActive={isPlaying && liveFilterFM !== undefined}
              />
            </div>
          </div>

          {/* Switches */}
          <div className="devilfish-section">
            <div className="devilfish-section-label">Switches</div>
            <div className="devilfish-switches">
              <Switch3Way
                label="Sweep"
                value={config.sweepSpeed}
                options={['fast', 'normal', 'slow']}
                labels={['F', 'N', 'S']}
                onChange={handleSweepSpeedChange}
                color="#f59e0b"
              />
              <Switch3Way
                label="Muffler"
                value={config.muffler}
                options={['off', 'soft', 'hard']}
                labels={['Off', 'Sft', 'Hrd']}
                onChange={handleMufflerChange}
                color="#ef4444"
              />
            </div>
          </div>

          {/* Toggles */}
          <div className="devilfish-section">
            <div className="devilfish-section-label">Options</div>
            <div className="devilfish-switches">
              <Toggle
                label="Hi Reso"
                value={config.highResonance}
                onChange={handleHighResonanceChange}
                color="#00d4aa"
                size="sm"
              />
              <Toggle
                label="Acc Swp"
                value={config.accentSweepEnabled}
                onChange={handleAccentSweepChange}
                color="#f59e0b"
                size="sm"
              />
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
