import { useGTUltraStore } from '@stores/useGTUltraStore';
import type { GTUltraConfig } from '@typedefs/instrument/exotic';
import type {
  SIDInstrumentAdapter, SIDADSR, SIDWaveform, SIDFilter, SIDVibrato,
  SIDTableData, SIDTableDef, SIDFeatures,
} from '../SIDInstrumentAdapter';

export class GTUltraAdapter implements SIDInstrumentAdapter {
  readonly formatName = 'GoatTracker Ultra';
  readonly accentColor = '#44ff88';

  readonly features: SIDFeatures = {
    hasTables: true,
    hasDirectFilter: false,
    hasDirectVibrato: false,
    hasDirectArpeggio: false,
    hasPanning: false,
    hasGateTimer: false,
    hasPCMSamples: false,
    hasSoundDesigner: false,
    isEditable: true,
    hasControlBits: true,
  };

  private config: GTUltraConfig;
  private onChange: (updates: Partial<GTUltraConfig>) => void;

  constructor(
    config: GTUltraConfig,
    onChange: (updates: Partial<GTUltraConfig>) => void,
  ) {
    this.config = config;
    this.onChange = onChange;
  }

  updateConfig(config: GTUltraConfig) {
    this.config = config;
  }

  get instrumentIndex(): number {
    return useGTUltraStore.getState().currentInstrument;
  }

  get instrumentName(): string {
    return this.config.name || '';
  }

  getADSR(): SIDADSR {
    return {
      attack: (this.config.ad >> 4) & 0xF,
      decay: this.config.ad & 0xF,
      sustain: (this.config.sr >> 4) & 0xF,
      release: this.config.sr & 0xF,
    };
  }

  setADSR(adsr: Partial<SIDADSR>): void {
    const cur = this.getADSR();
    const a = adsr.attack ?? cur.attack;
    const d = adsr.decay ?? cur.decay;
    const s = adsr.sustain ?? cur.sustain;
    const r = adsr.release ?? cur.release;
    this.onChange({
      ad: (a << 4) | (d & 0xF),
      sr: (s << 4) | (r & 0xF),
    });
  }

  getWaveform(): SIDWaveform | null {
    const fw = this.config.firstwave;
    return {
      tri: !!(fw & 0x10),
      saw: !!(fw & 0x20),
      pul: !!(fw & 0x40),
      noi: !!(fw & 0x80),
      gate: !!(fw & 0x01),
      sync: !!(fw & 0x02),
      ring: !!(fw & 0x04),
      test: !!(fw & 0x08),
    };
  }

  setWaveform(wf: Partial<SIDWaveform>): void {
    let fw = this.config.firstwave;
    if (wf.tri !== undefined) fw = wf.tri ? (fw | 0x10) : (fw & ~0x10);
    if (wf.saw !== undefined) fw = wf.saw ? (fw | 0x20) : (fw & ~0x20);
    if (wf.pul !== undefined) fw = wf.pul ? (fw | 0x40) : (fw & ~0x40);
    if (wf.noi !== undefined) fw = wf.noi ? (fw | 0x80) : (fw & ~0x80);
    if (wf.gate !== undefined) fw = wf.gate ? (fw | 0x01) : (fw & ~0x01);
    if (wf.sync !== undefined) fw = wf.sync ? (fw | 0x02) : (fw & ~0x02);
    if (wf.ring !== undefined) fw = wf.ring ? (fw | 0x04) : (fw & ~0x04);
    if (wf.test !== undefined) fw = wf.test ? (fw | 0x08) : (fw & ~0x08);
    this.onChange({ firstwave: fw & 0xFF });
  }

  getFilter(): SIDFilter | null {
    return null;
  }

  setFilter(_f: Partial<SIDFilter>): void {}

  getVibrato(): SIDVibrato | null {
    return null;
  }

  setVibrato(_v: Partial<SIDVibrato>): void {}

  getTableDefs(): SIDTableDef[] {
    return [
      { key: 'wave', label: 'Wave', color: '#60e060' },
      { key: 'pulse', label: 'Pulse', color: '#ff8866' },
      { key: 'filter', label: 'Filter', color: '#ffcc00' },
      { key: 'speed', label: 'Speed', color: '#6699ff' },
    ];
  }

  getTable(key: string): SIDTableData | null {
    const s = useGTUltraStore.getState();
    const td = s.tableData[key];
    if (!td) return null;
    return { left: td.left, right: td.right, rows: td.left.length };
  }

  setTableEntry(key: string, row: number, side: 'left' | 'right', value: number): void {
    const s = useGTUltraStore.getState();
    const td = s.tableData[key];
    if (!td) return;
    const arr = side === 'left' ? new Uint8Array(td.left) : new Uint8Array(td.right);
    arr[row] = value & 0xFF;
    const tableKeys = ['wave', 'pulse', 'filter', 'speed'];
    const tableIdx = tableKeys.indexOf(key);
    if (tableIdx < 0) return;
    const left = side === 'left' ? arr : td.left;
    const right = side === 'right' ? arr : td.right;
    s.updateTableData(tableIdx, left, right);
  }

  getTablePointer(key: string): number {
    if (key === 'wave') return this.config.wavePtr;
    if (key === 'pulse') return this.config.pulsePtr;
    if (key === 'filter') return this.config.filterPtr;
    if (key === 'speed') return this.config.speedPtr;
    return 0;
  }

  setTablePointer(key: string, value: number): void {
    if (key === 'wave') this.onChange({ wavePtr: value });
    else if (key === 'pulse') this.onChange({ pulsePtr: value });
    else if (key === 'filter') this.onChange({ filterPtr: value });
    else if (key === 'speed') this.onChange({ speedPtr: value });
  }

  getArpeggio(): { table: number[]; speed: number } | null {
    return null;
  }

  setArpeggio(_arp: Partial<{ table: number[]; speed: number }>): void {}

  getSidRegisters(chipIndex: number): Uint8Array | null {
    const regs = useGTUltraStore.getState().sidRegisters;
    return regs[chipIndex] ?? null;
  }

  getSidCount(): number {
    return useGTUltraStore.getState().sidRegisters.length;
  }

  refreshSidRegisters(): void {
    useGTUltraStore.getState().refreshSidRegisters();
  }
}
