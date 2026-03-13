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
import type { Pattern, TrackerCell, ChannelData, InstrumentConfig, KlysNativeData } from '@/types';

const SONG_SIG = 'cyd!song';
const INST_SIG = 'cyd!inst';
const MUS_VERSION = 27;

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

  // Time signature (advance read position)
  r.readU8();

  // Sequence step (tick subdivision)
  if (version >= 17) {
    r.readU8();
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

  // Multiplex period (advance read position)
  if (version >= 9) r.readU8();

  // Pitch inaccuracy (advance read position)
  if (version >= 16) r.readU8();

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
  if (version >= 10) {
    r.readU8(); // nFx
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
    const channels: ChannelData[] = [];
    for (let ch = 0; ch < numChannels; ch++) {
      const rows: TrackerCell[] = [];
      for (let row = 0; row < defaultSteps; row++) {
        rows.push({ note: 0, instrument: -1, volume: -1, effect: '', effTyp: 0, eff: 0, effTyp2: 0, eff2: 0 });
      }
      channels.push({
        id: `p${i}-ch${ch}`,
        name: `Ch ${ch + 1}`,
        rows,
        muted: false,
        solo: false,
        collapsed: false,
        volume: 100,
        pan: 0,
        instrumentId: null,
        color: null,
      });
    }
    patterns.push({ id: `pat-${i}`, name: `Pattern ${i}`, length: defaultSteps, channels });
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

  // Pre-populate klysNative with stub data so KlysView has something to display
  // immediately. WASM onSongData callback will overwrite with real data when ready.
  const nativePatterns: KlysNativeData['patterns'] = patterns.map(p => ({
    numSteps: p.length,
    steps: Array.from({ length: p.length }, () => ({
      note: 0,
      instrument: 0xFF,
      ctrl: 0,
      volume: 0,
      command: 0,
    })),
  }));

  const nativeSequences: KlysNativeData['sequences'] = Array.from(
    { length: numChannels },
    (_) => ({
      entries: songPositions.map((pat, pos) => ({
        position: pos,
        pattern: pat,
        noteOffset: 0,
      })),
    }),
  );

  const nativeInstruments: KlysNativeData['instruments'] = instruments.map(i => ({
    name: i.name,
    adsr: { a: 0, d: 0, s: 127, r: 0 },
    flags: 0,
    cydflags: 0,
    baseNote: 60,
    finetune: 0,
    slideSpeed: 0,
    pw: 128,
    volume: 100,
    progPeriod: 0,
    vibratoSpeed: 0,
    vibratoDepth: 0,
    pwmSpeed: 0,
    pwmDepth: 0,
    cutoff: 255,
    resonance: 0,
    flttype: 0,
    fxBus: 0,
    buzzOffset: 0,
    ringMod: 0,
    syncSource: 0,
    wavetableEntry: 0,
    fm: { modulation: 0, feedback: 0, harmonic: 0, adsr: { a: 0, d: 0, s: 0, r: 0 } },
    program: [],
  }));

  const klysNative: KlysNativeData = {
    channels: numChannels,
    songLength,
    loopPoint,
    songSpeed,
    songSpeed2,
    songRate,
    masterVolume,
    flags,
    patterns: nativePatterns,
    sequences: nativeSequences,
    instruments: nativeInstruments,
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
