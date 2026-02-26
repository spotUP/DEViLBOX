/**
 * MusicMakerParser.ts — Music Maker 4V / 8V format detection and stub parsers
 *
 * Detection:
 *   IFF 3.0+ format (4V and 8V share a common IFF container):
 *     bytes[0..3] == "FORM", bytes[8..11] == "MMV8" (or "MMV4")
 *   Legacy prefix-based (for older non-IFF variants):
 *     4V: prefix mm4.* or sdata.*
 *     8V: prefix mm8.*
 *
 * eagleplayer.conf prefixes:
 *   MusicMaker_4V  prefixes=mm4,sdata
 *   MusicMaker_8V  prefixes=mm8
 *
 * Minimum file size: 12 bytes for IFF header check.
 */

import type { TrackerSong, TrackerFormat } from '@/engine/TrackerReplayer';
import type { InstrumentConfig } from '@/types';

const MIN_IFF_SIZE = 12;

function readTag4(buf: Uint8Array, offset: number): string {
  if (buf.length < offset + 4) return '';
  return String.fromCharCode(buf[offset], buf[offset + 1], buf[offset + 2], buf[offset + 3]);
}

function makeStubSong(moduleName: string, label: string, filename: string): TrackerSong {
  const instruments: InstrumentConfig[] = [{
    id: 1, name: 'Sample 1', type: 'synth' as const,
    synthType: 'Synth' as const, effects: [], volume: 0, pan: 0,
  } as InstrumentConfig];

  const emptyRows = Array.from({ length: 64 }, () => ({
    note: 0, instrument: 0, volume: 0, effTyp: 0, eff: 0, effTyp2: 0, eff2: 0,
  }));

  const numChannels = label === 'Music Maker 8V' ? 8 : 4;
  const pattern = {
    id: 'pattern-0', name: 'Pattern 0', length: 64,
    channels: Array.from({ length: numChannels }, (_, ch) => ({
      id: `channel-${ch}`, name: `Channel ${ch + 1}`, muted: false,
      solo: false, collapsed: false, volume: 100,
      pan: numChannels === 4
        ? (ch === 0 || ch === 3 ? -50 : 50)
        : Math.round(((ch / (numChannels - 1)) * 2 - 1) * 50),
      instrumentId: null, color: null, rows: emptyRows,
    })),
    importMetadata: {
      sourceFormat: 'MOD' as const, sourceFile: filename,
      importedAt: new Date().toISOString(),
      originalChannelCount: numChannels, originalPatternCount: 1, originalInstrumentCount: 0,
    },
  };

  return {
    name: `${moduleName} [${label}]`, format: 'MOD' as TrackerFormat,
    patterns: [pattern], instruments, songPositions: [0],
    songLength: 1, restartPosition: 0, numChannels,
    initialSpeed: 6, initialBPM: 125, linearPeriods: false,
  };
}

// ── Music Maker 4V ────────────────────────────────────────────────────────────

/**
 * Detect Music Maker 4V format.
 * IFF check: FORM + MMV4 at bytes[8..11], or FORM + MMV8 with 4 channel hint.
 * Prefix check: mm4.* or sdata.*
 */
export function isMusicMaker4VFormat(
  buffer: ArrayBuffer | Uint8Array,
  filename?: string,
): boolean {
  const buf = buffer instanceof Uint8Array ? buffer : new Uint8Array(buffer);

  if (buf.length >= MIN_IFF_SIZE && readTag4(buf, 0) === 'FORM') {
    const subType = readTag4(buf, 8);
    if (subType === 'MMV4') return true;
  }

  if (!filename) return false;
  const base = (filename.split('/').pop() ?? filename).split('\\').pop()!.toLowerCase();
  return base.startsWith('mm4.') || base.startsWith('sdata.');
}

export function parseMusicMaker4VFile(buffer: ArrayBuffer, filename: string): TrackerSong {
  if (!isMusicMaker4VFormat(buffer, filename)) throw new Error('Not a Music Maker 4V module');
  const baseName = filename.split('/').pop() ?? filename;
  const moduleName = baseName.replace(/^(mm4|sdata)\./i, '') || baseName;
  return makeStubSong(moduleName, 'Music Maker 4V', filename);
}

// ── Music Maker 8V ────────────────────────────────────────────────────────────

/**
 * Detect Music Maker 8V format.
 * IFF check: FORM + MMV8 at bytes[8..11].
 * Prefix check: mm8.*
 */
export function isMusicMaker8VFormat(
  buffer: ArrayBuffer | Uint8Array,
  filename?: string,
): boolean {
  const buf = buffer instanceof Uint8Array ? buffer : new Uint8Array(buffer);

  if (buf.length >= MIN_IFF_SIZE && readTag4(buf, 0) === 'FORM') {
    const subType = readTag4(buf, 8);
    if (subType === 'MMV8') return true;
  }

  if (!filename) return false;
  const base = (filename.split('/').pop() ?? filename).split('\\').pop()!.toLowerCase();
  return base.startsWith('mm8.');
}

export function parseMusicMaker8VFile(buffer: ArrayBuffer, filename: string): TrackerSong {
  if (!isMusicMaker8VFormat(buffer, filename)) throw new Error('Not a Music Maker 8V module');
  const baseName = filename.split('/').pop() ?? filename;
  const moduleName = baseName.replace(/^mm8\./i, '') || baseName;
  return makeStubSong(moduleName, 'Music Maker 8V', filename);
}
