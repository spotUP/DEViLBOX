/**
 * SimpleAmigaStubParser.ts — Filename-based stub parsers for compiled 68k binary formats
 * where no public format spec is available for pattern extraction.
 *
 * These formats are self-contained 68k executables (player + music data fused).
 * No pattern data is extractable without deep reverse engineering.
 * Audio is always delegated to UADE classic streaming via injectUADE: true.
 *
 * Formats covered:
 *   - Thomas Hermann (.tw / THM.*) — used in numerous Amiga game soundtracks
 *   - Darius Zendeh (.dz)         — proprietary format
 *   - Silmarils (.mok / MOK.*)    — 3-voice MIDI clone, Silmarils games 1989-92
 *   - Mark II (.mk2 / MK2.*)      — compiled binary replayer
 */

import type { TrackerSong, TrackerFormat } from '@/engine/TrackerReplayer';
import type { InstrumentConfig } from '@/types';

// ── Shared stub factory ────────────────────────────────────────────────────────

interface StubFormatInfo {
  label:       string;
  instrCount:  number;
  numChannels: number;
  prefixes:    string[];
  extensions:  string[];
}

function makeStub(_buffer: ArrayBuffer, filename: string, info: StubFormatInfo): TrackerSong {
  const baseName = filename.split('/').pop() ?? filename;

  // Strip known prefix forms (e.g. "tw.chuckie_egg" → "chuckie_egg")
  let moduleName = baseName;
  for (const pfx of info.prefixes) {
    moduleName = moduleName.replace(new RegExp(`^${pfx}\\.`, 'i'), '');
  }
  // Strip known suffix extensions (e.g. "chuckie_egg.tw" → "chuckie_egg")
  for (const ext of info.extensions) {
    moduleName = moduleName.replace(new RegExp(`\\.${ext}$`, 'i'), '');
  }
  if (!moduleName || moduleName === baseName) {
    moduleName = baseName.replace(/\.[^.]+$/, '') || baseName;
  }

  const NUM_CHANNELS = info.numChannels;

  const instruments: InstrumentConfig[] = Array.from({ length: info.instrCount }, (_, i) => ({
    id:        i + 1,
    name:      `Instrument ${i + 1}`,
    type:      'synth' as const,
    synthType: 'Synth' as const,
    effects:   [],
    volume:    0,
    pan:       0,
  } as InstrumentConfig));

  const ROWS = 64;
  const emptyRow = () => ({ note: 0, instrument: 0, volume: 0, effTyp: 0, eff: 0, effTyp2: 0, eff2: 0 });

  const pattern = {
    id:     'pattern-0',
    name:   'Pattern 0',
    length: ROWS,
    channels: Array.from({ length: NUM_CHANNELS }, (_, ch) => ({
      id:           `channel-${ch}`,
      name:         `Channel ${ch + 1}`,
      muted:        false,
      solo:         false,
      collapsed:    false,
      volume:       100,
      pan:          NUM_CHANNELS === 4 ? (ch === 0 || ch === 3 ? -50 : 50) : 0,
      instrumentId: null,
      color:        null,
      rows:         Array.from({ length: ROWS }, emptyRow),
    })),
    importMetadata: {
      sourceFormat:            'MOD' as const,
      sourceFile:              filename,
      importedAt:              new Date().toISOString(),
      originalChannelCount:    NUM_CHANNELS,
      originalPatternCount:    1,
      originalInstrumentCount: info.instrCount,
    },
  };

  return {
    name:            `${moduleName} [${info.label}]`,
    format:          'MOD' as TrackerFormat,
    patterns:        [pattern],
    instruments,
    songPositions:   [0],
    songLength:      1,
    restartPosition: 0,
    numChannels:     NUM_CHANNELS,
    initialSpeed:    6,
    initialBPM:      125,
    linearPeriods:   false,
  };
}

// ── Thomas Hermann (.tw / THM.*) ──────────────────────────────────────────────

const THOMAS_HERMANN_INFO: StubFormatInfo = {
  label:       'Thomas Hermann',
  instrCount:  8,
  numChannels: 4,
  prefixes:    ['tw', 'thm'],
  extensions:  ['tw'],
};

export function parseThomasHermannFile(buffer: ArrayBuffer, filename: string): TrackerSong {
  return makeStub(buffer, filename, THOMAS_HERMANN_INFO);
}

// ── Darius Zendeh (.dz) ───────────────────────────────────────────────────────

const DARIUS_ZENDEH_INFO: StubFormatInfo = {
  label:       'Darius Zendeh',
  instrCount:  4,
  numChannels: 4,
  prefixes:    ['dz'],
  extensions:  ['dz'],
};

export function parseDariusZendehFile(buffer: ArrayBuffer, filename: string): TrackerSong {
  return makeStub(buffer, filename, DARIUS_ZENDEH_INFO);
}

// ── Silmarils (.mok / MOK.*) ──────────────────────────────────────────────────

const SILMARILS_INFO: StubFormatInfo = {
  label:       'Silmarils',
  instrCount:  3,
  numChannels: 3,
  prefixes:    ['mok'],
  extensions:  ['mok'],
};

export function parseSilmarilsFile(buffer: ArrayBuffer, filename: string): TrackerSong {
  return makeStub(buffer, filename, SILMARILS_INFO);
}

// ── Mark II (.mk2 / MK2.*) ────────────────────────────────────────────────────

const MARK_II_INFO: StubFormatInfo = {
  label:       'Mark II',
  instrCount:  4,
  numChannels: 4,
  prefixes:    ['mk2', 'mkii'],
  extensions:  ['mk2', 'mkii'],
};

export function parseMarkIIFile(buffer: ArrayBuffer, filename: string): TrackerSong {
  return makeStub(buffer, filename, MARK_II_INFO);
}

// ── ArtAndMagic (.aam / AAM.*) ────────────────────────────────────────────────

const ART_AND_MAGIC_INFO: StubFormatInfo = {
  label:       'ArtAndMagic',
  instrCount:  8,
  numChannels: 4,
  prefixes:    ['aam'],
  extensions:  ['aam'],
};

export function parseArtAndMagicFile(buffer: ArrayBuffer, filename: string): TrackerSong {
  return makeStub(buffer, filename, ART_AND_MAGIC_INFO);
}

// ── SonicArranger SAS (.sas / SAS.*) ─────────────────────────────────────────

const SONIC_ARRANGER_SAS_INFO: StubFormatInfo = {
  label:       'SonicArranger',
  instrCount:  8,
  numChannels: 4,
  prefixes:    ['sas'],
  extensions:  ['sas'],
};

export function parseSonicArrangerSasFile(buffer: ArrayBuffer, filename: string): TrackerSong {
  return makeStub(buffer, filename, SONIC_ARRANGER_SAS_INFO);
}

// ── Sound Factory (.psf / PSF.*) ─────────────────────────────────────────────

const SOUND_FACTORY_INFO: StubFormatInfo = {
  label:       'Sound Factory',
  instrCount:  8,
  numChannels: 4,
  prefixes:    ['psf'],
  extensions:  ['psf'],
};

export function parseSoundFactoryFile(buffer: ArrayBuffer, filename: string): TrackerSong {
  return makeStub(buffer, filename, SOUND_FACTORY_INFO);
}

// ── Mike Davies (.md / MD.*) ─────────────────────────────────────────────────

const MIKE_DAVIES_INFO: StubFormatInfo = {
  label:       'Mike Davies',
  instrCount:  4,
  numChannels: 4,
  prefixes:    ['md'],
  extensions:  ['md'],
};

export function parseMikeDaviesFile(buffer: ArrayBuffer, filename: string): TrackerSong {
  return makeStub(buffer, filename, MIKE_DAVIES_INFO);
}

// ── AProSys (.aps / APS.*) ───────────────────────────────────────────────────

const APROSYS_INFO: StubFormatInfo = {
  label:       'AProSys',
  instrCount:  4,
  numChannels: 4,
  prefixes:    ['aps'],
  extensions:  ['aps'],
};

export function parseAProSysFile(buffer: ArrayBuffer, filename: string): TrackerSong {
  return makeStub(buffer, filename, APROSYS_INFO);
}

// ── Leggless Music Editor (.lme / LME.*) ─────────────────────────────────────

const LEGGLESS_INFO: StubFormatInfo = {
  label:       'Leggless Music Editor',
  instrCount:  4,
  numChannels: 4,
  prefixes:    ['lme'],
  extensions:  ['lme'],
};

export function parseLegglessFile(buffer: ArrayBuffer, filename: string): TrackerSong {
  return makeStub(buffer, filename, LEGGLESS_INFO);
}
