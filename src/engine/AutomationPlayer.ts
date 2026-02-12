/**
 * AutomationPlayer - Real-time automation value reader and applier
 * Reads automation from tracker columns or curve data and applies to Tone.js parameters
 * Respects manual overrides from TB-303 knob panel
 */

import * as Tone from 'tone';
import { getToneEngine } from './ToneEngine';
import { DB303Synth as JC303Synth } from './db303/DB303Synth';
import { getManualOverrideManager } from './ManualOverrideManager';
import { isDevilboxSynth } from '@typedefs/synth';
import type { TrackerCell, Pattern } from '@typedefs';
import { interpolateAutomationValue } from '@typedefs/automation';
import type { AutomationCurve } from '@typedefs/automation';

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
  private getColumnValue(cell: TrackerCell, parameter: string): number | null {
    // Map NKS param id suffix to TrackerCell field
    // e.g. 'tb303.cutoff' → 'cutoff', 'obxd.filterCutoff' → no match (curve-only)
    const shortName = parameter.includes('.') ? parameter.split('.').pop()! : parameter;
    let rawValue: number | undefined;

    switch (shortName) {
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
          rawValue = cell.volume - 0x10;
        } else {
          rawValue = undefined;
        }
        break;
      default:
        return null;
    }

    if (rawValue === undefined) return null;

    // Normalize to 0-1
    if (shortName === 'volume') {
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
    parameter: string,
    row: number
  ): number | null {
    const curve = this.automationData[patternId]?.[channelIndex]?.[parameter];
    if (!curve || !curve.enabled || curve.points.length === 0) return null;
    return interpolateAutomationValue(curve.points, row, curve.interpolation, curve.mode);
  }

  /**
   * Get combined automation value (column takes precedence over curve)
   */
  private getAutomationValue(
    cell: TrackerCell,
    patternId: string,
    channelIndex: number,
    parameter: string,
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
    parameter: string,
    value: number, // 0-1 normalized
    channelIndex?: number
  ): void {
    // Check for manual override - if user is controlling this via knobs, skip automation
    // Override manager stores short names ('cutoff'), so extract from NKS id ('tb303.cutoff')
    const shortName = parameter.includes('.') ? parameter.split('.').pop()! : parameter;
    const overrideManager = getManualOverrideManager();
    if (overrideManager.isOverridden(shortName as 'cutoff' | 'resonance' | 'envMod' | 'decay' | 'accent' | 'overdrive' | 'tuning' | 'volume' | 'pan' | 'distortion' | 'delay' | 'reverb')) {
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
    // Also try iterating to find any matching TB303/Buzz3o3 for this instrumentId
    if (!instrument) {
      for (const [key, inst] of engine.instruments.entries()) {
        if (key.startsWith(`${instrumentId}-`) &&
            (inst instanceof JC303Synth || inst.constructor.name === 'BuzzmachineGenerator')) {
          instrument = inst;
          break;
        }
      }
    }
    if (!instrument) return;

    try {
      // Any instrument with a set() method — delegate directly
      if (isDevilboxSynth(instrument) && instrument.set) {
        instrument.set(shortName, value);
        return;
      }

      // TB303-style synths
      const isTB303 = instrument instanceof JC303Synth || instrument.constructor.name === 'BuzzmachineGenerator';
      if (isTB303 && 'set' in instrument) {
        (instrument as unknown as { set: (p: string, v: number) => void }).set(shortName, value);
        return;
      }

      // Generic Tone.js fallback for common params
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const inst = instrument as any;
      switch (shortName) {
        case 'cutoff':
          if (inst.filter?.frequency) {
            inst.filter.frequency.setValueAtTime(200 * Math.pow(5000 / 200, value), Tone.now());
          }
          break;
        case 'resonance':
          if (inst.filter?.Q) {
            inst.filter.Q.setValueAtTime(value * 30, Tone.now());
          }
          break;
        case 'volume': {
          const volumeDb = -40 + value * 40;
          if (inst.volume) {
            inst.volume.setValueAtTime(volumeDb, Tone.now());
          }
          break;
        }
        case 'pan': {
          const panValue = value * 2 - 1;
          if (inst.pan) {
            inst.pan.setValueAtTime(panValue, Tone.now());
          }
          break;
        }
        case 'distortion':
          if (inst.distortion) inst.distortion.setValueAtTime(value, Tone.now());
          break;
        case 'delay':
          if (inst.delayWet) inst.delayWet.setValueAtTime(value, Tone.now());
          break;
        case 'reverb':
          if (inst.reverbWet) inst.reverbWet.setValueAtTime(value, Tone.now());
          break;
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

    // Column-based params (always checked — these come from TrackerCell hex columns)
    const columnParams = ['cutoff', 'resonance', 'envMod', 'pan', 'volume'];
    for (const param of columnParams) {
      const colValue = this.getColumnValue(cell, param);
      if (colValue !== null) {
        this.applyParameter(instrumentId, param, colValue, channelIndex);
      }
    }

    // Curve-based params — iterate over whatever curves exist for this channel
    const channelCurves = this.automationData[patternId]?.[channelIndex];
    if (channelCurves) {
      for (const parameter of Object.keys(channelCurves)) {
        const curveValue = this.getCurveValue(patternId, channelIndex, parameter, row);
        if (curveValue !== null) {
          this.applyParameter(instrumentId, parameter, curveValue, channelIndex);
        }
      }
    }
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
        this.processRow(this.currentPattern!.id, channelIndex, row, cell, instrumentId);
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
    parameter: string,
    row: number
  ): number | null {
    if (!this.currentPattern) return null;

    const cell = this.currentPattern.channels[channelIndex]?.rows[row];
    if (!cell) return null;

    return this.getAutomationValue(cell, patternId, channelIndex, parameter, row);
  }

  /**
   * Export automation data for a specific pattern and channel
   * Exports all curve-based parameters that have data
   */
  public exportAutomation(patternId: string, channelIndex: number): Record<string, number[]> {
    if (!this.currentPattern) return {};

    const result: Record<string, number[]> = {};
    const channelCurves = this.automationData[patternId]?.[channelIndex];
    if (!channelCurves) return result;

    for (const parameter of Object.keys(channelCurves)) {
      const values: number[] = [];
      for (let row = 0; row < this.currentPattern.length; row++) {
        const cell = this.currentPattern.channels[channelIndex].rows[row];
        const value = this.getAutomationValue(cell, patternId, channelIndex, parameter, row);
        values.push(value !== null ? value : 0);
      }
      result[parameter] = values;
    }

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
