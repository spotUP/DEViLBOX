import { useCheeseCutterStore } from '@stores/useCheeseCutterStore';
import type {
  SIDInstrumentAdapter, SIDADSR, SIDWaveform, SIDFilter, SIDVibrato,
  SIDTableData, SIDTableDef, SIDFeatures,
} from '../SIDInstrumentAdapter';

export class CheeseCutterAdapter implements SIDInstrumentAdapter {
  readonly formatName = 'CheeseCutter';
  readonly accentColor = '#ffaa33';

  readonly features: SIDFeatures = {
    hasTables: true,
    hasDirectFilter: false,
    hasDirectVibrato: false,
    hasDirectArpeggio: false,
    hasPanning: false,
    hasGateTimer: false,
    hasPCMSamples: false,
    hasSoundDesigner: false,
    isEditable: false,
    hasControlBits: false,
  };

  get instrumentIndex(): number {
    return useCheeseCutterStore.getState().currentInstrument;
  }

  get instrumentName(): string {
    const s = useCheeseCutterStore.getState();
    const inst = s.instruments[s.currentInstrument];
    return inst?.name || '';
  }

  getADSR(): SIDADSR {
    const s = useCheeseCutterStore.getState();
    const inst = s.instruments[s.currentInstrument];
    if (!inst) return { attack: 0, decay: 0, sustain: 0, release: 0 };
    return {
      attack: (inst.ad >> 4) & 0xF,
      decay: inst.ad & 0xF,
      sustain: (inst.sr >> 4) & 0xF,
      release: inst.sr & 0xF,
    };
  }

  setADSR(_adsr: Partial<SIDADSR>): void {
    // Read-only until WASM bridge is extended
  }

  getWaveform(): SIDWaveform | null {
    return null;
  }

  setWaveform(_wf: Partial<SIDWaveform>): void {}

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
    ];
  }

  getTable(key: string): SIDTableData | null {
    const s = useCheeseCutterStore.getState();
    if (key === 'wave' && s.waveTable) {
      return { left: s.waveTable.wave1, right: s.waveTable.wave2, rows: s.waveTable.wave1.length };
    }
    if (key === 'pulse' && s.pulseTable) {
      const empty = new Uint8Array(s.pulseTable.length);
      return { left: s.pulseTable, right: empty, rows: s.pulseTable.length };
    }
    if (key === 'filter' && s.filterTable) {
      const empty = new Uint8Array(s.filterTable.length);
      return { left: s.filterTable, right: empty, rows: s.filterTable.length };
    }
    return null;
  }

  setTableEntry(_key: string, _row: number, _side: 'left' | 'right', _value: number): void {
    // Read-only until WASM bridge is extended
  }

  getTablePointer(key: string): number {
    const s = useCheeseCutterStore.getState();
    const inst = s.instruments[s.currentInstrument];
    if (!inst) return 0;
    if (key === 'wave') return inst.wavePtr;
    if (key === 'pulse') return inst.pulsePtr;
    if (key === 'filter') return inst.filterPtr;
    return 0;
  }

  setTablePointer(_key: string, _value: number): void {
    // Read-only until WASM bridge is extended
  }

  getArpeggio(): { table: number[]; speed: number } | null {
    return null;
  }

  setArpeggio(_arp: Partial<{ table: number[]; speed: number }>): void {}

  getSidRegisters(_chipIndex: number): Uint8Array | null {
    return null;
  }

  getSidCount(): number {
    return 1;
  }

  refreshSidRegisters(): void {
    // TODO: query cc_get_sid_regs from worklet
  }
}
