import type { SidMonConfig } from '@typedefs/instrument/exotic';
import type {
  SIDInstrumentAdapter, SIDADSR, SIDWaveform, SIDFilter, SIDVibrato,
  SIDTableData, SIDTableDef, SIDFeatures,
} from '../SIDInstrumentAdapter';

export class SidMonAdapter implements SIDInstrumentAdapter {
  readonly formatName = 'SidMon II';
  readonly accentColor = '#ff66aa';

  readonly features: SIDFeatures = {
    hasTables: false,
    hasDirectFilter: true,
    hasDirectVibrato: true,
    hasDirectArpeggio: true,
    hasPanning: false,
    hasGateTimer: false,
    hasPCMSamples: false,
    hasSoundDesigner: false,
    isEditable: true,
    hasControlBits: false,
  };

  private config: SidMonConfig;
  private onChange: (updates: Partial<SidMonConfig>) => void;
  private _instrumentIndex: number;

  constructor(
    config: SidMonConfig,
    onChange: (updates: Partial<SidMonConfig>) => void,
    instrumentIndex: number = 0,
  ) {
    this.config = config;
    this.onChange = onChange;
    this._instrumentIndex = instrumentIndex;
  }

  updateConfig(config: SidMonConfig) {
    this.config = config;
  }

  get instrumentIndex(): number {
    return this._instrumentIndex;
  }

  get instrumentName(): string {
    return '';
  }

  getADSR(): SIDADSR {
    return {
      attack: this.config.attack,
      decay: this.config.decay,
      sustain: this.config.sustain,
      release: this.config.release,
    };
  }

  setADSR(adsr: Partial<SIDADSR>): void {
    this.onChange({
      ...(adsr.attack !== undefined && { attack: adsr.attack }),
      ...(adsr.decay !== undefined && { decay: adsr.decay }),
      ...(adsr.sustain !== undefined && { sustain: adsr.sustain }),
      ...(adsr.release !== undefined && { release: adsr.release }),
    });
  }

  getWaveform(): SIDWaveform | null {
    return {
      tri: this.config.waveform === 0,
      saw: this.config.waveform === 1,
      pul: this.config.waveform === 2,
      noi: this.config.waveform === 3,
      gate: true,
    };
  }

  setWaveform(wf: Partial<SIDWaveform>): void {
    if (wf.tri) this.onChange({ waveform: 0 });
    else if (wf.saw) this.onChange({ waveform: 1 });
    else if (wf.pul) this.onChange({ waveform: 2 });
    else if (wf.noi) this.onChange({ waveform: 3 });
  }

  getFilter(): SIDFilter | null {
    const modeMap: Record<number, 'lp' | 'hp' | 'bp'> = { 0: 'lp', 1: 'hp', 2: 'bp' };
    return {
      cutoff: this.config.filterCutoff,
      resonance: this.config.filterResonance,
      mode: modeMap[this.config.filterMode] ?? 'lp',
    };
  }

  setFilter(f: Partial<SIDFilter>): void {
    const modeMap: Record<string, number> = { lp: 0, hp: 1, bp: 2 };
    this.onChange({
      ...(f.cutoff !== undefined && { filterCutoff: f.cutoff }),
      ...(f.resonance !== undefined && { filterResonance: f.resonance }),
      ...(f.mode !== undefined && { filterMode: modeMap[f.mode] ?? 0 }),
    });
  }

  getVibrato(): SIDVibrato | null {
    return {
      delay: this.config.vibDelay,
      speed: this.config.vibSpeed,
      depth: this.config.vibDepth,
    };
  }

  setVibrato(v: Partial<SIDVibrato>): void {
    this.onChange({
      ...(v.delay !== undefined && { vibDelay: v.delay }),
      ...(v.speed !== undefined && { vibSpeed: v.speed }),
      ...(v.depth !== undefined && { vibDepth: v.depth }),
    });
  }

  getTableDefs(): SIDTableDef[] {
    return [];
  }

  getTable(_key: string): SIDTableData | null {
    return null;
  }

  setTableEntry(_key: string, _row: number, _side: 'left' | 'right', _value: number): void {}

  getTablePointer(_key: string): number {
    return 0;
  }

  setTablePointer(_key: string, _value: number): void {}

  getArpeggio(): { table: number[]; speed: number } | null {
    return {
      table: this.config.arpTable,
      speed: this.config.arpSpeed,
    };
  }

  setArpeggio(arp: Partial<{ table: number[]; speed: number }>): void {
    this.onChange({
      ...(arp.table !== undefined && { arpTable: arp.table }),
      ...(arp.speed !== undefined && { arpSpeed: arp.speed }),
    });
  }

  getSidRegisters(_chipIndex: number): Uint8Array | null {
    return null;
  }

  getSidCount(): number {
    return 1;
  }

  refreshSidRegisters(): void {}
}
