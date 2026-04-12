export interface SIDADSR {
  attack: number;   // 0-15
  decay: number;    // 0-15
  sustain: number;  // 0-15
  release: number;  // 0-15
}

export interface SIDWaveform {
  tri: boolean;
  saw: boolean;
  pul: boolean;
  noi: boolean;
  gate: boolean;
  sync?: boolean;
  ring?: boolean;
  test?: boolean;
}

export interface SIDFilter {
  cutoff: number;      // 0-255
  resonance: number;   // 0-15
  mode: 'lp' | 'hp' | 'bp';
}

export interface SIDVibrato {
  delay: number;   // 0-255
  speed: number;   // 0-63
  depth: number;   // 0-63
}

export interface SIDTableData {
  left: Uint8Array;
  right: Uint8Array;
  rows: number;
}

export interface SIDTableDef {
  key: string;
  label: string;
  color: string;
}

export interface SIDFeatures {
  hasTables: boolean;
  hasDirectFilter: boolean;
  hasDirectVibrato: boolean;
  hasDirectArpeggio: boolean;
  hasPanning: boolean;
  hasGateTimer: boolean;
  hasPCMSamples: boolean;
  hasSoundDesigner: boolean;
  isEditable: boolean;
  hasControlBits: boolean;
}

export interface SIDInstrumentAdapter {
  formatName: string;
  instrumentIndex: number;
  instrumentName: string;
  accentColor: string;

  getADSR(): SIDADSR;
  setADSR(adsr: Partial<SIDADSR>): void;

  getWaveform(): SIDWaveform | null;
  setWaveform(wf: Partial<SIDWaveform>): void;

  getFilter(): SIDFilter | null;
  setFilter(f: Partial<SIDFilter>): void;

  getVibrato(): SIDVibrato | null;
  setVibrato(v: Partial<SIDVibrato>): void;

  getTableDefs(): SIDTableDef[];
  getTable(key: string): SIDTableData | null;
  setTableEntry(key: string, row: number, side: 'left' | 'right', value: number): void;
  getTablePointer(key: string): number;
  setTablePointer(key: string, value: number): void;

  getArpeggio(): { table: number[]; speed: number } | null;
  setArpeggio(arp: Partial<{ table: number[]; speed: number }>): void;

  getSidRegisters(chipIndex: number): Uint8Array | null;
  getSidCount(): number;
  refreshSidRegisters(): void;

  features: SIDFeatures;
}
