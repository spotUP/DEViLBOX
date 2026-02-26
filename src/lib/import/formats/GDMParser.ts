/**
 * GDMParser.ts — General Digital Music / BWSB 2GDM (.gdm) format parser
 *
 * GDM is a conversion format produced by BWSB 2GDM. It wraps MOD/S3M/FAR/ULT/etc.
 * files into a single container with a normalised effect set. All values are
 * little-endian.
 *
 * Binary layout:
 *   GDMFileHeader (157 bytes):
 *     +0    magic[4]          = "GDM\xFE"
 *     +4    songTitle[32]
 *     +36   songMusician[32]
 *     +68   dosEOF[3]         = {13, 10, 26}
 *     +71   magic2[4]         = "GMFS"
 *     +75   formatMajorVer    (uint8, must be 1)
 *     +76   formatMinorVer    (uint8, must be 0)
 *     +77   trackerID         (uint16LE)
 *     +79   trackerMajorVer   (uint8)
 *     +80   trackerMinorVer   (uint8)
 *     +81   panMap[32]        (uint8 each: 0-15=pan, 16=surround, 255=unused)
 *     +113  masterVol         (uint8, 0-64)
 *     +114  tempo             (uint8) → initial speed (ticks per row)
 *     +115  bpm               (uint8) → initial BPM
 *     +116  originalFormat    (uint16LE): 1=MOD 2=MTM 3=S3M 4=669 5=FAR 6=ULT 7=STM 8=MED 9=PSM
 *     +118  orderOffset       (uint32LE)
 *     +122  lastOrder         (uint8)  → numOrders = lastOrder + 1
 *     +123  patternOffset     (uint32LE)
 *     +127  lastPattern       (uint8)  → numPatterns = lastPattern + 1
 *     +128  sampleHeaderOffset(uint32LE)
 *     +132  sampleDataOffset  (uint32LE)
 *     +136  lastSample        (uint8)  → numSamples = lastSample + 1
 *     +137  messageTextOffset (uint32LE)
 *     +141  messageTextLength (uint32LE)
 *     +145  scrollyScriptOffset(uint32LE)
 *     +149  scrollyScriptLength(uint16LE)
 *     +151  textGraphicOffset (uint32LE)
 *     +155  textGraphicLength (uint16LE)
 *
 *   GDMSampleHeader (62 bytes, repeated numSamples times at sampleHeaderOffset):
 *     +0    name[32]
 *     +32   fileName[12]
 *     +44   emsHandle  (uint8, ignored)
 *     +45   length     (uint32LE, bytes)
 *     +49   loopBegin  (uint32LE, bytes)
 *     +53   loopEnd    (uint32LE, bytes; effective end = loopEnd - 1)
 *     +57   flags      (uint8): smpLoop=0x01 smp16Bit=0x02 smpVolume=0x04 smpPanning=0x08
 *     +58   c4Hertz    (uint16LE) → C5 speed
 *     +60   volume     (uint8, 0-64; only if smpVolume flag set)
 *     +61   panning    (uint8, 0-15 / 16=surround / 255=no pan)
 *
 * Reference: OpenMPT Load_gdm.cpp
 */

import type { TrackerSong, TrackerFormat } from '@/engine/TrackerReplayer';
import type { Pattern, ChannelData, TrackerCell, InstrumentConfig } from '@/types';
import { createSamplerInstrument } from './AmigaUtils';

// ── Binary helpers ─────────────────────────────────────────────────────────────

function u8(v: DataView, off: number): number  { return v.getUint8(off); }
function u16le(v: DataView, off: number): number { return v.getUint16(off, true); }
function u32le(v: DataView, off: number): number { return v.getUint32(off, true); }

function readString(v: DataView, off: number, len: number): string {
  let s = '';
  for (let i = 0; i < len; i++) {
    const ch = v.getUint8(off + i);
    if (ch === 0) break;
    s += String.fromCharCode(ch);
  }
  return s.trim();
}

// ── Constants ─────────────────────────────────────────────────────────────────

const FILE_HEADER_SIZE   = 157;
const SAMPLE_HEADER_SIZE = 62;
const ROWS_PER_PATTERN   = 64;

// Sample flags
const SMP_LOOP    = 0x01;
const SMP_16BIT   = 0x02;
const SMP_VOLUME  = 0x04;
const _SMP_PANNING = 0x08;

// Pattern cell channel-byte flags
const ROW_DONE     = 0x00;
const CHANNEL_MASK = 0x1F;
const NOTE_FLAG    = 0x20;
const EFFECT_FLAG  = 0x40;
const EFFECT_MASK  = 0x1F;
const EFFECT_MORE  = 0x20;

// GDM effect → XM/TrackerCell effect-type translation LUT
// Indices 0-31 map directly from (effByte & 0x1F):
//   0=none 1=portaUp 2=portaDn 3=tonePorta 4=vibrato 5=tonePortaVol 6=vibratoVol
//   7=tremolo 8=tremor 9=offset A=volSlide B=posJump C=volume D=patBreak E=modCmdEx
//   F=speed 10=arpeggio 11=none(internal) 12=retrig 13=globalVol 14=fineVibrato
//   15-1D=none 1E=S3MCmdEx 1F=tempo
//
// We store them as [effTyp, meaning] pairs where effTyp matches XM/TrackerReplayer
// command bytes (0x0=none, 0x1=portaUp, …, per standard XM effect encoding).

// XM effect byte assignments (matching TrackerReplayer expectations):
// 0x00 = Arpeggio / none
// 0x01 = Porta up
// 0x02 = Porta down
// 0x03 = Tone porta
// 0x04 = Vibrato
// 0x05 = Tone porta + vol slide
// 0x06 = Vibrato + vol slide
// 0x07 = Tremolo
// 0x08 = Set panning
// 0x09 = Sample offset
// 0x0A = Volume slide
// 0x0B = Position jump
// 0x0C = Set volume
// 0x0D = Pattern break
// 0x0E = Extended (MOD Exy)
// 0x0F = Set speed/BPM
// 0x10 = Set global volume
// 0x1B = Retrig
// 0x1D = Fine vibrato (XM Rxy)
// 0x1E = S3M extended (Sxy)
// 0x1F = Tempo (XM Txx)
//
// The TrackerReplayer uses numeric effect types.  We map each GDM command to the
// integer that TrackerReplayer uses internally.  For "none" we use 0 (arpeggio
// with param 0 = silence).

// GDM effect indices 0x00–0x1F mapped to TrackerCell effTyp values
// (matching the OpenMPT gdmEffTrans[] table):
const GDM_EFF_TRANS: number[] = [
  /* 0x00 none */           0x00,
  /* 0x01 portaUp */        0x01,
  /* 0x02 portaDn */        0x02,
  /* 0x03 tonePorta */      0x03,
  /* 0x04 vibrato */        0x04,
  /* 0x05 tonePortaVol */   0x05,
  /* 0x06 vibratoVol */     0x06,
  /* 0x07 tremolo */        0x07,
  /* 0x08 tremor */         0x1D, // CMD_TREMOR — using 0x1D (XM Ixy slot)
  /* 0x09 offset */         0x09,
  /* 0x0A volSlide */       0x0A,
  /* 0x0B posJump */        0x0B,
  /* 0x0C volume */         0x0C,
  /* 0x0D patBreak */       0x0D,
  /* 0x0E modCmdEx */       0x0E,
  /* 0x0F speed */          0x0F,
  /* 0x10 arpeggio */       0x00,
  /* 0x11 none(internal) */ 0x00,
  /* 0x12 retrig */         0x1B,
  /* 0x13 globalVol */      0x10,
  /* 0x14 fineVibrato */    0x15, // XM fine vibrato
  /* 0x15 none */           0x00,
  /* 0x16 none */           0x00,
  /* 0x17 none */           0x00,
  /* 0x18 none */           0x00,
  /* 0x19 none */           0x00,
  /* 0x1A none */           0x00,
  /* 0x1B none */           0x00,
  /* 0x1C none */           0x00,
  /* 0x1D none */           0x00,
  /* 0x1E S3MCmdEx */       0x1E,
  /* 0x1F tempo */          0x1F,
];

// Names for original format IDs 1-9
const ORIGINAL_FORMAT_NAMES: string[] = [
  '', 'MOD', 'MTM', 'S3M', '669', 'FAR', 'ULT', 'STM', 'MED', 'PSM',
];

// ── Format detection ──────────────────────────────────────────────────────────

/**
 * Returns true if the buffer is a valid GDM file.
 *
 * Detection checks (all must pass):
 *   1. "GDM\xFE" at offset 0
 *   2. dosEOF bytes = {13, 10, 26} at offsets 68-70
 *   3. "GMFS" at offset 71
 *   4. formatMajorVer == 1, formatMinorVer == 0
 *   5. originalFormat in range 1-9
 *   6. numChannels (first 0xFF in panMap[32]) > 0
 */
export function isGDMFormat(buffer: ArrayBuffer): boolean {
  if (buffer.byteLength < FILE_HEADER_SIZE) return false;

  const v = new DataView(buffer);

  // Magic 1: "GDM\xFE" at +0
  if (u8(v, 0) !== 0x47 || u8(v, 1) !== 0x44 || u8(v, 2) !== 0x4D || u8(v, 3) !== 0xFE) {
    return false;
  }

  // dosEOF: {13, 10, 26} at +68
  if (u8(v, 68) !== 13 || u8(v, 69) !== 10 || u8(v, 70) !== 26) return false;

  // Magic 2: "GMFS" at +71
  if (u8(v, 71) !== 0x47 || u8(v, 72) !== 0x4D || u8(v, 73) !== 0x46 || u8(v, 74) !== 0x53) {
    return false;
  }

  // Format version: must be 1.0
  if (u8(v, 75) !== 1 || u8(v, 76) !== 0) return false;

  // originalFormat must be 1-9
  const originalFormat = u16le(v, 116);
  if (originalFormat < 1 || originalFormat > 9) return false;

  // numChannels = position of first 0xFF in panMap[32] (at +81)
  let numChannels = 0;
  for (let i = 0; i < 32; i++) {
    if (u8(v, 81 + i) === 0xFF) { numChannels = i; break; }
    if (i === 31) numChannels = 32; // no 0xFF found → all 32 used
  }
  if (numChannels === 0) return false;

  return true;
}

// ── Pattern chunk reader ──────────────────────────────────────────────────────

/** Stateful byte reader for a fixed-length pattern chunk. */
class ChunkReader {
  private pos = 0;
  private readonly data: Uint8Array;
  constructor(data: Uint8Array) { this.data = data; }

  canRead(n: number): boolean { return this.pos + n <= this.data.length; }

  readU8(): number {
    if (this.pos >= this.data.length) return 0;
    return this.data[this.pos++];
  }
}

// ── Panning helper ────────────────────────────────────────────────────────────

/**
 * Convert a GDM pan value (0-15, 16=surround, 255=no pan) to a
 * TrackerCell-style pan position (-100 to +100, 0 = centre).
 *
 * GDM 0 = far left, 8 = centre, 15 = far right.
 * Mapping: 0-15 → 0-255 using (pan * 16) + 8, then centre-offset to -100..+100.
 */
function gdmPanToTrackerPan(gdmPan: number): number {
  if (gdmPan > 15) return 0; // surround or no-pan → centre
  // Map 0-15 → 0-255 like OpenMPT
  const p255 = Math.min((gdmPan * 16) + 8, 255);
  // Centre-offset to -100..+100
  return Math.round((p255 - 128) * 100 / 128);
}

// ── Effect translation ────────────────────────────────────────────────────────

interface EffectResult {
  effTyp: number;
  eff:    number;
  /** If the effect produced a volume column entry, place it here */
  volcmd: number;
  vol:    number;
}

/**
 * Translate a single GDM (effByte & EFFECT_MASK, param) pair into a
 * TrackerCell effect, applying all OpenMPT fixups.
 *
 * Returns the primary effect and, when the command is CMD_VOLUME (0x0C),
 * a volume-column value instead of a pattern command.
 */
function translateGDMEffect(rawCmd: number, param: number): EffectResult {
  const gdmCmd = rawCmd & EFFECT_MASK;
  const effTyp  = gdmCmd < GDM_EFF_TRANS.length ? GDM_EFF_TRANS[gdmCmd] : 0x00;
  let eff       = param;
  let volcmd    = 0;
  let vol       = 0;
  let outEffTyp = effTyp;

  switch (gdmCmd) {
    // 0x01 portaUp / 0x02 portaDn: clamp param to 0xDF to avoid fine-slide territory
    case 0x01:
    case 0x02:
      if (eff >= 0xE0) eff = 0xDF;
      break;

    // 0x05 tonePortaVol / 0x06 vibratoVol: keep only the non-zero nibble
    case 0x05:
    case 0x06:
      if (eff & 0xF0) eff &= 0xF0;
      break;

    // 0x0C volume: clamp to 64, move to volume column
    case 0x0C:
      eff     = Math.min(eff, 64);
      volcmd  = 1; // VOLCMD_VOLUME (volume column has a value)
      vol     = eff;
      outEffTyp = 0x00;
      eff       = 0;
      break;

    // 0x0E modCmdEx: fix portamento fine-slide sub-commands
    case 0x0E:
      switch (param >> 4) {
        case 0x8:
          outEffTyp = 0x01; // portaUp
          eff = 0xE0 | (param & 0x0F);
          break;
        case 0x9:
          outEffTyp = 0x02; // portaDn
          eff = 0xE0 | (param & 0x0F);
          break;
        default:
          // Keep as modCmdEx (0x0E)
          break;
      }
      break;

    // 0x12 retrig: convert to MOD-style CMD_MODCMDEX (E9x)
    case 0x12:
      outEffTyp = 0x0E; // CMD_MODCMDEX
      eff = 0x90 | (param & 0x0F);
      break;

    // 0x1E S3MCmdEx: only surround (0x01→0x91) and 4-bit panning (0x8x) survive
    case 0x1E:
      if (param === 0x01) {
        eff = 0x91; // surround
      } else if ((param & 0xF0) === 0x80) {
        // 4-bit panning: keep as S3MCmdEx (0x1E)
      } else {
        // Not implemented in 2GDM/BWSB → silence
        outEffTyp = 0x00;
        eff       = 0x00;
      }
      break;

    default:
      break;
  }

  return { effTyp: outEffTyp, eff, volcmd, vol };
}

// ── Main parser ───────────────────────────────────────────────────────────────

/**
 * Parse a General Digital Music (.gdm) file into a TrackerSong.
 *
 * @throws If the file fails GDM format validation.
 */
export async function parseGDMFile(
  buffer: ArrayBuffer,
  filename: string,
): Promise<TrackerSong> {
  if (!isGDMFormat(buffer)) {
    throw new Error('GDMParser: file does not pass GDM format validation');
  }

  const v     = new DataView(buffer);
  const bytes = new Uint8Array(buffer);

  // ── File header fields ─────────────────────────────────────────────────────

  const songTitle     = readString(v, 4,  32) || filename.replace(/\.[^/.]+$/, '');
  const songMusician  = readString(v, 36, 32);
  // +75 formatMajorVer, +76 formatMinorVer (already validated)
  const trackerMajorVer = u8(v, 79);
  const trackerMinorVer = u8(v, 80);
  // panMap at +81, 32 bytes
  const masterVol     = u8(v, 113);
  const tempo         = u8(v, 114); // initial speed (ticks per row)
  const bpm           = u8(v, 115); // initial BPM
  const originalFormat = u16le(v, 116);

  const orderOffset         = u32le(v, 118);
  const lastOrder           = u8(v, 122);
  const patternOffset       = u32le(v, 123);
  const lastPattern         = u8(v, 127);
  const sampleHeaderOffset  = u32le(v, 128);
  const sampleDataOffset    = u32le(v, 132);
  const lastSample          = u8(v, 136);
  const _messageTextOffset   = u32le(v, 137);
  const _messageTextLength   = u32le(v, 141);

  const numOrders   = lastOrder   + 1;
  const numPatterns = lastPattern + 1;
  const numSamples  = lastSample  + 1;

  // Derive numChannels from panMap: first 0xFF entry = channel count
  let numChannels = 32;
  for (let i = 0; i < 32; i++) {
    if (u8(v, 81 + i) === 0xFF) { numChannels = i; break; }
  }

  // Build channel pan array from panMap (0-15 → -100..+100, 16=surround→0)
  const channelPans: number[] = [];
  for (let i = 0; i < numChannels; i++) {
    channelPans.push(gdmPanToTrackerPan(u8(v, 81 + i)));
  }

  // Global volume: min(masterVol * 4, 256), then scale to 0-64
  const nDefaultGlobalVolume = Math.min(masterVol * 4, 256);

  // Format comment (trackerID at +77)
  const trackerID = u16le(v, 77);
  void trackerID;         // available for metadata but not stored in TrackerSong
  void trackerMajorVer;
  void trackerMinorVer;
  void songMusician;
  void nDefaultGlobalVolume;

  // ── Order list ─────────────────────────────────────────────────────────────
  // At orderOffset, read numOrders bytes. 0xFF = end marker, 0xFE = loop.
  // We include all entries up to the first 0xFF (exclusive).

  const orderList: number[] = [];
  if (orderOffset + numOrders <= buffer.byteLength) {
    for (let i = 0; i < numOrders; i++) {
      const o = u8(v, orderOffset + i);
      if (o === 0xFF) break; // end of order list
      orderList.push(o === 0xFE ? 0xFE : o); // pass 0xFE (loop) through as-is
    }
  }
  // Filter out 0xFE loop markers for songPositions (keep only pattern indices)
  const songPositions = orderList.filter(o => o !== 0xFE);

  // ── Sample headers ─────────────────────────────────────────────────────────

  interface GDMSampleInfo {
    name:      string;
    fileName:  string;
    length:    number;   // bytes
    loopBegin: number;   // bytes
    loopEnd:   number;   // bytes (effective end = loopEnd - 1)
    flags:     number;
    c4Hertz:   number;
    volume:    number;
    panning:   number;
  }

  const sampleInfos: GDMSampleInfo[] = [];
  let sampleHeaderCursor = sampleHeaderOffset;

  for (let s = 0; s < numSamples; s++) {
    if (sampleHeaderCursor + SAMPLE_HEADER_SIZE > buffer.byteLength) break;

    sampleInfos.push({
      name:      readString(v, sampleHeaderCursor + 0,  32) || `Sample ${s + 1}`,
      fileName:  readString(v, sampleHeaderCursor + 32, 12),
      length:    u32le(v, sampleHeaderCursor + 45),
      loopBegin: u32le(v, sampleHeaderCursor + 49),
      loopEnd:   u32le(v, sampleHeaderCursor + 53),
      flags:     u8(v, sampleHeaderCursor + 57),
      c4Hertz:   u16le(v, sampleHeaderCursor + 58),
      volume:    u8(v, sampleHeaderCursor + 60),
      panning:   u8(v, sampleHeaderCursor + 61),
    });

    sampleHeaderCursor += SAMPLE_HEADER_SIZE;
  }

  // ── Sample PCM data ────────────────────────────────────────────────────────
  // All samples are stored sequentially starting at sampleDataOffset.
  // GDM PCM is unsigned (center = 0x80). Convert to signed by XOR 0x80 each byte.
  // 16-bit samples: length in bytes (not samples); loopBegin/End also in bytes.
  // We downsample 16-bit to 8-bit (take high byte) like DSMParser does, since
  // createSamplerInstrument expects 8-bit PCM input.

  let pcmCursor = sampleDataOffset;
  const samplePCM: (Uint8Array | null)[] = [];

  for (let s = 0; s < sampleInfos.length; s++) {
    const info    = sampleInfos[s];
    const byteLen = info.length;

    if (byteLen === 0 || pcmCursor + byteLen > buffer.byteLength) {
      samplePCM.push(null);
      pcmCursor += byteLen;
      continue;
    }

    const raw = bytes.subarray(pcmCursor, pcmCursor + byteLen);

    if (info.flags & SMP_16BIT) {
      // 16-bit little-endian unsigned PCM → 8-bit signed
      // Take the high byte of each 16-bit sample, then flip bit 7 for sign.
      const numSamples16 = Math.floor(byteLen / 2);
      const pcm8 = new Uint8Array(numSamples16);
      for (let i = 0; i < numSamples16; i++) {
        // LE: [lowByte, highByte]; high byte carries the waveform shape
        const highByte = raw[i * 2 + 1];
        pcm8[i] = highByte ^ 0x80; // unsigned → signed
      }
      samplePCM.push(pcm8);
    } else {
      // 8-bit unsigned PCM → signed (XOR 0x80)
      const pcm8 = new Uint8Array(byteLen);
      for (let i = 0; i < byteLen; i++) {
        pcm8[i] = raw[i] ^ 0x80;
      }
      samplePCM.push(pcm8);
    }

    pcmCursor += byteLen;
  }

  // ── Build InstrumentConfig list ────────────────────────────────────────────

  const instruments: InstrumentConfig[] = [];

  for (let s = 0; s < sampleInfos.length; s++) {
    const info = sampleInfos[s];
    const id   = s + 1;
    const pcm  = samplePCM[s];

    if (!pcm || pcm.length === 0) {
      instruments.push({
        id,
        name:      info.name,
        type:      'sample'  as const,
        synthType: 'Sampler' as const,
        effects:   [],
        volume:    -60,
        pan:       0,
      } as unknown as InstrumentConfig);
      continue;
    }

    const hasLoop = (info.flags & SMP_LOOP) !== 0 && info.loopEnd > info.loopBegin;
    const is16bit = (info.flags & SMP_16BIT) !== 0;

    // Loop offsets are byte offsets in the original data.
    // If 16-bit, divide by 2 to get sample indices in the downsampled 8-bit array.
    // Effective loopEnd = loopEnd - 1 (byte offset), per GDM spec.
    let loopStart = is16bit ? Math.floor(info.loopBegin / 2) : info.loopBegin;
    let loopEnd   = is16bit ? Math.floor((info.loopEnd - 1) / 2) : (info.loopEnd - 1);
    loopEnd       = Math.min(loopEnd, pcm.length);

    // Default volume: if smpVolume flag set, use info.volume (0-64), else 64
    const defaultVol = (info.flags & SMP_VOLUME) ? Math.min(info.volume, 64) : 64;

    // C4 speed stored as C5 speed (Hz)
    const sampleRate = info.c4Hertz > 0 ? info.c4Hertz : 8363;

    instruments.push(
      createSamplerInstrument(
        id,
        info.name,
        pcm,
        defaultVol,
        sampleRate,
        hasLoop ? loopStart : 0,
        hasLoop ? loopEnd   : 0,
      ),
    );
  }

  // ── Patterns ───────────────────────────────────────────────────────────────
  // Seek to patternOffset. For each pattern: read uint16LE patternLength (includes
  // itself), then parse (patternLength - 2) bytes as a row-packed chunk.
  // 64 rows per pattern, each row terminated by a 0x00 channel byte.

  const patterns: Pattern[] = [];
  let patCursor = patternOffset;

  for (let pIdx = 0; pIdx < numPatterns; pIdx++) {
    if (patCursor + 2 > buffer.byteLength) break;

    const patternLength = u16le(v, patCursor);
    patCursor += 2;

    const chunkLen = patternLength > 2 ? patternLength - 2 : 0;

    if (chunkLen === 0 || patCursor + chunkLen > buffer.byteLength) {
      patCursor += chunkLen;
      // Push an empty pattern placeholder
      patterns.push(buildEmptyPattern(pIdx, numChannels, filename, numPatterns, sampleInfos.length));
      continue;
    }

    const chunkData  = bytes.subarray(patCursor, patCursor + chunkLen);
    patCursor       += chunkLen;
    const chunk      = new ChunkReader(chunkData);

    // Initialise channels (all rows empty)
    const channelRows: TrackerCell[][] = Array.from({ length: numChannels }, () => []);

    for (let row = 0; row < ROWS_PER_PATTERN; row++) {
      // Accumulate events for this row; flush to channelRows at end of row.
      const rowCells: Map<number, TrackerCell> = new Map();

      // Read channel events until ROW_DONE (0x00)
      while (chunk.canRead(1)) {
        const channelByte = chunk.readU8();
        if (channelByte === ROW_DONE) break;

        const channel = channelByte & CHANNEL_MASK;
        if (channel >= numChannels) {
          // Out-of-range channel — skip note/effect bytes to stay in sync
          if (channelByte & NOTE_FLAG)   { chunk.readU8(); chunk.readU8(); }
          if (channelByte & EFFECT_FLAG) {
            let more = true;
            while (more && chunk.canRead(2)) {
              const eb = chunk.readU8(); chunk.readU8();
              more = (eb & EFFECT_MORE) !== 0;
            }
          }
          continue;
        }

        // Start building/updating the cell for this channel.
        // Multiple channel bytes can target the same channel (rare but valid).
        let cell: TrackerCell = rowCells.get(channel) ?? {
          note: 0, instrument: 0, volume: 0,
          effTyp: 0, eff: 0, effTyp2: 0, eff2: 0,
        };

        // ── Note / instrument ────────────────────────────────────────────────
        if (channelByte & NOTE_FLAG) {
          const rawNote = chunk.readU8();
          const instr   = chunk.readU8();

          if (rawNote !== 0) {
            // High bit = no-retrig flag (ignore); strip it for note decode.
            const noteByte = (rawNote & 0x7F) - 1;
            // GDM note encoding: high nibble = octave, low nibble = semitone
            // XM note = semitone + 12 * octave + 12 + 1 (1-based, C-0 = 1)
            const xmNote = (noteByte & 0x0F) + 12 * (noteByte >> 4) + 12 + 1;
            cell = { ...cell, note: xmNote };
          }
          if (instr !== 0) {
            cell = { ...cell, instrument: instr };
          }
        }

        // ── Effects ──────────────────────────────────────────────────────────
        if (channelByte & EFFECT_FLAG) {
          let effectMore = true;
          let firstEffect = true;

          while (effectMore && chunk.canRead(2)) {
            const effByte = chunk.readU8();
            const param   = chunk.readU8();
            effectMore    = (effByte & EFFECT_MORE) !== 0;

            const { effTyp, eff, volcmd, vol } = translateGDMEffect(effByte, param);

            if (firstEffect) {
              // Primary effect slot
              if (volcmd !== 0) {
                // CMD_VOLUME → goes to volume column; keep any prior effTyp/eff
                cell = { ...cell, volume: vol };
              } else {
                cell = { ...cell, effTyp, eff };
              }
              firstEffect = false;
            } else {
              // Secondary effect slot (effTyp2/eff2)
              if (volcmd !== 0) {
                cell = { ...cell, volume: vol };
              } else if (cell.effTyp2 === 0) {
                cell = { ...cell, effTyp2: effTyp, eff2: eff };
              }
              // Tertiary+ effects are discarded (TrackerCell only has two slots)
            }
          }
        }

        rowCells.set(channel, cell);
      }

      // Flush this row into channelRows
      for (let ch = 0; ch < numChannels; ch++) {
        channelRows[ch].push(rowCells.get(ch) ?? {
          note: 0, instrument: 0, volume: 0,
          effTyp: 0, eff: 0, effTyp2: 0, eff2: 0,
        });
      }
    }

    // Build ChannelData array
    const channels: ChannelData[] = channelRows.map((rows, ch): ChannelData => ({
      id:           `channel-${ch}`,
      name:         `Channel ${ch + 1}`,
      muted:        false,
      solo:         false,
      collapsed:    false,
      volume:       100,
      pan:          channelPans[ch] ?? 0,
      instrumentId: null,
      color:        null,
      rows,
    }));

    patterns.push({
      id:      `pattern-${pIdx}`,
      name:    `Pattern ${pIdx}`,
      length:  ROWS_PER_PATTERN,
      channels,
      importMetadata: {
        sourceFormat:            'GDM',
        sourceFile:              filename,
        importedAt:              new Date().toISOString(),
        originalChannelCount:    numChannels,
        originalPatternCount:    numPatterns,
        originalInstrumentCount: sampleInfos.length,
      },
    });
  }

  // ── Map TrackerFormat from originalFormat ──────────────────────────────────
  // GDM wraps another format; we surface it as the parent format for playback.
  // S3M-origin files use linear periods; MOD/MED/etc. use Amiga periods.
  const formatMap: Record<number, TrackerFormat> = {
    1: 'MOD',
    2: 'MOD', // MTM → treat as MOD
    3: 'S3M',
    4: 'MOD', // 669 → no dedicated TrackerFormat, nearest is MOD
    5: 'MOD', // FAR
    6: 'MOD', // ULT
    7: 'MOD', // STM
    8: 'MED',
    9: 'MOD', // PSM
  };
  const trackerFormat: TrackerFormat = formatMap[originalFormat] ?? 'MOD';
  const linearPeriods = trackerFormat === 'S3M' || trackerFormat === 'IT';

  void ORIGINAL_FORMAT_NAMES; // available if metadata is needed

  // ── Assemble TrackerSong ───────────────────────────────────────────────────

  return {
    name:            songTitle,
    format:          trackerFormat,
    patterns,
    instruments,
    songPositions,
    songLength:      songPositions.length,
    restartPosition: 0,
    numChannels,
    initialSpeed:    tempo  > 0 ? tempo  : 6,
    initialBPM:      bpm    > 0 ? bpm    : 125,
    linearPeriods,
  };
}

// ── Helpers ────────────────────────────────────────────────────────────────────

function buildEmptyPattern(
  pIdx: number,
  numChannels: number,
  filename: string,
  numPatterns: number,
  numInstruments: number,
): Pattern {
  const emptyRow: TrackerCell = {
    note: 0, instrument: 0, volume: 0,
    effTyp: 0, eff: 0, effTyp2: 0, eff2: 0,
  };

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
    rows:         Array.from({ length: ROWS_PER_PATTERN }, () => ({ ...emptyRow })),
  }));

  return {
    id:      `pattern-${pIdx}`,
    name:    `Pattern ${pIdx}`,
    length:  ROWS_PER_PATTERN,
    channels,
    importMetadata: {
      sourceFormat:            'GDM',
      sourceFile:              filename,
      importedAt:              new Date().toISOString(),
      originalChannelCount:    numChannels,
      originalPatternCount:    numPatterns,
      originalInstrumentCount: numInstruments,
    },
  };
}
