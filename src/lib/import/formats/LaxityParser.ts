/**
 * LaxityParser.ts — Laxity format detection and stub parser
 *
 * Detection (from eagleplayer.conf: Laxity  prefixes=powt,pt):
 *   Prefix-based detection.  powt.* is unambiguous.
 *   pt.* is shared with ProTracker MOD files; those are excluded by
 *   checking for a known ProTracker tag at offset 0x438 (bytes 1080–1083).
 *   Common ProTracker tags: M.K., M!K!, FLT4, FLT8, 4CHN, 6CHN, 8CHN, etc.
 *
 * UADE eagleplayer: Laxity.library
 */

import type { TrackerSong, TrackerFormat } from '@/engine/TrackerReplayer';
import type { InstrumentConfig } from '@/types';

/** ProTracker / MOD marker tags at offset 0x438 */
const MOD_TAGS = ['M.K.', 'M!K!', 'FLT4', 'FLT8', '4CHN', '6CHN', '8CHN'];

function readTag(buf: Uint8Array, offset: number): string {
  if (buf.length < offset + 4) return '';
  return String.fromCharCode(buf[offset], buf[offset + 1], buf[offset + 2], buf[offset + 3]);
}

/**
 * Detect Laxity format.
 * powt.* prefix → always Laxity.
 * pt.* prefix → Laxity unless a ProTracker MOD tag is present at offset 0x438.
 */
export function isLaxityFormat(
  buffer: ArrayBuffer | Uint8Array,
  filename?: string,
): boolean {
  if (!filename) return false;
  const base = (filename.split('/').pop() ?? filename).split('\\').pop()!.toLowerCase();

  if (base.startsWith('powt.')) return true;

  if (base.startsWith('pt.')) {
    const buf = buffer instanceof Uint8Array ? buffer : new Uint8Array(buffer);
    const tag = readTag(buf, 0x438);
    // If it looks like a real ProTracker MOD, reject it
    if (MOD_TAGS.includes(tag)) return false;
    return true;
  }

  return false;
}

export function parseLaxityFile(buffer: ArrayBuffer, filename: string): TrackerSong {
  if (!isLaxityFormat(buffer, filename)) throw new Error('Not a Laxity module');

  const baseName = filename.split('/').pop() ?? filename;
  const moduleName = baseName.replace(/^(powt|pt)\./i, '') || baseName;

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
    name: `${moduleName} [Laxity]`, format: 'MOD' as TrackerFormat,
    patterns: [pattern], instruments, songPositions: [0],
    songLength: 1, restartPosition: 0, numChannels: 4,
    initialSpeed: 6, initialBPM: 125, linearPeriods: false,
  };
}
