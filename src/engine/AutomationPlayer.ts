import * as Tone from 'tone';
import { AUDIO_CONSTANTS } from '../constants/audioConstants';
import { getToneEngine } from './ToneEngine';
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

  public setAutomationData(data: AutomationData): void {
    this.automationData = data;
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

  public setPattern(pattern: Pattern): void {
    this.currentPattern = pattern;
  }

  private getColumnValue(cell: TrackerCell, parameter: AutomationParameter): number | null {
    let rawValue: number | undefined;
    switch (parameter) {
      case 'cutoff': rawValue = cell.cutoff; break;
      case 'resonance': rawValue = cell.resonance; break;
      case 'envMod': rawValue = cell.envMod; break;
      case 'pan': rawValue = cell.pan; break;
      case 'volume': rawValue = cell.volume !== null ? cell.volume : undefined; break;
      default: return null;
    }
    if (rawValue === undefined) return null;
    if (parameter === 'volume') return rawValue / AUDIO_CONSTANTS.VOLUME.MAX_VALUE;
    return rawValue / AUDIO_CONSTANTS.PAN.SCALE;
  }

  private getCurveValue(patternId: string, channelIndex: number, parameter: AutomationParameter, row: number): number | null {
    const curve = this.automationData[patternId]?.[channelIndex]?.[parameter];
    if (!curve || !curve.enabled || curve.points.length === 0) return null;
    const sortedPoints = [...curve.points].sort((a, b) => a.row - b.row);
    if (row < sortedPoints[0].row) return sortedPoints[0].value;
    if (row >= sortedPoints[sortedPoints.length - 1].row) return sortedPoints[sortedPoints.length - 1].value;
    let prevPoint = sortedPoints[0];
    let nextPoint = sortedPoints[sortedPoints.length - 1];
    for (let i = 0; i < sortedPoints.length - 1; i++) {
      if (sortedPoints[i].row <= row && sortedPoints[i + 1].row > row) {
        prevPoint = sortedPoints[i];
        nextPoint = sortedPoints[i + 1];
        break;
      }
    }
    if (prevPoint.row === row) return prevPoint.value;
    if (nextPoint.row === row) return nextPoint.value;
    const rowDiff = nextPoint.row - prevPoint.row;
    const valueDiff = nextPoint.value - prevPoint.value;
    const t = (row - prevPoint.row) / rowDiff;
    switch (curve.interpolation) {
      case 'linear': return prevPoint.value + valueDiff * t;
      case 'exponential': return prevPoint.value + valueDiff * (t * t);
      case 'easeIn': return prevPoint.value + valueDiff * (t * t * t);
      case 'easeOut': { const tInv = 1 - t; return prevPoint.value + valueDiff * (1 - tInv * tInv * tInv); }
      case 'easeBoth':
        if (t < 0.5) return prevPoint.value + valueDiff * (4 * t * t * t);
        else { const tShift = 2 * t - 2; return prevPoint.value + valueDiff * (1 + tShift * tShift * tShift / 2 + 0.5); }
      default: return prevPoint.value + valueDiff * t;
    }
  }

  private getAutomationValue(cell: TrackerCell, patternId: string, channelIndex: number, parameter: AutomationParameter, row: number): number | null {
    const columnValue = this.getColumnValue(cell, parameter);
    if (columnValue !== null) return columnValue;
    return this.getCurveValue(patternId, channelIndex, parameter, row);
  }

  private applyParameter(instrumentId: number, parameter: AutomationParameter, value: number, channelIndex?: number): void {
    const overrideManager = getManualOverrideManager();
    if (overrideManager.isOverridden(parameter as any)) return;
    const engine = getToneEngine();
    let instrument = null;
    if (channelIndex !== undefined) instrument = engine.getInstrumentInstance(`${instrumentId}-${channelIndex}`);
    if (!instrument) instrument = engine.getInstrumentInstance(`${instrumentId}-${-1}`);
    if (!instrument) {
      for (const [key, inst] of engine.getAllInstruments().entries()) {
        if (key.startsWith(`${instrumentId}-`) && (inst as any).isTB303) {
          instrument = inst;
          break;
        }
      }
    }
    if (!instrument) return;
    try {
      const isTB303 = (instrument as any).isTB303;
      switch (parameter) {
        case 'cutoff': {
          const cutoffHz = 50 * Math.pow(360, value);
          if (isTB303) (instrument as any).setCutoff(cutoffHz);
          else if ('filter' in instrument && (instrument as any).filter instanceof Tone.Filter) (instrument as any).filter.frequency.setValueAtTime(cutoffHz, Tone.now());
          break;
        }
        case 'resonance': {
          const resoPercent = value * 100;
          if (isTB303) (instrument as any).setResonance(resoPercent);
          else if ('filter' in instrument && (instrument as any).filter instanceof Tone.Filter) (instrument as any).filter.Q.setValueAtTime(value * 30, Tone.now());
          break;
        }
        case 'envMod':
          if (isTB303 || typeof (instrument as any).setEnvMod === 'function') (instrument as any).setEnvMod(value * 100);
          break;
        case 'decay':
          if (isTB303) (instrument as any).setDecay(30 * Math.pow(100, value));
          break;
        case 'accent':
          if (isTB303) (instrument as any).setAccentAmount(value * 100);
          break;
        case 'tuning':
          if (isTB303) (instrument as any).setTuning((value - 0.5) * 2400);
          break;
        case 'overdrive':
          if (isTB303) (instrument as any).setOverdrive(value * 100);
          break;
        case 'volume': {
          const volumeDb = AUDIO_CONSTANTS.VOLUME.MIN_DB + value * (AUDIO_CONSTANTS.VOLUME.MAX_DB - AUDIO_CONSTANTS.VOLUME.MIN_DB);
          if ((instrument as any).volume && (instrument as any).volume instanceof Tone.Signal) (instrument as any).volume.setValueAtTime(volumeDb, Tone.now());
          break;
        }
        case 'pan': {
          const panValue = value * 2 - 1;
          if ((instrument as any).pan && (instrument as any).pan instanceof Tone.Signal) (instrument as any).pan.setValueAtTime(panValue, Tone.now());
          break;
        }
        default: console.warn(`Unknown automation parameter: ${parameter}`);
      }
    } catch (error) { console.error(`Failed to apply automation for ${parameter}:`, error); }
  }

  public processRow(patternId: string, channelIndex: number, row: number, cell: TrackerCell, instrumentId: number | null): void {
    if (instrumentId === null) return;
    const parameters: AutomationParameter[] = ['cutoff', 'resonance', 'envMod', 'decay', 'accent', 'tuning', 'overdrive', 'volume', 'pan'];
    parameters.forEach((parameter) => {
      const value = this.getAutomationValue(cell, patternId, channelIndex, parameter, row);
      if (value !== null) this.applyParameter(instrumentId, parameter, value, channelIndex);
    });
  }

  public processPatternRow(row: number): void {
    if (!this.currentPattern) return;
    this.currentPattern.channels.forEach((channel, channelIndex) => {
      const cell = channel.rows[row];
      const instrumentId = cell.instrument !== null ? cell.instrument : channel.instrumentId;
      if (instrumentId !== null) this.processRow(this.currentPattern!.id, channelIndex, row, cell, instrumentId);
    });
  }

  public clear(): void { this.currentPattern = null; this.automationData = {}; }
  public getCurrentValue(patternId: string, channelIndex: number, parameter: AutomationParameter, row: number): number | null {
    if (!this.currentPattern) return null;
    const cell = this.currentPattern.channels[channelIndex]?.rows[row];
    if (!cell) return null;
    return this.getAutomationValue(cell, patternId, channelIndex, parameter, row);
  }

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

let automationPlayerInstance: AutomationPlayer | null = null;
export const getAutomationPlayer = (): AutomationPlayer => {
  if (!automationPlayerInstance) automationPlayerInstance = new AutomationPlayer();
  return automationPlayerInstance;
};
