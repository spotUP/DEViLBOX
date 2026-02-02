/**
 * NanoExporter - Extreme binary compression for 4k intros
 * 
 * Concept:
 * - No JSON, strictly Uint8Array
 * - Only exports instruments and patterns actually used
 * - Bit-masking for pattern cells (don't store what you don't use)
 * - 0-255 normalized parameters for synths
 */

import type { InstrumentConfig, SynthType } from '@/types/instrument';
import type { Pattern, PatternCell } from '@/types';

// Map synth types to tiny IDs
const SYNTH_TYPE_TO_ID: Record<string, number> = {
  'Synth': 1, 'MonoSynth': 2, 'DuoSynth': 3, 'FMSynth': 4, 'AMSynth': 5,
  'TB303': 10, 'Sampler': 11, 'WobbleBass': 12, 'DubSiren': 13,
  'SpaceLaser': 14, 'V2': 20, 'Synare': 15, 'DrumMachine': 16, 'ChipSynth': 17
};

export class NanoExporter {
  /**
   * Export the current project to a highly compressed binary string (Base64)
   */
  public static export(
    instruments: InstrumentConfig[],
    patterns: Pattern[],
    patternOrder: number[],
    bpm: number,
    speed: number
  ): Uint8Array {
    const buffer: number[] = [];

    // 1. HEADER (8 bytes)
    buffer.push(0xDB, 0x58, 0x4E, 0x21); // Magic: "DBXN!"
    buffer.push(1); // Version
    buffer.push(Math.min(255, bpm));
    buffer.push(Math.min(255, speed));
    
    // Find used instruments and patterns
    const usedInstrIds = this.getUsedInstrumentIds(patterns, patternOrder);
    const usedInstrConfigs = instruments.filter(i => usedInstrIds.has(i.id));
    
    buffer.push(usedInstrConfigs.length); // Num Instruments
    buffer.push(patternOrder.length); // Song Length

    // 2. INSTRUMENTS SECTION
    // For each instrument: ID (1), Type (1), Vol (1), Pan (1), 8 Generic Params (8) = 12 bytes
    usedInstrConfigs.forEach(inst => {
      buffer.push(inst.id);
      buffer.push(SYNTH_TYPE_TO_ID[inst.synthType] || 0);
      buffer.push(Math.round(((inst.volume + 60) / 60) * 255)); // -60..0 -> 0..255
      buffer.push(Math.round(((inst.pan + 100) / 200) * 255)); // -100..100 -> 0..255
      
      // Pack the most important params based on type
      const params = this.packSynthParams(inst);
      params.forEach(p => buffer.push(p));
    });

    // 3. PATTERN ORDER (Song Arrangement)
    patternOrder.forEach(pIdx => buffer.push(pIdx));

    // 4. PATTERNS DATA
    // We only export the patterns present in the patternOrder
    const uniquePatterns = Array.from(new Set(patternOrder));
    buffer.push(uniquePatterns.length);

    uniquePatterns.forEach(pIdx => {
      const pattern = patterns[pIdx];
      if (!pattern) return;

      buffer.push(pIdx); // Pattern Index
      buffer.push(pattern.rows.length); // Rows (usually 64)

      pattern.rows.forEach((row, rIdx) => {
        // Find cells with data
        const activeCells = row.cells.map((c, cIdx) => ({ cell: c, channel: cIdx })).filter(item => this.isCellActive(item.cell));
        
        if (activeCells.length === 0) {
          buffer.push(0); // 0 active cells signals empty row
          return;
        }

        buffer.push(activeCells.length);
        activeCells.forEach(({ cell, channel }) => {
          // PACKED CELL: 
          // Byte 1: [Channel Index (4 bits) | Mask (4 bits: Note, Instr, Vol, FX)]
          let mask = 0;
          if (cell.note) mask |= 0x08;
          if (cell.instrument !== null) mask |= 0x04;
          if (cell.volume !== undefined && cell.volume !== 64) mask |= 0x02;
          if (cell.effectType) mask |= 0x01;

          buffer.push((channel << 4) | mask);

          // Data bytes based on mask
          if (mask & 0x08) buffer.push(this.noteToByte(cell.note!));
          if (mask & 0x04) buffer.push(cell.instrument!);
          if (mask & 0x02) buffer.push(cell.volume!);
          if (mask & 0x01) {
            buffer.push(cell.effectType!.charCodeAt(0));
            buffer.push(cell.effectParam || 0);
          }
        });
      });
    });

    return new Uint8Array(buffer);
  }

  private static getUsedInstrumentIds(patterns: Pattern[], order: number[]): Set<number> {
    const used = new Set<number>();
    order.forEach(pIdx => {
      patterns[pIdx]?.rows.forEach(row => {
        row.cells.forEach(cell => {
          if (cell.instrument !== null) used.add(cell.instrument);
        });
      });
    });
    return used;
  }

  private static isCellActive(cell: PatternCell): boolean {
    return !!(cell.note || cell.instrument !== null || (cell.volume !== undefined && cell.volume !== 64) || cell.effectType);
  }

  private static noteToByte(note: string): number {
    // Basic mapping for 4k: C-0 = 0, etc.
    const notes = ['C-', 'C#', 'D-', 'D#', 'E-', 'F-', 'F#', 'G-', 'G#', 'A-', 'A#', 'B-'];
    const name = note.substring(0, 2);
    const octave = parseInt(note.substring(2));
    const idx = notes.indexOf(name);
    return octave * 12 + idx;
  }

  private static packSynthParams(inst: InstrumentConfig): number[] {
    const res = new Array(8).fill(0);
    // Extract 8 most vital params for each type to keep it tiny
    if (inst.synthType === 'TB303' && inst.tb303) {
      res[0] = inst.tb303.filter.cutoff; // already 0-100ish
      res[1] = inst.tb303.filter.resonance;
      res[2] = inst.tb303.filterEnvelope.envMod;
      res[3] = inst.tb303.filterEnvelope.decay;
    } else if (inst.synthType === 'SpaceLaser' && inst.spaceLaser) {
      res[0] = (inst.spaceLaser.laser.sweepTime / 2000) * 255;
      res[1] = inst.spaceLaser.fm.amount;
      res[2] = inst.spaceLaser.fm.ratio * 10;
      res[3] = inst.spaceLaser.filter.cutoff / 100;
    }
    // ... etc for other types
    return res.map(v => Math.floor(Math.min(255, Math.max(0, v))));
  }
}
