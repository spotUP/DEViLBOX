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
import type { UADEPatternLayout, UADEVariablePatternLayout } from '@/engine/uade/UADEPatternEncoder';
import { encodeKlysCell, klysVariableEncoder } from '@/engine/uade/encoders/KlysEncoder';

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

// ─── Structural raw-block carrier (byte-exact round-trip) ─────────────────────
//
// klystrack's on-disk pattern packing (bit-packed presence nibbles + VOLUME in
// the CTRL byte high bits) has no naive byte-exact inverse. To make an unedited
// module re-export identically, we parse the whole .kt stream LINEARLY — mirroring
// `mus_load_song_RW` in klystrack-wasm/common/music.c — to recover each pattern's
// REAL [offset, size) in the file, carry the original bytes verbatim, and fall back
// to the real packer (KlysEncoder.encodeKlysPattern) the moment a cell is edited.
//
// The parse is validated by a decisive oracle: after the trailing wavetable block
// the cursor MUST equal the file length. Any misalignment (wrong field size in fx /
// instrument / sequence skipping) fails that check, and we simply omit the carrier
// rather than ship a wrong parse.

const PAK_BIT_NOTE = 1;
const PAK_BIT_INST = 2;
const PAK_BIT_CTRL = 4;
const PAK_BIT_CMD = 8;
const PAK_BIT_VOLUME = 128;
const KLYS_NOTE_NONE = 0xff;
const KLYS_NO_INSTRUMENT = 0xff;
const KLYS_NO_VOLUME = 0xff;
const KLYS_INSTRUMENT_NAME_SIZE = 33; // MUS_INSTRUMENT_NAME_LEN + 1
const KLYS_SONG_TITLE_SIZE = 65; // MUS_SONG_TITLE_LEN + 1

/** Skip one serialized FX bus (inner_load_fx in music.c). */
function skipKlysFx(r: BinaryReader, version: number): void {
  if (version >= 22) {
    const len = r.readU8();
    if (len) r.skip(Math.min(len, 16)); // sizeof(fx->name) = 16
  }
  r.skip(4); // flags
  r.skip(5); // crush.bit_drop, chr.rate, chr.min_delay, chr.max_delay, chr.sep
  if (version < 27) r.skip(1); // spread (only steers computed taps 8..15, not read)
  if (version < 21) r.skip(1); // padding
  const taps = version < 27 ? 8 : 16; // CYDRVB_TAPS
  for (let i = 0; i < taps; i++) {
    r.skip(4); // delay (u16), gain (s16)
    if (version >= 27) r.skip(2); // panning, flags
  }
  r.skip(1); // crushex.downsample
  if (version >= 19) r.skip(1); // crushex.gain
}

/** Skip one serialized instrument (mus_load_instrument_RW, wavetable_entries = NULL). */
function skipKlysInstrument(r: BinaryReader, version: number): void {
  r.skip(4); // flags (u32)
  r.skip(4); // cydflags (u32)
  r.skip(4); // adsr (a,d,s,r u8)
  r.skip(1); // sync_source
  r.skip(1); // ring_mod
  r.skip(2); // pw (u16)
  r.skip(1); // volume
  const progsteps = r.readU8();
  r.skip(progsteps * 2); // program (u16 each)
  r.skip(1); // prog_period
  r.skip(5); // vibrato_speed, vibrato_depth, pwm_speed, pwm_depth, slide_speed
  r.skip(1); // base_note
  if (version >= 20) r.skip(1); // finetune (s8)
  let len = 16;
  if (version >= 11) len = r.readU8();
  if (len) r.skip(Math.min(len, KLYS_INSTRUMENT_NAME_SIZE)); // name
  if (version >= 1) {
    r.skip(2); // cutoff (u16)
    r.skip(1); // resonance
    r.skip(1); // flttype
  }
  if (version >= 7) {
    r.skip(1); // ym_env_shape
    r.skip(2); // buzz_offset (s16)
  }
  if (version >= 10) r.skip(1); // fx_bus
  if (version >= 11) {
    r.skip(1); // vib_shape
    r.skip(1); // vib_delay
    r.skip(1); // pwm_shape
  }
  if (version >= 18) r.skip(1); // lfsr_type
  if (version >= 12) r.skip(1); // wavetable_entry
  if (version >= 23) {
    r.skip(4); // fm_flags (u32)
    r.skip(1); // fm_modulation
    r.skip(1); // fm_feedback
    r.skip(1); // fm_harmonic
    r.skip(4); // fm_adsr
  }
  if (version >= 25) r.skip(1); // fm_attack_start
  if (version >= 23) r.skip(1); // fm_wave
}

/** Skip one serialized wavetable entry (load_wavetable_entry in music.c, v>=12). */
function skipKlysWavetable(r: BinaryReader, version: number): void {
  // flags(u32), sample_rate(u32), samples(u32), loop_begin(u32), loop_end(u32), base_note(u16)
  r.skip(4);
  r.skip(4);
  const samples = r.readU32LE();
  r.skip(4);
  r.skip(4);
  r.skip(2);
  if (samples > 0) {
    if (version < 15) {
      r.skip(samples * 2); // Sint16 PCM
    } else {
      const dataSizeBits = r.readU32LE();
      r.skip((dataSizeBits + 7) >> 3); // compressed, data_size is in bits
    }
  }
}

/** Decode one klystrack pattern block into carrier rows; advances the reader. */
function decodeKlysPatternBlock(r: BinaryReader, version: number): TrackerCell[] {
  const steps = r.readU16LE();
  if (version >= 24) r.readU8(); // color
  const rows: TrackerCell[] = [];
  if (version < 8) {
    // Legacy fixed-size steps (pre-packing); not expected for modern fixtures.
    const stepSize = version < 2 ? 3 : 3 + 2 + 1;
    for (let s = 0; s < steps; s++) {
      const note = r.readU8();
      const instrument = r.readU8();
      r.readU8(); // ctrl
      const command = r.readU16LE();
      let volume = KLYS_NO_VOLUME;
      if (stepSize > 6) volume = r.readU8();
      rows.push(makeKlysCell(note, instrument, volume, command));
    }
    return rows;
  }
  const nibbleLen = (steps >> 1) + (steps & 1);
  const packed = r.readBytes(nibbleLen);
  let ci = 0;
  for (let s = 0; s < steps; s++) {
    const isLow = (s & 1) !== 0 || s === steps - 1;
    let bits = isLow ? packed[ci] & 0xf : packed[ci] >> 4;
    let note = KLYS_NOTE_NONE;
    let instrument = KLYS_NO_INSTRUMENT;
    let command = 0;
    let volume = KLYS_NO_VOLUME;
    if (bits & PAK_BIT_NOTE) note = r.readU8();
    if (bits & PAK_BIT_INST) instrument = r.readU8();
    if (bits & PAK_BIT_CTRL) {
      const ctrl = r.readU8();
      if (version >= 14) bits |= ctrl & ~7;
    }
    if (bits & PAK_BIT_CMD) command = r.readU16LE();
    if (bits & PAK_BIT_VOLUME) volume = r.readU8();
    rows.push(makeKlysCell(note, instrument, volume, command));
    if (s & 1) ci++;
  }
  return rows;
}

/** Build a carrier cell from raw klystrack step fields (0xFF = absent). */
function makeKlysCell(note: number, instrument: number, volume: number, command: number): TrackerCell {
  return {
    note,
    instrument,
    volume,
    effect: '',
    effTyp: (command >> 8) & 0xff,
    eff: command & 0xff,
    effTyp2: 0,
    eff2: 0,
  };
}

interface KlysBlockCarrier {
  numChannels: number;
  numPatterns: number;
  filePatternAddrs: number[];
  filePatternSizes: number[];
  blockRawBytes: Uint8Array[];
  blockRows: TrackerCell[][];
}

/**
 * Fully parse a .kt file linearly to recover each pattern's real file offset/size
 * and decode its carrier rows. Returns null when the parse cannot be validated
 * (cursor != EOF) so the caller omits the carrier rather than shipping a wrong parse.
 */
function parseKlysBlocks(buf: ArrayBuffer): KlysBlockCarrier | null {
  try {
    const bytes = new Uint8Array(buf);
    const r = new BinaryReader(buf);
    if (r.readString(8) !== SONG_SIG) return null;
    const version = r.readU8();
    if (version > MUS_VERSION) return null;

    const numChannels = version >= 6 ? r.readU8() : version > 3 ? 4 : 3;
    r.skip(2); // time_signature (u16)
    if (version >= 17) r.skip(2); // sequence_step (u16)
    const numInstruments = r.readU8();
    const numPatterns = r.readU16LE();
    const numSequences: number[] = [];
    for (let i = 0; i < numChannels; i++) numSequences.push(r.readU16LE());
    r.skip(2); // song_length
    r.skip(2); // loop_point
    if (version >= 12) r.skip(1); // master_volume
    r.skip(1); // song_speed
    r.skip(1); // song_speed2
    r.skip(1); // song_rate (u8)
    if (version > 2) r.skip(4); // flags (u32)
    if (version >= 9) r.skip(1); // multiplex_period
    if (version >= 16) r.skip(1); // pitch_inaccuracy
    let titleLen = 17;
    if (version >= 11) titleLen = r.readU8();
    if (version >= 5) r.skip(Math.min(titleLen, KLYS_SONG_TITLE_SIZE)); // title

    // FX buses. v>=10 stores an explicit count of serialized CydFxSerialized;
    // pre-v10 reverb (MUS_ENABLE_REVERB) is not exercised by modern fixtures and
    // would fail the EOF oracle below, safely omitting the carrier.
    if (version >= 10) {
      const nFx = r.readU8();
      for (let i = 0; i < nFx; i++) skipKlysFx(r, version);
    }

    if (version >= 13) {
      r.skip(numChannels); // default_volume
      r.skip(numChannels); // default_panning
    }

    for (let i = 0; i < numInstruments; i++) skipKlysInstrument(r, version);

    for (let i = 0; i < numChannels; i++) {
      const n = numSequences[i];
      if (n <= 0) continue;
      if (version < 8) {
        r.skip(n * 5); // position(u16)+pattern(u16)+note_offset(s8)
      } else {
        for (let s = 0; s < n; s++) r.skip(5);
      }
    }

    const filePatternAddrs: number[] = [];
    const filePatternSizes: number[] = [];
    const blockRawBytes: Uint8Array[] = [];
    const blockRows: TrackerCell[][] = [];
    for (let i = 0; i < numPatterns; i++) {
      const start = r.offset;
      const rows = decodeKlysPatternBlock(r, version);
      const size = r.offset - start;
      filePatternAddrs.push(start);
      filePatternSizes.push(size);
      blockRawBytes.push(bytes.slice(start, start + size));
      blockRows.push(rows);
    }

    if (version >= 12) {
      const maxWt = r.readU8();
      for (let i = 0; i < maxWt; i++) skipKlysWavetable(r, version);
      if (version >= 26) {
        for (let i = 0; i < maxWt; i++) {
          const len = r.readU8();
          r.skip(len);
        }
      }
    }

    // Decisive oracle: a correct linear parse ends exactly at EOF.
    if (r.offset !== bytes.length) return null;
    return { numChannels, numPatterns, filePatternAddrs, filePatternSizes, blockRawBytes, blockRows };
  } catch {
    return null;
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
    ymEnvShape: 0,
    buzzOffset: 0,
    fxBus: 0,
    vibShape: 0,
    vibDelay: 0,
    pwmShape: 0,
    lfsrType: 0,
    wavetableEntry: 0,
    ringMod: 0,
    syncSource: 0,
    fm: { flags: 0, modulation: 0, feedback: 0, wave: 0, harmonic: 0, adsr: { a: 0, d: 0, s: 0, r: 0 }, attackStart: 0 },
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

  // Build pattern layout for editing infrastructure.
  // Klystrack patterns are stored in WASM memory; we provide the encoder
  // so the editing infrastructure knows how to serialize cells.
  // patternDataFileOffset = 0 (WASM-managed); offsets computed by WASM callback.
  const bytesPerCell = 6;
  const defaultStepsPerPat = 64;
  const uadePatternLayout: UADEPatternLayout = {
    formatId: 'klystrack',
    patternDataFileOffset: 0,
    bytesPerCell,
    rowsPerPattern: defaultStepsPerPat,
    numChannels,
    numPatterns: numPatterns,
    moduleSize: buf.byteLength,
    encodeCell: encodeKlysCell,
  };

  // Structural raw-block carrier: a full linear parse recovers each pattern's real
  // file [offset, size) so an unedited module re-exports byte-for-byte. Omitted
  // (undefined) when the parse can't be validated to EOF.
  const carrier = parseKlysBlocks(buf);
  let uadeVariableLayout: UADEVariablePatternLayout | undefined;
  if (carrier) {
    uadeVariableLayout = {
      formatId: 'klystrack',
      numChannels: 1, // klystrack patterns are single-channel step lists
      numFilePatterns: carrier.numPatterns,
      rowsPerPattern: carrier.blockRows.map((rows) => rows.length),
      moduleSize: buf.byteLength,
      encoder: klysVariableEncoder,
      filePatternAddrs: carrier.filePatternAddrs,
      filePatternSizes: carrier.filePatternSizes,
      trackMap: [],
      blockRows: carrier.blockRows,
      blockRawBytes: carrier.blockRawBytes,
    };
  }

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
    uadePatternLayout,
    uadeVariableLayout,
  };
}
