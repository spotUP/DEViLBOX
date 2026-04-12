import { useCheeseCutterStore } from '@stores/useCheeseCutterStore';
import type {
  SIDInstrumentAdapter, SIDADSR, SIDWaveform, SIDFilter, SIDVibrato,
  SIDTableData, SIDTableDef, SIDFeatures,
} from '../SIDInstrumentAdapter';

const MAX_INSTRUMENTS = 48;
const PTR_INST = 18;
const PTR_ARP1 = 14;
const PTR_FILTTAB = 16;
const PTR_PULSTAB = 17;

async function getEngine() {
  const { CheeseCutterEngine } = await import('@/engine/cheesecut/CheeseCutterEngine');
  if (CheeseCutterEngine.hasInstance()) return CheeseCutterEngine.getInstance();
  return null;
}

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
    isEditable: true,
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

  setADSR(adsr: Partial<SIDADSR>): void {
    const s = useCheeseCutterStore.getState();
    const inst = s.instruments[s.currentInstrument];
    if (!inst) return;
    const cur = this.getADSR();
    const a = adsr.attack ?? cur.attack;
    const d = adsr.decay ?? cur.decay;
    const su = adsr.sustain ?? cur.sustain;
    const r = adsr.release ?? cur.release;
    const newAD = (a << 4) | (d & 0xF);
    const newSR = (su << 4) | (r & 0xF);

    const ptrs = s.pointerTable;
    const instAddr = ptrs[PTR_INST];
    if (instAddr) {
      const idx = s.currentInstrument;
      const adAddr = instAddr + 0 * MAX_INSTRUMENTS + idx;
      const srAddr = instAddr + 1 * MAX_INSTRUMENTS + idx;
      getEngine().then(eng => {
        if (eng) eng.writeBytes([adAddr, srAddr], [newAD, newSR]);
      });
    }

    const instruments = [...s.instruments];
    instruments[s.currentInstrument] = { ...inst, ad: newAD, sr: newSR };
    useCheeseCutterStore.setState({ instruments });
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

  setTableEntry(key: string, row: number, side: 'left' | 'right', value: number): void {
    const s = useCheeseCutterStore.getState();
    const ptrs = s.pointerTable;
    if (!ptrs.length) return;

    if (key === 'wave' && s.waveTable) {
      const baseAddr = ptrs[PTR_ARP1];
      const offset = side === 'left' ? row : 256 + row;
      getEngine().then(eng => { if (eng) eng.writeByte(baseAddr + offset, value & 0xFF); });
      const wt = { ...s.waveTable };
      if (side === 'left') { wt.wave1 = new Uint8Array(wt.wave1); wt.wave1[row] = value & 0xFF; }
      else { wt.wave2 = new Uint8Array(wt.wave2); wt.wave2[row] = value & 0xFF; }
      useCheeseCutterStore.setState({ waveTable: wt });
    } else if (key === 'pulse' && s.pulseTable) {
      const baseAddr = ptrs[PTR_PULSTAB];
      getEngine().then(eng => { if (eng) eng.writeByte(baseAddr + row, value & 0xFF); });
      const pt = new Uint8Array(s.pulseTable);
      pt[row] = value & 0xFF;
      useCheeseCutterStore.setState({ pulseTable: pt });
    } else if (key === 'filter' && s.filterTable) {
      const baseAddr = ptrs[PTR_FILTTAB];
      getEngine().then(eng => { if (eng) eng.writeByte(baseAddr + row, value & 0xFF); });
      const ft = new Uint8Array(s.filterTable);
      ft[row] = value & 0xFF;
      useCheeseCutterStore.setState({ filterTable: ft });
    }
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

  setTablePointer(key: string, value: number): void {
    const s = useCheeseCutterStore.getState();
    const inst = s.instruments[s.currentInstrument];
    if (!inst) return;

    const ptrFieldMap: Record<string, number> = { wave: 2, pulse: 3, filter: 4 };
    const byteIdx = ptrFieldMap[key];
    if (byteIdx === undefined) return;

    const ptrs = s.pointerTable;
    const instAddr = ptrs[PTR_INST];
    if (instAddr) {
      const addr = instAddr + byteIdx * MAX_INSTRUMENTS + s.currentInstrument;
      getEngine().then(eng => { if (eng) eng.writeByte(addr, value & 0xFF); });
    }

    const instruments = [...s.instruments];
    const updates: Record<string, number> = {};
    if (key === 'wave') updates.wavePtr = value;
    else if (key === 'pulse') updates.pulsePtr = value;
    else if (key === 'filter') updates.filterPtr = value;
    instruments[s.currentInstrument] = { ...inst, ...updates };
    useCheeseCutterStore.setState({ instruments });
  }

  getArpeggio(): { table: number[]; speed: number } | null {
    return null;
  }

  setArpeggio(_arp: Partial<{ table: number[]; speed: number }>): void {}

  private _sidRegs: Uint8Array | null = null;

  getSidRegisters(_chipIndex: number): Uint8Array | null {
    return this._sidRegs;
  }

  getSidCount(): number {
    return 1;
  }

  refreshSidRegisters(): void {
    getEngine().then(eng => {
      if (!eng) return;
      eng.requestSidRegs().then((regs: Uint8Array) => {
        this._sidRegs = regs;
      });
    });
  }
}
