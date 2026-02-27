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

  const baseName = filename.split('/').pop() ?? filename;
  const moduleName = baseName.replace(/^mon\./i, '') || baseName;

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
      id: `channel-${ch}`, name: `Channel ${ch + 1}`, muted: false,
      solo: false, collapsed: false, volume: 100,
      pan: ch === 0 || ch === 3 ? -50 : 50,
      instrumentId: null, color: null, rows: emptyRows,
    })),
    importMetadata: {
      sourceFormat: 'MOD' as const, sourceFile: filename,
      importedAt: new Date().toISOString(),
      originalChannelCount: 4, originalPatternCount: 1, originalInstrumentCount: 0,
    },
  };

  return {
    name: `${moduleName} [Maniacs of Noise]`, format: 'MOD' as TrackerFormat,
    patterns: [pattern], instruments, songPositions: [0],
    songLength: 1, restartPosition: 0, numChannels: 4,
    initialSpeed: 6, initialBPM: 125, linearPeriods: false,
  };
}
