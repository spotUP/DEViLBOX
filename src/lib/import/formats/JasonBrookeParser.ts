/**
 * JasonBrookeParser.ts — Jason Brooke format detection and stub parser
 *
 * Detection (from eagleplayer.conf: JasonBrooke  prefixes=jcbo,jcb,jb):
 *   Pure prefix-based detection (no magic bytes).
 *   Prefixes (checked longest-first to avoid jcb matching jcbo):
 *     jcbo.songname, jcb.songname, jb.songname
 *
 * UADE eagleplayer: JasonBrooke.library
 */

import type { TrackerSong, TrackerFormat } from '@/engine/TrackerReplayer';
import type { InstrumentConfig } from '@/types';

/**
 * Detect Jason Brooke format by filename prefix or extension.
 * Prefix format (UADE): jcbo.songname, jcb.songname, jb.songname
 * Extension format (common rips): songname.jcbo, songname.jcb, songname.jb
 * Checks jcbo. before jcb. to avoid false matches.
 */
export function isJasonBrookeFormat(
  _buffer: ArrayBuffer | Uint8Array,
  filename?: string,
): boolean {
  if (!filename) return false;
  const base = (filename.split('/').pop() ?? filename).split('\\').pop()!.toLowerCase();
  // Prefix-based (UADE canonical)
  if (base.startsWith('jcbo.') || base.startsWith('jcb.') || base.startsWith('jb.')) return true;
  // Extension-based (common rip naming)
  if (base.endsWith('.jcbo') || base.endsWith('.jcb') || base.endsWith('.jb')) return true;
  return false;
}

export function parseJasonBrookeFile(buffer: ArrayBuffer, filename: string): TrackerSong {
  if (!isJasonBrookeFormat(buffer, filename)) throw new Error('Not a Jason Brooke module');

  const baseName = filename.split('/').pop() ?? filename;
  // Strip any recognised prefix
  const moduleName = baseName.replace(/^(jcbo|jcb|jb)\./i, '') || baseName;

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
    name: `${moduleName} [Jason Brooke]`, format: 'MOD' as TrackerFormat,
    patterns: [pattern], instruments, songPositions: [0],
    songLength: 1, restartPosition: 0, numChannels: 4,
    initialSpeed: 6, initialBPM: 125, linearPeriods: false,
  };
}
