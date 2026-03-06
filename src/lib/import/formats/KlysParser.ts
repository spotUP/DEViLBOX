/**
 * KlysParser.ts - Parser for klystrack (.kt) files
 *
 * Reads the binary header for metadata and provides the raw binary
 * to the KlysEngine WASM for playback. Pattern/instrument data is
 * extracted from WASM after loading via klys_get_* functions.
 *
 * The binary format ("cyd!song") is version-dependent and complex,
 * so we only parse the header here and rely on WASM for full decoding.
 */

import type { TrackerSong, TrackerFormat } from '@/engine/TrackerReplayer';
import type { Pattern, TrackerCell, InstrumentConfig, KlysNativeData } from '@/types';

const SONG_SIG = 'cyd!song';
const INST_SIG = 'cyd!inst';
const MUS_VERSION = 27;

// Step constants
const MUS_NOTE_NONE = 0xFF;
const MUS_NOTE_NO_INSTRUMENT = 0xFF;
const MUS_NOTE_NO_VOLUME = 0xFF;

// Pack bits
const MUS_PAK_BIT_NOTE = 1;
const MUS_PAK_BIT_INST = 2;
const MUS_PAK_BIT_CTRL = 4;
const MUS_PAK_BIT_CMD = 8;
const MUS_PAK_BIT_VOLUME = 128;

// Note names for display
const NOTE_NAMES = ['C-', 'C#', 'D-', 'D#', 'E-', 'F-', 'F#', 'G-', 'G#', 'A-', 'A#', 'B-'];

function noteToString(note: number): string {
  if (note === MUS_NOTE_NONE || note === 0) return '---';
  if (note === 0xFE) return '==='; // note-off
  const n = note - 1;
  const octave = Math.floor(n / 12);
  const semitone = n % 12;
  return `${NOTE_NAMES[semitone]}${octave}`;
}

/** Check if a buffer is a valid klystrack song */
export function isKlystrack(buf: ArrayBuffer): boolean {
  if (buf.byteLength < 9) return false;
  const view = new DataView(buf);
  let sig = '';
  for (let i = 0; i < 8; i++) sig += String.fromCharCode(view.getUint8(i));
  return sig === SONG_SIG;
}

/** Check if a buffer is a valid klystrack instrument */
export function isKlysInstrument(buf: ArrayBuffer): boolean {
  if (buf.byteLength < 9) return false;
  const view = new DataView(buf);
  let sig = '';
  for (let i = 0; i < 8; i++) sig += String.fromCharCode(view.getUint8(i));
  return sig === INST_SIG;
}

class BinaryReader {
  private view: DataView;
  private pos: number;

  constructor(buf: ArrayBuffer) {
    this.view = new DataView(buf);
    this.pos = 0;
  }

  get offset(): number { return this.pos; }
  get remaining(): number { return this.view.byteLength - this.pos; }

  readU8(): number {
    const v = this.view.getUint8(this.pos);
    this.pos += 1;
    return v;
  }

  readS8(): number {
    const v = this.view.getInt8(this.pos);
    this.pos += 1;
    return v;
  }

  readU16LE(): number {
    const v = this.view.getUint16(this.pos, true);
    this.pos += 2;
    return v;
  }

  readU32LE(): number {
    const v = this.view.getUint32(this.pos, true);
    this.pos += 4;
    return v;
  }

  readS32LE(): number {
    const v = this.view.getInt32(this.pos, true);
    this.pos += 4;
    return v;
  }

  readString(len: number): string {
    let s = '';
    for (let i = 0; i < len; i++) {
      const c = this.view.getUint8(this.pos + i);
      if (c === 0) break;
      s += String.fromCharCode(c);
    }
    this.pos += len;
    return s;
  }

  readBytes(len: number): Uint8Array {
    const arr = new Uint8Array(this.view.buffer, this.view.byteOffset + this.pos, len);
    this.pos += len;
    return new Uint8Array(arr);
  }

  skip(n: number): void {
    this.pos += n;
  }
}

/**
 * Parse a klystrack .kt file.
 * Returns a TrackerSong with klysNative data and klysFileData for WASM playback.
 */
export function parseKlystrack(buf: ArrayBuffer): TrackerSong {
  const r = new BinaryReader(buf);

  // Signature
  const sig = r.readString(8);
  if (sig !== SONG_SIG) {
    throw new Error(`Not a klystrack file (sig: ${sig})`);
  }

  const version = r.readU8();
  if (version > MUS_VERSION) {
    throw new Error(`Unsupported klystrack version ${version} (max: ${MUS_VERSION})`);
  }

  // Number of channels
  let numChannels: number;
  if (version >= 6) {
    numChannels = r.readU8();
  } else {
    numChannels = version > 3 ? 4 : 3;
  }

  // Time signature
  const timeSignature = r.readU8();

  // Sequence step (tick subdivision)
  let sequenceStep = 0;
  if (version >= 17) {
    sequenceStep = r.readU8();
  }

  // Instrument/pattern/sequence counts
  const numInstruments = r.readU8();
  const numPatterns = r.readU16LE();
  const numSequences: number[] = [];
  for (let i = 0; i < numChannels; i++) {
    numSequences.push(r.readU16LE());
  }
  const songLength = r.readU16LE();
  const loopPoint = r.readU16LE();

  let masterVolume = 128;
  if (version >= 12) {
    masterVolume = r.readU8();
  }

  const songSpeed = r.readU8();
  const songSpeed2 = r.readU8();
  const songRate = r.readU16LE();

  let flags = 0;
  if (version > 2) flags = r.readU16LE();

  let multiplexPeriod = 3;
  if (version >= 9) multiplexPeriod = r.readU8();

  let pitchInaccuracy = 0;
  if (version >= 16) pitchInaccuracy = r.readU8();

  // Title
  let titleLen = 17; // old default
  if (version >= 11) {
    titleLen = r.readU8();
  }
  let title = '';
  if (version >= 5) {
    title = r.readString(Math.min(titleLen, 64));
  }

  // FX buses (skip for now — complex and version-dependent)
  let nFx = 0;
  if (version >= 10) {
    nFx = r.readU8();
  } else if (flags & 1) { // MUS_ENABLE_REVERB
    nFx = 1;
  }
  // Skip FX data — it's loaded by WASM
  // We can't easily skip it without parsing, so we'll stop header parsing here
  // and rely on WASM for the rest.

  // Build a "slim" TrackerSong for the store.
  // Patterns/instruments/sequences will be populated from WASM after loading.

  // Create stub patterns and instruments for initial display
  const patterns: Pattern[] = [];
  const defaultSteps = 64;
  for (let i = 0; i < numPatterns; i++) {
    const cells: TrackerCell[][] = [];
    for (let row = 0; row < defaultSteps; row++) {
      const rowCells: TrackerCell[] = [];
      for (let ch = 0; ch < numChannels; ch++) {
        rowCells.push({ note: 0, instrument: -1, volume: -1, effects: [] });
      }
      cells.push(rowCells);
    }
    patterns.push({ rows: defaultSteps, channels: numChannels, cells });
  }

  const instruments: InstrumentConfig[] = [];
  for (let i = 0; i < numInstruments; i++) {
    instruments.push({
      id: i + 1,
      name: `Inst ${i.toString(16).toUpperCase().padStart(2, '0')}`,
      type: 'Klystrack' as InstrumentConfig['type'],
      synthType: 'KlysSynth',
      volume: -6,
    } as InstrumentConfig);
  }

  // Song positions (global, maps to first channel's sequence — klystrack doesn't use global positions)
  const songPositions = Array.from({ length: Math.max(1, songLength) }, (_, i) => i % Math.max(1, numPatterns));

  // BPM estimation from song_rate
  const bpm = songRate > 0 ? Math.round((songRate * 60) / (songSpeed + songSpeed2 || 6)) : 125;

  const klysNative: KlysNativeData = {
    channels: numChannels,
    songLength,
    loopPoint,
    songSpeed,
    songSpeed2,
    songRate,
    masterVolume,
    flags,
    patterns: [], // populated from WASM
    sequences: [], // populated from WASM
    instruments: [], // populated from WASM
  };

  const format: TrackerFormat = 'KT';

  return {
    name: title || 'Untitled',
    format,
    patterns,
    instruments,
    songPositions,
    songLength: songLength || 1,
    restartPosition: loopPoint,
    numChannels,
    initialSpeed: songSpeed,
    initialBPM: bpm,
    speed2: songSpeed2,
    hz: songRate,
    klysNative,
    klysFileData: buf.slice(0), // copy for WASM
  };
}
