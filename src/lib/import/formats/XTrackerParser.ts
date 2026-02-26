/**
 * XTrackerParser.ts — X-Tracker DMF (.dmf) format parser
 *
 * Parses the Delusion Digital Music Format (DMF) written by X-Tracker by D-LUSiON.
 * Versions 1–10 are supported (v8 is the official release, v10 is X-Tracker 32).
 *
 * Binary layout:
 *   +0    DMFFileHeader (66 bytes):
 *         signature[4] = "DDMF", version(u8), tracker[8], songname[30],
 *         composer[20], creationDay(u8), creationMonth(u8), creationYear(u8)
 *
 *   After the header, the file consists of chunks of the form:
 *         id(u32le), length(u32le), data[length]
 *
 *   Known chunks:
 *     CMSG — Song message
 *     SEQU — Order list (u16le entries; v3+: loopStart u16le; v4+: loopEnd u16le)
 *     PATT — Pattern data (DMFPatterns header + per-pattern data)
 *     SMPI — Sample headers
 *     SMPD — Sample data (each entry: length(u32le), data[length])
 *     SMPJ — Sample jump table (X-Tracker 32 only, ignored)
 *     ENDE — End marker
 *     SETT — GUI settings (ignored)
 *
 * Pattern format: see ConvertDMFPattern notes in Load_dmf.cpp.
 *   - First channel is the "global track" for tempo/BPM commands.
 *   - Remaining channels carry note/instrument/volume/effect data.
 *   - Run-length packing: a counter byte suppresses re-reading for N rows.
 *   - Effect columns: instrument effects (InsEff), note effects (NoteEff),
 *     volume effects (VolEff).
 *
 * Sample compression type 1: DMF Huffman (see DMFUnpack in Load_dmf.cpp).
 *
 * Reference: OpenMPT Load_dmf.cpp (BSD licence, Johannes Schultz)
 */

import type { TrackerSong, TrackerFormat } from '@/engine/TrackerReplayer';
import type { Pattern, ChannelData, TrackerCell, InstrumentConfig } from '@/types';
import { createSamplerInstrument } from './AmigaUtils';

// ── Binary helpers (little-endian throughout) ────────────────────────────────

function u8(v: DataView, off: number): number    { return v.getUint8(off); }
function u16le(v: DataView, off: number): number { return v.getUint16(off, true); }
function u32le(v: DataView, off: number): number { return v.getUint32(off, true); }

/** Read a fixed-length ASCII field, trimming trailing null bytes and spaces. */
function readString(v: DataView, off: number, len: number): string {
  let s = '';
  for (let i = 0; i < len; i++) {
    const c = v.getUint8(off + i);
    if (c === 0) break;
    s += String.fromCharCode(c);
  }
  return s.trim();
}

// ── Constants ─────────────────────────────────────────────────────────────────

/** DMFFileHeader is always 66 bytes */
const FILE_HDR_SIZE = 66;

/** DMFChunk header: 4-byte id + 4-byte length */
const CHUNK_HDR_SIZE = 8;

// Chunk identifiers (little-endian 32-bit values of ASCII strings)
const ID_SEQU = charCode4('S', 'E', 'Q', 'U');
const ID_PATT = charCode4('P', 'A', 'T', 'T');
const ID_SMPI = charCode4('S', 'M', 'P', 'I');
const ID_SMPD = charCode4('S', 'M', 'P', 'D');

function charCode4(a: string, b: string, c: string, d: string): number {
  return a.charCodeAt(0) | (b.charCodeAt(0) << 8) | (c.charCodeAt(0) << 16) | (d.charCodeAt(0) << 24);
}

// DMFSampleHeader flags
const SMP_LOOP       = 0x01;
const SMP_16BIT      = 0x02;
const SMP_COMP_MASK  = 0x0C;
const SMP_COMP1      = 0x04;

// Pattern flags — global track
const PAT_GLOB_PACK  = 0x80;
const PAT_GLOB_MASK  = 0x3F;

// Pattern flags — note tracks
const PAT_COUNTER    = 0x80;
const PAT_INSTR      = 0x40;
const PAT_NOTE       = 0x20;
const PAT_VOLUME     = 0x10;
const PAT_INS_EFF    = 0x08;
const PAT_NOTE_EFF   = 0x04;
const PAT_VOL_EFF    = 0x02;

// Note special values (after adding 24, stored as raw DMF note bytes):
// DMF 1–108 → XM note = dmfNote + 24   (range 25–132)
// DMF 129–236 → buffer note = (dmfNote & 0x7F) + 24
// DMF 255 → note cut
const DMF_NOTE_CUT   = 255;
const DMF_NOTE_OFF_XM = 97; // TrackerReplayer XM key-off

// Instrument effect note values
const NOTE_NOTECUT   = 254; // mapped to XM note cut
const NOTE_KEYOFF    = 253; // mapped to XM key-off

// ── Format detection ─────────────────────────────────────────────────────────

/**
 * Returns true if the first four bytes are "DDMF" and version is 1–10.
 */
export function isXTrackerFormat(bytes: Uint8Array): boolean {
  if (bytes.length < FILE_HDR_SIZE) return false;
  if (bytes[0] !== 0x44 || bytes[1] !== 0x44 || bytes[2] !== 0x4D || bytes[3] !== 0x46) {
    return false; // Not "DDMF"
  }
  const version = bytes[4];
  return version >= 1 && version <= 10;
}

// ── Chunk reader ─────────────────────────────────────────────────────────────

interface Chunk {
  id: number;
  data: Uint8Array; // raw chunk payload (without the 8-byte header)
}

/**
 * Walk the chunk list from after the file header.
 * Handles the version-specific quirks documented in OpenMPT:
 *   - v3 SEQU: chunk size didn't include 2 extra bytes (loop start)
 *   - v4 SEQU: chunk size didn't include 4 extra bytes (loop start + loop end)
 *   - v<8 SMPD: chunk size is garbage → consume remaining bytes
 */
function readChunks(v: DataView, raw: Uint8Array, fileVersion: number): Map<number, Chunk> {
  const chunks = new Map<number, Chunk>();
  let pos = FILE_HDR_SIZE;
  const end = raw.length;

  while (pos + CHUNK_HDR_SIZE <= end) {
    const id     = u32le(v, pos);
    let   length = u32le(v, pos + 4);
    pos += CHUNK_HDR_SIZE;

    // Version-specific quirks from OpenMPT
    if (fileVersion === 3 && id === ID_SEQU) {
      // v3: chunk length was not updated when loopStart was added; skip 2 extra bytes after
      const data = raw.subarray(pos, Math.min(pos + length, end));
      chunks.set(id, { id, data });
      pos += length + 2;
      continue;
    }
    if (fileVersion === 4 && id === ID_SEQU) {
      // v4: chunk length was not updated when loopEnd was added; skip 4 extra bytes after
      const data = raw.subarray(pos, Math.min(pos + length, end));
      chunks.set(id, { id, data });
      pos += length + 4;
      continue;
    }
    if (fileVersion < 8 && id === ID_SMPD) {
      // v<8: SMPD length is garbage if samples are compressed; consume rest of file
      length = end - pos;
    }

    const data = raw.subarray(pos, Math.min(pos + length, end));
    chunks.set(id, { id, data });
    pos += length;
  }

  return chunks;
}

// ── DMF Huffman decompressor (compression type 1) ────────────────────────────

interface HNode {
  left:  number; // child node index, or -1 for leaf
  right: number;
  value: number;
}

/**
 * Decompress a DMF type-1 compressed sample block.
 * The tree is stored as a bit-stream: each node is [7-bit value][left?][right?].
 * Samples are then decoded as: [sign bit][huffman-coded delta], accumulated.
 *
 * Returns the decompressed bytes (length = maxlen), or null on failure.
 */
function dmfUnpack(src: Uint8Array, maxlen: number): Uint8Array | null {
  try {
    // Bit-reader state
    let bytePos = 0;
    let bitBuf = 0;
    let bitsLeft = 0;

    function readBit(): number {
      if (bitsLeft === 0) {
        if (bytePos >= src.length) throw new Error('eof');
        bitBuf = src[bytePos++];
        bitsLeft = 8;
      }
      bitsLeft--;
      return (bitBuf >> bitsLeft) & 1;
    }

    function readBits(n: number): number {
      let result = 0;
      for (let i = 0; i < n; i++) {
        result = (result << 1) | readBit();
      }
      return result;
    }

    // Build Huffman tree
    const nodes: HNode[] = Array.from({ length: 256 }, () => ({ left: -1, right: -1, value: 0 }));
    let nodecount = 0;
    let lastnode  = 0;

    function dmfNewNode(): void {
      const actnode = nodecount;
      if (actnode > 255) return;
      nodes[actnode].value = readBits(7);
      const isLeft  = readBit() !== 0;
      const isRight = readBit() !== 0;
      const savedActnode = lastnode;
      nodecount++;
      lastnode = nodecount;
      if (isLeft) {
        nodes[savedActnode].left = lastnode;
        dmfNewNode();
      } else {
        nodes[savedActnode].left = -1;
      }
      lastnode = nodecount;
      if (isRight) {
        nodes[savedActnode].right = lastnode;
        dmfNewNode();
      } else {
        nodes[savedActnode].right = -1;
      }
    }

    dmfNewNode();

    // Verify tree has at least two children
    if (nodes[0].left < 0 || nodes[0].right < 0) {
      return null;
    }

    // Decode samples
    const out = new Uint8Array(maxlen);
    let value = 0;
    let delta = 0;

    for (let i = 0; i < maxlen; i++) {
      let actnode = 0;
      const sign = readBit() !== 0;
      do {
        if (readBit()) {
          actnode = nodes[actnode].right;
        } else {
          actnode = nodes[actnode].left;
        }
        if (actnode > 255) break;
        delta = nodes[actnode].value;
      } while (nodes[actnode].left >= 0 && nodes[actnode].right >= 0);
      if (sign) delta ^= 0xFF;
      value = (value + delta) & 0xFF;
      out[i] = value;
    }

    return out;
  } catch {
    return null;
  }
}

// ── WAV encoder for 16-bit signed LE PCM (mirrors ULTParser) ─────────────────

function buildWAV16(pcmBytes: Uint8Array, sampleRate: number): ArrayBuffer {
  const numFrames = pcmBytes.length >> 1;
  const dataSize  = numFrames * 2;
  const fileSize  = 44 + dataSize;
  const buf  = new ArrayBuffer(fileSize);
  const view = new DataView(buf);

  const ws = (off: number, s: string) => {
    for (let i = 0; i < s.length; i++) view.setUint8(off + i, s.charCodeAt(i));
  };
  ws(0,  'RIFF'); view.setUint32(4,  fileSize - 8, true);
  ws(8,  'WAVE');
  ws(12, 'fmt '); view.setUint32(16, 16,            true);
  view.setUint16(20, 1, true);  // PCM
  view.setUint16(22, 1, true);  // mono
  view.setUint32(24, sampleRate,       true);
  view.setUint32(28, sampleRate * 2,   true);
  view.setUint16(32, 2, true);
  view.setUint16(34, 16, true);
  ws(36, 'data'); view.setUint32(40, dataSize, true);

  const dst = new Uint8Array(buf, 44);
  dst.set(pcmBytes.subarray(0, numFrames * 2));
  return buf;
}

/** WAV ArrayBuffer → base64 data URL */
function wavToDataUrl(wavBuf: ArrayBuffer): string {
  const bytes = new Uint8Array(wavBuf);
  let binary = '';
  const CHUNK = 8192;
  for (let i = 0; i < bytes.length; i += CHUNK) {
    binary += String.fromCharCode(...Array.from(bytes.subarray(i, Math.min(i + CHUNK, bytes.length))));
  }
  return `data:audio/wav;base64,${btoa(binary)}`;
}

// ── Tempo conversion helper ───────────────────────────────────────────────────

/**
 * Convert X-Tracker tempo settings to IT/S3M-style speed + tempo pair.
 * Mirrors OpenMPT's ConvertDMFPattern tempo calculation exactly.
 */
function dmfTempoToSpeedBPM(
  realBPMmode: boolean,
  tempoBPM: number,
  tempoTicks: number,
  beat: number,
): { speed: number; bpm: number } {
  if (realBPMmode && beat === 0) {
    return { speed: 6, bpm: 120 };
  }
  // tickspeed = realBPMmode ? max(1, tempoBPM * beat * 2) : (tempoTicks + 1) * 30
  const tickspeed = realBPMmode
    ? Math.max(1, tempoBPM * beat * 2)
    : (tempoTicks + 1) * 30;

  let speed = 1;
  let bpm   = 32;
  for (let s = 255; s >= 1; s--) {
    const t = Math.floor(tickspeed * s / 48);
    if (t >= 32 && t <= 255) {
      speed = s;
      bpm   = t;
      break;
    }
  }
  bpm = Math.max(32, Math.min(255, bpm));
  speed = Math.max(1, speed);
  return { speed, bpm };
}

// ── Effect parameter converters (mirrors Load_dmf.cpp helpers) ────────────────

function dmfDelay2MPT(val: number, ticks: number): number {
  const nv = Math.floor(val * ticks / 255);
  return Math.max(0, Math.min(15, nv));
}

function dmfVibrato2MPT(val: number, ticks: number): number {
  const periodInTicks = Math.max(1, val >> 4) * ticks;
  const matchingPeriod = Math.max(1, Math.min(15, Math.floor(128 / periodInTicks)));
  return (matchingPeriod << 4) | Math.max(1, val & 0x0F);
}

function dmfTremor2MPT(val: number, ticks: number): number {
  let ontime  = (val >> 4);
  let offtime = (val & 0x0F);
  ontime  = Math.max(1, Math.min(15, Math.floor(ontime  * ticks / 15)));
  offtime = Math.max(1, Math.min(15, Math.floor(offtime * ticks / 15)));
  return (ontime << 4) | offtime;
}

function dmfPorta2MPT(val: number, ticks: number, hasFine: boolean): number {
  if (val === 0) return 0;
  if ((val <= 0x0F && hasFine) || ticks < 2) return (val | 0xF0);
  return Math.max(1, Math.floor(val / (ticks - 1)));
}

function dmfSlide2MPT(val: number, ticks: number, up: boolean): number {
  val = Math.max(1, Math.floor(val / 4));
  const isFine = (val < 0x0F) || (ticks < 2);
  if (!isFine) {
    val = Math.max(1, Math.floor((val + ticks - 2) / (ticks - 1)));
  }
  if (up)  return ((isFine ? 0x0F : 0x00) | (val << 4));
  else     return ((isFine ? 0xF0 : 0x00) | (val & 0x0F));
}

// ── Channel state for pattern conversion ──────────────────────────────────────

interface ChannelState {
  noteBuffer:   number;  // queued "buffer note" for portamento
  lastNote:     number;  // last played note (XM numbering, 0 = none)
  vibratoType:  number;  // last vibrato waveform type (1-byte DMF cmd)
  tremoloType:  number;  // last tremolo waveform type (1-byte DMF cmd)
  highOffset:   number;  // last high-offset command (6..9)
  playDir:      boolean; // sample play direction (false = forward)
}

function makeChannelState(): ChannelState {
  return {
    noteBuffer:  0,
    lastNote:    0,
    vibratoType: 8,
    tremoloType: 4,
    highOffset:  6,
    playDir:     false,
  };
}

// XM effect numbers used by TrackerReplayer
const XM_NONE          = 0;
const XM_PORTA_UP      = 0x01;
const XM_PORTA_DOWN    = 0x02;
const XM_TONE_PORTA    = 0x03;
const XM_VIBRATO       = 0x04;
const XM_TREMOR        = 0x1D;   // IT tremor — TrackerReplayer knows it
const XM_OFFSET        = 0x09;
const XM_VOL_SLIDE     = 0x0A;
const XM_RETRIG        = 0x1B;   // IT retrig (matches S3M/IT Qxx)
const XM_PANNING8      = 0x08;   // Xxx panning
const XM_PAN_SLIDE     = 0x19;   // IT pan slide (Pxx)
const XM_PANBRELLO     = 0x1A;   // IT panbrello (Yxx)
const XM_TEMPO         = 0x0F;   // Fxx (>= 0x20 = BPM, < 0x20 = speed)
const XM_SPEED         = 0x0F;
const XM_S3MCMDEX      = 0x13;   // Sxx extended

// ── Pattern conversion ────────────────────────────────────────────────────────

interface ConvertedPattern {
  numRows: number;
  initialSpeed?: number;  // if tempo change on first row
  initialBPM?:   number;
  channels: TrackerCell[][];  // [channelIndex][rowIndex]
}

/**
 * Convert a single DMF pattern chunk into a TrackerCell grid.
 *
 * The returned object has one array per channel (0-based), each with numRows cells.
 * Channel 0 carries tempo/speed changes; channels 1..N are the actual note channels.
 *
 * @param data      Raw pattern chunk bytes (starts at the DMFPatternHeader)
 * @param fileVersion  DMF file version (affects header size)
 * @param settings  Mutable tempo/channel state carried across patterns
 * @param numGlobalChannels  Total number of channels including global track
 */
function convertDMFPattern(
  data: Uint8Array,
  fileVersion: number,
  settings: {
    realBPMmode: boolean;
    beat: number;
    tempoTicks: number;
    tempoBPM: number;
    internalTicks: number;
    channelStates: ChannelState[];
  },
  numGlobalChannels: number,
): ConvertedPattern | null {
  const v   = new DataView(data.buffer, data.byteOffset, data.byteLength);
  let   pos = 0;

  // ── Pattern header ─────────────────────────────────────────────────────────
  let numTracks: number;
  let beat: number;
  let numRows: number;

  if (fileVersion < 3) {
    // v1/v2: 1 + 2 + 2 + 4 bytes = 9 bytes, skip 2 unknown bytes after numTracks
    if (data.length < 9) return null;
    numTracks = u8(v, pos); pos += 1;
    pos += 2; // unknown
    numRows   = u16le(v, pos); pos += 2;
    pos += 4; // patternLength (u32le)
    beat = 0; // not present in v1/v2
  } else {
    // v3+: 8-byte DMFPatternHeader: numTracks(u8), beat(u8), numRows(u16le), patternLength(u32le)
    if (data.length < 8) return null;
    numTracks = u8(v,   pos); pos += 1;
    beat      = u8(v,   pos); pos += 1;
    numRows   = u16le(v, pos); pos += 2;
    pos += 4; // patternLength
  }
  if (fileVersion < 6) beat = 0;

  numRows = Math.max(1, Math.min(numRows, 256));

  // Update beat from pattern header
  settings.beat = (beat >> 4);

  // ── Per-channel packing counters (0 = global track, 1..N = note channels) ──
  const numChannels = Math.min(numGlobalChannels - 1, numTracks); // note channels only
  const channelCounter = new Array<number>(numChannels + 1).fill(0);

  // Allocate grid: channels[0] is the global/tempo channel, channels[1..N] are note channels
  // We return channels[1..N] as the actual pattern data.
  // For simplicity we allocate (numChannels + 1) arrays here.
  const grid: TrackerCell[][] = Array.from({ length: numChannels + 1 }, () =>
    Array.from({ length: numRows }, (): TrackerCell => ({
      note: 0, instrument: 0, volume: 0,
      effTyp: 0, eff: 0, effTyp2: 0, eff2: 0,
    }))
  );

  let tempoChange = settings.realBPMmode;
  let writeDelay  = 0;
  let initialSpeed: number | undefined;
  let initialBPM:   number | undefined;

  for (let row = 0; row < numRows; row++) {
    if (pos >= data.length) break;

    // ── Global track ──────────────────────────────────────────────────────
    if (channelCounter[0] === 0) {
      if (pos >= data.length) break;
      const globalInfo = u8(v, pos++);

      if ((globalInfo & PAT_GLOB_PACK) !== 0) {
        if (pos >= data.length) break;
        channelCounter[0] = u8(v, pos++);
      }

      const cmd = globalInfo & PAT_GLOB_MASK;
      let   gd  = 0;
      if (cmd !== 0) {
        if (pos >= data.length) break;
        gd = u8(v, pos++);
      }

      switch (cmd) {
        case 1: // Set Tick Frame Speed
          settings.realBPMmode = false;
          settings.tempoTicks  = Math.max(1, gd);
          settings.tempoBPM    = 0;
          tempoChange = true;
          break;
        case 2: // Set BPM Speed
          if (gd !== 0) {
            settings.realBPMmode = true;
            settings.tempoBPM    = gd;
            if (settings.beat !== 0) {
              settings.tempoTicks = gd * settings.beat * 15;
            }
            tempoChange = true;
          }
          break;
        case 3: // Set Beat
          settings.beat = (gd >> 4);
          if (settings.beat !== 0) {
            tempoChange = settings.realBPMmode;
          } else {
            settings.realBPMmode = false;
          }
          break;
        case 4: // Tick Delay
          writeDelay = gd;
          break;
        case 5: // Set External Flag — ignore
          break;
        case 6: // Slide Speed Up
          if (gd > 0) {
            const ref = settings.realBPMmode ? 'bpm' : 'ticks';
            if (ref === 'bpm') {
              settings.tempoBPM = Math.min(255, settings.tempoBPM + gd);
            } else {
              settings.tempoTicks = Math.min(255, settings.tempoTicks + gd);
            }
            tempoChange = true;
          }
          break;
        case 7: // Slide Speed Down
          if (gd > 0) {
            const ref = settings.realBPMmode ? 'bpm' : 'ticks';
            if (ref === 'bpm') {
              settings.tempoBPM = Math.max(1, settings.tempoBPM - gd);
            } else {
              settings.tempoTicks = Math.max(1, settings.tempoTicks - gd);
            }
            tempoChange = true;
          }
          break;
      }
    } else {
      channelCounter[0]--;
    }

    // ── Compute tempo if changed ───────────────────────────────────────────
    let rowSpeed = 0;
    let rowBPM   = 0;
    if (tempoChange) {
      if (!settings.realBPMmode || settings.beat !== 0) {
        const { speed, bpm } = dmfTempoToSpeedBPM(
          settings.realBPMmode, settings.tempoBPM, settings.tempoTicks, settings.beat
        );
        rowSpeed = speed;
        rowBPM   = bpm;
        settings.internalTicks = Math.max(1, speed);
        tempoChange = false;

        if (row === 0) {
          initialSpeed = speed;
          initialBPM   = bpm;
        }
      } else {
        tempoChange = false;
      }
    }

    // Write tempo to global channel cell if it changed
    if (rowSpeed > 0 || rowBPM > 0) {
      const gc = grid[0][row];
      // Encode speed as Fxx < 0x20, BPM as Fxx >= 0x20
      // We store speed in effTyp/eff and BPM in effTyp2/eff2
      if (rowSpeed > 0) {
        gc.effTyp = XM_SPEED;
        gc.eff    = rowSpeed;
      }
      if (rowBPM > 0) {
        gc.effTyp2 = XM_TEMPO;
        gc.eff2    = rowBPM;
      }
    }

    // Tick delay commands go to global channel too
    if ((writeDelay & 0xF0) !== 0) {
      const gc = grid[0][row];
      if (gc.effTyp === XM_NONE) {
        gc.effTyp = XM_S3MCMDEX;
        gc.eff    = 0xE0 | (writeDelay >> 4);
      }
    }
    if ((writeDelay & 0x0F) !== 0) {
      const param = Math.max(1, Math.min(15, Math.floor((writeDelay & 0x0F) * settings.internalTicks / 15)));
      const gc = grid[0][row];
      if (gc.effTyp2 === XM_NONE) {
        gc.effTyp2 = XM_S3MCMDEX;
        gc.eff2    = 0x60 | param;
      }
    }
    writeDelay = 0;

    // ── Note channels ──────────────────────────────────────────────────────
    for (let chn = 1; chn <= numChannels; chn++) {
      if (channelCounter[chn] === 0) {
        if (pos >= data.length) break;
        const channelInfo = u8(v, pos++);

        if ((channelInfo & PAT_COUNTER) !== 0) {
          if (pos >= data.length) break;
          channelCounter[chn] = u8(v, pos++);
        }

        const cell = grid[chn][row];
        const cs   = settings.channelStates[chn - 1];

        let slideNote = true; // No instr → don't retrigger, use portamento

        // 0x40: Instrument
        if ((channelInfo & PAT_INSTR) !== 0) {
          if (pos >= data.length) break;
          cell.instrument = u8(v, pos++);
          if (cell.instrument !== 0) slideNote = false;
        }

        // 0x20: Note
        if ((channelInfo & PAT_NOTE) !== 0) {
          if (pos >= data.length) break;
          const rawNote = u8(v, pos++);
          if (rawNote >= 1 && rawNote <= 108) {
            // Normal note: DMF note + 24 → XM note range
            cell.note = Math.max(1, Math.min(120, rawNote + 24));
            cs.lastNote = cell.note;
          } else if (rawNote >= 129 && rawNote <= 236) {
            // Buffer note: queued for portamento, not played immediately
            cs.noteBuffer = Math.max(1, Math.min(120, (rawNote & 0x7F) + 24));
            cell.note = 0; // not played this row
          } else if (rawNote === DMF_NOTE_CUT) {
            cell.note = NOTE_NOTECUT;
          }
          // rawNote == 0 or other values → leave cell.note = 0
        }

        // If instrument without note → retrigger last note
        if (cell.note === 0 && cell.instrument > 0) {
          cell.note = cs.lastNote;
          cell.instrument = 0;
        }

        // Playing a note resets play direction
        if (cell.note >= 1 && cell.note <= 120) {
          cs.playDir = false;
        }

        // Effect accumulators
        let eff1:  number = XM_NONE; let p1 = 0;
        let eff2:  number = XM_NONE; let p2 = 0;
        let eff3:  number = XM_NONE; let p3 = 0;

        // ── 0x10: Volume ──────────────────────────────────────────────────
        let hasVolume = false;
        let volValue  = 0;
        if ((channelInfo & PAT_VOLUME) !== 0) {
          if (pos >= data.length) break;
          const raw = u8(v, pos++);
          // OpenMPT: vol = (raw + 2) / 4  (volume 1 is silent in X-Tracker)
          volValue  = Math.floor((raw + 2) / 4);
          hasVolume = true;
        }

        // ── 0x08: Instrument effect ───────────────────────────────────────
        if ((channelInfo & PAT_INS_EFF) !== 0) {
          if (pos + 1 >= data.length) break;
          const cmd = u8(v, pos++);
          p1        = u8(v, pos++);

          switch (cmd) {
            case 1: // Stop Sample
              cell.note = NOTE_NOTECUT;
              eff1 = XM_NONE;
              break;
            case 2: // Stop Sample Loop
              cell.note = NOTE_KEYOFF;
              eff1 = XM_NONE;
              break;
            case 3: // Instrument Volume Override ("Restart")
              cell.note = cs.lastNote;
              cs.playDir = false;
              eff1 = XM_NONE;
              break;
            case 4: { // Sample Delay
              const delay = dmfDelay2MPT(p1, settings.internalTicks);
              if (delay > 0) {
                eff1 = XM_S3MCMDEX;
                p1   = 0xD0 | delay;
              } else {
                eff1 = XM_NONE;
              }
              if (cell.note === 0) {
                cell.note = cs.lastNote;
                cs.playDir = false;
              }
              break;
            }
            case 5: { // Tremolo Retrig Sample
              const rt = Math.max(1, dmfDelay2MPT(p1, settings.internalTicks));
              eff1 = XM_RETRIG;
              p1   = rt;
              cs.playDir = false;
              break;
            }
            case 6: case 7: case 8: case 9: { // Offset (+ high page 0/64k/128k/192k)
              // High offset goes on previous row's S3MCMDEX
              // We store it in the current cell's effect for simplicity (minor inaccuracy)
              eff1 = XM_OFFSET;
              cs.highOffset = cmd;
              if (cell.note === 0) cell.note = cs.lastNote;
              cs.playDir = false;
              break;
            }
            case 10: // Invert Sample Play Direction
              eff1 = XM_S3MCMDEX;
              p1   = cs.playDir ? 0x9E : 0x9F;
              cs.playDir = !cs.playDir;
              break;
            default:
              eff1 = XM_NONE;
              break;
          }
        }

        // ── 0x04: Note effect ─────────────────────────────────────────────
        if ((channelInfo & PAT_NOTE_EFF) !== 0) {
          if (pos + 1 >= data.length) break;
          const cmd = u8(v, pos++);
          p2        = u8(v, pos++);

          switch (cmd) {
            case 1: { // Note Finetune (1/16th semitone signed)
              // OpenMPT: fine = (int8)p2 * 8 / 128; note += fine.quot; eff = CMD_FINETUNE
              // We approximate: shift note and ignore sub-semitone finetune
              const signedP2 = p2 < 128 ? p2 : p2 - 256;
              const fine = Math.round(signedP2 * 8 / 128);
              if (cell.note >= 1 && cell.note <= 120) {
                cell.note = Math.max(1, Math.min(120, cell.note + fine));
              }
              eff2 = XM_NONE; // CMD_FINETUNE has no direct XM equivalent; skip
              break;
            }
            case 2: { // Note Delay
              const delay = dmfDelay2MPT(p2, settings.internalTicks);
              if (delay > 0) {
                eff2 = XM_S3MCMDEX;
                p2   = 0xD0 | delay;
              } else {
                eff2 = XM_NONE;
              }
              break;
            }
            case 3: // Arpeggio
              eff2 = 0x00; // XM arpeggio = effect 0
              break;
            case 4: // Portamento Up
              p2   = dmfPorta2MPT(p2, settings.internalTicks, true);
              eff2 = XM_PORTA_UP;
              break;
            case 5: // Portamento Down
              p2   = dmfPorta2MPT(p2, settings.internalTicks, true);
              eff2 = XM_PORTA_DOWN;
              break;
            case 6: // Portamento to Note
              if (cell.note === 0) cell.note = cs.noteBuffer;
              p2   = dmfPorta2MPT(p2, settings.internalTicks, false);
              eff2 = XM_TONE_PORTA;
              break;
            case 7: // Scratch to Note
              cell.note = Math.max(1, Math.min(120, p2 + 25));
              eff2 = XM_TONE_PORTA;
              p2   = 0xFF;
              break;
            case 8: case 9: case 10: { // Vibrato (Sine / Triangle / Square)
              // Set vibrato waveform type on previous row (approximation: ignored here)
              cs.vibratoType = cmd;
              eff2 = XM_VIBRATO;
              p2   = dmfVibrato2MPT(p2, settings.internalTicks);
              break;
            }
            case 11: // Note Tremolo
              p2   = dmfTremor2MPT(p2, settings.internalTicks);
              eff2 = XM_TREMOR;
              break;
            case 12: { // Note Cut
              const delay = dmfDelay2MPT(p2, settings.internalTicks);
              if (delay > 0) {
                eff2 = XM_S3MCMDEX;
                p2   = 0xC0 | delay;
              } else {
                eff2   = XM_NONE;
                cell.note = NOTE_NOTECUT;
              }
              break;
            }
            default:
              eff2 = XM_NONE;
              break;
          }
        }

        // ── 0x02: Volume effect ───────────────────────────────────────────
        if ((channelInfo & PAT_VOL_EFF) !== 0) {
          if (pos + 1 >= data.length) break;
          const cmd = u8(v, pos++);
          p3        = u8(v, pos++);

          switch (cmd) {
            case 1: // Volume Slide Up
              p3   = dmfSlide2MPT(p3, settings.internalTicks, true);
              eff3 = XM_VOL_SLIDE;
              break;
            case 2: // Volume Slide Down
              p3   = dmfSlide2MPT(p3, settings.internalTicks, false);
              eff3 = XM_VOL_SLIDE;
              break;
            case 3: // Volume Tremolo (Tremor)
              p3   = dmfTremor2MPT(p3, settings.internalTicks);
              eff3 = XM_TREMOR;
              break;
            case 4: case 5: case 6: { // Tremolo (Sine / Triangle / Square)
              cs.tremoloType = cmd;
              eff3 = 0x07; // XM tremolo
              p3   = dmfVibrato2MPT(p3, settings.internalTicks);
              break;
            }
            case 7: // Set Balance (Panning)
              eff3 = XM_PANNING8;
              break;
            case 8: // Slide Balance Left
              p3   = dmfSlide2MPT(p3, settings.internalTicks, true);
              eff3 = XM_PAN_SLIDE;
              break;
            case 9: // Slide Balance Right
              p3   = dmfSlide2MPT(p3, settings.internalTicks, false);
              eff3 = XM_PAN_SLIDE;
              break;
            case 10: // Balance Vibrato (Panbrello)
              eff3 = XM_PANBRELLO;
              p3   = dmfVibrato2MPT(p3, settings.internalTicks);
              break;
            default:
              eff3 = XM_NONE;
              break;
          }
        }

        // ── Slide note: no instrument → use portamento instead of retrigger ──
        if (slideNote && cell.note >= 1 && cell.note <= 120) {
          if (eff2 === XM_NONE) {
            eff2 = XM_TONE_PORTA;
            p2   = 0xFF;
          } else if (eff3 === XM_NONE && eff2 !== XM_TONE_PORTA) {
            eff3 = XM_TONE_PORTA;
            p3   = 0xFF;
          }
        }

        // ── Merge effects into the two output slots ───────────────────────
        // Priority: instrument effects (eff1) > note effects (eff2) > volume effects (eff3)
        // Volume column gets volume if we have room.

        // Assign volume
        if (hasVolume) {
          cell.volume = volValue;
        }

        // We have three effects; TrackerCell only has two effect slots.
        // Fill eff2→effTyp/eff, eff3→effTyp2/eff2, instrument eff1 overwrites if present.
        cell.effTyp = eff2;
        cell.eff    = p2;
        cell.effTyp2 = eff3;
        cell.eff2    = p3;

        // Instrument effect takes priority: push it into slot 1, demote eff2 to slot 2
        if (eff1 !== XM_NONE) {
          // eff2 already in slot1 — move to slot2 if empty
          if (cell.effTyp2 === XM_NONE) {
            cell.effTyp2 = cell.effTyp;
            cell.eff2    = cell.eff;
          }
          cell.effTyp = eff1;
          cell.eff    = p1;
        }

        // Map internal note sentinel values to XM conventions
        if (cell.note === NOTE_NOTECUT) {
          cell.note = 254; // XM note cut (0xFE)
        } else if (cell.note === NOTE_KEYOFF) {
          cell.note = DMF_NOTE_OFF_XM; // XM key-off = 97
        }

      } else {
        channelCounter[chn]--;
      }
    } // end channel loop
  } // end row loop

  return {
    numRows,
    initialSpeed,
    initialBPM,
    channels: grid,
  };
}

// ── Main parser ───────────────────────────────────────────────────────────────

/**
 * Parse an X-Tracker DMF file into a TrackerSong.
 * Returns null on any parse failure (never throws).
 */
export function parseXTrackerFile(bytes: Uint8Array, filename: string): TrackerSong | null {
  try {
    return parseXTrackerFileInternal(bytes, filename);
  } catch {
    return null;
  }
}

function parseXTrackerFileInternal(bytes: Uint8Array, filename: string): TrackerSong | null {
  if (!isXTrackerFormat(bytes)) return null;

  const v           = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const fileVersion = bytes[4];

  // ── File header ────────────────────────────────────────────────────────────
  // +0  signature[4] = "DDMF"
  // +4  version(u8)
  // +5  tracker[8]
  // +13 songname[30]
  // +43 composer[20]
  // +63 creationDay(u8), creationMonth(u8), creationYear(u8)
  const songName = readString(v, 13, 30) || filename.replace(/\.[^/.]+$/i, '');

  // ── Read all chunks ────────────────────────────────────────────────────────
  const chunks = readChunks(v, bytes, fileVersion);

  // ── PATT chunk: read global channel count and all pattern raw data ─────────
  const pattChunk = chunks.get(ID_PATT);
  if (!pattChunk) return null;

  const pv = new DataView(pattChunk.data.buffer, pattChunk.data.byteOffset, pattChunk.data.byteLength);
  if (pattChunk.data.length < 3) return null;

  const numPatterns = u16le(pv, 0); // 1..1024
  const numTracks   = Math.max(1, Math.min(32, pattChunk.data[2])); // 1..32

  // Extract per-pattern raw data sub-chunks
  const headerSize = fileVersion < 3 ? 9 : 8;
  const patternRawData: Uint8Array[] = [];
  {
    let ppos = 3; // after DMFPatterns header
    for (let p = 0; p < numPatterns; p++) {
      if (ppos + headerSize > pattChunk.data.length) break;
      // patternLength is last 4 bytes of the header
      const patLength = u32le(pv, ppos + headerSize - 4);
      const total = headerSize + patLength;
      if (ppos + total > pattChunk.data.length) break;
      patternRawData.push(pattChunk.data.subarray(ppos, ppos + total));
      ppos += total;
    }
  }

  // ── SEQU chunk: order list ─────────────────────────────────────────────────
  const seqChunk = chunks.get(ID_SEQU);
  const orderList: number[] = [];
  let seqLoopStart = 0;
  let seqLoopEnd   = 0;
  let hasSeqLoop   = false;

  if (seqChunk) {
    const sv  = new DataView(seqChunk.data.buffer, seqChunk.data.byteOffset, seqChunk.data.byteLength);
    let   spos = 0;

    if (fileVersion >= 3 && spos + 2 <= seqChunk.data.length) {
      seqLoopStart = u16le(sv, spos); spos += 2;
    }
    if (fileVersion >= 4 && spos + 2 <= seqChunk.data.length) {
      seqLoopEnd = u16le(sv, spos); spos += 2;
      hasSeqLoop = true;
      // v4 quirk: if seqLoopEnd == 0 it may be buggy
      if (fileVersion === 4 && seqLoopEnd === 0) hasSeqLoop = false;
    }

    while (spos + 2 <= seqChunk.data.length) {
      orderList.push(u16le(sv, spos));
      spos += 2;
    }
  }

  // ── SMPI chunk: sample headers ────────────────────────────────────────────
  const smpiChunk = chunks.get(ID_SMPI);
  const smpdChunk = chunks.get(ID_SMPD);

  interface DMFSampleInfo {
    name:      string;
    length:    number;
    loopStart: number;
    loopEnd:   number;
    c3freq:    number;
    volume:    number; // 0 = ignore (use default 256 → scale to 64)
    flags:     number;
  }

  const sampleInfos: DMFSampleInfo[] = [];

  if (smpiChunk && smpiChunk.data.length >= 1) {
    const mi  = new DataView(smpiChunk.data.buffer, smpiChunk.data.byteOffset, smpiChunk.data.byteLength);
    const numSamples = smpiChunk.data[0];
    let   mpos = 1;

    for (let s = 0; s < numSamples; s++) {
      // Name length: v1 = fixed 30 bytes; v2+ = read 1 byte then that many bytes
      const nameLen = fileVersion < 2 ? 30 : (mpos < smpiChunk.data.length ? smpiChunk.data[mpos++] : 0);
      if (mpos + nameLen > smpiChunk.data.length) break;
      const name = readString(mi, mpos, nameLen);
      mpos += nameLen;

      // DMFSampleHeader: length(u32), loopStart(u32), loopEnd(u32), c3freq(u16), volume(u8), flags(u8) = 16 bytes
      if (mpos + 16 > smpiChunk.data.length) break;
      const length    = u32le(mi, mpos + 0);
      const loopStart = u32le(mi, mpos + 4);
      const loopEnd   = u32le(mi, mpos + 8);
      const c3freq    = u16le(mi, mpos + 10);
      const volume    = smpiChunk.data[mpos + 12];
      const flags     = smpiChunk.data[mpos + 13];
      mpos += 16;

      // v8+ has 8-byte library filename (skip)
      if (fileVersion >= 8) mpos += 8;

      // Filler + CRC: v2+ = 6 bytes, v1 = 2 bytes
      mpos += fileVersion > 1 ? 6 : 2;

      sampleInfos.push({ name: name || `Sample ${s + 1}`, length, loopStart, loopEnd, c3freq, volume, flags });
    }
  }

  // ── SMPD chunk: sample data ────────────────────────────────────────────────
  // Each entry: sampleDataLength(u32le), data[sampleDataLength]
  const samplePCM: (Uint8Array | null)[] = [];

  if (smpdChunk) {
    const dv   = new DataView(smpdChunk.data.buffer, smpdChunk.data.byteOffset, smpdChunk.data.byteLength);
    let   dpos = 0;

    for (let s = 0; s < sampleInfos.length; s++) {
      if (dpos + 4 > smpdChunk.data.length) { samplePCM.push(null); continue; }
      const blockLen = u32le(dv, dpos); dpos += 4;
      if (dpos + blockLen > smpdChunk.data.length) { samplePCM.push(null); dpos += blockLen; continue; }

      const raw  = smpdChunk.data.subarray(dpos, dpos + blockLen);
      dpos += blockLen;

      const info = sampleInfos[s];
      const comp = info.flags & SMP_COMP_MASK;

      if (blockLen === 0 || info.length === 0) {
        samplePCM.push(null);
        continue;
      }

      if (comp === SMP_COMP1) {
        // DMF Huffman decompression
        const is16 = (info.flags & SMP_16BIT) !== 0;
        const uncompLen = is16 ? info.length * 2 : info.length;
        const decompressed = dmfUnpack(raw, uncompLen);
        samplePCM.push(decompressed);
      } else {
        // Uncompressed PCM
        samplePCM.push(raw.slice());
      }
    }
  }

  // ── Build InstrumentConfig list ────────────────────────────────────────────
  const instruments: InstrumentConfig[] = [];

  for (let s = 0; s < sampleInfos.length; s++) {
    const info = sampleInfos[s];
    const id   = s + 1;
    const pcm  = samplePCM[s] ?? null;
    const is16 = (info.flags & SMP_16BIT) !== 0;
    const loop = (info.flags & SMP_LOOP)   !== 0;

    // Volume: 0 = ignore (use full 256 = 64 in 0-64 scale); else volume + 1 → scale
    const vol64 = info.volume === 0 ? 64 : Math.min(64, Math.floor((info.volume + 1) / 4));

    // C3 speed: clamp to reasonable range
    const c3freq = Math.max(1000, Math.min(45000, info.c3freq || 8363));

    if (!pcm || pcm.length === 0) {
      instruments.push({
        id,
        name:      info.name,
        type:      'sample'  as const,
        synthType: 'Sampler' as const,
        effects:   [],
        volume:    -60,
        pan:       0,
      } as InstrumentConfig);
      continue;
    }

    if (is16) {
      // 16-bit signed PCM
      let loopStartFrames = 0;
      let loopEndFrames   = 0;
      if (loop) {
        loopStartFrames = Math.floor(info.loopStart / 2);
        loopEndFrames   = Math.floor(info.loopEnd   / 2);
        const maxFrames = Math.floor(pcm.length / 2);
        loopEndFrames   = Math.min(loopEndFrames, maxFrames);
      }
      const hasLoop = loop && loopEndFrames > loopStartFrames;
      const wavBuf  = buildWAV16(pcm, c3freq);
      const dataUrl = wavToDataUrl(wavBuf);

      instruments.push({
        id,
        name:      info.name.replace(/\0/g, '').trim() || `Sample ${id}`,
        type:      'sample'  as const,
        synthType: 'Sampler' as const,
        effects:   [],
        volume:    vol64 > 0 ? 20 * Math.log10(vol64 / 64) : -60,
        pan:       0,
        sample: {
          audioBuffer: wavBuf,
          url:         dataUrl,
          baseNote:    'C3',
          detune:      0,
          loop:        hasLoop,
          loopType:    hasLoop ? 'forward' as const : 'off' as const,
          loopStart:   loopStartFrames,
          loopEnd:     loopEndFrames > 0 ? loopEndFrames : Math.floor(pcm.length / 2),
          sampleRate:  c3freq,
          reverse:     false,
          playbackRate: 1.0,
        },
      } as unknown as InstrumentConfig);
    } else {
      // 8-bit unsigned PCM (X-Tracker stores as unsigned, createSamplerInstrument accepts it)
      let loopStartFrames = 0;
      let loopEndFrames   = 0;
      if (loop) {
        loopStartFrames = info.loopStart;
        loopEndFrames   = Math.min(info.loopEnd, pcm.length);
      }
      const loopEnd = (loop && loopEndFrames > loopStartFrames) ? loopEndFrames : 0;
      instruments.push(
        createSamplerInstrument(id, info.name, pcm, vol64, c3freq, loopStartFrames, loopEnd)
      );
    }
  }

  // ── Convert patterns ───────────────────────────────────────────────────────
  const numGlobalChannels = numTracks + 1; // +1 for global track

  const settings = {
    realBPMmode:   false,
    beat:          0,
    tempoTicks:    32,   // X-Tracker default tick speed
    tempoBPM:      120,
    internalTicks: 6,
    channelStates: Array.from({ length: numTracks }, () => makeChannelState()),
  };

  // Compute initial BPM/speed before any patterns
  const { speed: initSpeed, bpm: initBPM } = dmfTempoToSpeedBPM(
    settings.realBPMmode, settings.tempoBPM, settings.tempoTicks, settings.beat
  );

  const convertedPatterns: ConvertedPattern[] = [];
  for (const rawPat of patternRawData) {
    const cp = convertDMFPattern(rawPat, fileVersion, settings, numGlobalChannels);
    convertedPatterns.push(cp ?? { numRows: 64, channels: [] });
  }

  // ── Build TrackerSong patterns ─────────────────────────────────────────────
  // OpenMPT creates one pattern per ORDER entry (the same source pattern can have
  // different tempo state when played at different positions).
  // We do the same: one Pattern object per order position.
  const patterns: Pattern[] = [];
  const songPositions: number[] = [];

  // Map from source pattern index to set of order positions that use it
  // (each order entry maps to a unique Pattern in our output)
  for (let ordIdx = 0; ordIdx < orderList.length; ordIdx++) {
    const srcPat = orderList[ordIdx];
    const cp     = srcPat < convertedPatterns.length ? convertedPatterns[srcPat] : null;
    const numRows = cp?.numRows ?? 64;
    const patIdx  = patterns.length;

    // Build ChannelData: channel 0 is the global/tempo track, channels 1..N are note channels
    const channelDataArr: ChannelData[] = [];

    for (let ch = 0; ch <= numTracks; ch++) {
      const cells: TrackerCell[] = cp?.channels[ch] ?? Array.from({ length: numRows }, (): TrackerCell => ({
        note: 0, instrument: 0, volume: 0, effTyp: 0, eff: 0, effTyp2: 0, eff2: 0,
      }));

      channelDataArr.push({
        id:           `channel-${ch}`,
        name:         ch === 0 ? 'Global' : `Channel ${ch}`,
        muted:        false,
        solo:         false,
        collapsed:    false,
        volume:       100,
        pan:          0,
        instrumentId: null,
        color:        null,
        rows:         cells,
      });
    }

    patterns.push({
      id:      `pattern-${patIdx}`,
      name:    `Pattern ${srcPat}`,
      length:  numRows,
      channels: channelDataArr,
      importMetadata: {
        sourceFormat:            'DMF',
        sourceFile:              filename,
        importedAt:              new Date().toISOString(),
        originalChannelCount:    numTracks,
        originalPatternCount:    patternRawData.length,
        originalInstrumentCount: sampleInfos.length,
      },
    });

    songPositions.push(patIdx);
  }

  // If no patterns were built, create a minimal empty one
  if (patterns.length === 0) {
    patterns.push({
      id: 'pattern-0',
      name: 'Pattern 0',
      length: 64,
      channels: Array.from({ length: numTracks + 1 }, (_, ch): ChannelData => ({
        id:           `channel-${ch}`,
        name:         ch === 0 ? 'Global' : `Channel ${ch}`,
        muted:        false,
        solo:         false,
        collapsed:    false,
        volume:       100,
        pan:          0,
        instrumentId: null,
        color:        null,
        rows: Array.from({ length: 64 }, (): TrackerCell => ({
          note: 0, instrument: 0, volume: 0, effTyp: 0, eff: 0, effTyp2: 0, eff2: 0,
        })),
      })),
      importMetadata: {
        sourceFormat:            'DMF',
        sourceFile:              filename,
        importedAt:              new Date().toISOString(),
        originalChannelCount:    numTracks,
        originalPatternCount:    0,
        originalInstrumentCount: sampleInfos.length,
      },
    });
    songPositions.push(0);
  }

  // ── Handle sequence loop ───────────────────────────────────────────────────
  // When a loop end is present, insert a position-jump effect in the last row
  // of the loop-end pattern. We approximate this by encoding it as a restart pos.
  const restartPosition = hasSeqLoop && seqLoopStart < songPositions.length
    ? seqLoopStart
    : 0;

  return {
    name:            songName,
    format:          'IT' as TrackerFormat,   // DMF effects map best to IT conventions
    patterns,
    instruments,
    songPositions,
    songLength:      songPositions.length,
    restartPosition,
    numChannels:     numTracks + 1,           // +1 for global track
    initialSpeed:    initSpeed,
    initialBPM:      initBPM,
    linearPeriods:   true,                    // X-Tracker uses linear slides
  };
}
