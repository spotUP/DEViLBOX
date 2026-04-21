/**
 * NanoExporter - Extreme binary compression for 4k intros
 * 
 * Concept:
 * - No JSON, strictly Uint8Array
 * - Only exports instruments and patterns actually used
 * - Bit-masking for pattern cells (don't store what you don't use)
 * - 0-255 normalized parameters for synths
 * - Optional LZMA compression on top of bit-packed binary
 *
 * Compressed format (version 2):
 *   [4 bytes] Magic: 0xDB 0x58 0x4E 0x21 ("DBXN!")
 *   [1 byte]  Version: 2 (indicates LZMA compressed)
 *   [4 bytes] Uncompressed payload size (little-endian uint32)
 *   [N bytes] LZMA-compressed payload (the raw v1 data minus header)
 */

import type { InstrumentConfig } from '@/types/instrument';
import type { Pattern, TrackerCell } from '@/types/tracker';

// Map synth types to tiny IDs
const SYNTH_TYPE_TO_ID: Record<string, number> = {
  'Synth': 1, 'MonoSynth': 2, 'DuoSynth': 3, 'FMSynth': 4, 'ToneAM': 5,
  'TB303': 10, 'Sampler': 11, 'WobbleBass': 12, 'DubSiren': 13,
  'SpaceLaser': 14, 'V2': 20, 'Synare': 15, 'DrumMachine': 16, 'ChipSynth': 17
};

export class NanoExporter {
  /**
   * Export the current project to a highly compressed binary (Base64)
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

  /**
   * Export with LZMA compression on top of the bit-packed binary.
   * Version 2 format: same magic + version 2 + uncompressed size + LZMA payload.
   * @param level LZMA compression level 1-9 (default 7, max ratio at 9)
   */
  public static exportCompressed(
    instruments: InstrumentConfig[],
    patterns: Pattern[],
    patternOrder: number[],
    bpm: number,
    speed: number,
    level: number = 7
  ): Uint8Array {
    const raw = this.export(instruments, patterns, patternOrder, bpm, speed);
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const LZMA = require('lzma/src/lzma_worker.js').LZMA;
    const compressed: number[] = LZMA.compress(raw, Math.min(9, Math.max(1, level)));

    // Build v2 container: magic(4) + version(1) + uncompressed_size(4) + LZMA data
    const result = new Uint8Array(9 + compressed.length);
    result[0] = 0xDB; result[1] = 0x58; result[2] = 0x4E; result[3] = 0x21;
    result[4] = 2; // version 2 = LZMA
    const view = new DataView(result.buffer);
    view.setUint32(5, raw.length, true);
    for (let i = 0; i < compressed.length; i++) {
      result[9 + i] = compressed[i] & 0xFF;
    }
    return result;
  }

  /**
   * Decompress a version-2 LZMA-compressed Nano export back to the raw v1 binary.
   * Useful for testing round-trips.
   */
  public static decompress(data: Uint8Array): Uint8Array {
    if (data.length < 9 || data[0] !== 0xDB || data[1] !== 0x58 ||
        data[2] !== 0x4E || data[3] !== 0x21) {
      throw new Error('Invalid Nano binary: bad magic');
    }
    if (data[4] === 1) return data; // v1 uncompressed — return as-is
    if (data[4] !== 2) throw new Error(`Unsupported Nano version: ${data[4]}`);

    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const LZMA = require('lzma/src/lzma_worker.js').LZMA;
    const lzmaPayload = Array.from(data.subarray(9));
    const decompressed = LZMA.decompress(lzmaPayload);

    // LZMA decompress may return string or byte array — normalize to Uint8Array
    if (typeof decompressed === 'string') {
      const encoder = new TextEncoder();
      return encoder.encode(decompressed);
    }
    if (decompressed instanceof Uint8Array) return decompressed;
    return new Uint8Array(decompressed.map((b: number) => b & 0xFF));
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