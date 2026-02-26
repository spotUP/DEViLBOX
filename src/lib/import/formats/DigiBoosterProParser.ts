/**
 * DigiBoosterProParser.ts — DigiBooster Pro (.dbm) native parser
 *
 * DigiBooster Pro is an Amiga tracker by Toni Lönnberg. The .dbm format
 * uses an IFF-like chunk structure. This is DIFFERENT from DigiBooster 1.x
 * (.digi) which is handled by DigiBoosterParser.ts.
 *
 * File layout:
 *   Header (8 bytes):
 *     magic[4]   = "DBM0"
 *     trkVerHi   uint8  (tracker version major; must be <= 3)
 *     trkVerLo   uint8
 *     reserved[2]
 *
 *   Followed by IFF chunks until EOF. Each chunk:
 *     id[4]      4-byte ASCII chunk identifier (big-endian)
 *     length     uint32BE
 *     data       <length> bytes
 *
 * Chunk IDs:
 *   "NAME" — song name (raw string, no null terminator required)
 *   "INFO" — global info: uint16BE × 5
 *              numInstruments, numSamples, numSongs, numPatterns, numChannels
 *   "SONG" — song order lists (one per sub-song):
 *              name[44] + uint16BE numOrders + numOrders × uint16BE pattern indices
 *   "INST" — instrument headers (50 bytes each)
 *   "VENV" — volume envelopes (not used for pattern display)
 *   "PENV" — panning envelopes (not used for pattern display)
 *   "PATT" — pattern data
 *   "PNAM" — pattern names (1-byte encoding prefix + variable-length names)
 *   "SMPL" — sample PCM data
 *   "DSPE" — DSP echo settings (skipped)
 *   "MPEG" — MPEG-compressed samples (not supported; skipped)
 *
 * Instrument header (50 bytes, big-endian):
 *   name[30]       — null-terminated or padded
 *   sample uint16  — 1-based sample index (0 = no sample)
 *   volume uint16  — 0-64
 *   sampleRate uint32 — C5 base rate
 *   loopStart uint32
 *   loopLength uint32
 *   panning int16  — -128..128
 *   flags uint16   — 0x01=loop, 0x02=pingpong
 *
 * Pattern data (from PATT chunk):
 *   Per pattern:
 *     numRows    uint16BE
 *     packedSize uint32BE
 *     <packed data>
 *   Packed data (stream of events):
 *     0x00 = end of row
 *     ch (1-based channel number), then mask byte:
 *       bit 0: note follows
 *       bit 1: instrument follows
 *       bit 2: c2 (command2) follows
 *       bit 3: p2 (param2) follows
 *       bit 4: c1 (command1) follows
 *       bit 5: p1 (param1) follows
 *   Note encoding: 0x1F = key-off;
 *     else ((rawNote >> 4) * 12) + (rawNote & 0x0F) + 13
 *
 * Sample PCM data (from SMPL chunk):
 *   Per sample:
 *     flags  uint32BE  — bits 0-2: 1=8-bit, 2=16-bit, 4=32-bit
 *     length uint32BE  — number of sample frames
 *     data   — big-endian signed PCM (8, 16, or 32 bit)
 *
 * Amiga LRRL stereo panning: channels 0,3 → -50, channels 1,2 → +50
 * (repeating for channel indices modulo 4).
 *
 * Reference: Reference Code/openmpt-master/soundlib/Load_dbm.cpp (authoritative)
 */

import type { TrackerSong, TrackerFormat } from '@/engine/TrackerReplayer';
import type { Pattern, ChannelData, TrackerCell, InstrumentConfig } from '@/types';

// ── Binary reader ─────────────────────────────────────────────────────────────

class Reader {
  public pos: number;
  private data: Uint8Array;
  private view: DataView;

  constructor(data: Uint8Array, offset = 0) {
    this.data = data;
    this.view = new DataView(data.buffer, data.byteOffset, data.byteLength);
    this.pos  = offset;
  }

  get length(): number    { return this.data.length; }
  get remaining(): number { return this.data.length - this.pos; }
  canRead(n: number): boolean { return this.pos + n <= this.data.length; }

  u8(): number {
    if (!this.canRead(1)) throw new Error('EOF');
    return this.data[this.pos++];
  }

  u16be(): number {
    if (!this.canRead(2)) throw new Error('EOF');
    const v = this.view.getUint16(this.pos, false);
    this.pos += 2;
    return v;
  }

  u32be(): number {
    if (!this.canRead(4)) throw new Error('EOF');
    const v = this.view.getUint32(this.pos, false);
    this.pos += 4;
    return v;
  }

  bytes(n: number): Uint8Array {
    if (!this.canRead(n)) throw new Error('EOF');
    const slice = this.data.slice(this.pos, this.pos + n);
    this.pos += n;
    return slice;
  }

  skip(n: number): void {
    this.pos = Math.min(this.pos + n, this.data.length);
  }
}

// ── String helpers ────────────────────────────────────────────────────────────

/** Read an Amiga (ISO-8859-1 compatible) null-terminated/padded string. */
function amigaString(data: Uint8Array, offset: number, maxLen: number): string {
  let s = '';
  const end = Math.min(offset + maxLen, data.length);
  for (let i = offset; i < end; i++) {
    const c = data[i];
    if (c === 0) break;
    s += (c >= 0x20 && c < 0x80) ? String.fromCharCode(c)
       : (c >= 0xA0)              ? String.fromCharCode(c)
       : ' ';
  }
  return s.trimEnd();
}

// ── Chunk map builder ─────────────────────────────────────────────────────────

interface DBMChunk {
  id:   string;
  data: Uint8Array;
}

/**
 * Parse all IFF-style chunks from the body (after the 8-byte file header).
 * Returns a map of chunk-ID → array of chunks with that ID (preserving order).
 */
function readChunks(data: Uint8Array, startOffset: number): Map<string, DBMChunk[]> {
  const map = new Map<string, DBMChunk[]>();
  const r = new Reader(data, startOffset);

  while (r.canRead(8)) {
    const id  = String.fromCharCode(r.u8(), r.u8(), r.u8(), r.u8());
    const len = r.u32be();
    if (!r.canRead(len)) break;
    const chunkData = r.bytes(len);
    if (!map.has(id)) map.set(id, []);
    map.get(id)!.push({ id, data: chunkData });
  }

  return map;
}

function firstChunk(map: Map<string, DBMChunk[]>, id: string): Uint8Array | null {
  const chunks = map.get(id);
  return (chunks && chunks.length > 0) ? chunks[0].data : null;
}

// ── DBM effect conversion ─────────────────────────────────────────────────────
//
// Mirrors the dbmEffects[] table and ConvertDBMEffect() in Load_dbm.cpp.
// We store effects as XM effTyp/eff values for display purposes.

const DBM_EFFECT_MAP: readonly number[] = [
  0x00, // 0  Arpeggio
  0x01, // 1  Portamento Up
  0x02, // 2  Portamento Down
  0x03, // 3  Tone Portamento
  0x04, // 4  Vibrato
  0x05, // 5  Tone Porta + Vol Slide
  0x06, // 6  Vibrato + Vol Slide
  0x07, // 7  Tremolo
  0x08, // 8  Set Panning
  0x09, // 9  Sample Offset
  0x0A, // 10 Volume Slide
  0x0B, // 11 Position Jump
  0x0C, // 12 Set Volume
  0x0D, // 13 Pattern Break
  0x0E, // 14 Extended (MOD Exx)
  0x0F, // 15 Set Tempo/Speed (Fxx)
  0x10, // 16 Global Volume (Gxx)
  0x11, // 17 Global Vol Slide (Hxx)
  0x00, // 18 (none)
  0x00, // 19 (none)
  0x14, // 20 Key Off (Kxx)
  0x15, // 21 Set Envelope Position (Lxx)
  0x00, // 22 (none)
  0x00, // 23 (none)
  0x00, // 24 (none)
  0x19, // 25 Panning Slide (Pxx)
  0x00, // 26 (none)
  0x00, // 27 (none)
  0x00, // 28 (none)
  0x00, // 29 (none)
  0x00, // 30 (none)
  0x00, // 31 DBM Echo Toggle (Vxx) — no XM equivalent
  0x00, // 32 Echo Delay (Wxx)      — no XM equivalent
  0x00, // 33 Echo Feedback (Xxx)   — no XM equivalent
  0x00, // 34 Echo Mix (Yxx)        — no XM equivalent
  0x00, // 35 Echo Cross (Zxx)      — no XM equivalent
];

function convertDBMEffect(cmd: number, param: number): { effTyp: number; eff: number } {
  let effTyp = (cmd < DBM_EFFECT_MAP.length) ? DBM_EFFECT_MAP[cmd] : 0;
  let eff    = param;

  // If cmd is in the map but maps to 0x00, only keep if it's cmd 0 (arpeggio)
  // and param != 0. Otherwise discard.
  if (effTyp === 0x00 && cmd !== 0) {
    return { effTyp: 0, eff: 0 };
  }

  switch (cmd) {
    case 0: // Arpeggio — 0x00 param means no arpeggio
      if (param === 0) effTyp = 0;
      break;

    case 13: // Pattern break — packed BCD → decimal (mirrors Load_dbm.cpp)
      eff = ((param >> 4) * 10) + (param & 0x0F);
      break;

    case 10: // Volume slide
    case 5:  // Tone porta + vol slide
    case 6:  // Vibrato + vol slide
      // DBM: up nibble has priority.
      // If both nibbles set and up nibble is not 0xF and down nibble is not 0xF:
      if ((param & 0xF0) !== 0x00 && (param & 0xF0) !== 0xF0 && (param & 0x0F) !== 0x0F) {
        eff = param & 0xF0;
      }
      break;

    case 16: // Global volume: DBM 0-64 → XM 0-128
      eff = param <= 64 ? param * 2 : 128;
      break;

    case 15: // Tempo/Speed: <= 0x1F → speed; > 0x1F → BPM (Fxx handles both in XM)
      // effTyp already 0x0F; just keep param as-is
      break;

    default:
      break;
  }

  return { effTyp, eff };
}

// ── WAV helpers for PCM sample data ──────────────────────────────────────────

function pcm8ToWAV(pcm: Uint8Array, rate: number): ArrayBuffer {
  const numSamples = pcm.length;
  const dataSize   = numSamples * 2; // expand to 16-bit for WAV
  const fileSize   = 44 + dataSize;
  const buf  = new ArrayBuffer(fileSize);
  const view = new DataView(buf);

  // RIFF header
  view.setUint8(0,  0x52); view.setUint8(1,  0x49); view.setUint8(2,  0x46); view.setUint8(3,  0x46); // "RIFF"
  view.setUint32(4, fileSize - 8, true);
  view.setUint8(8,  0x57); view.setUint8(9,  0x41); view.setUint8(10, 0x56); view.setUint8(11, 0x45); // "WAVE"
  // fmt chunk
  view.setUint8(12, 0x66); view.setUint8(13, 0x6D); view.setUint8(14, 0x74); view.setUint8(15, 0x20); // "fmt "
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);       // PCM
  view.setUint16(22, 1, true);       // mono
  view.setUint32(24, rate, true);
  view.setUint32(28, rate * 2, true);
  view.setUint16(32, 2, true);
  view.setUint16(34, 16, true);
  // data chunk
  view.setUint8(36, 0x64); view.setUint8(37, 0x61); view.setUint8(38, 0x74); view.setUint8(39, 0x61); // "data"
  view.setUint32(40, dataSize, true);

  let off = 44;
  for (let i = 0; i < numSamples; i++) {
    const s8 = pcm[i] < 128 ? pcm[i] : pcm[i] - 256;
    view.setInt16(off, s8 * 256, true);
    off += 2;
  }
  return buf;
}

function pcm16BeToWAV(pcmData: Uint8Array, frames: number, rate: number): ArrayBuffer {
  // pcmData is big-endian 16-bit signed; convert to little-endian for WAV
  const dataSize = frames * 2;
  const fileSize = 44 + dataSize;
  const buf  = new ArrayBuffer(fileSize);
  const view = new DataView(buf);

  view.setUint8(0,  0x52); view.setUint8(1,  0x49); view.setUint8(2,  0x46); view.setUint8(3,  0x46);
  view.setUint32(4, fileSize - 8, true);
  view.setUint8(8,  0x57); view.setUint8(9,  0x41); view.setUint8(10, 0x56); view.setUint8(11, 0x45);
  view.setUint8(12, 0x66); view.setUint8(13, 0x6D); view.setUint8(14, 0x74); view.setUint8(15, 0x20);
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, 1, true);
  view.setUint32(24, rate, true);
  view.setUint32(28, rate * 2, true);
  view.setUint16(32, 2, true);
  view.setUint16(34, 16, true);
  view.setUint8(36, 0x64); view.setUint8(37, 0x61); view.setUint8(38, 0x74); view.setUint8(39, 0x61);
  view.setUint32(40, dataSize, true);

  const srcView = new DataView(pcmData.buffer, pcmData.byteOffset, pcmData.byteLength);
  let off = 44;
  for (let i = 0; i < frames; i++) {
    const sample = srcView.getInt16(i * 2, false); // read big-endian
    view.setInt16(off, sample, true);              // write little-endian
    off += 2;
  }
  return buf;
}

function wavToDataUrl(wavBuf: ArrayBuffer): string {
  const wavBytes = new Uint8Array(wavBuf);
  let binary = '';
  const CHUNK = 8192;
  for (let i = 0; i < wavBytes.length; i += CHUNK) {
    binary += String.fromCharCode(
      ...Array.from(wavBytes.subarray(i, Math.min(i + CHUNK, wavBytes.length)))
    );
  }
  return `data:audio/wav;base64,${btoa(binary)}`;
}

// ── Instrument structures ─────────────────────────────────────────────────────

interface DBMInstrumentInfo {
  name:       string;
  sample:     number;  // 1-based sample index (0 = no sample)
  volume:     number;  // 0-64
  sampleRate: number;  // C5 base rate in Hz
  loopStart:  number;  // frames
  loopLength: number;  // frames
  panning:    number;  // -128..128
  flags:      number;  // 0x01=loop, 0x02=pingpong
}

const INST_SIZE = 50;

function readInstruments(data: Uint8Array, count: number): DBMInstrumentInfo[] {
  const result: DBMInstrumentInfo[] = [];
  const view = new DataView(data.buffer, data.byteOffset, data.byteLength);

  for (let i = 0; i < count; i++) {
    const base = i * INST_SIZE;
    if (base + INST_SIZE > data.length) break;

    const name       = amigaString(data, base, 30);
    const sample     = view.getUint16(base + 30, false);
    const volume     = view.getUint16(base + 32, false);
    const sampleRate = view.getUint32(base + 34, false);
    const loopStart  = view.getUint32(base + 38, false);
    const loopLength = view.getUint32(base + 42, false);
    const panning    = view.getInt16(base + 46, false);
    const flags      = view.getUint16(base + 48, false);

    result.push({ name, sample, volume, sampleRate, loopStart, loopLength, panning, flags });
  }

  return result;
}

// ── Sample PCM reader ─────────────────────────────────────────────────────────

interface DBMSamplePCM {
  frames: number;
  bits:   number;      // 8, 16, or 0 (unsupported/empty)
  data:   Uint8Array;
}

/**
 * Read all raw sample PCM entries from the SMPL chunk.
 * Each entry: uint32BE flags, uint32BE length (frames), then PCM data.
 * flags bit 0=8-bit, bit 1=16-bit, bit 2=32-bit. DBM stores big-endian signed PCM.
 * Mirrors the sample-reading loop in CSoundFile::ReadDBM().
 */
function readSamplePCM(smplData: Uint8Array, numSamples: number): DBMSamplePCM[] {
  const result: DBMSamplePCM[] = [];
  const r = new Reader(smplData);

  for (let i = 0; i < numSamples; i++) {
    if (!r.canRead(8)) break;
    const flags  = r.u32be();
    const frames = r.u32be();

    const bitFlag = flags & 7;
    let bits = 0;
    if (bitFlag & 1) bits = 8;
    else if (bitFlag & 2) bits = 16;
    else if (bitFlag & 4) bits = 32;

    if (bits === 0 || frames === 0) {
      result.push({ frames: 0, bits: 0, data: new Uint8Array(0) });
      continue;
    }

    const byteCount = frames * (bits / 8);
    if (!r.canRead(byteCount)) {
      result.push({ frames: 0, bits, data: new Uint8Array(0) });
      break;
    }
    const data = r.bytes(byteCount);
    result.push({ frames, bits, data });
  }

  return result;
}

// ── Build InstrumentConfig ────────────────────────────────────────────────────

/**
 * Build an InstrumentConfig from a DBM instrument header + raw PCM data.
 * - 8-bit samples: convert to 16-bit WAV.
 * - 16-bit big-endian: convert to 16-bit little-endian WAV.
 * - 32-bit: downsample to 16-bit by taking upper 16 bits (big-endian).
 * - No PCM: return a bare placeholder with required fields.
 */
function buildInstrumentConfig(
  id: number,
  inst: DBMInstrumentInfo,
  pcm: DBMSamplePCM | undefined,
): InstrumentConfig {
  const vol   = Math.min(inst.volume, 64);
  const volDB = vol > 0 ? 20 * Math.log10(vol / 64) : -60;

  // OpenMPT: nC5Speed = Util::muldivr(sampleRate, 8303, 8363)
  const sampleRate = inst.sampleRate > 0
    ? Math.round((inst.sampleRate * 8303) / 8363)
    : 8287;

  const hasLoop = inst.loopLength > 0 && (inst.flags & 3) !== 0;
  const loopEnd = hasLoop ? inst.loopStart + inst.loopLength : 0;
  const name    = inst.name || `Instrument ${id}`;

  if (!pcm || pcm.frames === 0 || pcm.data.length === 0) {
    return {
      id,
      name,
      type:      'sample' as const,
      synthType: 'Sampler' as const,
      effects:   [],
      volume:    0,
      pan:       0,
    } as unknown as InstrumentConfig;
  }

  let wavBuf: ArrayBuffer;

  if (pcm.bits === 8) {
    wavBuf = pcm8ToWAV(pcm.data, sampleRate);
  } else if (pcm.bits === 16) {
    wavBuf = pcm16BeToWAV(pcm.data, pcm.frames, sampleRate);
  } else {
    // 32-bit: take upper 16 bits (big-endian bytes 0-1 of each 4-byte frame)
    const numFrames = Math.floor(pcm.data.length / 4);
    // Convert: extract the high 2 bytes of each 32-bit big-endian sample
    const reduced = new Uint8Array(numFrames * 2);
    for (let i = 0; i < numFrames; i++) {
      reduced[i * 2]     = pcm.data[i * 4];
      reduced[i * 2 + 1] = pcm.data[i * 4 + 1];
    }
    wavBuf = pcm16BeToWAV(reduced, numFrames, sampleRate);
  }

  const dataUrl = wavToDataUrl(wavBuf);

  return {
    id,
    name,
    type:      'sample' as const,
    synthType: 'Sampler' as const,
    effects:   [],
    volume:    volDB,
    pan:       0,
    sample: {
      audioBuffer: wavBuf,
      url:         dataUrl,
      baseNote:    'C3',
      detune:      0,
      loop:        hasLoop,
      loopType:    hasLoop
        ? ((inst.flags & 2) ? 'pingpong' as const : 'forward' as const)
        : 'off' as const,
      loopStart:   inst.loopStart,
      loopEnd:     loopEnd > 0 ? loopEnd : pcm.frames,
      sampleRate,
      reverse:     false,
      playbackRate: 1.0,
    },
    metadata: {
      modPlayback: {
        usePeriodPlayback: false,
        periodMultiplier:  3546895,
        finetune:          0,
        defaultVolume:     vol,
      },
    },
  } as unknown as InstrumentConfig;
}

// ── Pattern parser ────────────────────────────────────────────────────────────

/**
 * Parse a single packed DBM pattern.
 * Returns an array of rows, each row being an array of TrackerCell per channel.
 * Mirrors the pattern-reading loop in CSoundFile::ReadDBM().
 *
 * Key-off note value: 97 (XM standard key-off = note 97).
 * Note encoding: rawNote 0x1F = key-off;
 *   else ((rawNote >> 4) * 12) + (rawNote & 0x0F) + 13
 *
 * Effect bit ordering (bits 2-5 of mask byte):
 *   bit 2 (0x04): c2 follows
 *   bit 3 (0x08): p2 follows
 *   bit 4 (0x10): c1 follows
 *   bit 5 (0x20): p1 follows
 */
function parsePattern(
  data: Uint8Array,
  numRows: number,
  numChannels: number,
): TrackerCell[][] {
  // [channelIndex][rowIndex]
  const channels: TrackerCell[][] = Array.from({ length: numChannels }, () =>
    Array.from({ length: numRows }, (): TrackerCell => ({
      note: 0, instrument: 0, volume: 0,
      effTyp: 0, eff: 0, effTyp2: 0, eff2: 0,
    })),
  );

  const r = new Reader(data);
  let row = 0;

  while (r.canRead(1) && row < numRows) {
    const ch = r.u8();

    if (ch === 0) {
      // End of row
      row++;
      continue;
    }

    if (!r.canRead(1)) break;
    const mask = r.u8();

    // ch is 1-based channel number; out-of-range → read bits but write to dummy
    const chIdx  = ch - 1;
    const inRange = (chIdx >= 0 && chIdx < numChannels && row < numRows);
    const cell    = inRange ? channels[chIdx][row] : null;

    // bit 0: note follows
    if (mask & 0x01) {
      if (!r.canRead(1)) break;
      const rawNote = r.u8();
      if (cell) {
        if (rawNote === 0x1F) {
          cell.note = 97; // key-off
        } else if (rawNote > 0 && rawNote < 0xFE) {
          cell.note = ((rawNote >> 4) * 12) + (rawNote & 0x0F) + 13;
        }
      }
    }

    // bit 1: instrument follows
    if (mask & 0x02) {
      if (!r.canRead(1)) break;
      const instr = r.u8();
      if (cell) cell.instrument = instr;
    }

    // bits 2-5: up to two effect command+param pairs.
    // Read order from Load_dbm.cpp: c2 (bit2), p2 (bit3), c1 (bit4), p1 (bit5)
    if (mask & 0x3C) {
      let c2 = 0, p2 = 0, c1 = 0, p1 = 0;
      if (mask & 0x04) { if (!r.canRead(1)) break; c2 = r.u8(); }
      if (mask & 0x08) { if (!r.canRead(1)) break; p2 = r.u8(); }
      if (mask & 0x10) { if (!r.canRead(1)) break; c1 = r.u8(); }
      if (mask & 0x20) { if (!r.canRead(1)) break; p1 = r.u8(); }

      if (cell) {
        const fx1 = convertDBMEffect(c1, p1);
        const fx2 = convertDBMEffect(c2, p2);
        cell.effTyp  = fx1.effTyp;
        cell.eff     = fx1.eff;
        cell.effTyp2 = fx2.effTyp;
        cell.eff2    = fx2.eff;
      }
    }
  }

  return channels;
}

// ── Order list parser ─────────────────────────────────────────────────────────

/** Parse the SONG chunk and extract a flat order list (all sub-songs concatenated). */
function readOrderList(songData: Uint8Array, numSongs: number): { name: string; orders: number[] } {
  const r = new Reader(songData);
  let firstName = '';
  const orders: number[] = [];

  for (let s = 0; s < numSongs; s++) {
    if (!r.canRead(46)) break;
    const nameBytes  = r.bytes(44);
    const songName   = amigaString(nameBytes, 0, 44);
    const numOrders  = r.u16be();

    if (s === 0) firstName = songName;

    for (let o = 0; o < numOrders; o++) {
      if (!r.canRead(2)) break;
      orders.push(r.u16be());
    }
  }

  return { name: firstName, orders };
}

// ── Format detection ──────────────────────────────────────────────────────────

/**
 * Returns true if the buffer starts with the DBM0 file header and the
 * tracker version major is <= 3.
 * Mirrors ValidateHeader() in Load_dbm.cpp.
 */
export function isDigiBoosterProFormat(bytes: Uint8Array): boolean {
  if (bytes.length < 8) return false;
  // magic "DBM0" = 0x44 0x42 0x4D 0x30
  if (bytes[0] !== 0x44 || bytes[1] !== 0x42 || bytes[2] !== 0x4D || bytes[3] !== 0x30) return false;
  // trkVerHi must be <= 3
  if (bytes[4] > 3) return false;
  return true;
}

// ── Main parser ───────────────────────────────────────────────────────────────

/**
 * Parse a DigiBooster Pro (.dbm) file into a TrackerSong.
 * Returns null on any validation failure (never throws).
 */
export function parseDigiBoosterProFile(bytes: Uint8Array, filename: string): TrackerSong | null {
  try {
    return _parseDigiBoosterProFile(bytes, filename);
  } catch {
    return null;
  }
}

function _parseDigiBoosterProFile(bytes: Uint8Array, filename: string): TrackerSong | null {
  if (!isDigiBoosterProFormat(bytes)) return null;

  // Header: 8 bytes. Body starts at offset 8.
  // Parse all IFF chunks
  const chunkMap = readChunks(bytes, 8);

  // ── INFO chunk (required) ─────────────────────────────────────────────────
  const infoData = firstChunk(chunkMap, 'INFO');
  if (!infoData || infoData.length < 10) return null;

  const infoView       = new DataView(infoData.buffer, infoData.byteOffset, infoData.byteLength);
  const numInstruments = infoView.getUint16(0, false);
  const numSamples     = infoView.getUint16(2, false);
  const numSongs       = infoView.getUint16(4, false);
  const numPatterns    = infoView.getUint16(6, false);
  const numChannels    = Math.max(1, Math.min(infoView.getUint16(8, false), 254));

  // ── NAME chunk (optional) ─────────────────────────────────────────────────
  let songName = '';
  const nameData = firstChunk(chunkMap, 'NAME');
  if (nameData && nameData.length > 0) {
    songName = amigaString(nameData, 0, nameData.length);
  }

  // ── SONG chunk → order list ───────────────────────────────────────────────
  const songData  = firstChunk(chunkMap, 'SONG');
  let orderList: number[] = [];
  if (songData) {
    const { name: firstSongName, orders } = readOrderList(songData, numSongs);
    orderList = orders;
    // If NAME chunk didn't give us a name, try the first SONG name
    if (!songName) songName = firstSongName;
  }

  if (!songName) {
    songName = filename.replace(/\.[^/.]+$/, '');
  }

  // ── INST chunk → instrument headers ──────────────────────────────────────
  const instData   = firstChunk(chunkMap, 'INST');
  const instHeaders: DBMInstrumentInfo[] = instData
    ? readInstruments(instData, numInstruments)
    : [];

  // ── SMPL chunk → raw PCM per sample ──────────────────────────────────────
  const smplData = firstChunk(chunkMap, 'SMPL');
  const samplePCMs: DBMSamplePCM[] = smplData
    ? readSamplePCM(smplData, numSamples)
    : [];

  // Build a map from 1-based sample index → PCM
  const sampleMap = new Map<number, DBMSamplePCM>();
  for (let i = 0; i < samplePCMs.length; i++) {
    sampleMap.set(i + 1, samplePCMs[i]);
  }

  // ── Build InstrumentConfig list ───────────────────────────────────────────
  const instruments: InstrumentConfig[] = [];
  for (let i = 0; i < instHeaders.length; i++) {
    const inst = instHeaders[i];
    const id   = i + 1;
    const pcm  = inst.sample > 0 ? sampleMap.get(inst.sample) : undefined;
    instruments.push(buildInstrumentConfig(id, inst, pcm));
  }

  // ── PATT chunk → patterns ─────────────────────────────────────────────────
  const pattData = firstChunk(chunkMap, 'PATT');
  const patterns: Pattern[] = [];

  if (pattData) {
    const r = new Reader(pattData);

    // PNAM chunk: 1-byte encoding prefix, then per-pattern length-prefixed names
    const pnamData    = firstChunk(chunkMap, 'PNAM');
    let pnamReader: Reader | null = pnamData ? new Reader(pnamData) : null;
    if (pnamReader && pnamReader.canRead(1)) {
      pnamReader.skip(1); // encoding byte
    }

    for (let pat = 0; pat < numPatterns; pat++) {
      if (!r.canRead(6)) break;

      const numRows    = r.u16be();
      const packedSize = r.u32be();
      if (!r.canRead(packedSize)) break;
      const patBytes = r.bytes(packedSize);

      // Pattern name from PNAM (each entry: uint8 length, then string bytes)
      let patName = `Pattern ${pat}`;
      if (pnamReader && pnamReader.canRead(1)) {
        const nameLen = pnamReader.u8();
        if (nameLen > 0 && pnamReader.canRead(nameLen)) {
          const nameBytes = pnamReader.bytes(nameLen);
          const parsed    = amigaString(nameBytes, 0, nameLen);
          if (parsed) patName = parsed;
        }
      }

      // Parse the packed pattern data
      const channelRows = parsePattern(patBytes, numRows, numChannels);

      // Build ChannelData array
      const channelDatas: ChannelData[] = Array.from({ length: numChannels }, (_, ch) => {
        // Amiga LRRL panning: ch%4 = 0 or 3 → left (-50), ch%4 = 1 or 2 → right (+50)
        const panPos = ch % 4;
        const pan    = (panPos === 0 || panPos === 3) ? -50 : 50;

        return {
          id:           `channel-${ch}`,
          name:         `Channel ${ch + 1}`,
          muted:        false,
          solo:         false,
          collapsed:    false,
          volume:       100,
          pan,
          instrumentId: null,
          color:        null,
          rows:         channelRows[ch] ?? Array.from({ length: numRows }, (): TrackerCell => ({
            note: 0, instrument: 0, volume: 0,
            effTyp: 0, eff: 0, effTyp2: 0, eff2: 0,
          })),
        };
      });

      patterns.push({
        id:      `pattern-${pat}`,
        name:    patName,
        length:  numRows,
        channels: channelDatas,
        importMetadata: {
          sourceFormat:            'DBM',
          sourceFile:              filename,
          importedAt:              new Date().toISOString(),
          originalChannelCount:    numChannels,
          originalPatternCount:    numPatterns,
          originalInstrumentCount: numInstruments,
        },
      });
    }
  }

  // Fallback: at least one empty pattern
  if (patterns.length === 0) {
    const emptyChannels: ChannelData[] = Array.from({ length: numChannels }, (_, ch) => {
      const panPos = ch % 4;
      const pan    = (panPos === 0 || panPos === 3) ? -50 : 50;
      return {
        id:           `channel-${ch}`,
        name:         `Channel ${ch + 1}`,
        muted:        false,
        solo:         false,
        collapsed:    false,
        volume:       100,
        pan,
        instrumentId: null,
        color:        null,
        rows:         Array.from({ length: 64 }, (): TrackerCell => ({
          note: 0, instrument: 0, volume: 0,
          effTyp: 0, eff: 0, effTyp2: 0, eff2: 0,
        })),
      };
    });
    patterns.push({
      id:      'pattern-0',
      name:    'Pattern 0',
      length:  64,
      channels: emptyChannels,
      importMetadata: {
        sourceFormat:            'DBM',
        sourceFile:              filename,
        importedAt:              new Date().toISOString(),
        originalChannelCount:    numChannels,
        originalPatternCount:    0,
        originalInstrumentCount: numInstruments,
      },
    });
  }

  // ── Build song position list ──────────────────────────────────────────────
  // Filter order list to only valid pattern indices
  const validOrder = orderList.filter(idx => idx < patterns.length);
  const songPositions = validOrder.length > 0 ? validOrder : patterns.map((_, i) => i);

  return {
    name:            songName,
    format:          'MOD' as TrackerFormat,
    patterns,
    instruments,
    songPositions,
    songLength:      songPositions.length,
    restartPosition: 0,
    numChannels,
    initialSpeed:    6,
    initialBPM:      125,
    linearPeriods:   false,
  };
}
