/**
 * ManiacsOfNoiseParser.ts — Maniacs of Noise format detection and stub parser
 *
 * Detection (from eagleplayer.conf: ManiacsOfNoise  prefixes=mon):
 *   Prefix-based detection: mon.songname
 *   Must NOT match mon_old.* — those belong to JeroenTelParser.
 *
 * UADE eagleplayer: ManiacsOfNoise.library
 */

import type { TrackerSong, TrackerFormat } from '@/engine/TrackerReplayer';
import type { InstrumentConfig } from '@/types';
import type { UADEPatternLayout } from '@/engine/uade/UADEPatternEncoder';
import { encodeMODCell, decodeMODCell } from '@/engine/uade/encoders/MODEncoder';

function u16BE(buf: Uint8Array, off: number): number {
  return ((buf[off] << 8) | buf[off + 1]) >>> 0;
}

function u32BE(buf: Uint8Array, off: number): number {
  return (((buf[off] << 24) | (buf[off + 1] << 16) | (buf[off + 2] << 8) | buf[off + 3]) >>> 0);
}

/**
 * Detect Maniacs of Noise format by filename prefix or extension.
 * Prefix format (UADE): mon.songname
 * Extension format (common rips): songname.mon
 * Rejects: mon_old.* (JeroenTel / Jeroen Tel format)
 */
export function isManiacsOfNoiseFormat(
  _buffer: ArrayBuffer | Uint8Array,
  filename?: string,
): boolean {
  if (!filename) return false;
  const base = (filename.split('/').pop() ?? filename).split('\\').pop()!.toLowerCase();
  // mon_old.* belongs to JeroenTel
  if (base.startsWith('mon_old.')) return false;
  // Prefix-based (UADE canonical)
  if (base.startsWith('mon.')) return true;
  // Extension-based (common rip naming)
  if (base.endsWith('.mon')) return true;
  return false;
}

export function parseManiacsOfNoiseFile(buffer: ArrayBuffer, filename: string): TrackerSong {
  if (!isManiacsOfNoiseFormat(buffer, filename)) throw new Error('Not a Maniacs of Noise module');
  const buf = new Uint8Array(buffer);

  const baseName = filename.split('/').pop() ?? filename;
  const moduleName = baseName.replace(/^mon\./i, '').replace(/\.mon$/i, '') || baseName;

  // ── Scan for instrument/sample data ───────────────────────────────────────
  //
  // Maniacs of Noise modules are 68k player binaries. Scan for common
  // opcode patterns to find sample count hints and tables.

  const NUM_CHANNELS = 4;
  let sampleCount = NUM_CHANNELS;

  try {
    // Look for LEA instructions ($41FA, $43FA) to find data tables
    const scanEnd = Math.min(buf.length - 4, 2048);

    for (let off = 0; off < scanEnd; off += 2) {
      const op = u16BE(buf, off);
      if (op === 0x41FA && off + 4 <= buf.length) {
        const disp = u16BE(buf, off + 2);
        const signedDisp = disp < 0x8000 ? disp : disp - 0x10000;
        const target = off + 2 + signedDisp;
        if (target > 0 && target + 8 <= buf.length) {
          // Try counting plausible sample entries (u32 + u16 per entry = 6 bytes)
          let count = 0;
          let soff = target;
          for (let i = 0; i < 32 && soff + 6 <= buf.length; i++) {
            const ptr = u32BE(buf, soff);
            const len = u16BE(buf, soff + 4) * 2;
            if (len === 0 || len > 0x80000) break;
            if (ptr > buf.length * 4) break;
            count++;
            soff += 6;
          }
          if (count >= 2) {
            sampleCount = count;
            break;
          }
        }
      }
    }
  } catch {
    // Fall back to defaults
  }

  const instruments: InstrumentConfig[] = [];
  for (let i = 0; i < sampleCount; i++) {
    instruments.push({
      id: i + 1,
      name: `MoN Sample ${i + 1}`,
      type: 'synth' as const,
      synthType: 'Synth' as const,
      effects: [],
      volume: 0,
      pan: 0,
    } as InstrumentConfig);
  }

  const emptyRows = Array.from({ length: 64 }, () => ({
    note: 0, instrument: 0, volume: 0, effTyp: 0, eff: 0, effTyp2: 0, eff2: 0,
  }));

  const pattern = {
    id: 'pattern-0', name: 'Pattern 0', length: 64,
    channels: Array.from({ length: NUM_CHANNELS }, (_, ch) => ({
      id: `channel-${ch}`, name: `Channel ${ch + 1}`, muted: false,
      solo: false, collapsed: false, volume: 100,
      pan: ch === 0 || ch === 3 ? -50 : 50,
      instrumentId: null, color: null, rows: emptyRows,
    })),
    importMetadata: {
      sourceFormat: 'MOD' as const, sourceFile: filename,
      importedAt: new Date().toISOString(),
      originalChannelCount: NUM_CHANNELS, originalPatternCount: 1,
      originalInstrumentCount: sampleCount,
    },
  };

  return {
    name: `${moduleName} [Maniacs of Noise]`, format: 'MOD' as TrackerFormat,
    patterns: [pattern], instruments, songPositions: [0],
    songLength: 1, restartPosition: 0, numChannels: NUM_CHANNELS,
    initialSpeed: 6, initialBPM: 125, linearPeriods: false,
    uadeEditableFileData: buffer.slice(0) as ArrayBuffer,
    uadeEditableFileName: filename,
    uadePatternLayout: {
      formatId: 'maniacsOfNoise',
      patternDataFileOffset: 0,
      bytesPerCell: 4,
      rowsPerPattern: 64,
      numChannels: NUM_CHANNELS,
      numPatterns: 1,
      moduleSize: buffer.byteLength,
      encodeCell: encodeMODCell,
      decodeCell: decodeMODCell,
    } as UADEPatternLayout,
  };
}
