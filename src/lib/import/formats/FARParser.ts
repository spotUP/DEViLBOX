/**
 * FARParser.ts — Farandole Composer (.far) PC format parser
 *
 * Farandole Composer is a 16-channel PC tracker by Daniel Potter (1994).
 * It uses a fixed 16-channel layout with direct frequency mode (linear
 * periods) and supports up to 256 patterns and 64 samples.
 *
 * Binary layout:
 *   +0     FARFileHeader (98 bytes)
 *   +98    Song message (fileHeader.messageLength bytes)
 *   +98+messageLength  FAROrderHeader (771 bytes)
 *   +fileHeader.headerLength  Pattern data (sequential, variable length)
 *   After patterns: sampleMap[8] + FARSampleHeader (48 bytes) + PCM per sample
 *
 * References:
 *   OpenMPT Load_far.cpp (primary)
 *   Storlek's Schism Tracker FAR loader (cited by OpenMPT devs)
 */

import type { TrackerSong } from '@/engine/TrackerReplayer';
import type { Pattern, ChannelData, TrackerCell, InstrumentConfig } from '@/types';
import { createSamplerInstrument } from './AmigaUtils';

// ── Binary helpers (little-endian) ────────────────────────────────────────────

function u8(v: DataView, off: number): number  { return v.getUint8(off); }
function u16(v: DataView, off: number): number { return v.getUint16(off, true); }
function u32(v: DataView, off: number): number { return v.getUint32(off, true); }

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

const FAR_MAGIC            = 'FAR\xFE';
const FAR_EOF              = [0x0D, 0x0A, 0x1A] as const;
const FILE_HEADER_SIZE     = 98;   // sizeof(FARFileHeader)
const ORDER_HEADER_SIZE    = 771;  // sizeof(FAROrderHeader): 256+1+1+1+512
const SAMPLE_HEADER_SIZE   = 48;   // sizeof(FARSampleHeader)
const NUM_CHANNELS         = 16;
const MAX_PATTERNS         = 256;
const MAX_SAMPLES          = 64;
const INITIAL_BPM          = 80;
const FAR_C5_SPEED         = 16726; // 8363 * 2

// FARSampleHeader flags
const SMP_16BIT = 0x01;
const SMP_LOOP  = 0x08;

// ── Effect command numbers (XM/FT2 effect table) ──────────────────────────────
// These match the CMD_ enum values used by TrackerReplayer:
//   0x00 = none         0x01 = portamento up   0x02 = portamento down
//   0x03 = tone porta   0x04 = retrig           0x05 = vibrato
//   0x0A = volume slide 0x0F = speed
//   0x0E = extended (for S3MCMDEX / note delay via E sub-commands)

// farEffects[highNibble of effect byte] → effTyp value
// Mirrors OpenMPT's static constexpr EffectCommand farEffects[] exactly.
const FAR_EFFECTS: ReadonlyArray<number> = [
  0x00, // 0x0 = none
  0x01, // 0x1 = portamento up
  0x02, // 0x2 = portamento down
  0x03, // 0x3 = tone portamento
  0x04, // 0x4 = retrig           (CMD_RETRIG mapped to XM Rxy via 0x1B, but OpenMPT uses 0x04 directly — see below)
  0x05, // 0x5 = vibrato depth    (CMD_VIBRATO)
  0x05, // 0x6 = vibrato speed    (CMD_VIBRATO)
  0x0A, // 0x7 = volume slide up  (CMD_VOLUMESLIDE)
  0x0A, // 0x8 = volume slide down (CMD_VOLUMESLIDE)
  0x05, // 0x9 = vibrato sustained (CMD_VIBRATO)
  0x00, // 0xA = vol+portamento   (handled specially — see below)
  0x0E, // 0xB = panning          (CMD_S3MCMDEX → extended effect 0x8x)
  0x0E, // 0xC = note offset/delay (CMD_S3MCMDEX → extended effect 0xDx)
  0x00, // 0xD = fine tempo down  (CMD_NONE — ignored)
  0x00, // 0xE = fine tempo up    (CMD_NONE — ignored)
  0x0F, // 0xF = speed            (CMD_SPEED)
];

// ── Format detection ──────────────────────────────────────────────────────────

/**
 * Returns true if the buffer contains a valid Farandole Composer (.far) file.
 *
 * Detection criteria (matching OpenMPT ValidateHeader):
 *   1. Magic "FAR\xFE" at offset 0
 *   2. eof[3] == {0x0D, 0x0A, 0x1A} at offset 44
 *   3. headerLength (uint16LE at +47) >= 98
 */
export function isFARFormat(buffer: ArrayBuffer): boolean {
  if (buffer.byteLength < FILE_HEADER_SIZE) return false;

  const v = new DataView(buffer);

  // Check magic
  for (let i = 0; i < 4; i++) {
    if (u8(v, i) !== FAR_MAGIC.charCodeAt(i)) return false;
  }

  // Check EOF marker at +44
  for (let i = 0; i < 3; i++) {
    if (u8(v, 44 + i) !== FAR_EOF[i]) return false;
  }

  // Validate headerLength
  const headerLength = u16(v, 47);
  if (headerLength < FILE_HEADER_SIZE) return false;

  return true;
}

// ── Effect conversion ─────────────────────────────────────────────────────────

/**
 * Convert a FAR raw effect byte into { effTyp, eff, volume } fields for a TrackerCell.
 *
 * The effect byte encodes:  highNibble = effect type, lowNibble = effect param
 *
 * Parameter fixups mirror OpenMPT Load_far.cpp exactly:
 *   0x01/0x02 (portamento): param |= 0xF0   → fine portamento (E1x/E2x style)
 *   0x03 (tone porta):      if param != 0: param = 60/param
 *   0x04 (retrig):          param = 6/(1+(param & 0xF)) + 1
 *   0x06 (vibrato speed):   param *= 8
 *   0x07 (vol slide up):    param *= 8, then format as volslide: up nibble
 *   0x08 (vol slide down):  format as volslide: down nibble
 *   0x0A (vol+portamento):  volcmd instead of effect — sets volume column
 *   0x0B (panning):         param |= 0x80   → S3MCMDEX 0x8x (set panning)
 *   0x0C (note delay):      param = 6/(1+param)+1, then param |= 0x0D → S3MCMDEX 0xDx
 *
 * Returns the cell fields to set.  The caller applies them.
 */
interface FAREffectResult {
  effTyp: number;
  eff:    number;
  // Optional volume column override for effect 0xA
  volColOverride?: number;
  // When true, skip writing effTyp/eff (effect was encoded into volCol only)
  skipEffect?: boolean;
}

function convertFAREffect(effectByte: number): FAREffectResult {
  const type  = (effectByte >> 4) & 0x0F;
  let   param =  effectByte       & 0x0F;

  switch (type) {
    case 0x00:
      // No effect
      return { effTyp: 0x00, eff: 0 };

    case 0x01:
    case 0x02:
      // Portamento up / down → fine portamento: param gets upper nibble 0xF
      param |= 0xF0;
      return { effTyp: FAR_EFFECTS[type], eff: param };

    case 0x03:
      // Tone portamento: rows-to-duration conversion (60/param)
      if (param !== 0) param = Math.min(0xFF, Math.floor(60 / param));
      return { effTyp: FAR_EFFECTS[type], eff: param };

    case 0x04:
      // Retrig: 6/(1+(param & 0xF)) + 1
      param = Math.floor(6 / (1 + (param & 0x0F))) + 1;
      return { effTyp: FAR_EFFECTS[type], eff: param };

    case 0x05:
      // Vibrato depth (no param adjustment)
      return { effTyp: FAR_EFFECTS[type], eff: param };

    case 0x06:
      // Vibrato speed: param *= 8
      param = Math.min(0xFF, param * 8);
      return { effTyp: FAR_EFFECTS[type], eff: param };

    case 0x07:
      // Volume slide up: param *= 8, encode as upper nibble of Axy
      param = Math.min(0x0F, Math.floor(param * 8 / 16)); // clamp nibble then shift
      // OpenMPT: param *= 8 (full byte param for CMD_VOLUMESLIDE)
      // Axy: x=up y=down. For slide up: param = (rawParam * 8) << 0 stored as full byte
      // We store as (param*8) in low byte which CMD_VOLUMESLIDE treats as Ax0 (up) pattern
      // Actually OpenMPT's param fixup for 0x07 is: param *= 8 (then CMD_VOLUMESLIDE)
      // The volumeslide Axy: upper nibble = slide up amount, lower nibble = slide down
      // For slide up: eff = (slideAmount << 4) | 0, but OpenMPT just does param *= 8
      // which gives the full param (not nibble-shifted) — follow OpenMPT exactly:
      return { effTyp: FAR_EFFECTS[type], eff: Math.min(0xFF, (effectByte & 0x0F) * 8) };

    case 0x08:
      // Volume slide down: lower nibble of Axy (Ax0 → A0x for down)
      // OpenMPT: cmd = CMD_VOLUMESLIDE, param as-is (0x08 has no param fixup)
      // Axy lower nibble = slide down amount → param stays as low nibble
      return { effTyp: FAR_EFFECTS[type], eff: param };

    case 0x09:
      // Vibrato sustained — treat as regular vibrato, no param fixup
      return { effTyp: FAR_EFFECTS[type], eff: param };

    case 0x0A: {
      // Volume + portamento: encode volume in volume column, skip main effect
      // OpenMPT: volcmd = VOLCMD_VOLUME, vol = (param << 2) + 4
      // This goes into the volume column, not effTyp/eff
      const vol = Math.min(0xFF, (param << 2) + 4);
      return { effTyp: 0x00, eff: 0, volColOverride: vol, skipEffect: true };
    }

    case 0x0B:
      // Panning: CMD_S3MCMDEX 0x8x — param |= 0x80
      param |= 0x80;
      return { effTyp: FAR_EFFECTS[type], eff: param };

    case 0x0C:
      // Note delay: CMD_S3MCMDEX 0xDx
      // param = 6/(1+param)+1, then OR with 0x0D (high nibble 0xD = note delay sub-cmd)
      param = Math.floor(6 / (1 + param)) + 1;
      param = (0x0D << 4) | (param & 0x0F);
      return { effTyp: FAR_EFFECTS[type], eff: param };

    case 0x0D: // Fine tempo down — ignored
    case 0x0E: // Fine tempo up — ignored
      return { effTyp: 0x00, eff: 0 };

    case 0x0F:
      // Speed
      return { effTyp: FAR_EFFECTS[type], eff: param };

    default:
      return { effTyp: 0x00, eff: 0 };
  }
}

// ── Main parser ───────────────────────────────────────────────────────────────

/**
 * Parse a Farandole Composer (.far) file into a TrackerSong.
 *
 * @throws If the file fails magic/structural validation.
 */
export async function parseFARFile(
  buffer: ArrayBuffer,
  filename: string,
): Promise<TrackerSong> {
  if (!isFARFormat(buffer)) {
    throw new Error('FARParser: file does not pass FAR format validation');
  }

  const v   = new DataView(buffer);
  const raw = new Uint8Array(buffer);

  // ── FARFileHeader (98 bytes at offset 0) ───────────────────────────────────
  //   +0  magic[4]
  //   +4  songName[40]
  //   +44 eof[3]
  //   +47 headerLength (uint16LE)
  //   +49 version (uint8)
  //   +50 onOff[16] (uint8 each; 0 = muted)
  //   +66 editingState[9] (ignored)
  //   +75 defaultSpeed (uint8)
  //   +76 chnPanning[16] (uint8 each; 0–15)
  //   +92 patternState[4] (ignored)
  //   +96 messageLength (uint16LE)

  const songName     = readString(v, 4, 40) || filename.replace(/\.[^/.]+$/, '');
  const headerLength = u16(v, 47);
  const defaultSpeed = u8(v, 75);
  const messageLength = u16(v, 96);

  const initialSpeed = defaultSpeed > 0 ? defaultSpeed : 6;

  // Channel settings from FARFileHeader
  const channelMuted: boolean[]  = [];
  const channelPan:   number[]   = [];

  for (let ch = 0; ch < NUM_CHANNELS; ch++) {
    channelMuted.push(u8(v, 50 + ch) === 0);
    // chnPanning: (val & 0x0F) * 17 gives 0–255 range (0=left, 127≈center, 255=right)
    // OpenMPT: nPan = ((chnPanning[chn] & 0x0F) << 4) + 8
    // We store pan as -100..+100 for TrackerSong; convert from 0–255:
    // 0 = full left (-100), 128 = center (0), 255 = full right (+100)
    const panRaw = ((u8(v, 76 + ch) & 0x0F) << 4) + 8; // 0–248 range (OpenMPT formula)
    channelPan.push(Math.round((panRaw - 128) / 128 * 100)); // -100..+100
  }

  // ── FAROrderHeader (771 bytes at offset 98 + messageLength) ───────────────
  //   orders[256]     (uint8 each; 0xFF = unused/end)
  //   numPatterns     (uint8)
  //   numOrders       (uint8)
  //   restartPos      (uint8)
  //   patternSize[256] (uint16LE each)

  const orderHeaderOff = FILE_HEADER_SIZE + messageLength;

  if (buffer.byteLength < orderHeaderOff + ORDER_HEADER_SIZE) {
    throw new Error('FARParser: file truncated reading order header');
  }

  // Parse order list
  const numOrders   = u8(v, orderHeaderOff + 257);
  const restartPos  = u8(v, orderHeaderOff + 258);

  const orderList: number[] = [];
  for (let i = 0; i < numOrders; i++) {
    const ord = u8(v, orderHeaderOff + i);
    if (ord === 0xFF) break; // end of orders sentinel
    orderList.push(ord);
  }

  // Pattern sizes table
  const patternSizes: number[] = [];
  for (let p = 0; p < MAX_PATTERNS; p++) {
    patternSizes.push(u16(v, orderHeaderOff + 259 + p * 2));
  }

  // Seek to headerLength for pattern data
  // (skips any gap between order header end and start of patterns)
  let cursor = headerLength;

  // ── Patterns ───────────────────────────────────────────────────────────────

  const patterns: Pattern[] = new Array(MAX_PATTERNS).fill(null);
  let totalPatternsInFile = 0;

  for (let pat = 0; pat < MAX_PATTERNS; pat++) {
    const chunkSize = patternSizes[pat];
    if (chunkSize === 0) continue;

    if (cursor + chunkSize > buffer.byteLength) {
      cursor += chunkSize;
      continue;
    }

    // numRows = (chunkSize - 2) / (16 * 4)
    // The -2 accounts for the 2-byte break row header at the start of the chunk
    const numRows = Math.floor((chunkSize - 2) / (NUM_CHANNELS * 4));
    if (numRows <= 0) {
      cursor += chunkSize;
      continue;
    }

    // Read break row (1 byte) + unused (1 byte)
    const breakRow = u8(v, cursor);
    cursor += 2;

    // Apply OpenMPT's breakRow adjustment:
    // if breakRow > 0 && breakRow < numRows - 2 → breakRow++ (effective break at next row)
    // otherwise → no break (ROWINDEX_INVALID)
    let effectiveBreakRow = -1;
    if (breakRow > 0 && breakRow < numRows - 2) {
      effectiveBreakRow = breakRow + 1;
    }

    // Build channels (row-major: all channels for row 0, then row 1, etc.)
    const channels: ChannelData[] = Array.from(
      { length: NUM_CHANNELS },
      (_, ch): ChannelData => ({
        id:           `channel-${ch}`,
        name:         `Channel ${ch + 1}`,
        muted:        channelMuted[ch],
        solo:         false,
        collapsed:    false,
        volume:       100,
        pan:          channelPan[ch],
        instrumentId: null,
        color:        null,
        rows:         [],
      }),
    );

    // Pattern data: numRows × 16 channels × 4 bytes
    // Stored row-major: row0ch0, row0ch1, ..., row0ch15, row1ch0, ...
    for (let row = 0; row < numRows; row++) {
      for (let ch = 0; ch < NUM_CHANNELS; ch++) {
        const cellOff = cursor + (row * NUM_CHANNELS + ch) * 4;

        const noteRaw  = u8(v, cellOff);
        const instrRaw = u8(v, cellOff + 1);
        const volRaw   = u8(v, cellOff + 2);
        const effByte  = u8(v, cellOff + 3);

        // Note: 0 = empty, 1–72 valid; XM note = note + 36
        // OpenMPT: m.note = note + 35 + NOTE_MIN (NOTE_MIN = 1, so note + 36)
        let xmNote   = 0;
        let xmInstr  = 0;
        if (noteRaw > 0 && noteRaw <= 72) {
          xmNote  = noteRaw + 36;
          xmInstr = instrRaw + 1; // convert 0-indexed to 1-indexed
        }

        // Volume column: 0 = none; 1–16 maps to 0–64 (volume command)
        // OpenMPT: (volume - 1) * 64 / 15
        // XM volume column: 0x10–0x50 = set volume 0–64
        let volumeCol = 0;
        if (volRaw > 0 && volRaw <= 16) {
          const volVal = Math.round((volRaw - 1) * 64 / 15); // 0–64
          volumeCol = 0x10 + volVal; // XM volume column set-volume encoding
        }

        // Decode effect
        const fx = convertFAREffect(effByte);

        // Handle volume+portamento (effect 0xA): override volume column
        let finalVolCol = volumeCol;
        let finalEffTyp = fx.effTyp;
        let finalEff    = fx.eff;

        if (fx.skipEffect && fx.volColOverride !== undefined) {
          // Volume column override from effect 0xA; volume from pattern cell takes priority
          // OpenMPT sets volcmd = VOLCMD_VOLUME, vol = (param<<2)+4
          // Store as XM volume column set-volume: 0x10 + value (clamp to 0x50 max)
          const volColVal = Math.min(64, fx.volColOverride);
          finalVolCol  = 0x10 + volColVal;
          finalEffTyp  = 0;
          finalEff     = 0;
        }

        const cell: TrackerCell = {
          note:       xmNote,
          instrument: xmInstr,
          volume:     finalVolCol,
          effTyp:     finalEffTyp,
          eff:        finalEff,
          effTyp2:    0,
          eff2:       0,
        };

        // Write pattern break at effectiveBreakRow
        // OpenMPT: Patterns[pat].WriteEffect(EffectWriter(CMD_PATTERNBREAK, 0).Row(breakRow))
        // CMD_PATTERNBREAK = 0x0D in XM effect numbering
        if (row === effectiveBreakRow) {
          // If the cell already has no effect, write pattern break there
          if (cell.effTyp === 0 && cell.eff === 0) {
            cell.effTyp = 0x0D; // Pattern break
            cell.eff    = 0;
          } else {
            // Use second effect slot for the pattern break
            cell.effTyp2 = 0x0D;
            cell.eff2    = 0;
          }
        }

        channels[ch].rows.push(cell);
      }
    }

    cursor += numRows * NUM_CHANNELS * 4;

    patterns[pat] = {
      id:      `pattern-${pat}`,
      name:    `Pattern ${pat}`,
      length:  numRows,
      channels,
      importMetadata: {
        sourceFormat:            'FAR',
        sourceFile:              filename,
        importedAt:              new Date().toISOString(),
        originalChannelCount:    NUM_CHANNELS,
        originalPatternCount:    MAX_PATTERNS,
        originalInstrumentCount: MAX_SAMPLES,
      },
    } as unknown as Pattern; // sourceFormat 'FAR' not in ImportMetadata union


  }

  // ── Samples ────────────────────────────────────────────────────────────────

  // sampleMap[8]: 64-bit bitmask, one bit per sample (bit i of byte i>>3)
  if (cursor + 8 > buffer.byteLength) {
    // No samples — build empty instruments
    return assembleSong(
      songName, orderList, restartPos, patterns, [],
      initialSpeed, NUM_CHANNELS,
    );
  }

  const sampleMap = new Uint8Array(8);
  for (let b = 0; b < 8; b++) {
    sampleMap[b] = u8(v, cursor + b);
  }
  cursor += 8;

  const instruments: InstrumentConfig[] = [];
  // We need instrument IDs 1..64 (1-indexed); fill gaps with blanks
  const instrSlots: (InstrumentConfig | null)[] = new Array(MAX_SAMPLES + 1).fill(null);

  for (let smp = 0; smp < MAX_SAMPLES; smp++) {
    const present = (sampleMap[smp >> 3] & (1 << (smp & 7))) !== 0;
    if (!present) continue;

    if (cursor + SAMPLE_HEADER_SIZE > buffer.byteLength) break;

    // FARSampleHeader (48 bytes):
    //   +0  name[32]
    //   +32 length (uint32LE, bytes)
    //   +36 finetune (uint8)
    //   +37 volume (uint8, 0–15)
    //   +38 loopStart (uint32LE, bytes)
    //   +42 loopEnd   (uint32LE, bytes)
    //   +46 type  (uint8): bit 0 = 16-bit, bit 3 = loop
    //   +47 loop  (uint8): bit 3 = loop active

    const smpOff     = cursor;
    const smpName    = readString(v, smpOff, 32) || `Sample ${smp + 1}`;
    const smpLength  = u32(v, smpOff + 32);
    const smpVol     = u8(v, smpOff + 37);   // 0–15
    let   loopStart  = u32(v, smpOff + 38);
    let   loopEnd    = u32(v, smpOff + 42);
    const smpType    = u8(v, smpOff + 46);
    const smpLoop    = u8(v, smpOff + 47);
    cursor += SAMPLE_HEADER_SIZE;

    const is16bit   = (smpType & SMP_16BIT) !== 0;
    const hasLoop   = (smpLoop & SMP_LOOP)  !== 0 && loopEnd > loopStart;

    // Volume: 0–15 → 0–240 (multiply by 16); OpenMPT: nVolume = volume * 16
    // createSamplerInstrument expects volume 0–64; convert: (volume * 16) / 4 = volume * 4
    // clamped to 64 max (0–15 → 0–60, well within range)
    const volFor64 = smpVol * 4; // 0–60

    // Read PCM bytes
    const rawByteLen = smpLength;
    if (rawByteLen === 0 || cursor + rawByteLen > buffer.byteLength) {
      // Empty or truncated — add blank placeholder
      instrSlots[smp + 1] = {
        id:        smp + 1,
        name:      smpName,
        type:      'sample'  as const,
        synthType: 'Sampler' as const,
        effects:   [],
        volume:    -60,
        pan:       0,
      } as InstrumentConfig;
      cursor += rawByteLen;
      continue;
    }

    if (is16bit) {
      // 16-bit signed LE PCM: length/2 samples, loop points halved (bytes → frames)
      const numFrames = Math.floor(rawByteLen / 2);
      const loopStartF = hasLoop ? Math.floor(loopStart / 2) : 0;
      const loopEndF   = hasLoop ? Math.min(numFrames, Math.floor(loopEnd / 2)) : 0;

      // Downsample to 8-bit by extracting the high byte of each signed 16-bit LE sample
      const pcm8 = new Uint8Array(numFrames);
      for (let f = 0; f < numFrames; f++) {
        const lo   = raw[cursor + f * 2];
        const hi   = raw[cursor + f * 2 + 1];
        const s16  = (hi << 8) | lo;
        const s16s = s16 < 32768 ? s16 : s16 - 65536;
        const s8   = Math.round(s16s / 256);
        pcm8[f]    = s8 < 0 ? s8 + 256 : s8;
      }

      instrSlots[smp + 1] = createSamplerInstrument(
        smp + 1, smpName, pcm8, volFor64, FAR_C5_SPEED,
        hasLoop ? loopStartF : 0,
        hasLoop ? loopEndF   : 0,
      );
    } else {
      // 8-bit signed PCM: FAR uses signed PCM directly
      const pcm8 = raw.subarray(cursor, cursor + rawByteLen);

      instrSlots[smp + 1] = createSamplerInstrument(
        smp + 1, smpName, pcm8, volFor64, FAR_C5_SPEED,
        hasLoop ? loopStart : 0,
        hasLoop ? Math.min(rawByteLen, loopEnd) : 0,
      );
    }

    cursor += rawByteLen;
  }

  // Flatten instrSlots into a dense array (keep ID-indexed gaps as blanks)
  for (let i = 1; i <= MAX_SAMPLES; i++) {
    const slot = instrSlots[i];
    if (slot !== null) {
      instruments.push(slot);
    }
  }

  return assembleSong(
    songName, orderList, restartPos, patterns, instruments,
    initialSpeed, NUM_CHANNELS,
  );
}

// ── Song assembly ─────────────────────────────────────────────────────────────

function assembleSong(
  name:         string,
  orderList:    number[],
  restartPos:   number,
  patternSlots: (Pattern | null)[],
  instruments:  InstrumentConfig[],
  initialSpeed: number,
  numChannels:  number,
): TrackerSong {
  // Compact the pattern array: only include non-null patterns
  // Use orderList entries to determine which patterns exist; keep all non-null slots.
  const patterns: Pattern[] = patternSlots.filter((p): p is Pattern => p !== null);

  return {
    name,
    format:          'MOD',   // Closest XM-compatible format for playback
    patterns,
    instruments,
    songPositions:   orderList.length > 0 ? orderList : [0],
    songLength:      orderList.length,
    restartPosition: restartPos,
    numChannels,
    initialSpeed,
    initialBPM:      INITIAL_BPM,
    linearPeriods:   false,   // FAR uses Amiga-style periods
  };
}
