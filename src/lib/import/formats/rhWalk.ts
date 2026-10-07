/**
 * rhWalk.ts - the Rob Hubbard player's own walk of a module, command by command.
 *
 * Rob Hubbard modules are 68k player code plus data; UADE plays them with the original code.
 * There is no C replayer for them in the repo (robhubbard-wasm is the sample synth), so the
 * walk is a port of the player's per-interrupt routine (Neoart FlodJS RHPlayer.js, itself a port
 * of Wanted Team's Rob Hubbard_v7 player): the same loader scan for the module's tables, the
 * same command reader per voice per interrupt. The test
 * src/engine/__tests__/robHubbardGridIsPlayersWalk.test.ts holds this walk, tick for tick and
 * period for period, to the original player running in UADE (Paula), so the port is the oracle
 * only where UADE agrees.
 *
 * What the grid needs from it (RobHubbardParser.ts): per voice and interrupt, the commands the
 * reader ran with the file offset and block each came from, and the period a note plays with
 * (the period table entry scaled by the sample's `relative`, which is why a note's name is not
 * its table index).
 *
 * Interrupts count from 1: the player's first call is tick 1 (every voice starts with tick
 * counter 1, so the first command of every voice runs on it). A note lasts `speed * duration`
 * interrupts, so every event lands on tick 1 + k * speed.
 */

/** Reader over the module; reads past the end give 0, like the player reading its own code. */
class Cursor {
  pos = 0;
  readonly buf: Uint8Array;
  constructor(buf: Uint8Array) { this.buf = buf; }
  u8(): number { return this.buf[this.pos++] ?? 0; }
  s8(): number { const v = this.u8(); return v < 128 ? v : v - 256; }
  u16(): number { const v = ((this.buf[this.pos] ?? 0) << 8) | (this.buf[this.pos + 1] ?? 0); this.pos += 2; return v; }
  u32(): number { const v = this.u16() * 65536 + this.u16(); return v; }
  s32(): number { const v = this.u32(); return v >= 0x80000000 ? v - 0x100000000 : v; }
}

export interface RhSampleInfo {
  /** 3579545 / the sample's frequency word (waves: the header's own value): period = table[note] * relative >> 10. */
  relative: number;
  length: number;
  /** A wave (synthesised) sample rather than a PCM one. */
  wave: boolean;
}

export interface RhSongHeader {
  /** Interrupts per duration unit. */
  speed: number;
  /** File offset of each voice's track list (u32 block addresses, 0 ends the list). */
  tracks: number[];
}

export interface RhModule {
  songs: RhSongHeader[];
  samples: RhSampleInfo[];
  /** File offset of the period table (u16 entries). */
  periods: number;
  /**
   * Which command set the module's player has: 0/1 base, 2 song end, 3 volume is -121, 4 volume is -122
   * with the sustain flag. Decides which of -121..-123 take an argument byte.
   */
  variant: number;
  /** File offsets of the sample header table and of the wave header table (0: none). */
  samplesHeaders: number;
  wavesHeaders: number;
}

/** The player's loader scan, ported from RHPlayer.js loader(): the tables of the module. Null when it does not find them. */
export function loadRhModule(buf: Uint8Array): RhModule | null {
  const s = new Cursor(buf);
  let samplesData = 0, samplesHeaders = 0, samplesLen = 0, songsHeaders = 0, periods = 0;
  let wavesPointers = 0, wavesHeaders = 0;
  s.pos = 44;
  while (s.pos < 1024 && s.pos < buf.length) {
    let value = s.u16();
    if (value === 0x7e10 || value === 0x7e20) {            // moveq #16,d7 / moveq #32,d7
      value = s.u16();
      if (value === 0x41fa) {                               // lea $x,a0
        const i = s.pos + s.u16();
        value = s.u16();
        if (value === 0xd1fc) {                             // adda.l
          samplesData = i + s.u32();
          s.pos += 2;
        } else {
          samplesData = i;
        }
        samplesHeaders = s.pos + s.u16();
        value = s.u8();
        if (value === 0x72) samplesLen = s.u8();            // moveq #x,d1
      }
    } else if (value === 0x51c9) {                          // dbf d1,x
      s.pos += 2;
      value = s.u16();
      if (value === 0x45fa) {                               // lea $x,a2
        wavesPointers = s.pos + s.u16();
        s.pos += 2;
        for (let guard = 0; guard < 512 && s.pos < buf.length; guard++) {
          value = s.u16();
          if (value === 0x4bfa) { wavesHeaders = s.pos + s.u16(); break; } // lea $x,a5
        }
      }
    } else if (value === 0xc0fc) {                          // mulu.w #x,d0
      s.pos += 2;
      value = s.u16();
      if (value === 0x41eb) songsHeaders = s.u16();         // lea $x(a3),a0
    } else if (value === 0x346d) {                          // movea.w x(a5),a2
      s.pos += 2;
      value = s.u16();
      if (value === 0x49fa) s.pos += 2;                     // lea $x,a4 (the vibrato table; the walk does not read it)
    } else if (value === 0x4240) {                          // clr.w d0
      value = s.u16();
      if (value === 0x45fa) { periods = s.pos + s.u16(); break; } // lea $x,a2
    }
  }
  if (!samplesHeaders || !samplesData || !samplesLen || !songsHeaders || !periods) return null;

  const samples: RhSampleInfo[] = [];
  s.pos = samplesData;
  samplesLen++;
  for (let i = 0; i < samplesLen; i++) {
    const length = s.u32();
    const freq = s.u16();
    samples.push({ relative: freq ? Math.trunc(3579545 / freq) : 0, length, wave: false });
    s.pos += length;
    if (s.pos > buf.length) return null;
  }

  let variant = 0;
  if (wavesHeaders) {
    variant = 1;
    let i = (wavesHeaders - samplesHeaders) >> 5;
    const len = i + 3;
    for (let j = samplesLen; j < i; j++) samples[j] = { relative: 0, length: 0, wave: true };
    s.pos = wavesHeaders;
    for (; i < len; i++) {
      s.pos += 4;
      s.s32();
      const length = s.u16();
      s.pos += 2;
      // FlodJS reads the word before this one as the relative; UADE's Paula for skateordie shows the
      // scale is this one (0x01ac = 428: period 285 for table entry 683 at 11522 chunks)
      const relative = s.u16();
      s.pos += 2 * 5;
      samples[i] = { relative, length, wave: true };
    }
    void wavesPointers;
  }

  const songs: RhSongHeader[] = [];
  s.pos = songsHeaders;
  let lowest = 65536;
  for (let guard = 0; guard < 64 && s.pos + 18 <= buf.length; guard++) {
    s.pos++;
    const speed = s.u8();
    const tracks: number[] = [];
    for (let i = 0; i < 4; i++) {
      const j = s.u32();
      if (j < lowest) lowest = j;
      tracks.push(j);
    }
    songs.push({ speed, tracks });
    if (lowest - s.pos < 18) break;
  }
  if (songs.length === 0) return null;

  s.pos = 0x160;
  while (s.pos < 0x200) {
    const value = s.u16();
    if (value === 0xb03c) {                                 // cmp.b #x,d0
      const v = s.u16();
      if (v === 0x0085) variant = 2;                        // -123
      else if (v === 0x0086) variant = 4;                   // -122
      else if (v === 0x0087) variant = 3;                   // -121
    }
  }
  return { songs, samples, periods, variant, samplesHeaders, wavesHeaders };
}

/** Bytes a stream command occupies; the argument of -121 / -122 is read only by the command set that has it. */
export function rhCommandLength(opcode: number, variant: number): number {
  if (opcode >= 0) return 2;                                // duration, note
  switch (opcode) {
    case -128: case -127: case -126: return 2;              // sample, portamento speed, rest duration
    case -122: return variant === 4 ? 2 : 1;
    case -121: return variant === 3 ? 2 : 1;
    default: return 1;                                      // -125 sustain, -124 block end, -123 song end, unknown
  }
}

export const RH_WALK = {
  note: 1, rest: 2, sample: 3, portamento: 4, sustain: 5, volume: 6, songEnd: 7, blockEnd: 8, unknown: 9,
} as const;

export interface RhWalkEvent {
  /** Interrupt the command ran on, from 1. */
  tick: number;
  voice: number;
  kind: number;
  /** File offset of the command's opcode byte. */
  off: number;
  /** File address of the block the command is in. */
  block: number;
  /** The sample index in force when the command ran (-1: none chosen yet, the player then uses sample 0). */
  sample: number;
  /** note: sample index it plays with (-1 none yet); rest: duration; sample: index; portamento: speed; volume: value; blockEnd: 1 when the track list restarted; songEnd: 1 when it restarts the song. */
  a: number;
  /** note: the table index byte; unknown: the byte. */
  b: number;
  /** note: duration in units (ticks = speed * dur). */
  dur: number;
  /** note: the Paula period it starts at, before vibrato. */
  period: number;
}

export interface RhWalk {
  speed: number;
  voices: number;
  /** Interrupts of one pass of the longest voice's track list (the grid's length; shorter voices are walked looping). */
  ticks: number;
  /** Per voice: interrupts of its own first pass of the track list (0 when it never ends one). */
  passTicks: number[];
  events: RhWalkEvent[];
  /** The module's tables the walk read. */
  module: RhModule;
}

export interface RhWalkOptions {
  /** Song header to walk (default 0). */
  song?: number;
  /** Hard cap on interrupts (default 96 * 64 units). */
  maxTicks?: number;
}

/** Run the player's reader over the module for one pass of every voice (the longest sets the length; shorter ones loop). */
export function walkRobHubbard(buf: Uint8Array, opts: RhWalkOptions = {}): RhWalk | null {
  const mod = loadRhModule(buf);
  if (!mod) return null;
  const song = mod.songs[opts.song ?? 0];
  if (!song || !song.speed) return null;
  const speed = song.speed;
  const maxTicks = opts.maxTicks ?? 96 * 64 * speed;
  const c = new Cursor(buf);

  interface Voice {
    trackPtr: number; trackPos: number; patternPos: number; tick: number;
    sample: number; block: number; passEnd: number; dead: boolean;
  }
  const voices: Voice[] = song.tracks.map((trackPtr) => {
    c.pos = trackPtr;
    const first = c.u32();
    return { trackPtr, trackPos: 4, patternPos: first, tick: 1, sample: -1, block: first, passEnd: 0, dead: !trackPtr || first >= buf.length };
  });

  const events: RhWalkEvent[] = [];
  const emit = (tick: number, v: number, kind: number, off: number, block: number, a: number, b: number, dur = 0, period = 0): void => {
    events.push({ tick, voice: v, kind, off, block, sample: voices[v].sample, a, b, dur, period });
  };

  let longest = 0;
  let restartAt = 0;
  for (let t = 1; t <= maxTicks; t++) {
    for (let v = 0; v < voices.length; v++) {
      const vo = voices[v];
      if (vo.dead) continue;
      if (--vo.tick !== 0) continue;
      c.pos = vo.patternPos;
      for (let guard = 0, loop = true; loop; guard++) {
        if (guard > 4096 || c.pos >= buf.length) { vo.dead = true; break; }
        const off = c.pos;
        const value = c.s8();
        if (value < 0) {
          switch (value) {
            case -121:
              if (mod.variant === 3) emit(t, v, RH_WALK.volume, off, vo.block, c.u8(), 0);
              else emit(t, v, RH_WALK.unknown, off, vo.block, 0, value & 0xff);
              break;
            case -122:
              if (mod.variant === 4) emit(t, v, RH_WALK.volume, off, vo.block, c.u8(), 0);
              else emit(t, v, RH_WALK.unknown, off, vo.block, 0, value & 0xff);
              break;
            case -123:
              // the command sets of variant 2+ end the song here: the player's song-end flag makes it start again
              // from interrupt 1 (UADE's Paula shows every voice's opening notes again on this interrupt)
              emit(t, v, RH_WALK.songEnd, off, vo.block, mod.variant > 1 ? 1 : 0, 0);
              if (mod.variant > 1 && !restartAt) restartAt = t - 1;
              break;
            case -124: {
              c.pos = vo.trackPtr + vo.trackPos;
              let next = c.u32();
              vo.trackPos += 4;
              let wrapped = 0;
              if (!next) {
                c.pos = vo.trackPtr;
                next = c.u32();
                vo.trackPos = 4;
                wrapped = 1;
                if (!vo.passEnd) vo.passEnd = t - 1;
              }
              emit(t, v, RH_WALK.blockEnd, off, vo.block, wrapped, 0);
              vo.block = next;
              c.pos = next;
              break;
            }
            case -125: emit(t, v, RH_WALK.sustain, off, vo.block, 0, 0); break;
            case -126: {
              const d = c.s8();
              vo.tick = speed * d;
              vo.patternPos = c.pos;
              emit(t, v, RH_WALK.rest, off, vo.block, d, 0, d);
              loop = false;
              break;
            }
            case -127: emit(t, v, RH_WALK.portamento, off, vo.block, c.s8(), 0); break;
            case -128: {
              let idx = c.s8();
              if (idx < 0) idx = 0;
              vo.sample = idx;
              emit(t, v, RH_WALK.sample, off, vo.block, idx, 0);
              break;
            }
            default: emit(t, v, RH_WALK.unknown, off, vo.block, 0, value & 0xff);
          }
        } else {
          vo.tick = speed * value;
          const note = c.s8();
          vo.patternPos = c.pos;
          const smp = mod.samples[vo.sample < 0 ? 0 : vo.sample];
          const entry = (buf[mod.periods + note * 2] ?? 0) * 256 + (buf[mod.periods + note * 2 + 1] ?? 0);
          const period = (entry * (smp?.relative ?? 0)) >> 10;
          emit(t, v, RH_WALK.note, off, vo.block, vo.sample, note, value, period);
          loop = false;
        }
        if (vo.tick === 0 && !loop) vo.dead = true; // a zero duration never counts down: the voice stalls
      }
    }
    if (restartAt) { longest = restartAt; voices.forEach((vo) => { vo.passEnd = restartAt; }); break; }
    // the walk is long enough once every voice has ended one pass and the longest pass is behind us
    if (t === 1) continue;
    if (voices.every((vo) => vo.dead || vo.passEnd > 0)) {
      longest = Math.max(0, ...voices.map((vo) => vo.passEnd));
      if (t > longest) break;
    }
  }
  const ticks = longest || Math.min(maxTicks, events.reduce((m, e) => Math.max(m, e.tick), 0));
  return { speed, voices: voices.length, ticks, passTicks: voices.map((vo) => vo.passEnd), events: events.filter((e) => e.tick <= ticks), module: mod };
}
