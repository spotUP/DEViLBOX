/**
 * UADEParser.ts - Catch-all parser for exotic Amiga music formats
 *
 * Handles 130+ formats that cannot be natively parsed in TypeScript:
 * JochenHippel, TFMX, FredEditor, SidMon, Hippel-7V, and many more.
 *
 * Returns a playback-only TrackerSong with a single UADEConfig instrument.
 * The UADE WASM module (emulating Amiga 68000 + Paula) handles all audio output.
 *
 * Pattern editing is not supported for these opaque formats — they use
 * tightly-coupled Amiga machine code that cannot be decomposed into cells.
 */

import type { TrackerSong, TrackerFormat } from '@/engine/TrackerReplayer';
import type { InstrumentConfig, UADEConfig } from '@/types/instrument';
import type { Pattern, ChannelData, TrackerCell } from '@/types';

/** Known UADE eagleplayer extensions (non-exhaustive — UADE auto-detects many more) */
const UADE_EXTENSIONS: Set<string> = new Set([
  // JochenHippel variants
  'hip', 'hip7', 'sog',
  // TFMX
  'tfmx', 'mdat', 'tfx',
  // Future Composer (pre-1.3 — 1.3/1.4 handled by FCParser)
  'fc', 'sfc',
  // FRED
  'fred',
  // SidMon
  'sm', 'sm2',
  // Ben Daglish
  'bd', 'bd5', 'bdm',
  // David Whittaker
  'dw',
  // Mark Cooksey
  'mc', 'mco',
  // Jason Page
  'jp', 'jpn',
  // Richard Joseph
  'rj',
  // Delta Music
  'dm', 'dm2',
  // Sonic Arranger
  'sa',
  // Oktalyzer (handled separately by OktalyzerParser, listed here as fallback)
  // 'okt',
  // DigiBooster (handled separately)
  // 'digi',
  // Other common exotic formats
  'abk', 'aam', 'aon', 'adpcm',
  'bump', 'bss',
  'core',
  'dl', 'dl2',
  'ea', 'eua',
  'emb',
  'fp', 'fw',
  'gmc',
  'hd',
  'ik',
  'jam',
  'kris',
  'kss',
  'lme',
  'ma',
  'max',
  'mdst',
  'mkii',
  'mn',
  'moz',
  'ntp',
  'osp',
  'pb',
  'ps', 'psf',
  'pt',
  'pw',
  'rh',
  'rp',
  'run',
  'sas',
  'sb',
  'scr',
  'sdr',
  'sg',
  'sl', 'sl2',
  'snk',
  'sot',
  'sq', 'sqx',
  'ss',
  'st26',
  'sun',
  'sw',
  'thp',
  'tnc',
  'tpu',
  'ufo',
  'v8',
  'wn',
  'wp',
]);

/**
 * Detect whether a filename likely belongs to a UADE-handled format.
 * Returns true if the extension matches a known UADE format.
 */
export function isUADEFormat(filename: string): boolean {
  const ext = filename.split('.').pop()?.toLowerCase() ?? '';
  return UADE_EXTENSIONS.has(ext);
}

/**
 * Parse an exotic Amiga music file into a playback-only TrackerSong.
 * The returned song has one instrument (UADEConfig) and one empty pattern.
 */
export function parseUADEFile(buffer: ArrayBuffer, filename: string): TrackerSong {
  const name = filename.replace(/\.[^/.]+$/, '');
  const ext = filename.split('.').pop()?.toLowerCase() ?? '';

  const uadeConfig: UADEConfig = {
    type: 'uade',
    filename,
    fileData: buffer,
    subsongCount: 1,   // Will be updated by UADEEngine after loading
    currentSubsong: 0,
    metadata: {
      player: '',       // Filled in by UADE after format detection
      formatName: guessFormatName(ext),
      minSubsong: 0,
      maxSubsong: 0,
    },
  };

  const instrument: InstrumentConfig = {
    id: 1,
    name: name || 'UADE Song',
    type: 'synth' as const,
    synthType: 'UADESynth' as const,
    effects: [],
    volume: -6,
    pan: 0,
    uade: uadeConfig,
  };

  // Single empty pattern — no editable cells for playback-only formats
  const emptyCell: TrackerCell = {
    note: 0,
    instrument: 0,
    volume: 0,
    effTyp: 0,
    eff: 0,
  };

  const channel: ChannelData = {
    id: 'channel-0',
    name: 'UADE',
    muted: false,
    solo: false,
    collapsed: false,
    volume: 100,
    pan: 0,
    instrumentId: null,
    color: null,
    rows: Array.from({ length: 64 }, () => ({ ...emptyCell })),
  };

  const pattern: Pattern = {
    id: 'pattern-0',
    name: 'Song',
    length: 64,
    channels: [channel],
    importMetadata: {
      sourceFormat: 'UADE' as TrackerFormat,
      sourceFile: filename,
      importedAt: new Date().toISOString(),
      originalChannelCount: 1,
      originalPatternCount: 1,
      originalInstrumentCount: 1,
    },
  };

  return {
    name,
    format: 'UADE' as TrackerFormat,
    patterns: [pattern],
    instruments: [instrument],
    songPositions: [0],
    songLength: 1,
    restartPosition: 0,
    numChannels: 1,
    initialSpeed: 6,
    initialBPM: 125,
  };
}

/** Map common file extensions to human-readable format names */
function guessFormatName(ext: string): string {
  const names: Record<string, string> = {
    hip: 'Jochen Hippel',
    hip7: 'Jochen Hippel 7V',
    sog: 'Jochen Hippel Song',
    tfmx: 'TFMX',
    mdat: 'TFMX',
    tfx: 'TFMX',
    fc: 'Future Composer',
    sfc: 'Future Composer',
    fred: 'FRED Editor',
    sm: 'SidMon',
    sm2: 'SidMon 2',
    bd: 'Ben Daglish',
    bd5: 'Ben Daglish 5',
    bdm: 'Ben Daglish MOD',
    dw: 'David Whittaker',
    mc: 'Mark Cooksey',
    jp: 'Jason Page',
    rj: 'Richard Joseph',
    dm: 'Delta Music',
    dm2: 'Delta Music 2',
    sa: 'Sonic Arranger',
    abk: 'AMOS AMBank',
    aon: 'Art of Noise',
  };
  return names[ext] ?? `Amiga ${ext.toUpperCase()}`;
}
