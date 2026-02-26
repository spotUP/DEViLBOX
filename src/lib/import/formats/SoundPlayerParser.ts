/**
 * SoundPlayerParser.ts — Sound Player Amiga music format native parser
 *
 * Sound Player is a Wanted Team Amiga 4-channel music player. Files use
 * a structured header encoding voice counts and pattern repetition values
 * that enable detection without a magic string.
 *
 * Detection (from UADE SoundPlayer_v1.asm Check2 routine):
 *   byte[1] in range 0x0B–0xA0 (number of something, 11–160)
 *   byte[2] is 7 or 15 (voice count)
 *   byte[3] and byte[4] are 0
 *   byte[5] is non-zero (call it b5)
 *   word at offset 6 is 0
 *   byte[8] == b5, byte[9] == 0, byte[10] == 0
 *   byte[11] == b5
 *   word at offset 12 is 0
 *   when byte[2] == 15: byte[14] == b5
 *
 * File prefix: "SJS."
 * Actual audio playback is delegated to UADE.
 *
 * Reference: Reference Code/uade-3.05/amigasrc/players/wanted_team/SoundPlayer/SoundPlayer_v1.asm
 */

import type { TrackerSong, TrackerFormat } from '@/engine/TrackerReplayer';
import type { InstrumentConfig } from '@/types';

const MIN_FILE_SIZE = 15;

function u16BE(buf: Uint8Array, off: number): number {
  return ((buf[off] << 8) | buf[off + 1]) >>> 0;
}

export function isSoundPlayerFormat(buffer: ArrayBuffer | Uint8Array): boolean {
  const buf = buffer instanceof Uint8Array ? buffer : new Uint8Array(buffer);
  if (buf.length < MIN_FILE_SIZE) return false;

  // byte[1]: must be in range 11–160 (exclusive of 0x0A, inclusive of 0x0B..0xA0)
  if (buf[1] <= 0x0A || buf[1] > 0xA0) return false;

  // byte[2]: voice count must be 7 or 15
  if (buf[2] !== 7 && buf[2] !== 15) return false;

  // bytes[3] and [4] must be zero
  if (buf[3] !== 0) return false;
  if (buf[4] !== 0) return false;

  // byte[5] must be non-zero — this is the key repetition/pattern value b5
  const b5 = buf[5];
  if (b5 === 0) return false;

  // word at offset 6 must be zero
  if (u16BE(buf, 6) !== 0) return false;

  // byte[8] must equal b5
  if (buf[8] !== b5) return false;

  // bytes[9] and [10] must be zero
  if (buf[9] !== 0) return false;
  if (buf[10] !== 0) return false;

  // byte[11] must equal b5
  if (buf[11] !== b5) return false;

  // word at offset 12 must be zero
  if (u16BE(buf, 12) !== 0) return false;

  // when voice count is 15, byte[14] must also equal b5
  if (buf[2] === 15 && buf[14] !== b5) return false;

  return true;
}

export function parseSoundPlayerFile(buffer: ArrayBuffer, filename: string): TrackerSong {
  const buf = new Uint8Array(buffer);
  if (!isSoundPlayerFormat(buf)) throw new Error('Not a Sound Player module');

  const baseName = (filename.split('/').pop() ?? filename).split('\\').pop() ?? filename;
  const moduleName = baseName.replace(/^sjs\./i, '') || baseName;

  const instruments: InstrumentConfig[] = [];

  const emptyRows = Array.from({ length: 64 }, () => ({
    note: 0, instrument: 0, volume: 0, effTyp: 0, eff: 0, effTyp2: 0, eff2: 0,
  }));

  const pattern = {
    id: 'pattern-0',
    name: 'Pattern 0',
    length: 64,
    channels: Array.from({ length: 4 }, (_, ch) => ({
      id: `channel-${ch}`,
      name: `Channel ${ch + 1}`,
      muted: false,
      solo: false,
      collapsed: false,
      volume: 100,
      pan: ch === 0 || ch === 3 ? -50 : 50,
      instrumentId: null,
      color: null,
      rows: emptyRows,
    })),
    importMetadata: {
      sourceFormat: 'MOD' as const,
      sourceFile: filename,
      importedAt: new Date().toISOString(),
      originalChannelCount: 4,
      originalPatternCount: 1,
      originalInstrumentCount: 0,
    },
  };

  return {
    name: `${moduleName} [Sound Player]`,
    format: 'MOD' as TrackerFormat,
    patterns: [pattern],
    instruments,
    songPositions: [0],
    songLength: 1,
    restartPosition: 0,
    numChannels: 4,
    initialSpeed: 6,
    initialBPM: 125,
    linearPeriods: false,
  };
}
