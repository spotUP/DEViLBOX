/**
 * STKParser.ts — Ultimate SoundTracker / SoundTracker (.stk / early .mod) format parser
 *
 * Ultimate SoundTracker (UST) is the original Amiga tracker by Karsten Obarski (1987),
 * predating ProTracker. The format is similar to a 4-channel MOD but with:
 *   - 15 samples (not 31)
 *   - 30-byte sample headers with 22-byte names (same as ProTracker MODSampleHeader)
 *   - No "M.K." or similar magic in the file header
 *   - Pattern data: 4 channels × 64 rows × 4 bytes per cell (same encoding as MOD)
 *   - Song header restartPos field encodes tempo (CIA timing) in early versions
 *
 * File layout:
 *   +0     songname[20]                   — song title, space-padded
 *   +20    15 × MODSampleHeader (30 bytes) — sample descriptors
 *   +470   MODFileHeader (130 bytes)       — numOrders, restartPos/tempo, orderList[128]
 *   +600   pattern data: N × 64 rows × 4 channels × 4 bytes
 *   after  sample data (raw signed 8-bit PCM)
 *
 * MODSampleHeader (30 bytes):
 *   +0    name[22]        — sample name (22 chars, null-padded, may have disk reference)
 *   +22   length (u16BE)  — sample length in words (× 2 = bytes)
 *   +24   finetune (u8)   — should be 0 in STK files
 *   +25   volume (u8)     — 0-64
 *   +26   loopStart (u16BE) — loop start in bytes
 *   +28   loopLength (u16BE) — loop length in words (× 2 = bytes); 1 = no loop
 *
 * Pattern cell (4 bytes):
 *   [0]  (sampleHi << 4) | (period >> 8)
 *   [1]  period & 0xFF
 *   [2]  (sampleLo << 4) | effect
 *   [3]  effectParam
 *   sample = (sampleHi << 4) | sampleLo  (1-15)
 *   period = full Amiga period value
 *   effect = lower nibble of byte[2]
 *
 * Reference: OpenMPT Load_stk.cpp + MODTools.h
 */

import type { TrackerSong, TrackerFormat } from '@/engine/TrackerReplayer';
import type { Pattern, ChannelData, TrackerCell, InstrumentConfig } from '@/types';
import { createSamplerInstrument } from './AmigaUtils';

// ── Binary helpers ────────────────────────────────────────────────────────────

function u8(v: DataView, off: number): number  { return v.getUint8(off); }
function u16be(v: DataView, off: number): number { return v.getUint16(off, false); }

function readString(v: DataView, off: number, len: number): string {
  let s = '';
  for (let i = 0; i < len; i++) {
    const c = v.getUint8(off + i);
    if (c === 0) break;
    if (c >= 0x20) s += String.fromCharCode(c);
  }
  return s.trim();
}

/** Count bytes that are not printable ASCII and not NUL */
function countInvalidChars(v: DataView, off: number, len: number): number {
  let count = 0;
  for (let i = 0; i < len; i++) {
    const c = v.getUint8(off + i);
    if (c !== 0 && (c < 0x20 || c > 0x7E)) count++;
  }
  return count;
}

// ── Format constants ──────────────────────────────────────────────────────────

const SONG_NAME_SIZE    = 20;
const SAMPLE_HDR_SIZE   = 30;  // name(22) + length(2) + finetune(1) + volume(1) + loopStart(2) + loopLength(2)
const NUM_SAMPLES       = 15;
const FILE_HDR_SIZE     = 130; // numOrders(1) + restartPos(1) + orderList(128)
const HEADER_BLOCK_SIZE = SONG_NAME_SIZE + NUM_SAMPLES * SAMPLE_HDR_SIZE + FILE_HDR_SIZE; // 600

const NUM_CHANNELS     = 4;
const ROWS_PER_PATTERN = 64;
const PATTERN_BYTES    = NUM_CHANNELS * ROWS_PER_PATTERN * 4;  // 1024

// ── Standard Amiga period table ───────────────────────────────────────────────
// ProTracker period table: 3 octaves × 12 notes = 36 entries
// Index 0 = C-1 (period 856), index 35 = B-3 (period 113)
// Used to convert raw period values to note numbers.

const AMIGA_PERIOD_TABLE = [
  // Octave 1: C-1 to B-1
  856, 808, 762, 720, 678, 640, 604, 570, 538, 508, 480, 453,
  // Octave 2: C-2 to B-2
  428, 404, 381, 360, 339, 320, 302, 285, 269, 254, 240, 226,
  // Octave 3: C-3 to B-3
  214, 202, 190, 180, 170, 160, 151, 143, 135, 127, 120, 113,
];

/**
 * Convert Amiga period to XM-style note number.
 * Returns 0 if period is 0 (empty).
 * Note numbering: 1 = C-0, 13 = C-1, etc.
 * ProTracker C-1 (period 856) = XM note 13.
 */
function periodToNote(period: number): number {
  if (period === 0) return 0;
  // Find closest period in table
  let bestIdx = 0;
  let bestDist = Infinity;
  for (let i = 0; i < AMIGA_PERIOD_TABLE.length; i++) {
    const d = Math.abs(AMIGA_PERIOD_TABLE[i] - period);
    if (d < bestDist) {
      bestDist = d;
      bestIdx  = i;
    }
  }
  // Index 0 in table = C-1 = XM note 13
  return bestIdx + 13;
}

// ── Format detection ──────────────────────────────────────────────────────────

/**
 * Format detection for STK (Ultimate SoundTracker) and SPS (Stonetracker) files.
 *
 * Stonetracker files use the magic "SPS" at offset 0 (followed by a version
 * byte, typically 0x02). These are accepted directly without structural checks.
 *
 * The heuristic UST/STK path (no magic bytes) mirrors OpenMPT ValidateHeader()
 * from Load_stk.cpp:
 * 1. Reasonable character counts in the title and sample names
 * 2. Valid sample volumes (0-64) and lengths (≤ 37000 words)
 * 3. Valid song header: numOrders ≤ 128, restartPos ≤ 220
 * 4. Pattern indices ≤ 63
 * 5. Non-empty: totalSampleLen > 0, allVolumes > 0
 */
export function isSTKFormat(buffer: ArrayBuffer): boolean {
  if (buffer.byteLength < HEADER_BLOCK_SIZE + PATTERN_BYTES) return false;
  const v = new DataView(buffer);

  // Stonetracker files begin with the ASCII magic "SPS"
  if (
    v.getUint8(0) === 0x53 /* S */ &&
    v.getUint8(1) === 0x50 /* P */ &&
    v.getUint8(2) === 0x53 /* S */
  ) return true;

  // Count invalid chars in song title
  let invalidCharsInTitle = countInvalidChars(v, 0, SONG_NAME_SIZE);
  let invalidChars = invalidCharsInTitle;
  let totalSampleLen = 0;
  let allVolumes = 0;
  let validNameCount = 0;
  let invalidNames = false;

  for (let smp = 0; smp < NUM_SAMPLES; smp++) {
    const base = SONG_NAME_SIZE + smp * SAMPLE_HDR_SIZE;
    // name[22] at base+0
    // length(u16BE) at base+22
    // finetune(u8) at base+24
    // volume(u8) at base+25
    // loopStart(u16BE) at base+26
    // loopLength(u16BE) at base+28

    const nameInvalid = countInvalidChars(v, base, 22);
    invalidChars += nameInvalid;

    const finetune = u8(v, base + 24);
    if (finetune !== 0) invalidChars += 16;  // STK files should have 0 finetune

    const volume    = u8(v, base + 25);
    const lengthW   = u16be(v, base + 22);  // length in words

    // Check if name has valid printable ASCII chars (mirrors ClassifyName logic)
    let hasValidChars = false;
    let hasInvalidChars = false;
    for (let i = 0; i < 22; i++) {
      const c = v.getUint8(base + i);
      if (c === 0) break;
      if (c >= 0x20 && c <= 0x7E) hasValidChars = true;
      else hasInvalidChars = true;
    }
    if (hasValidChars && !hasInvalidChars) validNameCount++;
    if (hasInvalidChars) invalidNames = true;

    if (invalidChars > 48) return false;
    if (volume > 64)        return false;
    if (lengthW > 37000)    return false;

    totalSampleLen += lengthW;
    allVolumes |= volume;
  }

  // Song title with too many garbage chars is OK only if many sample names are valid
  if (invalidCharsInTitle > 5 && (validNameCount < 4 || invalidNames)) return false;

  // Must have at least some samples with non-zero volume
  if (totalSampleLen === 0 || allVolumes === 0) return false;

  // MODFileHeader starts at SONG_NAME_SIZE + NUM_SAMPLES * SAMPLE_HDR_SIZE = 470
  const fhBase = SONG_NAME_SIZE + NUM_SAMPLES * SAMPLE_HDR_SIZE;
  const numOrders  = u8(v, fhBase);
  const restartPos = u8(v, fhBase + 1);

  if (numOrders > 128)   return false;
  if (restartPos > 220)  return false;

  // Find max pattern index in order list
  let maxPattern = 0;
  for (let i = 0; i < 128; i++) {
    const p = u8(v, fhBase + 2 + i);
    if (p > maxPattern) maxPattern = p;
  }
  if (maxPattern > 63) return false;

  // No playable song
  if (restartPos === 0 && numOrders === 0 && maxPattern === 0) return false;

  // Basic sanity: enough data for at least 1 pattern
  if (buffer.byteLength < HEADER_BLOCK_SIZE + PATTERN_BYTES) return false;

  return true;
}

// ── Main parser ───────────────────────────────────────────────────────────────

/**
 * Parse an STK (Ultimate SoundTracker) file into a TrackerSong.
 * Follows OpenMPT ReadSTK() from Load_stk.cpp.
 */
export async function parseSTKFile(
  buffer: ArrayBuffer,
  filename: string,
): Promise<TrackerSong> {
  const v   = new DataView(buffer);
  const raw = new Uint8Array(buffer);

  // ── Song name ─────────────────────────────────────────────────────────────
  const songName = readString(v, 0, SONG_NAME_SIZE);

  // ── Sample headers ────────────────────────────────────────────────────────
  interface STKSampleInfo {
    name:       string;
    lengthWords: number;  // in words (×2 = bytes)
    volume:     number;   // 0-64
    loopStart:  number;   // in bytes
    loopLengthWords: number;  // in words (×2 = bytes); 1 = no loop
  }

  const sampleInfos: STKSampleInfo[] = [];
  let totalSampleLen = 0;  // in words

  for (let smp = 0; smp < NUM_SAMPLES; smp++) {
    const base = SONG_NAME_SIZE + smp * SAMPLE_HDR_SIZE;
    const name        = readString(v, base, 22);
    const lengthWords = u16be(v, base + 22);
    // finetune at base+24 (ignored: always 0 for UST)
    const volume      = Math.min(u8(v, base + 25), 64);
    const loopStart   = u16be(v, base + 26);
    const loopLengthWords = u16be(v, base + 28);

    sampleInfos.push({ name, lengthWords, volume, loopStart, loopLengthWords });
    totalSampleLen += lengthWords;
  }

  // ── File header (MODFileHeader) ───────────────────────────────────────────
  const fhBase     = SONG_NAME_SIZE + NUM_SAMPLES * SAMPLE_HDR_SIZE;
  const numOrders  = u8(v, fhBase);
  let   restartPos = u8(v, fhBase + 1);

  // Special case: jjk55 by Jesper Kyd has a weird tempo, force standard
  const titleBuf = raw.slice(0, 6);
  const titleStr = String.fromCharCode(...titleBuf);
  if (titleStr === 'jjk55\0' || titleStr.startsWith('jjk55')) {
    restartPos = 0x78;
  }

  // Default: if restartPos is 0, set to 0x78 (125 BPM equivalent)
  if (!restartPos) restartPos = 0x78;

  const orderList: number[] = [];
  for (let i = 0; i < 128; i++) {
    orderList.push(u8(v, fhBase + 2 + i));
  }

  // Determine number of patterns: max pattern index + 1
  const usedOrders = numOrders > 0 ? orderList.slice(0, numOrders) : orderList;
  let numPatterns = 0;
  for (const p of usedOrders) {
    if (p + 1 > numPatterns) numPatterns = p + 1;
  }
  if (numPatterns === 0) numPatterns = 1;

  // Also check all 128 order slots for a conservative upper bound
  let maxPatFromAll = 0;
  for (let i = 0; i < 128; i++) {
    const p = u8(v, fhBase + 2 + i);
    if (p > maxPatFromAll) maxPatFromAll = p;
  }
  // Use the maximum needed: clamp to what fits in the file
  const maxPossiblePats = Math.floor(
    (buffer.byteLength - HEADER_BLOCK_SIZE) / PATTERN_BYTES,
  );
  numPatterns = Math.min(Math.max(numPatterns, maxPatFromAll + 1), maxPossiblePats, 64);

  // ── Tempo / BPM calculation ───────────────────────────────────────────────
  // In UST, restartPos encodes CIA tempo:
  //   actual BPM = (709379 * 125 / 50) / ((240 - restartPos) * 122)
  // At restartPos=0x78 (120): this yields ~125 BPM
  let initialBPM = 125;
  if (restartPos !== 0x78) {
    initialBPM = Math.round((709379.0 * 125.0 / 50.0) / ((240 - restartPos) * 122.0));
    initialBPM = Math.max(1, Math.min(255, initialBPM));
  }
  const initialSpeed = 6; // UST default speed

  // ── Build song order from order list ──────────────────────────────────────
  const effectiveNumOrders = Math.max(1, Math.min(numOrders, 128));
  const songOrders = orderList.slice(0, effectiveNumOrders);

  // ── Parse patterns ────────────────────────────────────────────────────────
  const patternStart = HEADER_BLOCK_SIZE;

  // Collect unique pattern indices and build them
  const patternArray: Pattern[] = [];
  const patIdxToArrayIdx = new Map<number, number>();

  // Build all patterns referenced in the order list (plus any others in the file)
  const patternSet = new Set<number>();
  for (const p of songOrders) patternSet.add(p);
  // Also parse all patterns that fit in the file
  for (let p = 0; p < numPatterns; p++) patternSet.add(p);

  const sortedPatterns = Array.from(patternSet).sort((a, b) => a - b);

  for (const patIdx of sortedPatterns) {
    const patOff = patternStart + patIdx * PATTERN_BYTES;
    if (patOff + PATTERN_BYTES > buffer.byteLength) continue;

    const channels: ChannelData[] = [];

    for (let ch = 0; ch < NUM_CHANNELS; ch++) {
      const rows: TrackerCell[] = [];

      for (let row = 0; row < ROWS_PER_PATTERN; row++) {
        // Cell layout (4 bytes):
        //   b0 = (sampleHi << 4) | (period >> 8)
        //   b1 = period & 0xFF
        //   b2 = (sampleLo << 4) | effect
        //   b3 = effectParam
        const cellBase = patOff + (row * NUM_CHANNELS + ch) * 4;
        const b0 = u8(v, cellBase);
        const b1 = u8(v, cellBase + 1);
        const b2 = u8(v, cellBase + 2);
        const b3 = u8(v, cellBase + 3);

        const sampleHi = (b0 >> 4) & 0x0F;
        const period   = ((b0 & 0x0F) << 8) | b1;
        const sampleLo = (b2 >> 4) & 0x0F;
        const effect   = b2 & 0x0F;
        const param    = b3;

        const instrument = (sampleHi << 4) | sampleLo;  // 1-15 or 0
        const note       = periodToNote(period);

        // Effect conversion following OpenMPT ReadSTK() with minVersion=UST1_80:
        // UST only supports a limited command set. We map to XM-style effect codes.
        // For simplicity (and because we are primarily a player/viewer), we emit
        // XM effect codes that approximately match UST behavior.
        let effTyp = 0;
        let eff    = 0;

        if (effect !== 0 || param !== 0) {
          switch (effect) {
            case 0x00:  // Arpeggio (if param >= 3; else no-op in UST)
              if (param >= 3) { effTyp = 0x00; eff = param; }
              break;
            case 0x01:  // Arpeggio in UST (effect 1 is arpeggio, not portamento up)
              effTyp = 0x00; eff = param;
              break;
            case 0x02:  // Combined portamento: low nibble = up, high nibble = down
              if (param & 0x0F) {
                effTyp = 0x02; eff = param & 0x0F;  // Portamento down
              } else if (param >> 4) {
                effTyp = 0x01; eff = param >> 4;     // Portamento up
              }
              break;
            case 0x0C:  // Set volume — mask high bit (chip ignores it)
              effTyp = 0x0C; eff = param & 0x7F;
              break;
            case 0x0D:  // In UST: volume slide (D = volume slide, not pattern break)
              effTyp = 0x0A; eff = param;
              break;
            case 0x0E:  // Auto volume slide (extended command in later ST versions)
              effTyp = 0x0E; eff = param;
              break;
            case 0x0F:  // Set speed (only low nibble is evaluated in ST)
              effTyp = 0x0F; eff = param & 0x0F;
              break;
            default:
              // Commands 3-B are no-ops in UST1_80 and earlier
              break;
          }
        }

        rows.push({
          note,
          instrument,
          volume: 0,
          effTyp,
          eff,
          effTyp2: 0,
          eff2: 0,
        });
      }

      channels.push({
        id:           `channel-${ch}`,
        name:         `Channel ${ch + 1}`,
        muted:        false,
        solo:         false,
        collapsed:    false,
        volume:       100,
        pan:          ch % 2 === 0 ? -50 : 50,  // Amiga LRRL panning
        instrumentId: null,
        color:        null,
        rows,
      });
    }

    const arrIdx = patternArray.length;
    patIdxToArrayIdx.set(patIdx, arrIdx);

    patternArray.push({
      id:     `pattern-${patIdx}`,
      name:   `Pattern ${patIdx}`,
      length: ROWS_PER_PATTERN,
      channels,
      importMetadata: {
        sourceFormat:            'STK',
        sourceFile:              filename,
        importedAt:              new Date().toISOString(),
        originalChannelCount:    NUM_CHANNELS,
        originalPatternCount:    numPatterns,
        originalInstrumentCount: NUM_SAMPLES,
      },
    });
  }

  // ── Song positions ────────────────────────────────────────────────────────
  const songPositions: number[] = [];
  for (const patIdx of songOrders) {
    const arrIdx = patIdxToArrayIdx.get(patIdx);
    if (arrIdx !== undefined) songPositions.push(arrIdx);
  }
  if (songPositions.length === 0) songPositions.push(0);

  // ── Build instruments from sample data ───────────────────────────────────
  // Sample data follows all pattern data. In STK, looped samples skip bytes
  // before loopStart (the data before the loop start is unused in UST).
  let sampleDataOff = HEADER_BLOCK_SIZE + numPatterns * PATTERN_BYTES;

  const instruments: InstrumentConfig[] = [];

  for (let smp = 0; smp < NUM_SAMPLES; smp++) {
    const info = sampleInfos[smp];
    const id   = smp + 1;
    const name = info.name || `Sample ${id}`;

    const lengthBytes = info.lengthWords * 2;

    if (lengthBytes < 4 || info.volume === 0) {
      // Skip unusable sample data
      sampleDataOff += lengthBytes;
      instruments.push({
        id,
        name,
        type:      'sample' as const,
        synthType: 'Sampler' as const,
        effects:   [],
        volume:    -60,
        pan:       0,
      } as InstrumentConfig);
      continue;
    }

    // UST: looped samples skip data before loopStart
    // (avoids clicks from the unused pre-loop data)
    const loopStart  = info.loopStart;
    const loopLenBytes = info.loopLengthWords * 2;
    const hasLoop    = loopLenBytes > 2;  // loopLength=1 word (2 bytes) means no loop

    // In UST, the actual sample starts at loopStart for looped samples
    const skipBytes  = hasLoop ? loopStart : 0;
    const actualOff  = sampleDataOff + skipBytes;
    const actualLen  = lengthBytes - skipBytes;

    let pcm: Uint8Array;
    if (actualOff + actualLen <= buffer.byteLength && actualLen > 0) {
      pcm = raw.slice(actualOff, actualOff + actualLen);
    } else if (sampleDataOff + lengthBytes <= buffer.byteLength) {
      // Fallback: use full sample if skip calculation goes out of bounds
      pcm = raw.slice(sampleDataOff, sampleDataOff + lengthBytes);
    } else {
      // Truncated file
      const avail = Math.max(0, buffer.byteLength - sampleDataOff);
      pcm = avail > 0 ? raw.slice(sampleDataOff, sampleDataOff + avail) : new Uint8Array(0);
    }

    sampleDataOff += lengthBytes;

    if (pcm.length === 0) {
      instruments.push({
        id,
        name,
        type:      'sample' as const,
        synthType: 'Sampler' as const,
        effects:   [],
        volume:    -60,
        pan:       0,
      } as InstrumentConfig);
      continue;
    }

    // After skipping loopStart bytes, the loop now starts at offset 0
    const effectiveLoopEnd = hasLoop ? loopLenBytes : 0;

    instruments.push(
      createSamplerInstrument(
        id,
        name,
        pcm,
        info.volume,
        8287,           // Amiga C-3 playback rate for period-based samples
        0,              // loopStart = 0 after skip
        effectiveLoopEnd,
      ),
    );
  }

  return {
    name:            songName || filename.replace(/\.[^/.]+$/, ''),
    format:          'MOD' as TrackerFormat,
    patterns:        patternArray,
    instruments,
    songPositions,
    songLength:      songPositions.length,
    restartPosition: 0,
    numChannels:     NUM_CHANNELS,
    initialSpeed,
    initialBPM,
    linearPeriods:   false,
  };
}
