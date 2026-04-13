/**
 * MarkIIParser.ts — Mark II Sound System (Darius Zendeh / Andreas Scholl / Cachet Software)
 *
 * Self-playing format: the module IS a 68k executable containing both the
 * replay code and music data. The UADE wrapper calls jsr (a0) into the module.
 *
 * Related formats:
 *   - Mark I (MRK1 magic) — data-driven, separate replayer, documented spec
 *   - DariusZendeh (dz) — old prototype Mark II modules
 *   - MarkII (mk2/mkii) — later Mark II Sound System modules
 *
 * UADE eagleplayer.conf: MarkII  prefixes=mk2,mkii
 */

import type { TrackerSong, TrackerFormat } from '@/engine/TrackerReplayer';
import type { InstrumentConfig } from '@/types';

export function isMarkIIFormat(_buffer: ArrayBuffer | Uint8Array, filename?: string): boolean {
  if (filename) {
    const base = (filename.split('/').pop() ?? '').toLowerCase();
    if (base.startsWith('mk2.') || base.startsWith('mkii.') ||
        base.endsWith('.mk2') || base.endsWith('.mkii')) return true;
  }
  return false;
}

export function parseMarkIIFile(buffer: ArrayBuffer, filename: string): TrackerSong {
  const baseName = filename.split('/').pop() ?? filename;
  const moduleName = baseName
    .replace(/^mk2\./i, '').replace(/^mkii\./i, '')
    .replace(/\.mk2$/i, '').replace(/\.mkii$/i, '') || baseName;

  const instruments: InstrumentConfig[] = [];
  for (let i = 0; i < 4; i++) {
    instruments.push({
      id: i + 1, name: `MKII ${i + 1}`,
      type: 'synth' as const, synthType: 'Synth' as const,
      effects: [], volume: 0, pan: 0,
    } as InstrumentConfig);
  }

  return {
    name: `${moduleName} [Mark II]`,
    format: 'MOD' as TrackerFormat,
    patterns: [{ id: 'pattern-0', name: 'Pattern 0', length: 64, channels: Array.from({ length: 4 }, (_, ch) => ({ id: `channel-${ch}`, name: `Channel ${ch + 1}`, muted: false, solo: false, collapsed: false, volume: 100, pan: ch === 0 || ch === 3 ? -50 : 50, instrumentId: null, color: null, rows: Array.from({ length: 64 }, () => ({ note: 0, instrument: 0, volume: 0, effTyp: 0, eff: 0, effTyp2: 0, eff2: 0 })) })) }],
    instruments, songPositions: [0], songLength: 1, restartPosition: 0,
    numChannels: 4, initialSpeed: 6, initialBPM: 125, linearPeriods: false,
    uadeEditableFileData: buffer.slice(0) as ArrayBuffer, uadeEditableFileName: filename,
  };
}
