/**
 * EarAcheParser — parser for EarAche format (.ea)
 *
 * eagleplayer.conf: EarAche  prefixes=ea  Magic: "EASO"
 * Stub — UADE classic handles audio.
 */

import type { TrackerSong } from '@engine/TrackerReplayer';
import type { Pattern, InstrumentConfig, TrackerCell } from '@/types';

function emptyCell(): TrackerCell {
  return { note: 0, instrument: 0, volume: 0, effTyp: 0, eff: 0, effTyp2: 0, eff2: 0 };
}

export function isEarAcheFormat(buffer: ArrayBuffer | Uint8Array): boolean {
  const data = buffer instanceof Uint8Array ? buffer : new Uint8Array(buffer);
  if (data.length < 4) return false;
  return data[0] === 0x45 && data[1] === 0x41 && data[2] === 0x53 && data[3] === 0x4F;
}

export function parseEarAcheFile(_buffer: ArrayBuffer, filename: string): TrackerSong {
  const name = filename.replace(/\.[^.]+$/, '').replace(/^[^.]+\./, '');
  const pattern: Pattern = {
    id: 'pattern-0',
    name: 'Pattern 0',
    length: 64,
    channels: Array.from({ length: 4 }, (_, ch) => ({
      id: `channel-${ch}`,
      name: `EarAche ${ch + 1}`,
      muted: false,
      solo: false,
      collapsed: false,
      volume: 100,
      pan: (ch === 0 || ch === 3) ? -50 : 50,
      instrumentId: null,
      color: null,
      rows: Array.from({ length: 64 }, () => emptyCell()),
    })),
  };
  const instruments: InstrumentConfig[] = Array.from({ length: 4 }, (_, i) => ({
    id: i + 1,
    name: `EarAche ${i + 1}`,
    type: 'sample' as const,
    synthType: 'Sampler' as const,
    effects: [],
    volume: -6,
    pan: 0,
  } as InstrumentConfig));

  return {
    name,
    format: 'MOD' as any,
    patterns: [pattern],
    instruments,
    songPositions: [0],
    songLength: 1,
    restartPosition: 0,
    numChannels: 4,
    initialSpeed: 6,
    initialBPM: 125,
  };
}
