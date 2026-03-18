/**
 * SimpleAmigaStubParser — stub parsers for simple Amiga formats
 * that only need a filename-based title + placeholder instruments
 * before falling through to UADE classic for audio.
 */

import type { TrackerSong } from '@engine/TrackerReplayer';
import type { Pattern, InstrumentConfig, TrackerCell } from '@/types';

function emptyCell(): TrackerCell {
  return { note: 0, instrument: 0, volume: 0, effTyp: 0, eff: 0, effTyp2: 0, eff2: 0 };
}

function makeStubSong(_buffer: ArrayBuffer, filename: string, formatName: string, channels: number = 4): TrackerSong {
  const name = filename.replace(/\.[^.]+$/, '').replace(/^[^.]+\./, '');
  const pattern: Pattern = {
    id: 'pattern-0',
    name: 'Pattern 0',
    length: 64,
    channels: Array.from({ length: channels }, (_, ch) => ({
      id: `channel-${ch}`,
      name: `${formatName} ${ch + 1}`,
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
  const instruments: InstrumentConfig[] = Array.from({ length: channels }, (_, i) => ({
    id: i + 1,
    name: `${formatName} ${i + 1}`,
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
    numChannels: channels,
    initialSpeed: 6,
    initialBPM: 125,
  };
}

export function parseSonicArrangerSasFile(buffer: ArrayBuffer, filename: string): TrackerSong {
  return makeStubSong(buffer, filename, 'SAS');
}

export function parseSoundFactoryFile(buffer: ArrayBuffer, filename: string): TrackerSong {
  return makeStubSong(buffer, filename, 'PSF');
}

export function parseLegglessFile(buffer: ArrayBuffer, filename: string): TrackerSong {
  return makeStubSong(buffer, filename, 'LME');
}

export function parseMikeDaviesFile(buffer: ArrayBuffer, filename: string): TrackerSong {
  return makeStubSong(buffer, filename, 'MD');
}

export function parseMarkIIFile(buffer: ArrayBuffer, filename: string): TrackerSong {
  return makeStubSong(buffer, filename, 'MK2');
}

export function parseAProSysFile(buffer: ArrayBuffer, filename: string): TrackerSong {
  return makeStubSong(buffer, filename, 'APS');
}

export function parseArtAndMagicFile(buffer: ArrayBuffer, filename: string): TrackerSong {
  return makeStubSong(buffer, filename, 'AAM');
}
