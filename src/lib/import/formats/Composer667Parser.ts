/**
 * Composer667Parser.ts — Composer 667 (.667) format parser
 *
 * Composer 667 is an OPL/FM tracker format using 18 channels (3 operators per channel).
 * Instruments are OPL FM patches (no PCM samples).
 *
 * Binary layout:
 *   +0    magic[2]          — 'gf' (0x67, 0x66)
 *   +2    names[64][8]      — 64 instrument names, 8 chars each (space-padded, no control chars)
 *   +514  speed(uint8)      — initial speed (1-15)
 *   +515  numOrders(uint8)  — number of orders (0-128)
 *   +516  patOffsets[128]   — uint16le pattern offsets, relative to end of instrument data
 *   Header total: 772 bytes (MPT_BINARY_STRUCT(_667FileHeader, 772))
 *
 *   After header:
 *   +772  orders[numOrders] — uint8 pattern indices
 *   +772+numOrders   instruments[64][11] — OPL patch bytes (64 * 11 = 704 bytes)
 *
 *   Pattern data (variable length, event-driven):
 *     0xFF skip(u8)         — end of row; row += skip; 0xFF + skip=0 ends pattern
 *     0xFE ch(u8) instr(u8) — set instrument (instr 0-63, ch 0-17)
 *     0xFD ch(u8) vol(u8)   — set volume (vol 0-63, displayed as 63-vol)
 *     0xFC target(u8)       — jump to pattern (position jump)
 *     0xFB                  — pattern break
 *     0..17  note(u8)       — note data for channel b (note = octave*12 + semitone, 0x00-0x7B)
 *
 * Note encoding: note = (octave << 4) | semitone → pitch = 12 + semitone + octave*12
 * (OpenMPT: NOTE_MIN + 12 + (note & 0x0F) + (note >> 4) * 12, NOTE_MIN=1)
 *
 * Panning: applied only if both left (even) and right (odd) channels are used.
 *   Even channels (0,2,4,...) → left (0); odd channels (1,3,5,...) → right (256)
 *   In DEViLBOX: even → -50, odd → +50 (Amiga LRRL style mapped to this 18-ch format)
 *
 * Reference: OpenMPT soundlib/Load_667.cpp
 */

import type { TrackerSong, TrackerFormat } from '@/engine/TrackerReplayer';
import type { Pattern, ChannelData, TrackerCell, InstrumentConfig } from '@/types';

// ── Binary helpers ────────────────────────────────────────────────────────────

function u8(v: DataView, off: number): number    { return v.getUint8(off); }
function u16le(v: DataView, off: number): number { return v.getUint16(off, true); }

function readSpacePaddedString(v: DataView, off: number, len: number): string {
  const bytes: number[] = [];
  for (let i = 0; i < len; i++) {
    const b = v.getUint8(off + i);
    bytes.push(b);
  }
  return String.fromCharCode(...bytes).trimEnd();
}

// ── Constants ─────────────────────────────────────────────────────────────────

const HEADER_SIZE     = 772;  // sizeof(_667FileHeader)
const NUM_INSTRUMENTS = 64;
const NUM_CHANNELS    = 18;
const ROWS_PER_PATTERN = 32;
const OPL_PATCH_SIZE  = 11;

const OFFSET_NAMES       = 2;            // names[64][8] at byte 2
const OFFSET_SPEED       = 514;          // speed at byte 2 + 64*8 = 514
const OFFSET_NUM_ORDERS  = 515;
const OFFSET_PAT_OFFSETS = 516;          // patOffsets[128] as uint16le

// Order data starts immediately after the 772-byte header
const ORDERS_OFFSET      = HEADER_SIZE;
// Instrument data starts after orders: HEADER_SIZE + numOrders
// (computed per-file since numOrders is variable)

// Panning: even channel → left (-50), odd channel → right (+50)
// Applied only when both left and right channels are active (see panning logic below)
const PAN_LEFT  = -50;
const PAN_RIGHT = +50;

// ── Format detection ─────────────────────────────────────────────────────────

/**
 * Returns true if the buffer looks like a Composer 667 file.
 * Mirrors _667FileHeader::IsValid() from OpenMPT Load_667.cpp.
 */
export function isComposer667Format(bytes: Uint8Array): boolean {
  if (bytes.length < HEADER_SIZE) return false;
  const v = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);

  // Magic: 'gf' (0x67, 0x66)
  if (u8(v, 0) !== 0x67 || u8(v, 1) !== 0x66) return false;

  const speed     = u8(v, OFFSET_SPEED);
  const numOrders = u8(v, OFFSET_NUM_ORDERS);

  if (speed < 1 || speed > 15) return false;
  if (numOrders > 128) return false;

  // All name characters must be >= 32 (space) — no control characters
  for (let i = 0; i < NUM_INSTRUMENTS * 8; i++) {
    const c = u8(v, OFFSET_NAMES + i);
    if (c <= 31) return false;
  }

  // Pattern offsets must be strictly increasing
  let prevOffset = -1;
  for (let i = 0; i < 128; i++) {
    const offset = u16le(v, OFFSET_PAT_OFFSETS + i * 2);
    if (offset <= prevOffset) return false;
    prevOffset = offset;
  }

  // Minimum additional size: numOrders (order bytes) + 64*11 (OPL patches)
  const minAdditional = numOrders + NUM_INSTRUMENTS * OPL_PATCH_SIZE;
  if (bytes.length < HEADER_SIZE + minAdditional) return false;

  return true;
}

// ── Effect command numbers (XM/FT2 style used in TrackerCell) ─────────────────

const CMD_POSITION_JUMP  = 0x0B;  // Bxx — position jump
const CMD_PATTERN_BREAK  = 0x0D;  // Dxx — pattern break
const CMD_SET_SPEED      = 0x0F;  // Fxx — set speed

// ── Parser ───────────────────────────────────────────────────────────────────

/**
 * Parse a Composer 667 (.667) file into a TrackerSong.
 * Returns null on any parse failure (never throws).
 */
export function parseComposer667File(bytes: Uint8Array, filename: string): TrackerSong | null {
  try {
    return _parse(bytes, filename);
  } catch {
    return null;
  }
}

function _parse(bytes: Uint8Array, filename: string): TrackerSong | null {
  if (!isComposer667Format(bytes)) return null;

  const v = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);

  const speed     = u8(v, OFFSET_SPEED);
  const numOrders = u8(v, OFFSET_NUM_ORDERS);

  // Read instrument names
  const instrNames: string[] = [];
  for (let i = 0; i < NUM_INSTRUMENTS; i++) {
    instrNames.push(readSpacePaddedString(v, OFFSET_NAMES + i * 8, 8));
  }

  // Read pattern offsets (128 entries, uint16le)
  const patOffsets: number[] = [];
  for (let i = 0; i < 128; i++) {
    patOffsets.push(u16le(v, OFFSET_PAT_OFFSETS + i * 2));
  }

  // Read order list
  const orders: number[] = [];
  for (let i = 0; i < numOrders; i++) {
    const pat = u8(v, ORDERS_OFFSET + i);
    if (pat >= 128) return null;
    orders.push(pat);
  }
  if (orders.length === 0) orders.push(0);

  // OPL instrument data: 64 instruments × 11 bytes each
  // Located after orders: HEADER_SIZE + numOrders
  const instrDataOffset = HEADER_SIZE + numOrders;

  // Pattern data base: immediately after OPL patches
  const patternDataBase = instrDataOffset + NUM_INSTRUMENTS * OPL_PATCH_SIZE;

  // Build InstrumentConfig list — OPL FM patches, no PCM data
  const instruments: InstrumentConfig[] = [];
  for (let i = 0; i < NUM_INSTRUMENTS; i++) {
    const id   = i + 1;
    const name = instrNames[i] || `Instrument ${id}`;
    instruments.push({
      id,
      name,
      type:      'sample' as const,
      synthType: 'Sampler' as const,
      effects:   [],
      volume:    0,
      pan:       0,
    } as unknown as InstrumentConfig);
  }

  // Parse all 128 patterns from the event-driven pattern stream.
  // Track whether left and right channels are actually used to decide panning.
  let leftChnUsed  = false;
  let rightChnUsed = false;

  // Build all 128 patterns (even unused ones, since patOffsets covers all 128)
  const rawPatterns: Array<TrackerCell[][] | null> = new Array(128).fill(null);

  for (let pat = 0; pat < 128; pat++) {
    // Max sensible pattern size: every cell written once + jump at end
    // = 32 rows × 18 channels × (1+2) bytes + end markers ≈ 4674 bytes per OpenMPT
    const patOffset = patternDataBase + patOffsets[pat];
    if (patOffset >= bytes.length) continue;

    // Allocate cell grid: NUM_CHANNELS × ROWS_PER_PATTERN
    const cells: TrackerCell[][] = Array.from(
      { length: NUM_CHANNELS },
      () => Array.from({ length: ROWS_PER_PATTERN }, (): TrackerCell => ({
        note: 0, instrument: 0, volume: 0,
        effTyp: 0, eff: 0, effTyp2: 0, eff2: 0,
      }))
    );

    let pos  = patOffset;
    let row  = 0;
    let ok   = true;

    while (pos < bytes.length && row < ROWS_PER_PATTERN) {
      const b = u8(v, pos);
      pos++;

      if (b === 0xFF) {
        // End of row — advance by skip amount
        if (pos >= bytes.length) { ok = false; break; }
        const skip = u8(v, pos);
        pos++;
        row += skip;
        if (skip === 0 || row >= ROWS_PER_PATTERN) break;
      } else if (b === 0xFE) {
        // Instrument change: ch, instrIdx (0-63)
        if (pos + 1 >= bytes.length) { ok = false; break; }
        const ch    = u8(v, pos);
        const instr = u8(v, pos + 1);
        pos += 2;
        if (ch >= NUM_CHANNELS || instr > 63) { ok = false; break; }
        cells[ch][row].instrument = instr + 1;
      } else if (b === 0xFD) {
        // Volume: ch, vol (0-63); displayed as 63 - vol in OpenMPT
        if (pos + 1 >= bytes.length) { ok = false; break; }
        const ch  = u8(v, pos);
        const vol = u8(v, pos + 1);
        pos += 2;
        if (ch >= NUM_CHANNELS || vol > 63) { ok = false; break; }
        // OpenMPT: VOLCMD_VOLUME with value 63 - vol
        cells[ch][row].volume = 63 - vol;
      } else if (b === 0xFC) {
        // Jump to pattern (position jump)
        if (pos >= bytes.length) { ok = false; break; }
        const target = u8(v, pos);
        pos++;
        cells[0][row].effTyp = CMD_POSITION_JUMP;
        cells[0][row].eff    = target;
      } else if (b === 0xFB) {
        // Pattern break
        cells[0][row].effTyp = CMD_PATTERN_BREAK;
        cells[0][row].eff    = 0;
      } else if (b < NUM_CHANNELS) {
        // Note data for channel b
        if (pos >= bytes.length) { ok = false; break; }
        const note = u8(v, pos);
        pos++;
        if (note >= 0x7C) { ok = false; break; }
        // OpenMPT: NOTE_MIN + 12 + (note & 0x0F) + (note >> 4) * 12
        // NOTE_MIN = 1 → DEViLBOX note = 1 + 12 + semitone + octave*12 = 13 + semitone + octave*12
        const semitone = note & 0x0F;
        const octave   = note >> 4;
        cells[b][row].note = 13 + semitone + octave * 12;
        // Track channel usage for panning decision
        if (b % 2 === 0) leftChnUsed  = true;
        else             rightChnUsed = true;
      } else {
        // Unknown event byte >= numChannels but not a control code
        ok = false;
        break;
      }
    }

    if (!ok) {
      // Pattern parse failed — leave as empty pattern but don't abort the whole file
    }

    rawPatterns[pat] = cells;
  }

  // Panning: only set if both left and right channels were actually used
  const channelPan: number[] = new Array(NUM_CHANNELS).fill(0);
  if (leftChnUsed && rightChnUsed) {
    for (let ch = 0; ch < NUM_CHANNELS; ch++) {
      channelPan[ch] = (ch % 2 === 0) ? PAN_LEFT : PAN_RIGHT;
    }
  }

  // Build TrackerSong patterns — one DEViLBOX pattern per order entry
  const patterns: Pattern[] = orders.map((patIdx, orderPos) => {
    const cells = rawPatterns[patIdx];

    const channels: ChannelData[] = Array.from({ length: NUM_CHANNELS }, (_, ch) => {
      const rows: TrackerCell[] = Array.from({ length: ROWS_PER_PATTERN }, (_, row): TrackerCell => {
        if (!cells) {
          // Empty pattern
          const cell: TrackerCell = { note: 0, instrument: 0, volume: 0, effTyp: 0, eff: 0, effTyp2: 0, eff2: 0 };
          // Inject speed on first row, first channel
          if (ch === 0 && row === 0) {
            cell.effTyp = CMD_SET_SPEED;
            cell.eff    = speed;
          }
          return cell;
        }

        const src = cells[ch][row];
        const cell: TrackerCell = { ...src };

        // Inject initial speed on row 0, channel 0 if no existing effect
        if (ch === 0 && row === 0 && cell.effTyp === 0 && cell.eff === 0) {
          cell.effTyp = CMD_SET_SPEED;
          cell.eff    = speed;
        }

        return cell;
      });

      return {
        id:           `c${orderPos}-ch${ch}`,
        name:         `Channel ${ch + 1}`,
        muted:        false,
        solo:         false,
        collapsed:    false,
        volume:       100,
        pan:          channelPan[ch],
        instrumentId: null,
        color:        null,
        rows,
      };
    });

    return {
      id:     `pattern-${orderPos}-${patIdx}`,
      name:   `Pattern ${patIdx}`,
      length: ROWS_PER_PATTERN,
      channels,
      importMetadata: {
        sourceFormat:            '667',
        sourceFile:              filename,
        importedAt:              new Date().toISOString(),
        originalChannelCount:    NUM_CHANNELS,
        originalPatternCount:    128,
        originalInstrumentCount: NUM_INSTRUMENTS,
      },
    };
  });

  const songPositions = patterns.map((_, i) => i);
  const songName      = filename.replace(/\.[^/.]+$/, '');

  return {
    name:            songName,
    format:          'MOD' as TrackerFormat,
    patterns,
    instruments,
    songPositions,
    songLength:      songPositions.length,
    restartPosition: 0,
    numChannels:     NUM_CHANNELS,
    initialSpeed:    speed,
    initialBPM:      150,
    linearPeriods:   false,
  };
}
