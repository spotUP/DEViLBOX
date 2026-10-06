/**
 * soundPlayerCodec.ts - Sound Player (Scott Johnston, "SoundPlayer V4.05",
 * SJS.* + SMP.*) song data: the structures the replayer reads, their codec,
 * and the replayer's own walk of them.
 *
 * Traced from third-party/uade-3.05/amigasrc/players/wanted_team/SoundPlayer/
 * src/SoundPlayer_v1.asm (format write-up:
 * thoughts/shared/research/2026-10-06_soundplayer-format.md):
 *
 *   +0  u8   CIA timer low  \ InitSound: dtg_Timer = byte1 << 8 | byte0
 *   +1  u8   CIA timer high /  (one player tick = timer / 709379 s)
 *   +2  u8   voice mask (bit N = Paula voice N plays; 7 or 15)
 *   +3  rows of 12 bytes: 4 x [note, instrument, command], voice N at +3N
 *
 * Every voice has its own row pointer into the SAME row array (lbC0639D6
 * points all four at module - 9; lbC063D70 adds 12 per row tick, then
 * lbC063D2C reads the voice's 3 bytes). A row tick comes every 6th player
 * tick (lbC063D18, counter 5..0). The command byte drives the walk: wait n
 * holds the voice on its row for n row ticks, loop start/end repeat a span,
 * park re-reads one row forever, song end ($DE) sends the pointer back to
 * the start. So the voices are independent streams over a shared row array,
 * and the grid is their walk laid on one row-tick timeline.
 *
 * Zero app imports besides the period naming, so tools and tests use it.
 */
import { periodToNote } from '@/lib/amiga/periodNotes';
import { SPL_FX } from './soundPlayerEffectGlyphs';

/** Bytes before the first row (timer word + voice mask). */
export const SP_HEADER_BYTES = 3;
/** Bytes per row: 4 voices x 3. */
export const SP_ROW_BYTES = 12;
export const SP_CELL_BYTES = 3;
/** Player ticks per row tick (lbC063D18 reloads its counter with 5). */
export const SP_TICKS_PER_ROW = 6;
/** PAL CIA clock (Hz): one player tick = timer / SP_CIA_CLOCK seconds. */
export const SP_CIA_CLOCK = 709379;

/** lbW0642A6: note byte n (1..39) plays period SP_PERIODS[n - 1]. */
export const SP_PERIODS: readonly number[] = [
  0x434, 0x3F8, 0x3C0, 0x358, 0x328, 0x2FA, 0x2D0, 0x2A6, 0x280, 0x25C, 0x23A, 0x21A,
  0x1FC, 0x1E0, 0x1C5, 0x1AC, 0x194, 0x17D, 0x168, 0x153, 0x140, 0x12E, 0x11D, 0x10D,
  0xFE, 0xF0, 0xE2, 0xD6, 0xCA, 0xBE, 0xB4, 0xAA, 0xA0, 0x97, 0x8F, 0x87,
  0x7F, 0x78, 0x71,
];

// ── Wire grammar: the command byte (lbW0642F4 jump table + handlers) ─────────

export type SPCommand =
  | { kind: 'none' }                       // $00
  | { kind: 'filterOff' }                  // $01 BSET #1,$BFE001
  | { kind: 'filterOn' }                   // $02 BCLR #1,$BFE001
  | { kind: 'volume'; value: number }      // $03-$42 volume = byte - 3
  | { kind: 'dmaOff' }                     // $43 voice DMA off
  | { kind: 'wait'; rows: number }         // $57-$88 hold n = byte - $56 row ticks
  | { kind: 'slideUp'; speed: number }     // $A7-$B0 +1 volume every n ticks
  | { kind: 'slideDown'; speed: number }   // $B1-$BA -1 volume every n ticks
  | { kind: 'setFlag'; flag: number }      // $BB-$CE game sync flag byte - $BB
  | { kind: 'holdOn' }                     // $CF sample not re-pointed to its loop
  | { kind: 'holdOff' }                    // $D0
  | { kind: 'clearFlags' }                 // $D1 clear all 20 flags
  | { kind: 'loopStart'; count: number }   // $D2-$DB count = byte - $D1
  | { kind: 'loopEnd' }                    // $DC
  | { kind: 'park' }                       // $DD pointer -= 12: this row forever
  | { kind: 'songEnd' }                    // $DE pointer = start, dtg_SongEnd
  | { kind: 'adkSet'; bits: number }       // $DF-$E4 ADKCON $8000 | bits
  | { kind: 'clearFlag'; flag: number }    // $E5-$F8 flag byte - $E5
  | { kind: 'adkClear'; bits: number }     // $F9-$FD ADKCON bits
  | { kind: 'inert'; byte: number };       // table entry 0 (RTS): ignored by V4.05

const ADK_SET_BITS = [0x01, 0x02, 0x04, 0x10, 0x20, 0x40];
const ADK_CLEAR_BITS = [0x01, 0x02, 0x04, 0x10, 0x20];

export function decodeSPCommand(c: number): SPCommand {
  if (c === 0) return { kind: 'none' };
  if (c === 0x01) return { kind: 'filterOff' };
  if (c === 0x02) return { kind: 'filterOn' };
  if (c >= 0x03 && c <= 0x42) return { kind: 'volume', value: c - 0x03 };
  if (c === 0x43) return { kind: 'dmaOff' };
  if (c >= 0x57 && c <= 0x88) return { kind: 'wait', rows: c - 0x56 };
  if (c >= 0xA7 && c <= 0xB0) return { kind: 'slideUp', speed: c - 0xA6 };
  if (c >= 0xB1 && c <= 0xBA) return { kind: 'slideDown', speed: c - 0xB0 };
  if (c >= 0xBB && c <= 0xCE) return { kind: 'setFlag', flag: c - 0xBB };
  if (c === 0xCF) return { kind: 'holdOn' };
  if (c === 0xD0) return { kind: 'holdOff' };
  if (c === 0xD1) return { kind: 'clearFlags' };
  if (c >= 0xD2 && c <= 0xDB) return { kind: 'loopStart', count: c - 0xD1 };
  if (c === 0xDC) return { kind: 'loopEnd' };
  if (c === 0xDD) return { kind: 'park' };
  if (c === 0xDE) return { kind: 'songEnd' };
  if (c >= 0xDF && c <= 0xE4) return { kind: 'adkSet', bits: ADK_SET_BITS[c - 0xDF] };
  if (c >= 0xE5 && c <= 0xF8) return { kind: 'clearFlag', flag: c - 0xE5 };
  if (c >= 0xF9 && c <= 0xFD) return { kind: 'adkClear', bits: ADK_CLEAR_BITS[c - 0xF9] };
  return { kind: 'inert', byte: c & 0xFF };
}

// ── The module: header + row array ───────────────────────────────────────────

export interface SPCell { note: number; instrument: number; command: number }

export interface SoundPlayerModule {
  /** CIA timer value (byte1 << 8 | byte0). */
  timer: number;
  /** Byte 2: bit N = Paula voice N is walked by the player. */
  voiceMask: number;
  /** rows[r][v]: voice v's 3 bytes of row r (all four, played or not). */
  rows: SPCell[][];
  /** Bytes after the last whole row (none in the corpus). */
  tail: Uint8Array;
}

export function decodeSoundPlayerModule(buf: Uint8Array): SoundPlayerModule {
  if (buf.length < SP_HEADER_BYTES) throw new Error('Sound Player: file shorter than its header');
  const nRows = Math.floor((buf.length - SP_HEADER_BYTES) / SP_ROW_BYTES);
  const rows: SPCell[][] = [];
  for (let r = 0; r < nRows; r++) {
    const o = SP_HEADER_BYTES + r * SP_ROW_BYTES;
    const row: SPCell[] = [];
    for (let v = 0; v < 4; v++) {
      const p = o + v * SP_CELL_BYTES;
      row.push({ note: buf[p], instrument: buf[p + 1], command: buf[p + 2] });
    }
    rows.push(row);
  }
  return {
    timer: (buf[1] << 8) | buf[0],
    voiceMask: buf[2],
    rows,
    tail: buf.slice(SP_HEADER_BYTES + nRows * SP_ROW_BYTES),
  };
}

export function encodeSoundPlayerModule(m: SoundPlayerModule): Uint8Array {
  const out = new Uint8Array(SP_HEADER_BYTES + m.rows.length * SP_ROW_BYTES + m.tail.length);
  out[0] = m.timer & 0xFF;
  out[1] = (m.timer >> 8) & 0xFF;
  out[2] = m.voiceMask & 0xFF;
  m.rows.forEach((row, r) => {
    const o = SP_HEADER_BYTES + r * SP_ROW_BYTES;
    row.forEach((c, v) => {
      const p = o + v * SP_CELL_BYTES;
      out[p] = c.note; out[p + 1] = c.instrument; out[p + 2] = c.command;
    });
  });
  out.set(m.tail, SP_HEADER_BYTES + m.rows.length * SP_ROW_BYTES);
  return out;
}

/** File offset of voice `voice`'s cell in row `row`. */
export function spCellOffset(row: number, voice: number): number {
  return SP_HEADER_BYTES + row * SP_ROW_BYTES + voice * SP_CELL_BYTES;
}

/** The Paula voices the player walks (lbC063AF8 tests the mask bit per voice). */
export function spActiveVoices(m: Pick<SoundPlayerModule, 'voiceMask'>): number[] {
  return [0, 1, 2, 3].filter((v) => (m.voiceMask >> v) & 1);
}

// ── The replayer's walk (lbC063D70 advance, lbC063D2C read, lbC063F4C cmds) ──

export interface SPVoiceWalk {
  /** rowAt[t] = the row the voice reads at row tick t, or -1 (waiting / past the data). */
  rowAt: Int32Array;
  /** Row ticks from the start through the first song end ($DE), or -1 if none came. */
  passTicks: number;
}

/**
 * Walk one voice for `ticks` row ticks exactly as the player does: the wait
 * counter is decremented first and holds the pointer while non-zero; then the
 * pointer moves 12 bytes and the row is read; then the row's command runs.
 * Loop state (count $FF = idle) survives song ends, as in the player.
 */
export function walkSoundPlayerVoice(m: SoundPlayerModule, voice: number, ticks: number): SPVoiceWalk {
  const rowAt = new Int32Array(ticks).fill(-1);
  let ptr = -1, wait = 0, loopCount = 0xFF, loopPtr = -1, passTicks = -1;
  for (let t = 0; t < ticks; t++) {
    if (wait !== 0) {
      wait--;
      if (wait !== 0) continue;
    }
    ptr++;
    // Past the row array the player reads whatever follows the module; the
    // grid has no row for that (no corpus song gets there).
    if (ptr < 0 || ptr >= m.rows.length) break;
    rowAt[t] = ptr;
    const cmd = decodeSPCommand(m.rows[ptr][voice].command);
    switch (cmd.kind) {
      case 'wait': wait = cmd.rows; break;
      case 'loopStart': if (loopCount === 0xFF) { loopPtr = ptr; loopCount = cmd.count; } break;
      case 'loopEnd':
        if (loopCount === 0) loopCount = 0xFF;
        else { loopCount = (loopCount - 1) & 0xFF; ptr = loopPtr; }
        break;
      case 'park': ptr--; break;
      case 'songEnd':
        ptr = -1;
        if (passTicks < 0) passTicks = t + 1;
        break;
      default: break;
    }
  }
  return { rowAt, passTicks };
}

// ── Grid cell codec (3 bytes <-> TrackerCell) ────────────────────────────────

export interface SPGridCell {
  note: number; instrument: number; volume: number;
  effTyp: number; eff: number; effTyp2: number; eff2: number;
}

/** Note byte -> grid note (ProTracker naming of its period); 0 = none / outside the table. */
export function spNoteToGrid(n: number): number {
  return n >= 1 && n <= SP_PERIODS.length ? periodToNote(SP_PERIODS[n - 1]) : 0;
}

/** Grid note -> note byte: the table entry with that note, else the nearest period. */
export function spGridToNote(note: number): number {
  if (!(note > 0) || note >= 97) return 0;
  const exact = SP_PERIODS.findIndex((p) => periodToNote(p) === note);
  if (exact >= 0) return exact + 1;
  // Not in the player's table: the entry whose note is nearest.
  let best = 0, bestD = Infinity;
  SP_PERIODS.forEach((p, i) => {
    const d = Math.abs(periodToNote(p) - note);
    if (d < bestD) { bestD = d; best = i; }
  });
  return best + 1;
}

const XM_A = 10, XM_B = 11, XM_C = 12, XM_E = 14;

/** Command byte -> (effTyp, eff). XM letters where XM means the same; the SPL block otherwise. */
export function spCommandToEffect(c: number): [number, number] {
  const cmd = decodeSPCommand(c);
  switch (cmd.kind) {
    case 'none': return [0, 0];
    case 'filterOff': return [XM_E, 0x01];
    case 'filterOn': return [XM_E, 0x00];
    case 'volume': return [XM_C, cmd.value];
    case 'dmaOff': return [XM_E, 0xC0];
    case 'wait': return [SPL_FX.wait, cmd.rows];
    case 'slideUp': return [XM_A, cmd.speed << 4];
    case 'slideDown': return [XM_A, cmd.speed];
    case 'setFlag': return [SPL_FX.sync, cmd.flag];
    case 'holdOn': return [SPL_FX.hold, 1];
    case 'holdOff': return [SPL_FX.hold, 0];
    case 'clearFlags': return [SPL_FX.sync, 0xFF];
    case 'loopStart': return [SPL_FX.loop, cmd.count];
    case 'loopEnd': return [SPL_FX.loop, 0];
    case 'park': return [SPL_FX.park, 0];
    case 'songEnd': return [XM_B, 0];
    case 'adkSet': return [SPL_FX.adk, 0x80 | cmd.bits];
    case 'clearFlag': return [SPL_FX.sync, 0x80 | cmd.flag];
    case 'adkClear': return [SPL_FX.adk, cmd.bits];
    case 'inert': return [SPL_FX.inert, cmd.byte];
  }
}

/** Every (effTyp, eff) a command byte decodes to, back to its byte. */
const EFFECT_TO_COMMAND = new Map<number, number>();
for (let c = 0; c < 256; c++) {
  const [t, e] = spCommandToEffect(c);
  EFFECT_TO_COMMAND.set((t << 8) | e, c);
}

const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));

/**
 * (effTyp, eff) -> command byte. Exact for every pair a byte decodes to; an
 * entered effect the player has no exact command for takes the nearest one
 * of its family (C clamps to 63, A to speed 10, W to 50 rows, any Bxx is the
 * song end); anything else is no command.
 */
export function spEffectToCommand(effTyp: number, eff: number): number {
  const exact = EFFECT_TO_COMMAND.get(((effTyp & 0xFF) << 8) | (eff & 0xFF));
  if (exact !== undefined) return exact;
  switch (effTyp) {
    case XM_C: return 0x03 + clamp(eff, 0, 63);
    case XM_A: {
      const up = eff >> 4, down = eff & 0x0F;
      if (up > 0) return 0xA6 + clamp(up, 1, 10);
      if (down > 0) return 0xB0 + clamp(down, 1, 10);
      return 0;
    }
    case XM_B: return 0xDE;
    case XM_E:
      if ((eff & 0xF0) === 0xC0) return 0x43;
      if ((eff & 0xF0) === 0x00) return (eff & 1) ? 0x01 : 0x02;
      return 0;
    case SPL_FX.wait: return 0x56 + clamp(eff, 1, 50);
    case SPL_FX.loop: return eff === 0 ? 0xDC : 0xD1 + clamp(eff, 1, 10);
    default: return 0;
  }
}

/** 3 cell bytes -> grid cell. */
export function decodeSPCell(bytes: Uint8Array): SPGridCell {
  const [effTyp, eff] = spCommandToEffect(bytes[2]);
  return { note: spNoteToGrid(bytes[0]), instrument: bytes[1], volume: 0, effTyp, eff, effTyp2: 0, eff2: 0 };
}

/** Grid cell -> 3 cell bytes. A note-off (97) has no note byte: it becomes the DMA-off command. */
export function encodeSPCell(cell: { note?: number; instrument?: number; effTyp?: number; eff?: number }): Uint8Array {
  const note = cell.note ?? 0;
  let command = spEffectToCommand(cell.effTyp ?? 0, cell.eff ?? 0);
  if (note === 97 && command === 0) command = 0x43;
  return new Uint8Array([spGridToNote(note), (cell.instrument ?? 0) & 0xFF, command]);
}
