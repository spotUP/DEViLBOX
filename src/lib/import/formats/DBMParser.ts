/**
 * DBMParser.ts — DigiBooster Pro (.dbm) parser
 *
 * DigiBooster Pro is an Amiga tracker format from Softworks. The file format
 * uses IFF-style chunks: a fixed 8-byte header ("DBM0" + 2-byte version +
 * 2 reserved bytes), followed by a stream of 4-byte ID + 4-byte big-endian
 * length chunks (NAME, INFO, SONG, INST, VENV, PENV, PATT, PNAM, SMPL, DSPE).
 *
 * All integers in chunks are big-endian.
 *
 * Reference: OpenMPT soundlib/Load_dbm.cpp
 */

import type { TrackerSong, TrackerFormat } from '@/engine/TrackerReplayer';
import type { Pattern, ChannelData, TrackerCell, InstrumentConfig } from '@/types';
import { createSamplerInstrument } from './AmigaUtils';

// ── Binary helpers ────────────────────────────────────────────────────────────

function u8(v: DataView, off: number): number { return v.getUint8(off); }
function u16be(v: DataView, off: number): number { return v.getUint16(off, false); }
function u32be(v: DataView, off: number): number { return v.getUint32(off, false); }
function i16be(v: DataView, off: number): number { return v.getInt16(off, false); }

function readString(v: DataView, off: number, len: number): string {
  let s = '';
  for (let i = 0; i < len; i++) {
    const ch = v.getUint8(off + i);
    if (ch === 0) break;
    s += String.fromCharCode(ch);
  }
  return s.trim();
}

function readMagic(v: DataView, off: number, len: number): string {
  let s = '';
  for (let i = 0; i < len; i++) {
    s += String.fromCharCode(v.getUint8(off + i));
  }
  return s;
}

// ── Chunk identifiers (big-endian 4-byte IDs as strings) ─────────────────────

const ID_NAME = 'NAME';
const ID_INFO = 'INFO';
const ID_SONG = 'SONG';
const ID_INST = 'INST';
const ID_VENV = 'VENV';
const ID_PENV = 'PENV';
const ID_PATT = 'PATT';
const ID_PNAM = 'PNAM';
const ID_SMPL = 'SMPL';
const ID_DSPE = 'DSPE';

// ── Chunk map ─────────────────────────────────────────────────────────────────

interface Chunk {
  id: string;
  offset: number;  // offset to first byte of data (after 8-byte header)
  length: number;  // data byte count
}

/**
 * Parse the IFF chunk stream starting at `start` in the DataView.
 * Returns a map from chunk ID to Chunk (first occurrence wins).
 */
function readChunks(v: DataView, start: number): Map<string, Chunk> {
  const map = new Map<string, Chunk>();
  let pos = start;
  const total = v.byteLength;

  while (pos + 8 <= total) {
    const id  = readMagic(v, pos, 4);
    const len = u32be(v, pos + 4);
    const dataOff = pos + 8;
    // Store only first occurrence (matching OpenMPT ChunkReader behaviour)
    if (!map.has(id)) {
      map.set(id, { id, offset: dataOff, length: len });
    }
    pos += 8 + len;
  }

  return map;
}

// ── DBMInstrument layout (50 bytes, big-endian) ───────────────────────────────
// +0   name[30]          null-padded ASCII
// +30  sample (uint16be) 1-based sample reference
// +32  volume (uint16be) 0..64
// +34  sampleRate (uint32be)
// +38  loopStart (uint32be)
// +42  loopLength (uint32be)
// +46  panning (int16be) -128..128
// +48  flags (uint16be)  0x01=loop, 0x02=pingpong

const DBM_INST_SIZE = 50;
const DBM_FLAG_LOOP     = 0x01;
const DBM_FLAG_PINGPONG = 0x02;

interface DBMInstrument {
  name:       string;
  sample:     number;   // 1-based
  volume:     number;   // 0..64
  sampleRate: number;
  loopStart:  number;   // in samples
  loopLength: number;   // in samples
  panning:    number;   // -128..128
  flags:      number;
}

function readDBMInstrument(v: DataView, off: number): DBMInstrument {
  return {
    name:       readString(v, off,       30),
    sample:     u16be(v, off + 30),
    volume:     u16be(v, off + 32),
    sampleRate: u32be(v, off + 34),
    loopStart:  u32be(v, off + 38),
    loopLength: u32be(v, off + 42),
    panning:    i16be(v, off + 46),
    flags:      u16be(v, off + 48),
  };
}

// ── Effect conversion ─────────────────────────────────────────────────────────
//
// DBM effect table (from Load_dbm.cpp, index = raw DBM command byte):
// Maps DBM command index → XM/IT effTyp value.
// 0=arpeggio, 1=portaUp, 2=portaDn, 3=tonePorta,
// 4=vibrato, 5=tonePortaVol, 6=vibratoVol, 7=tremolo,
// 8=panning(0x08), 9=offset(0x09), 10=volSlide(0x0A), 11=posJump(0x0B),
// 12=volume(0x0C), 13=patBreak(0x0D), 14=extendedMod(0x0E), 15=tempo(0x0F),
// 16=globalVol(0x10), 17=globalVolSlide(0x11), 18-19=none,
// 20=keyoff(0x14), 21=setEnvPos, 22-24=none,
// 25=panSlide(0x19), 26-30=none,
// 31=echo(DBM special), 32=midi, 33=midi, 34=midi, 35=midi

// We use XM effect type numbers (same as OpenMPT XM effTyp values):
// 0x00=arpeggio, 0x01=portaUp, 0x02=portaDn, 0x03=tonePorta,
// 0x04=vibrato, 0x05=tonePortaVol, 0x06=vibratoVol, 0x07=tremolo,
// 0x08=setpan, 0x09=offset, 0x0A=volSlide, 0x0B=posJump,
// 0x0C=setVol, 0x0D=patBreak, 0x0E=extMod, 0x0F=tempo(speed),
// 0x10=globalVol, 0x11=globalVolSlide, 0x14=keyOff, 0x19=panSlide

// CMD_NONE = 0xFF (sentinel for "skip")
const CMD_NONE        = 0xFF;
const CMD_ARPEGGIO    = 0x00;
const CMD_PORTAUP     = 0x01;
const CMD_PORTADN     = 0x02;
const CMD_TONEPORTA   = 0x03;
const CMD_VIBRATO     = 0x04;
const CMD_TONEPORTAVOL= 0x05;
const CMD_VIBRATOVOL  = 0x06;
const CMD_TREMOLO     = 0x07;
const CMD_PANNING8    = 0x08;
const CMD_OFFSET      = 0x09;
const CMD_VOLSLIDE    = 0x0A;
const CMD_POSJUMP     = 0x0B;
const CMD_SETVOLUME   = 0x0C;
const CMD_PATBREAK    = 0x0D;
const CMD_MODCMDEX    = 0x0E;
const CMD_TEMPO       = 0x0F;
const CMD_GLOBALVOL   = 0x10;
const CMD_GLOBALVOLSL = 0x11;
const CMD_KEYOFF      = 0x14;
const CMD_PANSLIDE    = 0x19;
const CMD_SPEED       = 0x0F; // share XM F-effect type, disambiguate by param

// DBM NOTE_KEYOFF byte value in pattern data
const DBM_NOTE_KEYOFF = 0x1F;

// XM note-off
const XM_NOTE_OFF = 97;

// DBM effect index table — matches OpenMPT dbmEffects[]
// Index is the raw DBM command nibble (0..35)
const DBM_EFFECTS: number[] = [
  CMD_ARPEGGIO,    // 0
  CMD_PORTAUP,     // 1
  CMD_PORTADN,     // 2
  CMD_TONEPORTA,   // 3
  CMD_VIBRATO,     // 4
  CMD_TONEPORTAVOL,// 5
  CMD_VIBRATOVOL,  // 6
  CMD_TREMOLO,     // 7
  CMD_PANNING8,    // 8
  CMD_OFFSET,      // 9
  CMD_VOLSLIDE,    // 10
  CMD_POSJUMP,     // 11
  CMD_SETVOLUME,   // 12
  CMD_PATBREAK,    // 13
  CMD_MODCMDEX,    // 14
  CMD_TEMPO,       // 15
  CMD_GLOBALVOL,   // 16
  CMD_GLOBALVOLSL, // 17
  CMD_NONE,        // 18
  CMD_NONE,        // 19
  CMD_KEYOFF,      // 20
  CMD_NONE,        // 21 (setEnvPosition — not mapped)
  CMD_NONE,        // 22
  CMD_NONE,        // 23
  CMD_NONE,        // 24
  CMD_PANSLIDE,    // 25
  CMD_NONE,        // 26
  CMD_NONE,        // 27
  CMD_NONE,        // 28
  CMD_NONE,        // 29
  CMD_NONE,        // 30
  CMD_NONE,        // 31 (DBM echo toggle — ignored)
  CMD_NONE,        // 32 (Wxx echo delay — ignored)
  CMD_NONE,        // 33 (Xxx echo feedback — ignored)
  CMD_NONE,        // 34 (Yxx echo mix — ignored)
  CMD_NONE,        // 35 (Zxx echo cross — ignored)
];

/**
 * Convert a DBM effect command + param to XM effTyp + eff.
 * Returns {effTyp, eff} where effTyp=0 and eff=0 means "no effect".
 *
 * Follows ConvertDBMEffect() from Load_dbm.cpp.
 */
function convertDBMEffect(cmd: number, param: number): { effTyp: number; eff: number } {
  const rawCmd = (cmd < DBM_EFFECTS.length) ? DBM_EFFECTS[cmd] : CMD_NONE;
  if (rawCmd === CMD_NONE || rawCmd === undefined) return { effTyp: 0, eff: 0 };

  let effTyp = rawCmd;
  let eff    = param;

  switch (effTyp) {
    case CMD_ARPEGGIO:
      // Arpeggio with param 0 = no effect
      if (eff === 0) return { effTyp: 0, eff: 0 };
      break;

    case CMD_PATBREAK:
      // DBM stores BCD: ((param>>4)*10)+(param&0x0F)
      eff = ((param >> 4) * 10) + (param & 0x0F);
      break;

    case CMD_VOLSLIDE:
    case CMD_TONEPORTAVOL:
    case CMD_VIBRATOVOL:
      // Volume slide nibble priority: upper nibble (slide up) wins if both present
      // Match Load_dbm.cpp: if upper != 0x0F and lower != 0x0F and upper != 0, keep only upper
      if ((eff & 0xF0) !== 0x00 && (eff & 0xF0) !== 0xF0 && (eff & 0x0F) !== 0x0F) {
        eff &= 0xF0;
      }
      break;

    case CMD_GLOBALVOL:
      // DBM global volume 0..64 → XM 0..128
      if (eff <= 64) {
        eff = eff * 2;
      } else {
        eff = 128;
      }
      break;

    case CMD_MODCMDEX:
      // Sub-command translation
      switch (eff & 0xF0) {
        case 0x30:  // Play backwards — map to S9F (no direct XM equiv, skip)
          return { effTyp: 0, eff: 0 };
        case 0x40:  // Turn off sound in channel
          return { effTyp: 0, eff: 0 };
        case 0x50:  // Turn on/off channel
          return { effTyp: 0, eff: 0 };
        case 0x70:  // Coarse offset
          return { effTyp: 0, eff: 0 };
        default:
          // Standard extended MOD effect — pass through
          break;
      }
      break;

    case CMD_TEMPO:
      // DBM Fxx: if param <= 0x1F → speed (same XM F-effect), else BPM
      // XM already uses F for both, so pass through as-is
      break;

    case CMD_KEYOFF:
      // Kxx: only tick-0 key-off is special; no conversion needed here
      break;

    default:
      break;
  }

  return { effTyp, eff };
}

// ── Sample data helpers ───────────────────────────────────────────────────────

/**
 * Convert a big-endian signed 16-bit PCM buffer to a signed 8-bit Uint8Array
 * (two's complement, stored as unsigned bytes where 0x80=silence).
 * We downsample to 8-bit for createSamplerInstrument compatibility.
 */
function be16toSigned8(v: DataView, off: number, numSamples: number): Uint8Array {
  const out = new Uint8Array(numSamples);
  for (let i = 0; i < numSamples; i++) {
    const s16 = v.getInt16(off + i * 2, false); // big-endian
    // Scale to 8-bit signed: divide by 256, clamp
    const s8 = Math.max(-128, Math.min(127, Math.round(s16 / 256)));
    out[i] = s8 < 0 ? s8 + 256 : s8;
  }
  return out;
}

/**
 * Convert a big-endian signed 8-bit PCM buffer to an unsigned representation
 * (signed 8-bit stored as bytes: 0x00=silence would be wrong — actual format
 * is signed, stored exactly as signed bytes in the file).
 * DBM samples are signed big-endian; just read byte-by-byte.
 */
function be8toSigned8(v: DataView, off: number, numSamples: number): Uint8Array {
  const out = new Uint8Array(numSamples);
  for (let i = 0; i < numSamples; i++) {
    out[i] = v.getUint8(off + i);
  }
  return out;
}

// ── Empty instrument placeholder ─────────────────────────────────────────────

function buildEmptyInstrument(id: number, name: string): InstrumentConfig {
  return {
    id,
    name: name || `Sample ${id}`,
    type:      'sample'  as const,
    synthType: 'Sampler' as const,
    effects: [],
    volume: -60,
    pan: 0,
  } as unknown as InstrumentConfig;
}

// ── Format detection ──────────────────────────────────────────────────────────

/**
 * Returns true if the buffer starts with a valid DBM0 IFF header.
 * Detection: bytes 0-3 = "DBM0", byte 4 (trkVerHi) <= 3.
 */
export function isDBMFormat(buffer: ArrayBuffer): boolean {
  if (buffer.byteLength < 8) return false;
  const v = new DataView(buffer);
  if (readMagic(v, 0, 4) !== 'DBM0') return false;
  const trkVerHi = v.getUint8(4);
  return trkVerHi <= 3;
}

// ── Main parser ───────────────────────────────────────────────────────────────

/**
 * Parse a DigiBooster Pro (.dbm) file into a TrackerSong.
 *
 * Follows ReadDBM() from OpenMPT Load_dbm.cpp.
 *
 * @throws If the file fails format detection or required chunks are missing.
 */
export async function parseDBMFile(
  buffer: ArrayBuffer,
  filename: string,
): Promise<TrackerSong> {
  if (!isDBMFormat(buffer)) {
    throw new Error('DBMParser: not a DBM0 file');
  }

  const v   = new DataView(buffer);
  const raw = new Uint8Array(buffer);

  // File header: 8 bytes
  // +0 dbm0[4], +4 trkVerHi, +5 trkVerLo, +6 reserved[2]
  const trkVerHi = u8(v, 4);
  const trkVerLo = u8(v, 5);

  // Parse IFF chunk stream starting after the 8-byte file header
  const chunks = readChunks(v, 8);

  // ── INFO chunk (required) ──────────────────────────────────────────────────
  // +0 numInstruments(u16be), +2 numSamples(u16be), +4 numSongs(u16be),
  // +6 numPatterns(u16be), +8 numChannels(u16be)
  const infoChunk = chunks.get(ID_INFO);
  if (!infoChunk || infoChunk.length < 10) {
    throw new Error('DBMParser: missing or truncated INFO chunk');
  }
  const infoOff      = infoChunk.offset;
  const numInstruments = u16be(v, infoOff + 0);
  const numSamples     = u16be(v, infoOff + 2);
  const numSongs       = u16be(v, infoOff + 4);
  const numPatterns    = u16be(v, infoOff + 6);
  const numChannels    = Math.max(1, u16be(v, infoOff + 8));

  // ── NAME chunk (optional) — song name ─────────────────────────────────────
  let songName = '';
  const nameChunk = chunks.get(ID_NAME);
  if (nameChunk) {
    songName = readString(v, nameChunk.offset, nameChunk.length);
  }

  // ── SONG chunk — order list for each sub-song ──────────────────────────────
  // Each sub-song: name[44], numOrders(u16be), orders[numOrders](u16be each)
  const songPositions: number[] = [];
  const songChunk = chunks.get(ID_SONG);
  if (songChunk) {
    let pos = songChunk.offset;
    const songEnd = pos + songChunk.length;

    for (let s = 0; s < numSongs && pos + 46 <= songEnd; s++) {
      // Sub-song name (44 bytes)
      const subName = readString(v, pos, 44);
      if (!songName && subName) songName = subName;
      pos += 44;

      const numOrders = u16be(v, pos);
      pos += 2;

      // Only the first sub-song's orders are used (matching non-subsong mode)
      if (s === 0) {
        for (let ord = 0; ord < numOrders && pos + 2 <= songEnd; ord++) {
          songPositions.push(u16be(v, pos));
          pos += 2;
        }
      } else {
        pos += numOrders * 2;
      }
    }
  }

  if (!songName) {
    songName = filename.replace(/\.[^/.]+$/, '');
  }

  // ── SMPL chunk — sample PCM data ──────────────────────────────────────────
  // Sequential entries per sample (1..numSamples):
  //   sampleFlags(u32be): bit0=8bit, bit1=16bit, bit2=32bit
  //   sampleLength(u32be): number of frames
  //   PCM data follows immediately (big-endian signed)
  //
  // Build array of sample PCM data, indexed 1..numSamples (index 0 unused).

  interface SampleData {
    pcm:    Uint8Array;  // 8-bit signed representation for createSamplerInstrument
    frames: number;      // number of sample frames
  }

  const sampleData: (SampleData | null)[] = [null]; // index 0 unused

  const smplChunk = chunks.get(ID_SMPL);
  if (smplChunk) {
    let smplPos = smplChunk.offset;
    const smplEnd = smplPos + smplChunk.length;

    for (let smp = 1; smp <= numSamples; smp++) {
      if (smplPos + 8 > smplEnd) {
        sampleData.push(null);
        continue;
      }

      const smpFlags  = u32be(v, smplPos);
      const smpLength = u32be(v, smplPos + 4);
      smplPos += 8;

      if (!(smpFlags & 7) || smpLength === 0) {
        // No valid sample data
        sampleData.push(null);
        continue;
      }

      const is32Bit = (smpFlags & 4) !== 0;
      const is16Bit = (smpFlags & 2) !== 0;
      // const is8Bit  = (smpFlags & 1) !== 0;

      let byteCount: number;
      let pcm: Uint8Array;

      if (is32Bit) {
        byteCount = smpLength * 4;
        if (smplPos + byteCount > smplEnd) {
          sampleData.push(null);
          smplPos += Math.min(byteCount, smplEnd - smplPos);
          continue;
        }
        // Convert big-endian 32-bit → 8-bit (take high byte of each 32-bit word)
        pcm = new Uint8Array(smpLength);
        for (let i = 0; i < smpLength; i++) {
          const s32 = v.getInt32(smplPos + i * 4, false);
          const s8 = Math.max(-128, Math.min(127, Math.round(s32 / 8388608)));
          pcm[i] = s8 < 0 ? s8 + 256 : s8;
        }
      } else if (is16Bit) {
        byteCount = smpLength * 2;
        if (smplPos + byteCount > smplEnd) {
          sampleData.push(null);
          smplPos += Math.min(byteCount, smplEnd - smplPos);
          continue;
        }
        pcm = be16toSigned8(v, smplPos, smpLength);
      } else {
        // 8-bit
        byteCount = smpLength;
        if (smplPos + byteCount > smplEnd) {
          sampleData.push(null);
          smplPos += Math.min(byteCount, smplEnd - smplPos);
          continue;
        }
        pcm = be8toSigned8(v, smplPos, smpLength);
      }

      sampleData.push({ pcm, frames: smpLength });
      smplPos += byteCount;
    }
  } else {
    // No SMPL chunk — fill with nulls
    for (let i = 1; i <= numSamples; i++) sampleData.push(null);
  }

  // ── INST chunk — instrument headers ────────────────────────────────────────
  // Sequential entries, each 50 bytes (DBMInstrument struct)
  const instruments: InstrumentConfig[] = [];

  const instChunk = chunks.get(ID_INST);
  if (instChunk) {
    let instPos = instChunk.offset;
    const instEnd = instPos + instChunk.length;

    // Track which sample indices have been used (for duplicate detection)
    // When an instrument references a sample already used by another instrument
    // with different playback parameters, we'd normally duplicate it.
    // For simplicity, we allow sharing (the WAV is the same raw data).

    for (let i = 1; i <= numInstruments; i++) {
      if (instPos + DBM_INST_SIZE > instEnd) {
        instruments.push(buildEmptyInstrument(i, `Instrument ${i}`));
        continue;
      }

      const inst = readDBMInstrument(v, instPos);
      instPos += DBM_INST_SIZE;

      const smpRef = inst.sample;  // 1-based sample index
      const vol    = Math.min(inst.volume, 64);

      // sampleRate: OpenMPT applies Util::muldivr(sampleRate, 8303, 8363)
      // This adjusts for the fact that DigiBooster uses a slightly different
      // C5 reference than the Amiga period table.
      const rawRate   = inst.sampleRate || 8287;
      const adjRate   = Math.round(rawRate * 8303 / 8363);
      const sampleRate = Math.max(1, adjRate);

      const hasLoop = inst.loopLength > 0 &&
        ((inst.flags & DBM_FLAG_LOOP) !== 0 || (inst.flags & DBM_FLAG_PINGPONG) !== 0);
      const loopStart = hasLoop ? inst.loopStart : 0;
      const loopEnd   = hasLoop ? inst.loopStart + inst.loopLength : 0;

      // Get sample PCM from SMPL chunk
      const sd = (smpRef >= 1 && smpRef < sampleData.length) ? sampleData[smpRef] : null;

      if (!sd) {
        instruments.push(buildEmptyInstrument(i, inst.name || `Instrument ${i}`));
        continue;
      }

      instruments.push(createSamplerInstrument(
        i,
        inst.name || `Instrument ${i}`,
        sd.pcm,
        vol,
        sampleRate,
        loopStart,
        loopEnd,
      ));
    }
  } else {
    // No INST chunk — create empty placeholders
    for (let i = 1; i <= numInstruments; i++) {
      instruments.push(buildEmptyInstrument(i, `Instrument ${i}`));
    }
  }

  // ── PATT chunk — pattern data ─────────────────────────────────────────────
  // Sequential entries per pattern:
  //   numRows(u16be), packedSize(u32be), packed data
  //
  // Packed data per row:
  //   Read bytes until 0x00 (end-of-row):
  //     ch = channel byte (1-based)
  //     b  = bitmask byte
  //       bit 0x01: note byte follows  (0x1F=keyoff, otherwise: octave=(note>>4), semitone=(note&0xF))
  //       bit 0x02: instrument byte follows
  //       bit 0x04: effect2 command byte follows (c2)
  //       bit 0x08: effect2 param byte follows   (p2)
  //       bit 0x10: effect1 command byte follows (c1)
  //       bit 0x20: effect1 param byte follows   (p1)

  const patterns: Pattern[] = [];

  const pattChunk = chunks.get(ID_PATT);
  const pnamChunk = chunks.get(ID_PNAM);

  // PNAM: 1 encoding byte, then size-prefixed strings (u8 length + data)
  let pnamPos = pnamChunk ? pnamChunk.offset + 1 : -1; // skip encoding byte
  const pnamEnd = pnamChunk ? pnamChunk.offset + pnamChunk.length : -1;

  if (pattChunk) {
    let pattPos = pattChunk.offset;
    const pattEnd = pattPos + pattChunk.length;

    for (let pat = 0; pat < numPatterns; pat++) {
      if (pattPos + 6 > pattEnd) break;

      const numRows   = u16be(v, pattPos);
      const packSize  = u32be(v, pattPos + 2);
      pattPos += 6;

      // Read pattern name from PNAM if available
      let patName = `Pattern ${pat}`;
      if (pnamPos >= 0 && pnamPos < pnamEnd) {
        const nameLen = u8(v, pnamPos);
        pnamPos += 1;
        if (nameLen > 0 && pnamPos + nameLen <= pnamEnd) {
          const pn = readString(v, pnamPos, nameLen);
          if (pn) patName = pn;
          pnamPos += nameLen;
        }
      }

      const packEnd = pattPos + packSize;

      // Allocate grid: grid[row][ch] — 0-based channel index
      const grid: TrackerCell[][] = Array.from({ length: numRows }, () =>
        Array.from({ length: numChannels }, (): TrackerCell => ({
          note: 0, instrument: 0, volume: 0,
          effTyp: 0, eff: 0, effTyp2: 0, eff2: 0,
        })),
      );

      let p    = pattPos;
      let row  = 0;

      while (p < packEnd && row < numRows) {
        const ch = u8(v, p++);
        if (ch === 0) {
          // End of row
          row++;
          continue;
        }

        // ch is 1-based channel number
        const chIdx = ch - 1;

        if (p >= packEnd) break;
        const b = u8(v, p++);

        const cell: TrackerCell = (chIdx >= 0 && chIdx < numChannels && row < numRows)
          ? grid[row][chIdx]!
          : { note: 0, instrument: 0, volume: 0, effTyp: 0, eff: 0, effTyp2: 0, eff2: 0 };

        // bit 0x01: note byte
        if (b & 0x01) {
          if (p >= packEnd) break;
          const noteRaw = u8(v, p++);
          if (noteRaw === DBM_NOTE_KEYOFF) {
            cell.note = XM_NOTE_OFF;
          } else if (noteRaw > 0 && noteRaw < 0xFE) {
            // Octave in upper nibble, semitone in lower nibble
            // OpenMPT: note = ((note>>4)*12) + (note&0x0F) + 13
            // That gives XM note: 13 = C-1 (DBM octave 0, semitone 0)
            const octave   = (noteRaw >> 4) & 0x0F;
            const semitone = noteRaw & 0x0F;
            cell.note = octave * 12 + semitone + 13;
          }
        }

        // bit 0x02: instrument byte
        if (b & 0x02) {
          if (p >= packEnd) break;
          cell.instrument = u8(v, p++);
        }

        // bits 0x04, 0x08: effect 2 (c2, p2)
        let c2 = 0, p2 = 0;
        if (b & 0x04) { if (p >= packEnd) break; c2 = u8(v, p++); }
        if (b & 0x08) { if (p >= packEnd) break; p2 = u8(v, p++); }

        // bits 0x10, 0x20: effect 1 (c1, p1)
        let c1 = 0, p1 = 0;
        if (b & 0x10) { if (p >= packEnd) break; c1 = u8(v, p++); }
        if (b & 0x20) { if (p >= packEnd) break; p1 = u8(v, p++); }

        // Convert and store effects
        // OpenMPT prioritises CMD_VOLUME in slot 1 (volume column);
        // if c2 is a volume command, swap so that c1 holds it.
        if (b & 0x3C) {
          const e1 = convertDBMEffect(c1, p1);
          const e2 = convertDBMEffect(c2, p2);

          // Priority swap: if e2 is set-volume OR e2 is none while e1 isn't set-volume
          // → swap (matching OpenMPT FillInTwoCommands + CMD_VOLUME priority logic)
          let fx1 = e1, fx2 = e2;
          if (fx2.effTyp === CMD_SETVOLUME ||
              (fx2.effTyp === 0 && fx2.eff === 0 && fx1.effTyp !== CMD_SETVOLUME)) {
            const tmp = fx1; fx1 = fx2; fx2 = tmp;
          }

          // If fx1 is volume command, put it in the volume column (0x0C → volume column val 0-64)
          if (fx1.effTyp === CMD_SETVOLUME) {
            cell.volume  = Math.min(64, fx1.eff);
            // Use fx2 as the main effect
            cell.effTyp  = fx2.effTyp !== 0 ? fx2.effTyp : 0;
            cell.eff     = fx2.effTyp !== 0 ? fx2.eff    : 0;
          } else {
            cell.effTyp  = fx1.effTyp;
            cell.eff     = fx1.eff;
            cell.effTyp2 = fx2.effTyp;
            cell.eff2    = fx2.eff;
          }
        }
      }

      pattPos = packEnd;

      // Build ChannelData from grid
      const channels: ChannelData[] = Array.from({ length: numChannels }, (_, ch): ChannelData => ({
        id:           `channel-${ch}`,
        name:         `Channel ${ch + 1}`,
        muted:        false,
        solo:         false,
        collapsed:    false,
        volume:       100,
        pan:          0,
        instrumentId: null,
        color:        null,
        rows:         grid.map(r => r[ch]!),
      }));

      patterns.push({
        id:      `pattern-${pat}`,
        name:    patName,
        length:  numRows,
        channels,
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

  // Pad patterns to declared count if truncated
  while (patterns.length < numPatterns) {
    const pat = patterns.length;
    const channels: ChannelData[] = Array.from({ length: numChannels }, (_, ch): ChannelData => ({
      id: `channel-${ch}`, name: `Channel ${ch + 1}`,
      muted: false, solo: false, collapsed: false,
      volume: 100, pan: 0, instrumentId: null, color: null,
      rows: Array.from({ length: 64 }, (): TrackerCell => ({
        note: 0, instrument: 0, volume: 0, effTyp: 0, eff: 0, effTyp2: 0, eff2: 0,
      })),
    }));
    patterns.push({
      id: `pattern-${pat}`, name: `Pattern ${pat}`, length: 64,
      channels, importMetadata: {
        sourceFormat: 'DBM', sourceFile: filename, importedAt: new Date().toISOString(),
        originalChannelCount: numChannels, originalPatternCount: numPatterns,
        originalInstrumentCount: numInstruments,
      },
    });
  }

  // ── Assemble TrackerSong ───────────────────────────────────────────────────

  // DBM uses Amiga-style period playback, same as MOD.
  // Default speed = 6, BPM = 125 (standard Amiga tracker defaults).
  void trkVerHi; void trkVerLo; void numSamples;

  return {
    name:            songName,
    format:          'MOD' as TrackerFormat,  // Amiga period-based playback
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
