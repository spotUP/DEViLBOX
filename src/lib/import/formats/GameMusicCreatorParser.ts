/**
 * GameMusicCreatorParser.ts — Game Music Creator (.gmc) Amiga format parser
 *
 * Game Music Creator was an Amiga tracker used in commercial games (e.g. Brides of Dracula,
 * Jet Set Willy 2, Covert Action). It is a 4-channel MOD-like format with 15 samples
 * and a custom effect command set that differs from ProTracker.
 *
 * File layout (no magic bytes — heuristic header validation):
 *   Header (444 bytes):
 *     samples[15] × 16 bytes each:
 *       offset(u32BE), length(u16BE, words), zero(u8), volume(u8, 0-64),
 *       address(u32BE), loopLength(u16BE, words), dataStart(u16BE, words)
 *     zero[3] (u8 each, must be 0)
 *     numOrders (u8, 1-100)
 *     orders[100] (u16BE each, multiples of 1024)
 *   Pattern data: numPatterns × (64 rows × 4 channels × 4 bytes/cell)
 *     Each cell: [byte0, byte1, cmd, param]
 *       byte0 & 0xF0 = high nibble of period (must be 0, except 0xFF/0xFE = note cut)
 *       byte0 & 0x0F = high nibble of sample
 *       byte1        = low byte of period
 *       cmd  & 0x0F  = GMC effect command (0-8)
 *       param        = effect parameter
 *   Sample data: 8-bit signed, little-endian (effectively unsigned by byte)
 *
 * Effect mapping (from Load_gmc.cpp):
 *   0x00 → nothing
 *   0x01 → portamento up (1xx)
 *   0x02 → portamento down (2xx)
 *   0x03 → set volume (Cxx), param &= 0x7F
 *   0x04 → pattern break (Dxx)
 *   0x05 → position jump (Bxx)
 *   0x06 → LED filter on (E00)
 *   0x07 → LED filter off (E01)
 *   0x08 → set speed (Fxx)
 *
 * References:
 *   Reference Code/openmpt-master/soundlib/Load_gmc.cpp (primary)
 *   thoughts/shared/research/nostalgicplayer/sources/GameMusicCreator/ (secondary)
 */

import type { TrackerSong, TrackerFormat } from '@/engine/TrackerReplayer';
import type { Pattern, ChannelData, TrackerCell, InstrumentConfig, UADEChipRamInfo } from '@/types';
import { createSamplerInstrument } from './AmigaUtils';

// ── Binary helpers ─────────────────────────────────────────────────────────────

function u8(view: DataView, off: number): number  { return view.getUint8(off); }
function u16be(view: DataView, off: number): number { return view.getUint16(off, false); }
function u32be(view: DataView, off: number): number { return view.getUint32(off, false); }

// ── Constants ──────────────────────────────────────────────────────────────────

const NUM_SAMPLES    = 15;
const NUM_CHANNELS   = 4;
const NUM_ROWS       = 64;
const SAMPLE_HDR_SIZE = 16;  // 4+2+1+1+4+2+2 = 16 bytes per GMCSampleHeader
const HEADER_SIZE     = NUM_SAMPLES * SAMPLE_HDR_SIZE + 3 + 1 + 100 * 2; // = 444 bytes

// ── Amiga period → note index table ───────────────────────────────────────────
// Standard ProTracker period table, finetune = 0.
// Index 0 = C-1 (period 856) ... index 35 = B-3 (period 113)
// Matches Load_gmc.cpp's use of ReadMODPatternEntry which uses this table.

const MOD_PERIODS: number[] = [
  856, 808, 762, 720, 678, 640, 604, 570, 538, 508, 480, 453,  // C-1 to B-1
  428, 404, 381, 360, 339, 320, 302, 285, 269, 254, 240, 226,  // C-2 to B-2
  214, 202, 190, 180, 170, 160, 151, 143, 135, 127, 120, 113,  // C-3 to B-3
];

/**
 * Convert a ProTracker period value to a TrackerCell note number.
 * XM/DEViLBOX: note 1 = C-0. ProTracker octave 1 starts at note 13 (C-1).
 * Returns 0 (empty) if period is 0 or out of range.
 */
function periodToNote(period: number): number {
  if (period === 0) return 0;
  let best = 0;
  let bestDist = Infinity;
  for (let i = 0; i < MOD_PERIODS.length; i++) {
    const d = Math.abs(MOD_PERIODS[i] - period);
    if (d < bestDist) {
      bestDist = d;
      best = i;
    }
  }
  // best = 0-based index into period table → note 13 = C-1 at index 0
  return best + 13;
}

// ── Format detection ───────────────────────────────────────────────────────────

/**
 * Returns true if the buffer passes Game Music Creator header validation.
 * Mirrors Load_gmc.cpp's GMCFileHeader::IsValid() + GMCSampleHeader::IsValid().
 */
export function isGameMusicCreatorFormat(bytes: Uint8Array): boolean {
  if (bytes.byteLength < HEADER_SIZE) return false;
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);

  // Validate 15 sample headers (each 16 bytes)
  for (let s = 0; s < NUM_SAMPLES; s++) {
    const base = s * SAMPLE_HDR_SIZE;
    const offset     = u32be(view, base);
    const length     = u16be(view, base + 4);
    const zero       = u8(view, base + 6);
    const volume     = u8(view, base + 7);
    const address    = u32be(view, base + 8);
    const loopLength = u16be(view, base + 12);
    const dataStart  = u16be(view, base + 14);

    // offset and address: max 0x1FFFFF, must be even
    if (offset > 0x1FFFFF || (offset & 1)) return false;
    if (address > 0x1FFFFF || (address & 1)) return false;
    // length/dataStart: max 0x7FFF
    if (length > 0x7FFF) return false;
    if (dataStart > 0x7FFF || (dataStart & 1)) return false;
    // loopLength must not exceed length
    if (loopLength > 2 && loopLength > length) return false;
    // volume 0-64
    if (volume > 64) return false;
    // zero byte must be 0
    if (zero !== 0) return false;
  }

  // The three zero bytes after sample headers
  const zeroBase = NUM_SAMPLES * SAMPLE_HDR_SIZE;  // = 240
  if (u8(view, zeroBase) !== 0 || u8(view, zeroBase + 1) !== 0 || u8(view, zeroBase + 2) !== 0) {
    return false;
  }

  // numOrders: 1-100
  const numOrders = u8(view, zeroBase + 3);
  if (!numOrders || numOrders > 100) return false;

  // All 100 order entries must be multiples of 1024
  const ordersBase = zeroBase + 4;  // = 244
  for (let i = 0; i < 100; i++) {
    const ord = u16be(view, ordersBase + i * 2);
    if (ord % 1024 !== 0) return false;
  }

  return true;
}

// ── Main parser ────────────────────────────────────────────────────────────────

/**
 * Parse a Game Music Creator (.gmc) file into a TrackerSong.
 * Returns null if the file does not match the format.
 */
export function parseGameMusicCreatorFile(bytes: Uint8Array, filename: string): TrackerSong | null {
  if (!isGameMusicCreatorFormat(bytes)) return null;

  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);

  // ── Sample headers ─────────────────────────────────────────────────────────
  interface GMCSample {
    offset: number;
    lengthBytes: number;  // length * 2
    volume: number;       // 0-64
    loopLengthBytes: number;  // loopLength * 2
  }

  const sampleHeaders: GMCSample[] = [];
  for (let s = 0; s < NUM_SAMPLES; s++) {
    const base = s * SAMPLE_HDR_SIZE;
    const length     = u16be(view, base + 4);
    const volume     = u8(view, base + 7);
    const offset     = u32be(view, base);
    const loopLength = u16be(view, base + 12);

    sampleHeaders.push({
      offset,
      lengthBytes: length * 2,
      volume,
      loopLengthBytes: loopLength * 2,
    });
  }

  // ── Order list + pattern count ─────────────────────────────────────────────
  const zeroBase   = NUM_SAMPLES * SAMPLE_HDR_SIZE;  // 240
  const numOrders  = u8(view, zeroBase + 3);
  const ordersBase = zeroBase + 4;  // 244

  const orderList: number[] = [];
  let numPatterns = 0;

  for (let i = 0; i < numOrders; i++) {
    const raw = u16be(view, ordersBase + i * 2);
    const patIdx = raw / 1024;
    orderList.push(patIdx);
    // Per Load_gmc.cpp: skip pattern 63 (Covert Action export bug workaround)
    if (patIdx !== 63) {
      numPatterns = Math.max(numPatterns, patIdx + 1);
    }
  }

  // ── Pattern data ───────────────────────────────────────────────────────────
  // Patterns start immediately after the 444-byte header.
  let pos = HEADER_SIZE;

  // Parse all patterns into raw cell arrays
  // Each pattern: NUM_ROWS × NUM_CHANNELS × 4 bytes
  const patternCells: TrackerCell[][][] = [];  // [patIdx][row][ch]

  for (let pat = 0; pat < numPatterns; pat++) {
    const rows: TrackerCell[][] = [];

    for (let row = 0; row < NUM_ROWS; row++) {
      const cells: TrackerCell[] = [];

      for (let ch = 0; ch < NUM_CHANNELS; ch++) {
        if (pos + 4 > bytes.byteLength) {
          // Truncated file — fill remainder with empty cells
          cells.push({ note: 0, instrument: 0, volume: 0, effTyp: 0, eff: 0, effTyp2: 0, eff2: 0 });
          continue;
        }

        const b0  = u8(view, pos);
        const b1  = u8(view, pos + 1);
        const cmd = u8(view, pos + 2) & 0x0F;
        const prm = u8(view, pos + 3);
        pos += 4;

        // Note cut: 0xFF/0xFE in bytes 0/1 per Load_gmc.cpp
        const noteCut = (b0 === 0xFF && b1 === 0xFE);

        // Sanity: high nibble of b0 must be 0 (except note cut)
        if (!noteCut && (b0 & 0xF0) !== 0) {
          // Corrupted data — treat as empty
          cells.push({ note: 0, instrument: 0, volume: 0, effTyp: 0, eff: 0, effTyp2: 0, eff2: 0 });
          continue;
        }

        // Reconstruct MOD 4-byte cell to extract period + sample
        // Standard MOD cell layout:
        //   b0 = (smp_hi & 0xF0) | (period >> 8)
        //   b1 = period & 0xFF
        //   b2 = (smp_lo & 0xF0) | (effect)   — GMC stores cmd here (low nibble)
        //   b3 = param
        // We parse sample from b0/b2, period from b0/b1
        const sampleHi   = (noteCut ? 0 : b0) & 0xF0;
        const periodHi   = (noteCut ? 0 : b0) & 0x0F;
        const periodRaw  = (periodHi << 8) | b1;
        // GMC stores sample nibble only in high nibble of b0 (no b2 contribution)
        const sampleNum  = sampleHi >> 4;  // 0-15

        let note = 0;
        if (noteCut) {
          note = 97;  // XM note-cut
        } else if (periodRaw > 0) {
          note = periodToNote(periodRaw);
        }

        // ── Effect mapping (Load_gmc.cpp switch) ──────────────────────────
        let effTyp = 0;
        let eff    = prm;

        switch (cmd) {
          case 0x00:  // Nothing
            effTyp = 0; eff = 0;
            break;
          case 0x01:  // Portamento up
            effTyp = 0x01;
            break;
          case 0x02:  // Portamento down
            effTyp = 0x02;
            break;
          case 0x03:  // Volume (Cxx)
            effTyp = 0x0C;
            eff = prm & 0x7F;
            break;
          case 0x04:  // Pattern break (Dxx)
            effTyp = 0x0D;
            break;
          case 0x05:  // Position jump (Bxx)
            effTyp = 0x0B;
            break;
          case 0x06:  // LED filter on → E00
            effTyp = 0x0E;
            eff = 0x00;
            break;
          case 0x07:  // LED filter off → E01
            effTyp = 0x0E;
            eff = 0x01;
            break;
          case 0x08:  // Set speed (Fxx)
            effTyp = 0x0F;
            break;
          default:
            effTyp = 0; eff = 0;
            break;
        }

        cells.push({
          note,
          instrument: sampleNum,
          volume: 0,
          effTyp,
          eff,
          effTyp2: 0,
          eff2: 0,
        });
      }

      rows.push(cells);
    }

    patternCells.push(rows);
  }

  // ── Build instruments ──────────────────────────────────────────────────────
  // GMC always has exactly 15 sample slots. Samples are 8-bit signed PCM.
  // The sampleHeaders[i].offset field points to the absolute byte offset
  // within the file where sample data starts.

  const instruments: InstrumentConfig[] = [];

  for (let s = 0; s < NUM_SAMPLES; s++) {
    const hdr  = sampleHeaders[s];
    const id   = s + 1;
    const name = `Sample ${id}`;

    if (hdr.lengthBytes === 0 || hdr.offset === 0 || hdr.offset >= bytes.byteLength) {
      // Empty/silent placeholder — header slot still exists in chip RAM
      const emptyChipRam: UADEChipRamInfo = {
        moduleBase: 0,
        moduleSize: bytes.byteLength,
        instrBase: s * SAMPLE_HDR_SIZE,
        instrSize: SAMPLE_HDR_SIZE,
        sections: { sampleHeaders: 0 },
      };
      instruments.push({
        id,
        name,
        type: 'sample' as const,
        synthType: 'Sampler' as const,
        effects: [],
        volume: 0,
        pan: 0,
        uadeChipRam: emptyChipRam,
      } as unknown as InstrumentConfig);
      continue;
    }

    const available = Math.min(hdr.lengthBytes, bytes.byteLength - hdr.offset);
    const pcm = bytes.slice(hdr.offset, hdr.offset + available);

    // Loop: GMC loop is at the END of the sample.
    // nLoopStart = nLength - loopLength * 2,  nLoopEnd = nLength
    // Per Load_gmc.cpp: loop only if loopLength > 2
    let loopStart = 0;
    let loopEnd   = 0;
    if (hdr.loopLengthBytes > 4) {  // loopLength > 2 words → > 4 bytes
      loopStart = Math.max(0, hdr.lengthBytes - hdr.loopLengthBytes);
      loopEnd   = hdr.lengthBytes;
    }

    const chipRam: UADEChipRamInfo = {
      moduleBase: 0,
      moduleSize: bytes.byteLength,
      instrBase: s * SAMPLE_HDR_SIZE,
      instrSize: SAMPLE_HDR_SIZE,
      sections: { sampleHeaders: 0 },
    };
    const instr = createSamplerInstrument(
      id,
      name,
      pcm,
      hdr.volume,      // volume 0-64
      8287,            // Amiga C-3 sample rate
      loopStart,
      loopEnd,
    );
    instr.uadeChipRam = chipRam;
    instruments.push(instr);
  }

  // ── Build TrackerSong patterns ─────────────────────────────────────────────
  // The order list maps order positions → pattern indices.
  // Each unique pattern becomes one DEViLBOX Pattern.
  // The songPositions list mirrors the GMC order list.

  // LRRL panning (standard Amiga 4-channel)
  const PANNING: [number, number, number, number] = [-50, 50, 50, -50];

  // Build one DEViLBOX Pattern per unique GMC pattern index.
  const builtPatterns: Map<number, Pattern> = new Map();

  for (const patIdx of orderList) {
    if (builtPatterns.has(patIdx)) continue;
    if (patIdx >= patternCells.length) continue;

    const rawRows = patternCells[patIdx];

    const channels: ChannelData[] = Array.from({ length: NUM_CHANNELS }, (_, ch) => {
      const rows: TrackerCell[] = rawRows.map((rowCells) => rowCells[ch]);
      return {
        id:           `channel-${ch}`,
        name:         `Channel ${ch + 1}`,
        muted:        false,
        solo:         false,
        collapsed:    false,
        volume:       100,
        pan:          PANNING[ch],
        instrumentId: null,
        color:        null,
        rows,
      };
    });

    builtPatterns.set(patIdx, {
      id:       `pattern-${patIdx}`,
      name:     `Pattern ${patIdx}`,
      length:   NUM_ROWS,
      channels,
      importMetadata: {
        sourceFormat:            'GameMusicCreator',
        sourceFile:              filename,
        importedAt:              new Date().toISOString(),
        originalChannelCount:    NUM_CHANNELS,
        originalPatternCount:    numPatterns,
        originalInstrumentCount: NUM_SAMPLES,
      },
    });
  }

  // Assemble the song-order list referencing the pattern id values
  // DEViLBOX songPositions are indices into the patterns array.
  // We need a flat ordered patterns array + matching integer indices.
  const orderedPatternIndices: number[] = [];
  const patternArray: Pattern[] = [];
  const patternIdxToArrayIdx: Map<number, number> = new Map();

  for (const patIdx of orderList) {
    if (!patternIdxToArrayIdx.has(patIdx) && builtPatterns.has(patIdx)) {
      patternIdxToArrayIdx.set(patIdx, patternArray.length);
      patternArray.push(builtPatterns.get(patIdx)!);
    }
    const arrIdx = patternIdxToArrayIdx.get(patIdx);
    if (arrIdx !== undefined) {
      orderedPatternIndices.push(arrIdx);
    }
  }

  // Fallback: ensure at least one pattern
  if (patternArray.length === 0) {
    const emptyPattern: Pattern = {
      id:     'pattern-0',
      name:   'Pattern 0',
      length: NUM_ROWS,
      channels: Array.from({ length: NUM_CHANNELS }, (_, ch) => ({
        id:           `channel-${ch}`,
        name:         `Channel ${ch + 1}`,
        muted:        false,
        solo:         false,
        collapsed:    false,
        volume:       100,
        pan:          PANNING[ch],
        instrumentId: null,
        color:        null,
        rows: Array.from({ length: NUM_ROWS }, (): TrackerCell => ({
          note: 0, instrument: 0, volume: 0,
          effTyp: 0, eff: 0, effTyp2: 0, eff2: 0,
        })),
      })),
      importMetadata: {
        sourceFormat:            'GameMusicCreator',
        sourceFile:              filename,
        importedAt:              new Date().toISOString(),
        originalChannelCount:    NUM_CHANNELS,
        originalPatternCount:    0,
        originalInstrumentCount: NUM_SAMPLES,
      },
    };
    patternArray.push(emptyPattern);
    orderedPatternIndices.push(0);
  }

  const name = filename.replace(/\.[^/.]+$/, '');

  return {
    name,
    format:          'MOD' as TrackerFormat,
    patterns:        patternArray,
    instruments,
    songPositions:   orderedPatternIndices,
    songLength:      orderedPatternIndices.length,
    restartPosition: 0,
    numChannels:     NUM_CHANNELS,
    initialSpeed:    6,
    initialBPM:      125,
    linearPeriods:   false,
  };
}
