// @ts-nocheck - Null check issues
/**
 * AutomationPlayer - Real-time automation value reader and applier
 * Reads automation from tracker columns or curve data and applies to Tone.js parameters
 * Respects manual overrides from TB-303 knob panel
 */

import * as Tone from 'tone';
import { getToneEngine } from './ToneEngine';
import { TB303Synth } from './TB303Engine';
import { TB303AccurateSynth } from './TB303AccurateSynth';
import { getManualOverrideManager } from './ManualOverrideManager';
import type { TrackerCell, Pattern } from '@typedefs';
import type { AutomationCurve, AutomationParameter } from '@typedefs/automation';

interface AutomationData {
  [patternId: string]: {
    [channelIndex: number]: {
      [parameter: string]: AutomationCurve;
    };
  };
}

export class AutomationPlayer {
  private currentPattern: Pattern | null = null;
  private automationData: AutomationData = {};

  /**
   * Set automation curve data
   */
  public setAutomationData(data: AutomationData): void {
    this.automationData = data;
    // Debug logging
    const patternIds = Object.keys(data);
    console.log('[AutomationPlayer] setAutomationData:', {
      patternCount: patternIds.length,
      patterns: patternIds.map(pid => ({
        patternId: pid,
        channels: Object.keys(data[pid] || {}).map(ch => ({
          channel: ch,
          params: Object.keys(data[pid][Number(ch)] || {})
        }))
      }))
    });
  }

  /**
   * Set current pattern
   */
  public setPattern(pattern: Pattern): void {
    this.currentPattern = pattern;
  }

  /**
   * Get automation value from tracker column
   * Returns 0-1 normalized value
   */
  private getColumnValue(cell: TrackerCell, parameter: AutomationParameter): number | null {
    let rawValue: number | undefined;

    switch (parameter) {
      case 'cutoff':
        rawValue = cell.cutoff;
        break;
      case 'resonance':
        rawValue = cell.resonance;
        break;
      case 'envMod':
        rawValue = cell.envMod;
        break;
      case 'pan':
        rawValue = cell.pan;
        break;
      case 'volume':
        // XM volume column format:
        // 0x00-0x0F: nothing (no volume data)
        // 0x10-0x50: set volume 0-64 (value = volumeByte - 0x10)
        // 0x60+: volume effects (handled separately)
        if (cell.volume !== null && cell.volume >= 0x10 && cell.volume <= 0x50) {
          // Extract volume value (0-64) and return it (will be normalized below)
          rawValue = cell.volume - 0x10;
        } else {
          // Skip automation for 0x00-0x0F (nothing) and effects (0x60+)
          rawValue = undefined;
        }
        break;
      default:
        return null;
    }

    if (rawValue === undefined) return null;

    // Normalize to 0-1
    if (parameter === 'volume') {
      return rawValue / 0x40; // Volume is 0-64 (0x40), normalize to 0-1
    } else {
      return rawValue / 0xff; // Others are 0x00-0xFF
    }
  }

  /**
   * Get automation value from curve data at specific row
   * Uses interpolation between keyframes
   */
  private getCurveValue(
    patternId: string,
    channelIndex: number,
    parameter: AutomationParameter,
    row: number
  ): number | null {
    const curve = this.automationData[patternId]?.[channelIndex]?.[parameter];
    if (!curve || !curve.enabled || curve.points.length === 0) return null;

    const sortedPoints = [...curve.points].sort((a, b) => a.row - b.row);

    // If before first point
    if (row < sortedPoints[0].row) {
      return sortedPoints[0].value;
    }

    // If after last point
    if (row >= sortedPoints[sortedPoints.length - 1].row) {
      return sortedPoints[sortedPoints.length - 1].value;
    }

    // Find surrounding points
    let prevPoint = sortedPoints[0];
    let nextPoint = sortedPoints[sortedPoints.length - 1];

    for (let i = 0; i < sortedPoints.length - 1; i++) {
      if (sortedPoints[i].row <= row && sortedPoints[i + 1].row > row) {
        prevPoint = sortedPoints[i];
        nextPoint = sortedPoints[i + 1];
        break;
      }
    }

    // If exactly on a point
    if (prevPoint.row === row) return prevPoint.value;
    if (nextPoint.row === row) return nextPoint.value;

    // Interpolate between points
    const rowDiff = nextPoint.row - prevPoint.row;
    const valueDiff = nextPoint.value - prevPoint.value;
    const t = (row - prevPoint.row) / rowDiff;

    switch (curve.interpolation) {
      case 'linear':
        return prevPoint.value + valueDiff * t;

      case 'exponential':
        return prevPoint.value + valueDiff * (t * t);

      case 'easeIn':
        // Cubic ease in
        return prevPoint.value + valueDiff * (t * t * t);

      case 'easeOut':
        // Cubic ease out
        const tInv = 1 - t;
        return prevPoint.value + valueDiff * (1 - tInv * tInv * tInv);

      case 'easeBoth':
        // Cubic ease in-out
        if (t < 0.5) {
          return prevPoint.value + valueDiff * (4 * t * t * t);
        } else {
          const tShift = 2 * t - 2;
          return prevPoint.value + valueDiff * (1 + tShift * tShift * tShift / 2 + 0.5);
        }

      default:
        return prevPoint.value + valueDiff * t;
    }
  }

  /**
   * Get combined automation value (column takes precedence over curve)
   */
  private getAutomationValue(
    cell: TrackerCell,
    patternId: string,
    channelIndex: number,
    parameter: AutomationParameter,
    row: number
  ): number | null {
    // Check column value first (takes precedence)
    const columnValue = this.getColumnValue(cell, parameter);
    if (columnValue !== null) return columnValue;

    // Fall back to curve value
    return this.getCurveValue(patternId, channelIndex, parameter, row);
  }

  /**
   * Apply automation parameter to instrument
   * Skips application if parameter has a manual override active
   */
  private applyParameter(
    instrumentId: number,
    parameter: AutomationParameter,
    value: number, // 0-1 normalized
    channelIndex?: number
  ): void {
    // Check for manual override - if user is controlling this via knobs, skip automation
    const overrideManager = getManualOverrideManager();
    if (overrideManager.isOverridden(parameter as any)) {
      console.log(`[AutomationPlayer] BLOCKED by manual override: ${parameter}`);
      return; // Manual control takes precedence
    }

    const engine = getToneEngine();

    // Try composite key first (instrumentId-channelIndex), then fall back to instrumentId-(-1)
    let instrument = null;
    if (channelIndex !== undefined) {
      instrument = engine.instruments.get(`${instrumentId}-${channelIndex}`);
    }
    if (!instrument) {
      instrument = engine.instruments.get(`${instrumentId}-${-1}`);
    }
    // Also try iterating to find any matching TB303 for this instrumentId
    if (!instrument) {
      for (const [key, inst] of engine.instruments.entries()) {
        if (key.startsWith(`${instrumentId}-`) && (inst instanceof TB303Synth || inst instanceof TB303AccurateSynth)) {
          instrument = inst;
          break;
        }
      }
    }
    if (!instrument) return;

    try {
      // Check if this is a TB303Synth - use its dedicated methods
      const isTB303 = instrument instanceof TB303Synth || instrument instanceof TB303AccurateSynth;

      switch (parameter) {
        case 'cutoff':
          // Map 0-1 to 50-18000 Hz (logarithmic)
          const cutoffHz = 50 * Math.pow(360, value); // 50 to ~18000 Hz
          if (isTB303) {
            console.log(`[AutomationPlayer] Applying cutoff: value=${value.toFixed(3)} -> ${cutoffHz.toFixed(0)}Hz`);
            (instrument as TB303Synth).setCutoff(cutoffHz);
          } else if (instrument.filter?.frequency) {
            instrument.filter.frequency.setValueAtTime(cutoffHz, Tone.now());
          }
          break;

        case 'resonance':
          // Map 0-1 to 0-100 percent
          const resoPercent = value * 100;
          if (isTB303) {
            (instrument as TB303Synth).setResonance(resoPercent);
          } else if (instrument.filter?.Q) {
            // For non-TB303, map to Q factor
            const qValue = value * 30;
            instrument.filter.Q.setValueAtTime(qValue, Tone.now());
          }
          break;

        case 'envMod':
          // Envelope modulation (TB-303 specific)
          if (isTB303) {
            (instrument as TB303Synth).setEnvMod(value * 100);
          } else if (typeof (instrument as any).setEnvMod === 'function') {
            (instrument as any).setEnvMod(value * 100);
          }
          break;

        case 'decay':
          // Decay time (TB-303 specific) - Map 0-1 to 30-3000ms LOGARITHMICALLY
          // Must match the Knob's logarithmic scaling
          if (isTB303) {
            const decayMs = 30 * Math.pow(100, value); // 30ms to 3000ms (log scale)
            (instrument as TB303Synth).setDecay(decayMs);
          }
          break;

        case 'accent':
          // Accent amount (TB-303 specific) - Map 0-1 to 0-100%
          if (isTB303) {
            console.log(`[AutomationPlayer] Applying accent: value=${value.toFixed(3)} -> ${(value * 100).toFixed(1)}%`);
            (instrument as TB303Synth).setAccentAmount(value * 100);
          }
          break;

        case 'tuning':
          // Tuning/detune (TB-303 specific) - Map 0-1 to -1200 to +1200 cents
          // 0.5 = no detune, 0 = -1200 cents, 1 = +1200 cents
          if (isTB303) {
            const cents = (value - 0.5) * 2400; // -1200 to +1200 cents
            (instrument as TB303Synth).setTuning(cents);
          }
          break;

        case 'overdrive':
          // Overdrive amount (TB-303 specific) - Map 0-1 to 0-100%
          if (isTB303) {
            (instrument as TB303Synth).setOverdrive(value * 100);
          }
          break;

        // === DEVIL FISH PARAMETERS ===
        case 'normalDecay':
          // Normal decay time (Devil Fish) - Map 0-1 to 30-3000ms LOGARITHMICALLY
          // Must match the Knob's logarithmic scaling
          if (isTB303) {
            const normalDecayMs = 30 * Math.pow(100, value); // 30ms to 3000ms (log scale)
            (instrument as TB303Synth).setNormalDecay(normalDecayMs);
          }
          break;

        case 'accentDecay':
          // Accent decay time (Devil Fish) - Map 0-1 to 30-3000ms LOGARITHMICALLY
          // Must match the Knob's logarithmic scaling
          if (isTB303) {
            const accentDecayMs = 30 * Math.pow(100, value); // 30ms to 3000ms (log scale)
            (instrument as TB303Synth).setAccentDecay(accentDecayMs);
          }
          break;

        case 'vegDecay':
          // VEG decay time (Devil Fish) - Map 0-1 to 16-3000ms LOGARITHMICALLY
          // Must match the Knob's logarithmic scaling (16 * (3000/16)^value = 16 * 187.5^value)
          if (isTB303) {
            const vegDecayMs = 16 * Math.pow(187.5, value); // 16ms to 3000ms (log scale)
            (instrument as TB303Synth).setVegDecay(vegDecayMs);
          }
          break;

        case 'vegSustain':
          // VEG sustain level (Devil Fish) - Map 0-1 to 0-100%
          if (isTB303) {
            (instrument as TB303Synth).setVegSustain(value * 100);
          }
          break;

        case 'softAttack':
          // Soft attack time (Devil Fish) - Map 0-1 to 0.3-30ms (logarithmic)
          if (isTB303) {
            const softAttackMs = 0.3 * Math.pow(100, value); // 0.3 to 30ms
            (instrument as TB303Synth).setSoftAttack(softAttackMs);
          }
          break;

        case 'filterTracking':
          // Filter tracking amount (Devil Fish) - Map 0-1 to 0-200%
          if (isTB303) {
            (instrument as TB303Synth).setFilterTracking(value * 200);
          }
          break;

        case 'filterFM':
          // Filter FM amount (Devil Fish) - Map 0-1 to 0-100%
          if (isTB303) {
            (instrument as TB303Synth).setFilterFM(value * 100);
          }
          break;

        case 'volume':
          // Map 0-1 to -40dB to 0dB
          const volumeDb = -40 + value * 40;
          if (instrument.volume) {
            instrument.volume.setValueAtTime(volumeDb, Tone.now());
          }
          break;

        case 'pan':
          // Map 0-1 to -1 to +1 (left to right)
          const panValue = value * 2 - 1;
          if (instrument.pan) {
            instrument.pan.setValueAtTime(panValue, Tone.now());
          }
          break;

        case 'distortion':
          // Map 0-1 to 0-1 distortion amount
          if (instrument.distortion) {
            instrument.distortion.setValueAtTime(value, Tone.now());
          }
          break;

        case 'delay':
          // Map 0-1 to 0-1 delay wet/dry mix
          if (instrument.delayWet) {
            instrument.delayWet.setValueAtTime(value, Tone.now());
          }
          break;

        case 'reverb':
          // Map 0-1 to 0-1 reverb wet/dry mix
          if (instrument.reverbWet) {
            instrument.reverbWet.setValueAtTime(value, Tone.now());
          }
          break;

        default:
          console.warn(`Unknown automation parameter: ${parameter}`);
      }
    } catch (error) {
      console.error(`Failed to apply automation for ${parameter}:`, error);
    }
  }

  /**
   * Process automation for a specific row during playback
   */
  public processRow(
    patternId: string,
    channelIndex: number,
    row: number,
    cell: TrackerCell,
    instrumentId: number | null
  ): void {
    if (instrumentId === null) return;

    // Supported automation parameters
    const parameters: AutomationParameter[] = [
      // TB-303 core parameters
      'cutoff',
      'resonance',
      'envMod',
      'decay',
      'accent',
      'tuning',
      'overdrive',
      // Devil Fish parameters
      'normalDecay',
      'accentDecay',
      'vegDecay',
      'vegSustain',
      'softAttack',
      'filterTracking',
      'filterFM',
      // General mixer parameters
      'volume',
      'pan',
      'distortion',
      'delay',
      'reverb',
    ];

    parameters.forEach((parameter) => {
      const value = this.getAutomationValue(cell, patternId, channelIndex, parameter, row);
      if (value !== null) {
        // Log every 8 rows to reduce spam
        if (row % 8 === 0) {
          console.log(`[AutomationPlayer] Row ${row} Ch ${channelIndex}: ${parameter}=${value.toFixed(3)}`);
        }
        this.applyParameter(instrumentId, parameter, value, channelIndex);
      }
    });
  }

  /**
   * Apply automation values for all channels at a specific row
   */
  public processPatternRow(row: number): void {
    if (!this.currentPattern) return;

    this.currentPattern.channels.forEach((channel, channelIndex) => {
      const cell = channel.rows[row];
      const instrumentId = cell.instrument !== null ? cell.instrument : channel.instrumentId;

      if (instrumentId !== null) {
        this.processRow(this.currentPattern.id, channelIndex, row, cell, instrumentId);
      }
    });
  }

  /**
   * Clear all automation states
   */
  public clear(): void {
    this.currentPattern = null;
    this.automationData = {};
  }

  /**
   * Get current automation value for display/debugging
   */
  public getCurrentValue(
    patternId: string,
    channelIndex: number,
    parameter: AutomationParameter,
    row: number
  ): number | null {
    if (!this.currentPattern) return null;

    const cell = this.currentPattern.channels[channelIndex]?.rows[row];
    if (!cell) return null;

    return this.getAutomationValue(cell, patternId, channelIndex, parameter, row);
  }

  /**
   * Export automation data for a specific pattern and channel
   */
  public exportAutomation(patternId: string, channelIndex: number): Record<string, number[]> {
    if (!this.currentPattern) return {};

    const result: Record<string, number[]> = {};
    const parameters: AutomationParameter[] = ['cutoff', 'resonance', 'envMod', 'volume', 'pan'];

    parameters.forEach((parameter) => {
      const values: number[] = [];
      for (let row = 0; row < this.currentPattern!.length; row++) {
        const cell = this.currentPattern!.channels[channelIndex].rows[row];
        const value = this.getAutomationValue(cell, patternId, channelIndex, parameter, row);
        values.push(value !== null ? value : 0);
      }
      result[parameter] = values;
    });

    return result;
  }
}

// Singleton instance
let automationPlayerInstance: AutomationPlayer | null = null;

export const getAutomationPlayer = (): AutomationPlayer => {
  if (!automationPlayerInstance) {
    automationPlayerInstance = new AutomationPlayer();
  }
  return automationPlayerInstance;
};
