/**
 * SimpleAmigaStubParser — stub parsers for simple Amiga formats
 * that only need a filename-based title + placeholder instruments
 * before falling through to UADE classic for audio.
 */

import type { TrackerSong } from '@engine/TrackerReplayer';
import type { Pattern, InstrumentConfig, TrackerCell } from '@/types';
import type { UADEPatternLayout } from '@/engine/uade/UADEPatternEncoder';
import { encodeSimpleAmigaStubCell } from '@/engine/uade/encoders/SimpleAmigaStubEncoder';
import { decodeMODCell } from '@/engine/uade/encoders/MODEncoder';

function emptyCell(): TrackerCell {
  return { note: 0, instrument: 0, volume: 0, effTyp: 0, eff: 0, effTyp2: 0, eff2: 0 };
}

function makeStubSong(buffer: ArrayBuffer, filename: string, formatName: string, formatId: string, channels: number = 4): TrackerSong {
  const name = filename.replace(/\.[^.]+$/, '').replace(/^[^.]+\./, '');
  const ROWS = 64;
  const pattern: Pattern = {
    id: 'pattern-0',
    name: 'Pattern 0',
    length: ROWS,
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
      rows: Array.from({ length: ROWS }, () => emptyCell()),
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

  const uadePatternLayout: UADEPatternLayout = {
    formatId,
    patternDataFileOffset: 0,
    bytesPerCell: 4,
    rowsPerPattern: ROWS,
    numChannels: channels,
    numPatterns: 1,
    moduleSize: buffer.byteLength,
    encodeCell: encodeSimpleAmigaStubCell,
    decodeCell: decodeMODCell,
  };

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
    uadeEditableFileData: buffer.slice(0) as ArrayBuffer,
    uadeEditableFileName: filename,
    uadePatternLayout,
  };
}

export function parseSonicArrangerSasFile(buffer: ArrayBuffer, filename: string): TrackerSong {
  return makeStubSong(buffer, filename, 'SAS', 'sonicArrangerSas');
}

export function parseSoundFactoryFile(buffer: ArrayBuffer, filename: string): TrackerSong {
  return makeStubSong(buffer, filename, 'PSF', 'soundFactoryStub');
}

export function parseLegglessFile(buffer: ArrayBuffer, filename: string): TrackerSong {
  return makeStubSong(buffer, filename, 'LME', 'leggless');
}

export function parseMikeDaviesFile(buffer: ArrayBuffer, filename: string): TrackerSong {
  return makeStubSong(buffer, filename, 'MD', 'mikeDavies');
}

export function parseMarkIIFile(buffer: ArrayBuffer, filename: string): TrackerSong {
  return makeStubSong(buffer, filename, 'MK2', 'markII');
}

export function parseAProSysFile(buffer: ArrayBuffer, filename: string): TrackerSong {
  return makeStubSong(buffer, filename, 'APS', 'aProSys');
}

export function parseArtAndMagicFile(buffer: ArrayBuffer, filename: string): TrackerSong {
  return makeStubSong(buffer, filename, 'AAM', 'artAndMagic');
}
