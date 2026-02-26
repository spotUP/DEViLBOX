/**
 * UFOParser.ts — MicroProse UFO format (.ufo / .mus) detector
 *
 * UFO is a 4-channel Amiga music format created by MicroProse (1994), used in
 * games like UFO: Enemy Unknown (X-COM). It uses an IFF-style structure with
 * a custom DDAT form type.
 *
 * Two-file format: song data (*.mus / *.ufo) + samples (SMP.set).
 * File prefixes: MUS.* and UFO.* (eagleplayer.conf: UFO prefixes=mus,ufo).
 *
 * Detection (from UFO_v1.asm DTP_Check2):
 *   bytes[0..3]   = 0x464F524D ('FORM')
 *   bytes[4..7]   = u32BE size  (skip)
 *   bytes[8..11]  = 0x44444154 ('DDAT')
 *   bytes[12..15] = 0x424F4459 ('BODY')
 *   bytes[16..19] = u32BE size  (skip)
 *   bytes[20..23] = 0x4348414E ('CHAN')
 *
 * Playback is delegated to UADE (UFO eagleplayer).
 */

import type { TrackerSong, TrackerFormat } from '@/engine/TrackerReplayer';
import type { InstrumentConfig } from '@/types';

const MIN_FILE_SIZE = 24;

function u32BE(buf: Uint8Array, off: number): number {
  return (((buf[off] << 24) | (buf[off + 1] << 16) | (buf[off + 2] << 8) | buf[off + 3]) >>> 0);
}

export function isUFOFormat(buffer: ArrayBuffer | Uint8Array): boolean {
  const buf = buffer instanceof Uint8Array ? buffer : new Uint8Array(buffer);
  if (buf.length < MIN_FILE_SIZE) return false;
  if (u32BE(buf,  0) !== 0x464F524D) return false; // 'FORM'
  if (u32BE(buf,  8) !== 0x44444154) return false; // 'DDAT'
  if (u32BE(buf, 12) !== 0x424F4459) return false; // 'BODY'
  if (u32BE(buf, 20) !== 0x4348414E) return false; // 'CHAN'
  return true;
}

export function parseUFOFile(buffer: ArrayBuffer, filename: string): TrackerSong {
  const buf = new Uint8Array(buffer);
  if (!isUFOFormat(buf)) throw new Error('Not a UFO module');

  const baseName = filename.split('/').pop() ?? filename;
  const moduleName = baseName.replace(/^(?:mus|ufo)\./i, '') || baseName;

  const instruments: InstrumentConfig[] = [{
    id: 1, name: 'Sample 1', type: 'synth' as const,
    synthType: 'Synth' as const, effects: [], volume: 0, pan: 0,
  } as InstrumentConfig];

  const emptyRows = Array.from({ length: 64 }, () => ({
    note: 0, instrument: 0, volume: 0, effTyp: 0, eff: 0, effTyp2: 0, eff2: 0,
  }));

  const pattern = {
    id: 'pattern-0', name: 'Pattern 0', length: 64,
    channels: Array.from({ length: 4 }, (_, ch) => ({
      id: `channel-${ch}`, name: `Channel ${ch + 1}`,
      muted: false, solo: false, collapsed: false,
      volume: 100, pan: ch === 0 || ch === 3 ? -50 : 50,
      instrumentId: null, color: null, rows: emptyRows,
    })),
    importMetadata: {
      sourceFormat: 'MOD' as const, sourceFile: filename,
      importedAt: new Date().toISOString(),
      originalChannelCount: 4, originalPatternCount: 1, originalInstrumentCount: 0,
    },
  };

  return {
    name: `${moduleName} [UFO]`,
    format: 'MOD' as TrackerFormat,
    patterns: [pattern], instruments,
    songPositions: [0], songLength: 1, restartPosition: 0,
    numChannels: 4, initialSpeed: 6, initialBPM: 125, linearPeriods: false,
  };
}
