/**
 * NanoExporter - Extreme binary compression for 4k intros
 * 
 * Concept:
 * - No JSON, strictly Uint8Array
 * - Only exports instruments and patterns actually used
 * - Bit-masking for pattern cells (don't store what you don't use)
 * - 0-255 normalized parameters for synths
 */

import type { InstrumentConfig } from '@/types/instrument';
import type { Pattern, TrackerCell } from '@/types/tracker';

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
    usedInstrConfigs.forEach(inst => {
      buffer.push(inst.id);
      buffer.push(SYNTH_TYPE_TO_ID[inst.synthType] || 0);
      buffer.push(Math.round(((inst.volume + 60) / 60) * 255));
      buffer.push(Math.round(((inst.pan + 100) / 200) * 255));
      
      const params = this.packSynthParams(inst);
      params.forEach(p => buffer.push(p));
    });

    // 3. PATTERN ORDER (Song Arrangement)
    patternOrder.forEach(pIdx => buffer.push(pIdx));

    // 4. PATTERNS DATA
    const uniquePatterns = Array.from(new Set(patternOrder));
    buffer.push(uniquePatterns.length);

    uniquePatterns.forEach(pIdx => {
      const pattern = patterns[pIdx];
      if (!pattern) return;

      buffer.push(pIdx);
      buffer.push(pattern.length);

      // Iterate through rows (0 to pattern.length)
      for (let rIdx = 0; rIdx < pattern.length; rIdx++) {
        // Find active cells in this row across all channels
        const activeCells: { cell: TrackerCell, channel: number }[] = [];
        
        pattern.channels.forEach((channel, cIdx) => {
          const cell = channel.rows[rIdx];
          if (cell && this.isCellActive(cell)) {
            activeCells.push({ cell, channel: cIdx });
          }
        });

        if (activeCells.length === 0) {
          buffer.push(0);
          continue;
        }

        buffer.push(activeCells.length);
        activeCells.forEach(({ cell, channel }) => {
          let mask = 0;
          if (cell.note > 0) mask |= 0x08;
          if (cell.instrument > 0) mask |= 0x04;
          if (cell.volume > 0) mask |= 0x02;
          if (cell.effTyp > 0) mask |= 0x01;

          buffer.push((channel << 4) | mask);

          if (mask & 0x08) buffer.push(cell.note);
          if (mask & 0x04) buffer.push(cell.instrument);
          if (mask & 0x02) buffer.push(cell.volume);
          if (mask & 0x01) {
            buffer.push(cell.effTyp);
            buffer.push(cell.eff);
          }
        });
      }
    });

    return new Uint8Array(buffer);
  }

  private static getUsedInstrumentIds(patterns: Pattern[], order: number[]): Set<number> {
    const used = new Set<number>();
    order.forEach(pIdx => {
      const pattern = patterns[pIdx];
      if (!pattern) return;
      pattern.channels.forEach(channel => {
        channel.rows.forEach(cell => {
          if (cell.instrument > 0) used.add(cell.instrument);
        });
      });
    });
    return used;
  }

  private static isCellActive(cell: TrackerCell): boolean {
    return cell.note > 0 || cell.instrument > 0 || cell.volume > 0 || cell.effTyp > 0;
  }

  private static packSynthParams(inst: InstrumentConfig): number[] {
    const res = new Array(8).fill(0);
    if (inst.synthType === 'TB303' && inst.tb303) {
      res[0] = inst.tb303.filter.cutoff;
      res[1] = inst.tb303.filter.resonance;
      res[2] = inst.tb303.filterEnvelope.envMod;
      res[3] = inst.tb303.filterEnvelope.decay;
    } else if (inst.synthType === 'SpaceLaser' && inst.spaceLaser) {
      res[0] = (inst.spaceLaser.laser.sweepTime / 2000) * 255;
      res[1] = inst.spaceLaser.fm.amount;
      res[2] = inst.spaceLaser.fm.ratio * 10;
      res[3] = inst.spaceLaser.filter.cutoff / 100;
    } else if (inst.synthType === 'V2' && inst.v2) {
      res[0] = inst.v2.osc1.transpose + 64;
      res[1] = inst.v2.osc1.detune + 64;
      res[2] = inst.v2.filter1.cutoff;
      res[3] = inst.v2.filter1.resonance;
    }
    return res.map(v => Math.floor(Math.min(255, Math.max(0, v))));
  }
}