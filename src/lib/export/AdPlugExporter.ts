/**
 * AdPlug RAD (Reality AdLib Tracker) v1 Exporter
 * Converts a TrackerSong to RAD v1 binary format for OPL2
 *
 * RAD v1 layout:
 *   "RAD by REALiTY!!" (16 bytes) + version byte (0x10)
 *   Description string (null-terminated)
 *   Initial speed byte
 *   Instrument definitions
 *   Order list
 *   Pattern data (channel events with row-skip encoding)
 *
 * OPL2 supports 9 melody channels, each with 2 operators (modulator + carrier).
 */

import type { RegisterWrite } from './VGMExporter';
import type { TrackerSong } from '@/engine/TrackerReplayer';
import type { InstrumentConfig, FurnaceOperatorConfig, FurnaceConfig } from '@/types';

void (undefined as unknown as RegisterWrite); // Satisfy import usage

// RAD v1 header magic
const RAD_HEADER = 'RAD by REALiTY!!';
const RAD_VERSION = 0x10; // v1.0

// OPL2 has 9 melody channels
const OPL2_CHANNELS = 9;

// OPL chip types in FurnaceChipType that map to OPL2-compatible instruments
const OPL_CHIP_TYPES = new Set([2, 23, 26]); // OPL3, Y8950, OPL4
const OPL_SYNTH_TYPES = new Set(['FurnaceOPL', 'FurnaceOPLL', 'FurnaceOPL4']);

/**
 * Check if a song has OPL-compatible instruments suitable for RAD export
 */
export function canExportRAD(song: TrackerSong): boolean {
  return song.instruments.some(inst => isOPLInstrument(inst));
}

/**
 * Determine if an instrument is OPL-based
 */
function isOPLInstrument(inst: InstrumentConfig): boolean {
  if (OPL_SYNTH_TYPES.has(inst.synthType)) return true;
  if (inst.furnace) {
    if (OPL_CHIP_TYPES.has(inst.furnace.chipType)) return true;
    // OPLL (chipType 11) is OPL-family
    if (inst.furnace.chipType === 11) return true;
  }
  return false;
}

/**
 * Convert Furnace OPL operator params → RAD 11-byte instrument format
 *
 * OPL2 register layout per operator:
 *   Byte 0: AM | VIB | EGT(sus) | KSR | MULT[3:0]   (reg 0x20+offset)
 *   Byte 1: KSL[1:0] | TL[5:0]                        (reg 0x40+offset)
 *   Byte 2: AR[3:0] | DR[3:0]                          (reg 0x60+offset)
 *   Byte 3: SL[3:0] | RR[3:0]                          (reg 0x80+offset)
 *   Byte 4: WS[1:0]                                    (reg 0xE0+offset)
 *
 * Full 11-byte layout:
 *   [0-4]  Modulator (op[0]): char, attack/sustain, waveSel, fbConn
 *   [5-9]  Carrier (op[1]): same 5 bytes
 *   [10]   FB[3:1] | CNT[0]                             (reg 0xC0+ch)
 */
function encodeOPLInstrument(config: FurnaceConfig): Uint8Array {
  const bytes = new Uint8Array(11);
  const mod = config.operators[0] || createDefaultOperator();
  const car = config.operators[1] || createDefaultOperator();

  // Modulator bytes (0-4)
  bytes[0] = encodeCharByte(mod);
  bytes[1] = encodeKslTl(mod);
  bytes[2] = encodeArDr(mod);
  bytes[3] = encodeSlRr(mod);
  bytes[4] = (mod.ws ?? 0) & 0x07;

  // Carrier bytes (5-9)
  bytes[5] = encodeCharByte(car);
  bytes[6] = encodeKslTl(car);
  bytes[7] = encodeArDr(car);
  bytes[8] = encodeSlRr(car);
  bytes[9] = (car.ws ?? 0) & 0x07;

  // FB/CNT byte
  const fb = (config.feedback & 0x07) << 1;
  const cnt = config.algorithm & 0x01;
  bytes[10] = fb | cnt;

  return bytes;
}

/** AM | VIB | EGT(sus) | KSR | MULT[3:0] */
function encodeCharByte(op: FurnaceOperatorConfig): number {
  return (
    ((op.am ? 1 : 0) << 7) |
    ((op.vib ? 1 : 0) << 6) |
    ((op.sus ? 1 : 0) << 5) |
    ((op.ksr ? 1 : 0) << 4) |
    (op.mult & 0x0F)
  );
}

/** KSL[1:0] | TL[5:0] */
function encodeKslTl(op: FurnaceOperatorConfig): number {
  const ksl = (op.ksl ?? 0) & 0x03;
  const tl = op.tl & 0x3F;
  return (ksl << 6) | tl;
}

/** AR[3:0] | DR[3:0] */
function encodeArDr(op: FurnaceOperatorConfig): number {
  return ((op.ar & 0x0F) << 4) | (op.dr & 0x0F);
}

/** SL[3:0] | RR[3:0] */
function encodeSlRr(op: FurnaceOperatorConfig): number {
  return ((op.sl & 0x0F) << 4) | (op.rr & 0x0F);
}

function createDefaultOperator(): FurnaceOperatorConfig {
  return {
    enabled: true,
    mult: 1, tl: 63, ar: 15, dr: 0, d2r: 0, sl: 15, rr: 15, dt: 0,
    am: false, vib: false, sus: false, ksr: false, ksl: 0, ws: 0,
  };
}

/**
 * Encode pattern rows in RAD's channel-event format
 *
 * Row format within a pattern:
 *   If row has no events → skip (counted by row-skip byte)
 *   Row-skip byte: (skip_count + 1) — number of empty rows before this row
 *     0x00 means "this is the next row", 0x01 means "skip 1 empty row", etc.
 *   Then per-channel events:
 *     First byte: channel_number (0-8) with flags:
 *       bit 7 (0x80): note present
 *       bit 6 (0x40): instrument present
 *       bit 5 (0x20): volume present (RAD v1 doesn't use this, but reserve)
 *       bit 4 (0x10): effect present
 *     Followed by optional bytes depending on flags:
 *       note byte: octave[6:4] | note[3:0] (1=C, 2=C#, ..., 12=B; 15=key-off)
 *       instrument byte: 1-based instrument number
 *       volume byte (unused in v1)
 *       effect byte: effect_type[7:4] | effect_param[3:0]
 *   End of row's channel events: 0x00
 *   End of pattern: row with 0x00 as first byte after row-skip processing
 */
function encodePatternData(
  song: TrackerSong,
  patternIndex: number,
  instrumentMap: Map<number, number>,
): number[] {
  const data: number[] = [];
  const pat = song.patterns[patternIndex];
  if (!pat) return [0x00]; // empty pattern

  const numRows = pat.length || 64;
  const numCh = Math.min(pat.channels.length, OPL2_CHANNELS);
  let emptyRows = 0;

  for (let row = 0; row < numRows; row++) {
    // Collect channel events for this row
    const rowEvents: number[] = [];

    for (let ch = 0; ch < numCh; ch++) {
      const cell = pat.channels[ch]?.rows[row];
      if (!cell) continue;

      const hasNote = cell.note > 0 && cell.note <= 97;
      const hasInst = cell.instrument > 0;
      const hasEffect = cell.effTyp > 0;

      if (!hasNote && !hasInst && !hasEffect) continue;

      // Channel byte with flags
      let chanByte = ch & 0x0F;
      if (hasNote) chanByte |= 0x80;
      if (hasInst) chanByte |= 0x40;
      if (hasEffect) chanByte |= 0x10;
      rowEvents.push(chanByte);

      // Note byte: octave[6:4] | noteNum[3:0]
      if (hasNote) {
        if (cell.note === 97) {
          // Key-off: note value 0x0F
          rowEvents.push(0x0F);
        } else {
          // XM note: 1=C-0, 13=C-1, etc. Convert to octave + semitone
          const semitone = ((cell.note - 1) % 12) + 1; // 1-12
          const octave = Math.floor((cell.note - 1) / 12); // 0-7
          rowEvents.push(((octave & 0x07) << 4) | (semitone & 0x0F));
        }
      }

      // Instrument byte (1-based RAD instrument number)
      if (hasInst) {
        const radInst = instrumentMap.get(cell.instrument) ?? cell.instrument;
        rowEvents.push(radInst & 0xFF);
      }

      // Effect byte: type[7:4] | param[3:0]
      if (hasEffect) {
        const effType = cell.effTyp & 0x0F;
        const effParam = cell.eff & 0x0F;
        rowEvents.push((effType << 4) | effParam);
      }
    }

    if (rowEvents.length === 0) {
      emptyRows++;
      continue;
    }

    // Emit row-skip byte + channel events + row terminator
    data.push(emptyRows & 0x3F);
    emptyRows = 0;
    data.push(...rowEvents);
    data.push(0x00); // end of row's channel events
  }

  // End-of-pattern marker
  data.push(0x00);
  return data;
}

/**
 * Export a TrackerSong to RAD v1 binary format
 */
export function exportToRAD(song: TrackerSong): ArrayBuffer {
  const encoder = new TextEncoder();

  // ── Identify OPL instruments and build mapping ────────────────────────
  // instrumentMap: XM instrument number (1-based) → RAD instrument number (1-based)
  const instrumentMap = new Map<number, number>();
  const oplInstruments: Array<{ radIndex: number; config: FurnaceConfig }> = [];
  let radIndex = 1;

  for (let i = 0; i < song.instruments.length; i++) {
    const inst = song.instruments[i];
    if (isOPLInstrument(inst) && inst.furnace) {
      const xmIndex = inst.id || (i + 1); // 1-based
      instrumentMap.set(xmIndex, radIndex);
      oplInstruments.push({ radIndex, config: inst.furnace });
      radIndex++;
    }
  }

  // ── Build binary sections ─────────────────────────────────────────────
  const sections: number[] = [];

  // 1. Header: "RAD by REALiTY!!" (16 bytes) + version byte
  const headerBytes = encoder.encode(RAD_HEADER);
  for (let i = 0; i < 16; i++) {
    sections.push(i < headerBytes.length ? headerBytes[i] : 0);
  }
  sections.push(RAD_VERSION);

  // 2. Description string (null-terminated)
  const desc = encoder.encode(song.name || 'DEViLBOX Export');
  for (let i = 0; i < desc.length; i++) sections.push(desc[i]);
  sections.push(0x00);

  // 3. Initial speed byte
  const speed = Math.max(1, Math.min(255, song.initialSpeed || 6));
  sections.push(speed);

  // 4. Instrument definitions: count + per-instrument data
  sections.push(oplInstruments.length & 0xFF);
  for (const { radIndex: idx, config } of oplInstruments) {
    sections.push(idx & 0xFF); // instrument number (1-based)
    const instBytes = encodeOPLInstrument(config);
    for (let j = 0; j < instBytes.length; j++) sections.push(instBytes[j]);
  }

  // 5. Order list: count + pattern numbers
  const orderLen = Math.min(128, song.songPositions.length);
  sections.push(orderLen & 0xFF);
  for (let i = 0; i < orderLen; i++) {
    sections.push((song.songPositions[i] ?? 0) & 0xFF);
  }

  // 6. Pattern data
  // Determine which patterns are referenced by the order list
  const usedPatterns = new Set<number>();
  for (let i = 0; i < orderLen; i++) {
    usedPatterns.add(song.songPositions[i] ?? 0);
  }

  for (const patIdx of Array.from(usedPatterns).sort((a, b) => a - b)) {
    sections.push(patIdx & 0xFF); // pattern number
    const patData = encodePatternData(song, patIdx, instrumentMap);
    sections.push(...patData);
  }

  // Build final ArrayBuffer
  const output = new Uint8Array(sections);
  return output.buffer as ArrayBuffer;
}
