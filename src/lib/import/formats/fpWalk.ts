/**
 * fpWalk.ts - the Future Player replayer's own walk of a module, row by row.
 *
 * A Future Player voice is a byte stream in a shared call graph (subroutines, repeats, jumps):
 * every `speed` ticks each voice whose duration has run out reads commands until it reaches a note
 * or a rest. This is the reader of futureplayer-wasm/src/FuturePlayer.c (read_sequence and the
 * cmd_* handlers, transpiled from Paul van der Valk's 68k player) plus the part of update_audio
 * that decides which table period a note plays (sample base note + note + both transposes +
 * the arpeggio step), because the grid names a note by the period the voice plays, not by the
 * note byte. src/engine/__tests__/futurePlayerGridMatchesPlayer.test.ts holds this walk to the
 * original 68k player in UADE (Paula writes), voice by voice.
 *
 * Timing: the player's first call is tick 1; tick_counter starts at 1, so every voice reads on
 * tick 1 and then every `speed` ticks. A note's duration byte counts reads (rows), so every event
 * lands on tick 1 + row * speed. A voice that ends (command 0 with an empty call stack) stops for
 * good. The walk ends where the joint state of the four voices repeats (the song loops through a
 * jump) or when every voice has ended, or at the row cap.
 *
 * ZERO imports on purpose beyond the module's own reader: the grid builder and the tests share it.
 */

/** Period table of the replayer (lbW0036C4): 8 octaves x 12 notes and one more entry (97). Indexes past it read the player's own data, not periods. */
export const FP_PERIODS: readonly number[] = [
  0x1C40, 0x1AC0, 0x1940, 0x17D0, 0x1680, 0x1530, 0x1400, 0x12E0, 0x11D0, 0x10D0, 0x0FE0, 0x0F00,
  0x0E20, 0x0D60, 0x0CA0, 0x0BE8, 0x0B40, 0x0A98, 0x0A00, 0x0970, 0x08E8, 0x0868, 0x07F0, 0x0780,
  0x0710, 0x06B0, 0x0650, 0x05F4, 0x05A0, 0x054C, 0x0500, 0x04B8, 0x0474, 0x0434, 0x03F8, 0x03C0,
  0x0388, 0x0358, 0x0328, 0x02FA, 0x02D0, 0x02A6, 0x0280, 0x025C, 0x023A, 0x021A, 0x01FC, 0x01E0,
  0x01C4, 0x01AC, 0x0194, 0x017D, 0x0168, 0x0153, 0x0140, 0x012E, 0x011D, 0x010D, 0x00FE, 0x00F0,
  0x00E2, 0x00D6, 0x00CA, 0x00BE, 0x00B4, 0x00AA, 0x00A0, 0x0097, 0x008F, 0x0087, 0x007F, 0x0078,
  0x0071, 0x006B, 0x0065, 0x005F, 0x005A, 0x0055, 0x0050, 0x004C, 0x0048, 0x0044, 0x0040, 0x003C,
  0x0039, 0x0035, 0x0032, 0x002F, 0x002D, 0x002A, 0x0028, 0x0026, 0x0024, 0x0022, 0x0020, 0x001E,
  0x001C,
];

export const FP_WALK = {
  /** A note that restarts the sample (a = note byte, b = instrument pointer, period = table period it plays). */
  note: 0,
  /** A note with the duration's top bit set: the pitch changes, the sample is not restarted. */
  legato: 1,
  /** A rest: the envelope releases. */
  rest: 2,
  /** Command 1: set instrument (a = instrument pointer). */
  instrument: 3,
  /** Command 2: set arpeggio table (a = table pointer). */
  arpTable: 4,
  /** Command 3: reset the arpeggio to the default. */
  arpReset: 5,
  /** Command 4: portamento rate (a = rate word). */
  portamento: 6,
  /** Command 11: transpose 1 (a = byte). */
  transpose1: 7,
  /** Command 12: transpose 2 (a = byte). */
  transpose2: 8,
  /** Command 0 / 13 with an empty call stack: the voice ends. */
  end: 9,
  /** A command number the player has no routine for (a = command number). */
  unknown: 10,
} as const;

export interface FpWalkEvent {
  /** Player interrupt (1-based). */
  tick: number;
  voice: number;
  kind: number;
  a: number;
  /** Instrument pointer in force at a note. */
  b: number;
  /** Table period at the note's first tick (notes and legato notes), else 0. */
  period: number;
  /** Code offset of the command's first byte. */
  off: number;
  /** Notes, legato notes and rests: the duration byte as stored (top bit: no retrigger), else 0. */
  dur: number;
  /** Notes and legato notes: what the player adds to the note byte for the period table (see fpNoteDelta). */
  delta: number;
  /** Notes, legato notes and rests: the transposes, arpeggio table pointer and portamento rate in force. */
  t1: number;
  t2: number;
  arp: number;
  porta: number;
}

export interface FpInstrumentRef {
  /** Code offset of the instrument struct (the pointer the set-instrument command carries). */
  ptr: number;
}

export interface FpWalk {
  voices: number;
  /** Ticks per row. */
  speed: number;
  /** Rows walked (the grid has this many rows). */
  rows: number;
  /** Ticks walked (rows * speed). */
  ticks: number;
  events: FpWalkEvent[];
  /** Row the song returns to when the joint state repeats; -1: no repeat found (every voice ended, or the cap). */
  loopRow: number;
  /** Rows of the loop body (rows - loopRow) when loopRow >= 0. */
  loopRows: number;
  /** Player interrupts per second (the subsong's timer). */
  tickHz: number;
  /** Why the walk stopped. */
  stop: 'loop' | 'ended' | 'cap';
  /** Voices whose stream never starts (no sequence pointer). */
  silentVoices: number[];
}

export interface FpSong {
  songDataPtr: number;
  speed: number;
  voiceSeqPtrs: number[];
  /** Read passes the player runs silently before the first tick (the low word of the subsong entry's second long). */
  intro: number;
  /** Song data +0x19: the CIA timer value is this byte << 8 (the player's dtg_Timer), so a tick lasts that many 709379 Hz cycles. */
  timerByte: number;
}

/** PAL CIA clock, Hz (the player's tick = timer value cycles of it). */
export const FP_CIA_HZ = 709379;

/** Player interrupts per second of a subsong: 709379 / (timer byte << 8); 50 when the module sets no timer. */
export function fpTickHz(timerByte: number): number {
  return timerByte > 0 ? FP_CIA_HZ / (timerByte << 8) : 50;
}

function u32(code: Uint8Array, p: number): number {
  return p >= 0 && p + 3 < code.length ? ((code[p] << 24) | (code[p + 1] << 16) | (code[p + 2] << 8) | code[p + 3]) >>> 0 : 0;
}
function u16(code: Uint8Array, p: number): number {
  return p >= 0 && p + 1 < code.length ? (code[p] << 8) | code[p + 1] : 0;
}
function u8(code: Uint8Array, p: number): number {
  return p >= 0 && p < code.length ? code[p] : 0;
}
function s8(code: Uint8Array, p: number): number {
  const v = u8(code, p);
  return v < 128 ? v : v - 256;
}

/** The hunk code section of a Future Player file (the replayer's own offsets are relative to it). */
export function fpCodeSection(buf: Uint8Array): Uint8Array {
  if (buf.length < 20 || u32(buf, 0) !== 0x000003F3) return buf;
  const numHunks = u32(buf, 8);
  const offset = 20 + numHunks * 4;
  if (offset + 8 <= buf.length && u32(buf, offset) === 0x000003E9) {
    const codeSize = u32(buf, offset + 4) * 4;
    return buf.subarray(offset + 8, offset + 8 + codeSize);
  }
  return buf;
}

/** The subsong table (offset 32, 8 bytes an entry) as the replayer reads it. */
export function fpSongs(code: Uint8Array): FpSong[] {
  const songs: FpSong[] = [];
  for (let scan = 32; scan + 8 <= code.length; scan += 8) {
    const songDataPtr = u32(code, scan);
    if (songDataPtr === 0) break;
    const voiceSeqPtrs: number[] = [];
    for (let i = 0; i < 4; i++) {
      const blockPtr = u32(code, songDataPtr + 8 + i * 4);
      voiceSeqPtrs.push(blockPtr !== 0 && blockPtr + 8 < code.length ? u32(code, blockPtr + 8) : 0);
    }
    let speed = u8(code, songDataPtr + 0x18) & 7;
    if (speed === 0) speed = 8;
    songs.push({ songDataPtr, speed, voiceSeqPtrs, timerByte: u8(code, songDataPtr + 0x19), intro: u16(code, scan + 6) });
  }
  return songs;
}

export interface FpVoiceState {
  ended: boolean;
  /** The stream position the reader holds while it runs (commands move it; a note or rest stores it). */
  seq: number;
  /** The stored stream position (+$A6 of the player's voice record): after the last note or rest read. */
  seqSaved: number;
  /** The note byte of the last read (+$A4); 0 after a rest. */
  trig: number;
  /** Call stack depth in bytes (0..0x1C, 4 an entry), as the player keeps it. */
  depth: number;
  stack: number[];
  loopAddr: number[];
  loopCount: number[];
  instr: number;
  arp: number;
  arpIdx: number;
  porta: number;
  t1: number;
  t2: number;
  curNote: number;
  timer: number;
  /** Whether the voice's note was started and not released or ended. */
  sounding: boolean;
}

function newVoice(seq: number): FpVoiceState {
  return {
    ended: seq === 0, seq, seqSaved: seq, trig: 0, depth: 0, stack: new Array<number>(9).fill(0), loopAddr: new Array<number>(9).fill(0),
    loopCount: new Array<number>(9).fill(0), instr: 0, arp: 0, arpIdx: 0, porta: 0, t1: 0, t2: 0, curNote: 0, timer: 1, sounding: false,
  };
}

/**
 * Sample base note of an instrument: the byte at +0x11 of the sample struct the voice plays
 * (update_audio: sample_info +8 = wavetable flag; +10 = sample struct, or the wave list whose first
 * frame is the struct).
 */
export function fpBaseNote(code: Uint8Array, instr: number): number {
  if (instr === 0 || instr >= code.length) return 0;
  const sampInfo = u32(code, instr + 8);
  let struct: number;
  if (u8(code, sampInfo + 8) !== 0) {
    const list = u32(code, sampInfo + 10) + 8;
    struct = u32(code, list);
  } else struct = u32(code, sampInfo + 10);
  return u8(code, struct + 0x11);
}

/** The instrument's release rate (detail struct +0x18): how fast the envelope falls once a rest releases the note; 0 holds the level. */
export function fpReleaseRate(code: Uint8Array, instr: number): number {
  if (instr === 0 || instr >= code.length) return 0;
  return u8(code, u32(code, instr + 12) + 0x18);
}

/** Whether an instrument plays a wavetable (animated frames) rather than one sample. */
export function fpIsWavetable(code: Uint8Array, instr: number): boolean {
  if (instr === 0 || instr >= code.length) return false;
  return u8(code, u32(code, instr + 8) + 8) !== 0;
}

/**
 * What the player adds to a note byte before it indexes the period table: the sample's base note, both
 * transposes and the arpeggio's current step (a byte sum: the table index is (note + delta) & 0x7f,
 * ASL.B #1 on the byte offset).
 */
export function fpNoteDelta(code: Uint8Array, v: Pick<FpVoiceState, 'instr' | 't1' | 't2' | 'arp' | 'porta'>, arpIdx: number): number {
  let arpVal = 0;
  if (v.porta === 0 && v.arp !== 0 && v.arp < code.length) {
    arpVal = s8(code, v.arp + 8 + arpIdx);
    if ((arpVal & 0xff) === 0x80) arpVal = s8(code, v.arp + 8);
  }
  return (fpBaseNote(code, v.instr) + v.t1 + v.t2 + arpVal) & 0xff;
}

/** The table period the player gives a voice at its current state (before portamento, modulation and detune); 0 beyond the table. */
function tablePeriod(code: Uint8Array, v: FpVoiceState, arpIdx: number): number {
  const idx = (v.curNote + fpNoteDelta(code, v, arpIdx)) & 0x7f;
  return idx < FP_PERIODS.length ? FP_PERIODS[idx] : 0;
}

/** Most rows a grid holds (512 patterns of 64): hybris.fp's whole loop is 29857. */
export const FP_MAX_ROWS = 32768;

export interface FpWalkOptions {
  /** Most rows to walk (default FP_MAX_ROWS). */
  maxRows?: number;
  /**
   * Called after each row's reads with the voices' state and, per voice, the table period the player writes on each tick
   * of the row (empty where the model does not apply: portamento, a wavetable instrument, a voice that has ended).
   */
  onRow?: (row: number, voices: ReadonlyArray<Readonly<FpVoiceState>>, tickPeriods: number[][]) => void;
}

/** Joint state of the four voices at a row boundary. */
function stateKey(vs: FpVoiceState[]): string {
  return vs.map((v) => v.ended ? 'E' : [v.seq, v.depth, v.timer, v.instr, v.arp, v.porta, v.t1, v.t2, v.curNote, v.stack.slice(0, (v.depth >> 2) + 1).join('.'), v.loopAddr.join('.'), v.loopCount.join('.')].join(',')).join('|');
}

/**
 * Walk subsong `subsong` of the module's code section. Null when the module has no such subsong.
 *
 * Before the first tick the player runs the subsong's intro count of read passes with its skip flag
 * set (lbC003468): every voice advances that many rows without sounding, and command 13 (the
 * skip-flag check) does nothing. Row 0 of the walk is the first read after it.
 */
export function walkFuturePlayer(code: Uint8Array, subsong = 0, opts: FpWalkOptions = {}): FpWalk | null {
  const songs = fpSongs(code);
  const song = songs[subsong];
  if (!song) return null;
  const maxRows = opts.maxRows ?? FP_MAX_ROWS;
  const speed = song.speed;
  const vs = song.voiceSeqPtrs.map(newVoice);
  const events: FpWalkEvent[] = [];
  const seen = new Map<string, number>();
  let loopRow = -1;
  let stop: FpWalk['stop'] = 'cap';
  let rows = 0;
  let skipping = false;

  /** One pass of read_sequence over the four voices (the player calls it every `speed` ticks). */
  const readPass = (tick0: number): void => {
    for (let ch = 0; ch < 4; ch++) {
      const v = vs[ch];
      if (v.ended) continue;
      v.timer = (v.timer - 1) & 0xff;
      if (v.timer !== 0) continue;
      let overflow = 0;
      for (;;) {
        const off = v.seq;
        const d0 = u8(code, v.seq++);
        if (d0 & 0x80) {
          overflow = (overflow - 1) & 0xff;
          if (overflow === 0) break; // the player's command-overflow guard: leave the row (it resumes after the wait)
          const arg = u8(code, v.seq++);
          const cmd = d0 & 0x3f;
          const ev = (kind: number, a: number): void => {
            if (!skipping) events.push({ tick: tick0, voice: ch, kind, a, b: v.instr, period: 0, off, dur: 0, delta: 0, t1: v.t1, t2: v.t2, arp: v.arp, porta: v.porta });
          };
          let ended = false;
          const endVoice = (): void => { v.ended = true; v.sounding = false; ev(FP_WALK.end, 0); ended = true; };
          switch (cmd) {
            // end of a block: return to the caller, or end the voice when there is none
            case 0: if (v.depth !== 0) { v.depth -= 4; v.seq = v.stack[v.depth >> 2]; } else endVoice(); break;
            // the skip-flag check: ends the voice outright (whatever the call depth), except during the intro skip
            case 13: if (!skipping) endVoice(); break;
            case 1: { v.instr = u32(code, v.seq); v.seq += 4; ev(FP_WALK.instrument, v.instr); break; }
            case 2: { v.arp = u32(code, v.seq); v.seq += 4; ev(FP_WALK.arpTable, v.arp); break; }
            case 3: { v.arp = 0; v.arpIdx = 0; ev(FP_WALK.arpReset, 0); break; }
            case 4: { v.porta = u16(code, v.seq); v.seq += 2; ev(FP_WALK.portamento, v.porta); break; }
            case 5: break;
            case 6: {
              v.stack[v.depth >> 2] = v.seq + 4;
              if (v.depth < 0x1c) v.depth += 4;
              v.loopCount[v.depth >> 2] = 1;
              v.seq = u32(code, u32(code, v.seq) + 8);
              break;
            }
            case 7: { v.seq = u32(code, u32(code, v.seq) + 8); break; }
            case 8: { v.loopAddr[v.depth >> 2] = v.seq; v.loopCount[v.depth >> 2] = arg; break; }
            case 9: {
              const i = v.depth >> 2;
              v.loopCount[i] = (v.loopCount[i] - 1) & 0xff;
              if (v.loopCount[i] !== 0) v.seq = v.loopAddr[i];
              break;
            }
            case 10: { v.seq = v.loopAddr[v.depth >> 2]; break; }
            case 11: { v.t1 = arg; ev(FP_WALK.transpose1, arg); break; }
            case 12: { v.t2 = arg; ev(FP_WALK.transpose2, arg); break; }
            case 14: break;
            default: ev(FP_WALK.unknown, cmd); break;
          }
          if (ended) break;
          continue;
        }
        // a note or a rest, then its duration byte
        const d1 = u8(code, v.seq++);
        v.seqSaved = v.seq;
        v.trig = d0;
        if (d0 !== 0) v.curNote = d0;
        const retrigger = (d1 & 0x80) === 0;
        v.timer = d1 & 0x80 ? d1 & 0x7f : d1;
        if (d0 === 0) {
          if (!skipping) events.push({ tick: tick0, voice: ch, kind: FP_WALK.rest, a: 0, b: v.instr, period: 0, off, dur: d1, delta: 0, t1: v.t1, t2: v.t2, arp: v.arp, porta: v.porta });
          v.sounding = false;
        } else {
          if (retrigger) v.arpIdx = 0;
          if (!skipping) {
            events.push({
              tick: tick0, voice: ch, kind: retrigger ? FP_WALK.note : FP_WALK.legato, a: d0, b: v.instr,
              period: tablePeriod(code, v, v.arpIdx), off, dur: d1, delta: fpNoteDelta(code, v, v.arpIdx), t1: v.t1, t2: v.t2, arp: v.arp, porta: v.porta,
            });
          }
          v.sounding = true;
        }
        break;
      }
    }
  };

  skipping = true;
  for (let i = 0; i < song.intro; i++) readPass(0);
  skipping = false;
  for (const v of vs) v.sounding = false;

  for (let row = 0; row < maxRows; row++) {
    if (vs.every((v) => v.ended)) { stop = 'ended'; break; }
    const key = stateKey(vs);
    const was = seen.get(key);
    if (was !== undefined) { loopRow = was; stop = 'loop'; break; }
    seen.set(key, row);
    rows = row + 1;
    readPass(1 + row * speed);
    // update_audio, once per tick of the row: the period of the tick, then the arpeggio step (it moves only without portamento)
    const tickPeriods: number[][] = vs.map(() => []);
    for (let i = 0; i < speed; i++) {
      for (let ch = 0; ch < 4; ch++) {
        const v = vs[ch];
        if (v.ended) continue;
        if (opts.onRow && v.porta === 0 && !fpIsWavetable(code, v.instr)) tickPeriods[ch].push(tablePeriod(code, v, v.arpIdx));
        if (v.porta !== 0 || v.arp === 0 || v.arp >= code.length) continue;
        const val = s8(code, v.arp + 8 + v.arpIdx);
        if ((val & 0xff) === 0x80) v.arpIdx = 0xffff;
        v.arpIdx = (v.arpIdx + 1) & 0xffff;
      }
    }
    opts.onRow?.(row, vs, tickPeriods);
  }

  const silentVoices = song.voiceSeqPtrs.map((p, i) => (p === 0 ? i : -1)).filter((i) => i >= 0);
  return {
    voices: 4, speed, tickHz: fpTickHz(song.timerByte), rows, ticks: rows * speed, events, loopRow, loopRows: loopRow >= 0 ? rows - loopRow : 0, stop, silentVoices,
  };
}
