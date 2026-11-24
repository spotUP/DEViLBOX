/**
 * AdPlug RAD (Reality AdLib Tracker) v1 Exporter
 * Converts a TrackerSong to RAD v1 binary format for OPL2 (layout per adplug rad2.cpp, file version 0x10):
 *   "RAD by REALiTY!!" (16) + version 0x10 + flags (bits 0-4 speed, bit 7 description follows)
 *   description (null-terminated) + instruments (number byte, 11 bytes; 0 ends) + order count + orders
 *   + 32 absolute LE uint16 pattern offsets (0 = empty) + patterns:
 *   line byte (bit 7 last line, low 7 row), per channel: chan byte (bit 7 last channel, low 4 channel),
 *   note byte (bit 7 instrument bit 4, bits 4-6 octave, low 4 note 1=C..12=B, 15=key off),
 *   instrument byte (high nibble instrument low bits, low nibble effect), parameter byte if effect != 0.
 */

import type { TrackerSong } from '@/engine/TrackerReplayer';
import type { InstrumentConfig, FurnaceOperatorConfig, FurnaceConfig } from '@/types';
import { DEFAULT_OPL3, type OPL3Config } from '@/types/instrument';
import { parseAdPlugFile } from '@/lib/import/formats/AdPlugParser';
import { levelToTotalLevel } from '@/engine/opl3/oplLevel';

// RAD v1 header magic
const RAD_HEADER = 'RAD by REALiTY!!';
const RAD_VERSION = 0x10; // v1.0

// OPL2 has 9 melody channels
const OPL2_CHANNELS = 9;

// RAD v1 effects: 1 slide up, 2 slide down, 3 tone porta, 5/6 volume slide + porta/vibrato, A volume slide, C volume, D break, F speed
const RAD_V1_EFFECTS = new Set([0x1, 0x2, 0x3, 0x5, 0x6, 0xA, 0xC, 0xD, 0xF]);

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
  if (inst.synthType === 'OPL3' && inst.opl3) return true;
  if (OPL_SYNTH_TYPES.has(inst.synthType)) return true;
  if (inst.furnace) {
    if (OPL_CHIP_TYPES.has(inst.furnace.chipType)) return true;
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
 * Convert OPL3Config (from OPL3Synth instruments) → RAD 11-byte register format.
 * Maps the named fields back to the standard 11-byte layout.
 */
function encodeOPL3Instrument(o: OPL3Config): Uint8Array {
  const bytes = new Uint8Array(11);
  bytes[0] = ((o.op1Tremolo ?? 0) & 1) << 7 | ((o.op1Vibrato ?? 0) & 1) << 6 |
    ((o.op1SustainHold ?? 0) & 1) << 5 | ((o.op1KSR ?? 0) & 1) << 4 | ((o.op1Multi ?? 0) & 0x0F);
  bytes[1] = ((o.op2Tremolo ?? 0) & 1) << 7 | ((o.op2Vibrato ?? 0) & 1) << 6 |
    ((o.op2SustainHold ?? 0) & 1) << 5 | ((o.op2KSR ?? 0) & 1) << 4 | ((o.op2Multi ?? 0) & 0x0F);
  bytes[2] = (((o.op1KSL ?? 0) & 0x03) << 6) | (levelToTotalLevel(o.op1Level ?? DEFAULT_OPL3.op1Level!) & 0x3F);
  bytes[3] = (((o.op2KSL ?? 0) & 0x03) << 6) | (levelToTotalLevel(o.op2Level ?? DEFAULT_OPL3.op2Level!) & 0x3F);
  bytes[4] = (((o.op1Attack ?? 0) & 0x0F) << 4) | ((o.op1Decay ?? 0) & 0x0F);
  bytes[5] = (((o.op2Attack ?? 0) & 0x0F) << 4) | ((o.op2Decay ?? 0) & 0x0F);
  bytes[6] = (((o.op1Sustain ?? 0) & 0x0F) << 4) | ((o.op1Release ?? 0) & 0x0F);
  bytes[7] = (((o.op2Sustain ?? 0) & 0x0F) << 4) | ((o.op2Release ?? 0) & 0x0F);
  bytes[8] = (o.op1Waveform ?? 0) & 0x07;
  bytes[9] = (o.op2Waveform ?? 0) & 0x07;
  bytes[10] = (((o.feedback ?? 0) & 0x07) << 1) | ((o.connection ?? 0) & 0x01);
  return bytes;
}

/** Encode one pattern as RAD v1 line/channel records; empty patterns return [] (offset 0 in the table). */
function encodePatternData(
  song: TrackerSong,
  patternIndex: number,
  instrumentMap: Map<number, number>,
): number[] {
  const pat = song.patterns[patternIndex];
  if (!pat) return [];
  const numRows = Math.min(64, pat.length || 64);
  const numCh = Math.min(pat.channels.length, OPL2_CHANNELS);
  const lines: number[][] = [];

  for (let row = 0; row < numRows; row++) {
    const chans: number[][] = [];
    for (let ch = 0; ch < numCh; ch++) {
      const cell = pat.channels[ch]?.rows[row];
      if (!cell) continue;
      const noteVal = cell.note === 97 ? 0x0F : cell.note >= 1 && cell.note <= 96 ? ((cell.note - 1) % 12) + 1 : 0;
      const octave = cell.note >= 1 && cell.note <= 96 ? Math.floor((cell.note - 1) / 12) : 0;
      const inst = cell.instrument > 0 ? (instrumentMap.get(cell.instrument) ?? cell.instrument) & 0x1F : 0;
      const effect = RAD_V1_EFFECTS.has(cell.effTyp) ? cell.effTyp : 0;
      if (!noteVal && !inst && !effect) continue;
      const rec = [ch, ((inst & 0x10) << 3) | (octave << 4) | noteVal, ((inst & 0x0F) << 4) | effect];
      if (effect) rec.push(cell.eff & 0xFF);
      chans.push(rec);
    }
    if (chans.length === 0) continue;
    chans[chans.length - 1][0] |= 0x80;
    lines.push([row, ...chans.flat()]);
  }
  if (lines.length === 0) return [];
  lines[lines.length - 1][0] |= 0x80;
  return lines.flat();
}

/**
 * Export a TrackerSong to RAD v1 binary format
 */
/** What the RAD encoder writes: cells, order list, speed and OPL patches. */
function radContent(s: TrackerSong): string {
  return JSON.stringify([
    s.patterns.map(p => p.channels.map(c => c.rows)), s.songPositions, s.initialSpeed,
    s.instruments.map(i => [i.opl3, i.furnace]),
  ]);
}

export function exportToRAD(song: TrackerSong): ArrayBuffer {
  // Source bytes are kept while nothing the encoder writes was edited. The variable-length
  // event stream is not patched in place; an edit falls through to the full encoder.
  const src = song.radFileData;
  if (src) {
    const orig = parseAdPlugFile(src.buffer.slice(src.byteOffset, src.byteOffset + src.byteLength) as ArrayBuffer, 'x.rad');
    if (radContent(orig) === radContent(song)) return src.slice().buffer as ArrayBuffer;
  }
  const encoder = new TextEncoder();

  // ── Identify OPL instruments and build mapping ────────────────────────
  // instrumentMap: XM instrument number (1-based) → RAD instrument number (1-based)
  const instrumentMap = new Map<number, number>();
  const oplInstrumentBytes: Array<{ radIndex: number; bytes: Uint8Array }> = [];
  let radIndex = 1;

  for (let i = 0; i < song.instruments.length && radIndex < 32; i++) {
    const inst = song.instruments[i];
    if (!isOPLInstrument(inst)) continue;
    const xmIndex = inst.id || (i + 1); // 1-based
    instrumentMap.set(xmIndex, radIndex);

    let bytes: Uint8Array;
    if (inst.opl3) {
      bytes = encodeOPL3Instrument(inst.opl3);
    } else if (inst.furnace) {
      bytes = encodeOPLInstrument(inst.furnace);
    } else {
      bytes = new Uint8Array(11); // empty patch
    }
    oplInstrumentBytes.push({ radIndex, bytes });
    radIndex++;
  }

  // ── Build binary sections ─────────────────────────────────────────────
  const out: number[] = [];
  out.push(...encoder.encode(RAD_HEADER), RAD_VERSION);

  // Flags: speed in bits 0-4, bit 7 = description follows
  out.push(0x80 | Math.max(1, Math.min(31, song.initialSpeed || 6)));
  out.push(...encoder.encode(song.name || 'DEViLBOX Export'), 0x00);

  // Instruments: number + 11 bytes (internal order ends C0 last; file order has C0 before the two waveforms), 0 ends
  for (const { radIndex: idx, bytes: b } of oplInstrumentBytes) {
    out.push(idx, ...b.subarray(0, 8), b[10], b[8], b[9]);
  }
  out.push(0x00);

  // Order list (patterns 0-31)
  const orderLen = Math.min(128, song.songPositions.length);
  out.push(orderLen);
  for (let i = 0; i < orderLen; i++) out.push((song.songPositions[i] ?? 0) & 0x1F);

  // 32 absolute pattern offsets, then the pattern data
  const patBytes: number[][] = [];
  for (let p = 0; p < 32; p++) patBytes.push(encodePatternData(song, p, instrumentMap));
  let off = out.length + 64;
  for (const pb of patBytes) {
    if (pb.length === 0) { out.push(0, 0); continue; }
    out.push(off & 0xFF, (off >> 8) & 0xFF);
    off += pb.length;
  }
  for (const pb of patBytes) out.push(...pb);

  return new Uint8Array(out).buffer as ArrayBuffer;
}

// ── IMF (id Music Format) Exporter ──────────────────────────────────────────
// IMF Type-1: 2-byte length header + 4-byte records [register, value, delay_lo, delay_hi]
// Used by Wolfenstein 3D, Commander Keen, Duke Nukem II, etc.

const IMF_RATE = 560; // Standard IMF playback rate (Hz)

// OPL2 channel → register offset mapping
const OPL_CH_TO_OP_OFFSET: number[][] = [
  [0x00, 0x03], [0x01, 0x04], [0x02, 0x05], // Ch 0-2
  [0x08, 0x0B], [0x09, 0x0C], [0x0A, 0x0D], // Ch 3-5
  [0x10, 0x13], [0x11, 0x14], [0x12, 0x15], // Ch 6-8
];

// Note frequency table (F-number for each semitone at octave 0)
const OPL_FNUM: number[] = [
  0x157, 0x16B, 0x181, 0x198, 0x1B0, 0x1CA, // C  C# D  D# E  F
  0x1E5, 0x202, 0x220, 0x241, 0x263, 0x287, // F# G  G# A  A# B
];

/**
 * Check if a song can be exported to IMF format
 */
export function canExportIMF(song: TrackerSong): boolean {
  return song.instruments.some(inst => isOPLInstrument(inst));
}

/**
 * Export a TrackerSong to IMF Type-1 format.
 * Renders all patterns in order, writing OPL register commands for each note.
 */
export function exportToIMF(song: TrackerSong): ArrayBuffer {
  const records: number[] = [];
  const speed = song.initialSpeed || 6;
  const bpm = song.initialBPM || 125;
  const ticksPerRow = speed;
  const rowDelayTicks = Math.round((IMF_RATE * 60) / (bpm * ticksPerRow * 4));

  // Build instrument register cache
  const instRegs = new Map<number, Uint8Array>();
  for (const inst of song.instruments) {
    if (inst.opl3) {
      instRegs.set(inst.id, encodeOPL3Instrument(inst.opl3));
    } else if (inst.furnace) {
      instRegs.set(inst.id, encodeOPLInstrument(inst.furnace));
    }
  }

  // Track current channel state for key-on/off
  const chanInst = new Array<number>(9).fill(0);

  function writeReg(reg: number, val: number, delay: number) {
    records.push(reg & 0xFF, val & 0xFF, delay & 0xFF, (delay >> 8) & 0xFF);
  }

  function programInstrument(ch: number, regs: Uint8Array) {
    const [modOff, carOff] = OPL_CH_TO_OP_OFFSET[ch];
    writeReg(0x20 + modOff, regs[0], 0);
    writeReg(0x20 + carOff, regs[1], 0);
    writeReg(0x40 + modOff, regs[2], 0);
    writeReg(0x40 + carOff, regs[3], 0);
    writeReg(0x60 + modOff, regs[4], 0);
    writeReg(0x60 + carOff, regs[5], 0);
    writeReg(0x80 + modOff, regs[6], 0);
    writeReg(0x80 + carOff, regs[7], 0);
    writeReg(0xE0 + modOff, regs[8], 0);
    writeReg(0xE0 + carOff, regs[9], 0);
    writeReg(0xC0 + ch, regs[10], 0);
  }

  function noteOn(ch: number, note: number) {
    if (note < 1 || note > 96) return;
    const semitone = (note - 1) % 12;
    const octave = Math.min(7, Math.floor((note - 1) / 12));
    const fnum = OPL_FNUM[semitone];
    writeReg(0xA0 + ch, fnum & 0xFF, 0);
    writeReg(0xB0 + ch, 0x20 | ((octave & 7) << 2) | ((fnum >> 8) & 3), 0);
  }

  function noteOff(ch: number) {
    writeReg(0xB0 + ch, 0, 0);
  }

  // Render each pattern in song order
  for (const patIdx of song.songPositions) {
    const pat = song.patterns[patIdx];
    if (!pat) continue;
    const numCh = Math.min(pat.channels.length, 9);
    const numRows = pat.length || 64;

    for (let row = 0; row < numRows; row++) {
      for (let ch = 0; ch < numCh; ch++) {
        const cell = pat.channels[ch]?.rows[row];
        if (!cell) continue;

        // Program instrument if changed
        if (cell.instrument > 0 && cell.instrument !== chanInst[ch]) {
          const regs = instRegs.get(cell.instrument);
          if (regs) {
            programInstrument(ch, regs);
            chanInst[ch] = cell.instrument;
          }
        }

        if (cell.note === 97) {
          noteOff(ch);
        } else if (cell.note > 0 && cell.note <= 96) {
          noteOff(ch); // key-off before re-trigger
          noteOn(ch, cell.note);
        }
      }

      // Add row delay to last record
      if (records.length >= 4) {
        const lastIdx = records.length - 2;
        const delay = rowDelayTicks;
        records[lastIdx] = delay & 0xFF;
        records[lastIdx + 1] = (delay >> 8) & 0xFF;
      } else {
        // Empty row — emit a delay-only record
        writeReg(0, 0, rowDelayTicks);
      }
    }
  }

  // Type-1 IMF: 2-byte length header + data
  const dataLen = records.length;
  const output = new Uint8Array(2 + dataLen);
  output[0] = dataLen & 0xFF;
  output[1] = (dataLen >> 8) & 0xFF;
  for (let i = 0; i < dataLen; i++) output[2 + i] = records[i];

  return output.buffer as ArrayBuffer;
}

// ── RAW (RdosPlay Raw OPL Capture) Exporter ────────────────────────────────────
// RAW format: "RAWADATA" header + 2-byte clock + pairs of (value, register) bytes
// Special commands: register=0x00 → delay, register=0x02 → chip select/speed
// EOF marker: 0xFF 0xFF

const RAW_MAGIC = 'RAWADATA';
const RAW_DEFAULT_CLOCK = 0xFFFF; // ~18.2 Hz timer (1193180/0xFFFF)

/**
 * Check if a song can be exported to RAW format
 */
export function canExportRAW(song: TrackerSong): boolean {
  return song.instruments.some(inst => isOPLInstrument(inst));
}

/**
 * Export a TrackerSong to RdosPlay RAW format.
 * Renders all patterns in order, writing OPL register pairs.
 */
export function exportToRAW(song: TrackerSong): ArrayBuffer {
  const encoder = new TextEncoder();
  const records: number[] = [];
  const speed = song.initialSpeed || 6;
  const bpm = song.initialBPM || 125;
  const timerHz = 1193180.0 / RAW_DEFAULT_CLOCK;
  const rowsPerSec = (bpm * 2) / (5 * speed);
  const ticksPerRow = Math.max(1, Math.round(timerHz / rowsPerSec));

  const instRegs = new Map<number, Uint8Array>();
  for (const inst of song.instruments) {
    if (inst.opl3) {
      instRegs.set(inst.id, encodeOPL3Instrument(inst.opl3));
    } else if (inst.furnace) {
      instRegs.set(inst.id, encodeOPLInstrument(inst.furnace));
    }
  }

  const chanInst = new Array<number>(9).fill(0);

  function writeRegPair(reg: number, val: number) {
    records.push(val & 0xFF, reg & 0xFF);
  }

  function writeDelay(ticks: number) {
    while (ticks > 0) {
      const d = Math.min(256, ticks);
      records.push(d - 1, 0x00); // register 0x00 = delay, value = ticks-1
      ticks -= d;
    }
  }

  function programInstrumentRaw(ch: number, regs: Uint8Array) {
    const [modOff, carOff] = OPL_CH_TO_OP_OFFSET[ch];
    writeRegPair(0x20 + modOff, regs[0]);
    writeRegPair(0x20 + carOff, regs[1]);
    writeRegPair(0x40 + modOff, regs[2]);
    writeRegPair(0x40 + carOff, regs[3]);
    writeRegPair(0x60 + modOff, regs[4]);
    writeRegPair(0x60 + carOff, regs[5]);
    writeRegPair(0x80 + modOff, regs[6]);
    writeRegPair(0x80 + carOff, regs[7]);
    writeRegPair(0xE0 + modOff, regs[8]);
    writeRegPair(0xE0 + carOff, regs[9]);
    writeRegPair(0xC0 + ch, regs[10]);
  }

  function noteOnRaw(ch: number, note: number) {
    if (note < 1 || note > 96) return;
    const semitone = (note - 1) % 12;
    const octave = Math.min(7, Math.floor((note - 1) / 12));
    const fnum = OPL_FNUM[semitone];
    writeRegPair(0xA0 + ch, fnum & 0xFF);
    writeRegPair(0xB0 + ch, 0x20 | ((octave & 7) << 2) | ((fnum >> 8) & 3));
  }

  function noteOffRaw(ch: number) {
    writeRegPair(0xB0 + ch, 0);
  }

  for (const patIdx of song.songPositions) {
    const pat = song.patterns[patIdx];
    if (!pat) continue;
    const numCh = Math.min(pat.channels.length, 9);
    const numRows = pat.length || 64;

    for (let row = 0; row < numRows; row++) {
      for (let ch = 0; ch < numCh; ch++) {
        const cell = pat.channels[ch]?.rows[row];
        if (!cell) continue;

        if (cell.instrument > 0 && cell.instrument !== chanInst[ch]) {
          const regs = instRegs.get(cell.instrument);
          if (regs) {
            programInstrumentRaw(ch, regs);
            chanInst[ch] = cell.instrument;
          }
        }

        if (cell.note === 97) {
          noteOffRaw(ch);
        } else if (cell.note > 0 && cell.note <= 96) {
          noteOffRaw(ch);
          noteOnRaw(ch, cell.note);
        }
      }

      writeDelay(ticksPerRow);
    }
  }

  // EOF marker
  records.push(0xFF, 0xFF);

  // Build output: 8-byte magic + 2-byte clock + data
  const magicBytes = encoder.encode(RAW_MAGIC);
  const output = new Uint8Array(8 + 2 + records.length);
  output.set(magicBytes, 0);
  output[8] = RAW_DEFAULT_CLOCK & 0xFF;
  output[9] = (RAW_DEFAULT_CLOCK >> 8) & 0xFF;
  for (let i = 0; i < records.length; i++) output[10 + i] = records[i];

  return output.buffer as ArrayBuffer;
}

// ── Unified AdPlug Export Entry Point ──────────────────────────────────────────

export type AdPlugExportFormat = 'rad' | 'imf' | 'raw';

const ADPLUG_FORMAT_EXTENSIONS: Record<AdPlugExportFormat, string> = {
  rad: '.rad',
  imf: '.imf',
  raw: '.raw',
};

/**
 * Export a TrackerSong to the specified AdLib format.
 * Default: RAD v1 (most complete OPL tracker format).
 */
export function exportAdPlug(
  song: TrackerSong,
  format: AdPlugExportFormat = 'rad',
): { data: Blob; filename: string; warnings: string[] } {
  const baseName = (song.name || 'untitled').replace(/[^a-zA-Z0-9_-]/g, '_');
  const ext = ADPLUG_FORMAT_EXTENSIONS[format];
  const warnings: string[] = [];

  let buf: ArrayBuffer;
  switch (format) {
    case 'imf':
      buf = exportToIMF(song);
      break;
    case 'raw':
      buf = exportToRAW(song);
      break;
    case 'rad':
    default:
      buf = exportToRAD(song);
      break;
  }

  const numOpl = song.instruments.filter(i => isOPLInstrument(i)).length;
  if (numOpl === 0) {
    warnings.push('No OPL instruments found — exported file may be empty');
  }

  return {
    data: new Blob([new Uint8Array(buf)], { type: 'application/octet-stream' }),
    filename: `${baseName}${ext}`,
    warnings,
  };
}
