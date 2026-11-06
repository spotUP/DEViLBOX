/**
 * Riff Raff (.riff) - the time-aligned, read-only grid (phase A) and its byte-exact stream carriers.
 *
 * Decoder truth: third-party/nuade/players/riffraff/rr_module.c (versions, slots, command table, readers) and
 * riffraff.c (rr_next_event, rr_next_track_entry, rr_run_voices). The module is an Amiga executable (one code hunk,
 * HUNK_RELOC32) that carries its own replayer. The replayer is recognised by an FNV-1a hash of its code from the init
 * entry with the relocated longs zeroed (four builds: Protector, Side Winder II, T'Bird, Bomb Fusion); every table
 * address is the relocated long at a fixed slot of that code. Offsets below are code hunk image offsets; the file
 * offset of a byte is the image offset + 0x20 (hunk header).
 *
 * Song (subsong 0): each voice plays the start pattern once, then its track list. A track list entry is a pattern
 * number plus a repeat byte (the pattern plays repeat + 1 times); 0xFE xx sets the transposition (Looping / Clamped
 * drivers); 0xFF ends the list and restarts it (the One Shot driver ends on any byte with bit 7). A pattern byte below
 * 0x80 is a note (period table index = byte + transposition) followed by a rate index; the rate table word is the
 * duration in replayer ticks (the wait counter is decremented once per tick and the next event is read at 0). Bytes
 * from 0x80 index the driver's command jump table; Rest and Rest Silence also take a rate index and consume time,
 * every other command takes no time. 0xFF ends a pattern.
 *
 * Time: one replayer tick is 20 ms (50 Hz, assumed: the module's timer is not read). One grid row is the greatest
 * common divisor of all event durations, so initialSpeed is that many ticks at BPM 125. The grid runs to the first
 * moment every voice has restarted its track list; a voice that restarts earlier loops until then.
 *
 * Three layers (docs/FORMAT_COMMAND_STREAM_GRID.md): the pattern and track list bytes are the truth; `blockRows` holds
 * one carrier cell per byte (cutoff 2, period = the byte) for every distinct pattern and the four track lists, so the
 * encoder rebuilds them; the grid shows the decoded notes.
 *
 * Not decoded: the Portamento command (argument size unknown, refused), subsongs after the first. Volume, volume slide,
 * master fade and pitch slide commands show in the effect columns of the next event's row (V S R F G P Q O).
 */
import type { Pattern, TrackerCell, ChannelData } from '@/types';
import { periodToNote } from '@/lib/amiga/periodNotes';
import { RR_FX } from './commandStreamEffectGlyphs';
import { addCellEffect, effectColumnsMeta } from './cellEffectSlots';

const VOICES = 4;
const HUNK_BYTES = 0x20;
const HEADER_BYTES = 0x44;
const FIRST_WORD = 0x70ff4e75;
const MAGIC_RIFF = 0x52494646;
const MAGIC_RAFF = 0x52414646;
const COMMAND_BASE = 0x80;
const PATTERN_END = 0xff;
const TRANSPOSE = 0xfe;
const NOTE_OFF = 97;
const ROWS_PER_PATTERN = 64;
const MAX_TICKS = 400000;
const MAX_STEPS = 1 << 16;
const VOICE_INSTRUMENT_OFFSET = 0x30;
const VOICE_TRANSPOSE_OFFSET = 0x34;
const FNV_OFFSET = 0xcbf29ce484222325n;
const FNV_PRIME = 0x100000001b3n;
const U64 = 0xffffffffffffffffn;

type Driver = 'looping' | 'clamped' | 'oneShot';
type MaskSource = 'file' | 'init' | 'subsongs';
type Command = 'setSample' | 'volumeSlide' | 'masterFade' | 'setVolume' | 'modulation' | 'loop' | 'rest' | 'restSilence' | 'pitchSlide' | 'pitchSlideOff' | 'portamento';
type Role = 'voices' | 'tracks' | 'startPattern' | 'mask' | 'periods' | 'rates' | 'patterns' | 'samplePtrs' | 'sampleLens' | 'trackStart0' | 'trackStart1' | 'trackStart2' | 'trackStart3';

interface Version {
  name: string;
  driver: Driver;
  maskSource: MaskSource;
  recordBytes: number;
  codeLen: number;
  secondPass: number;
  tick: number;
  codeHash: bigint;
  slots: Array<[Role, number]>;
}

const VERSIONS: Version[] = [
  {
    name: 'Protector', driver: 'looping', maskSource: 'file', recordBytes: 0x36, codeLen: 0x6b0, secondPass: 0x1c0, tick: 0x16c,
    codeHash: 0x0e53a4ed6bc12b6cn,
    slots: [['voices', 0x2], ['tracks', 0xf6], ['startPattern', 0x108], ['mask', 0x16e], ['periods', 0x2e2], ['rates', 0x2f6], ['samplePtrs', 0x3d6], ['sampleLens', 0x3dc], ['patterns', 0x48a]],
  },
  {
    name: 'Side Winder II', driver: 'looping', maskSource: 'init', recordBytes: 0x36, codeLen: 0x6e0, secondPass: 0x1d4, tick: 0x17e,
    codeHash: 0x66f709495bd0c119n,
    slots: [['voices', 0x4], ['mask', 0x10], ['tracks', 0x100], ['startPattern', 0x112], ['periods', 0x300], ['rates', 0x314], ['samplePtrs', 0x3fa], ['sampleLens', 0x400], ['patterns', 0x4b4]],
  },
  {
    name: "T'Bird", driver: 'clamped', maskSource: 'subsongs', recordBytes: 0x36, codeLen: 0x676, secondPass: 0x1e8, tick: 0x198,
    codeHash: 0xd14055040303e01cn,
    slots: [['voices', 0x2], ['tracks', 0x10a], ['startPattern', 0x11e], ['mask', 0x19a], ['periods', 0x31e], ['rates', 0x332], ['samplePtrs', 0x412], ['sampleLens', 0x418], ['patterns', 0x4c6]],
  },
  {
    name: 'Bomb Fusion', driver: 'oneShot', maskSource: 'file', recordBytes: 0x3c, codeLen: 0x768, secondPass: 0x1a8, tick: 0,
    codeHash: 0x774ec91dbb396a36n,
    slots: [['voices', 0x12], ['trackStart0', 0x118], ['startPattern', 0x12c], ['trackStart1', 0x13c], ['trackStart2', 0x160], ['trackStart3', 0x184], ['mask', 0x1c4], ['periods', 0x326], ['rates', 0x33a], ['samplePtrs', 0x43a], ['sampleLens', 0x440], ['patterns', 0x53e]],
  },
];

// The jump tables (the byte minus 0x80 indexes them).
const LOOPING_COMMANDS: Command[] = ['setSample', 'volumeSlide', 'masterFade', 'setVolume', 'modulation', 'modulation', 'rest', 'restSilence', 'pitchSlide', 'pitchSlideOff', 'portamento'];
const ONE_SHOT_COMMANDS: Command[] = ['setSample', 'loop', 'loop', 'volumeSlide', 'masterFade', 'setVolume', 'modulation', 'modulation', 'rest', 'restSilence', 'pitchSlide', 'pitchSlideOff', 'portamento'];

function argBytes(command: Command): number {
  switch (command) {
    case 'volumeSlide': case 'masterFade': case 'pitchSlide': return 2;
    case 'setSample': case 'setVolume': case 'rest': case 'restSilence': case 'portamento': return 1;
    default: return 0;
  }
}

const emptyCell = (): TrackerCell => ({ note: 0, instrument: 0, volume: 0, effTyp: 0, eff: 0, effTyp2: 0, eff2: 0 });
const gcd = (a: number, b: number): number => (b === 0 ? a : gcd(b, a % b));

interface Image {
  /** the code hunk (file bytes from 0x20) */
  b: Uint8Array;
  /** 1 where a relocated long starts (all four bytes are marked) */
  reloc: Uint8Array;
}

const u8 = (m: Image, o: number): number => (o >= 0 && o < m.b.length ? m.b[o] : 0);
const u16 = (m: Image, o: number): number => (u8(m, o) << 8) | u8(m, o + 1);
const u32 = (m: Image, o: number): number => ((u16(m, o) * 65536) + u16(m, o + 2)) >>> 0;

/** The executable's single code hunk and its relocation table; a string is the reason it is not a Riff Raff module. */
function loadImage(file: Uint8Array): Image | string {
  const be = (o: number): number => (((file[o] << 24) | (file[o + 1] << 16) | (file[o + 2] << 8) | file[o + 3]) >>> 0);
  if (file.length < HUNK_BYTES + 8 || be(0) !== 0x3f3 || be(8) !== 1 || be(24) !== 0x3e9) return 'not a one-hunk executable';
  const longs = be(28);
  const size = longs * 4;
  if (size < HEADER_BYTES || HUNK_BYTES + size + 8 > file.length) return 'the code hunk is outside the file';
  const b = file.subarray(HUNK_BYTES, HUNK_BYTES + size);
  const reloc = new Uint8Array(size);
  let pos = HUNK_BYTES + size;
  if (be(pos) !== 0x3ec) return 'the relocation table is missing';
  pos += 4;
  for (;;) {
    if (pos + 4 > file.length) return 'the relocation table is cut off';
    const count = be(pos);
    pos += 4;
    if (count === 0) break;
    pos += 4; // hunk number
    for (let i = 0; i < count; i++, pos += 4) {
      const at = be(pos);
      if (pos + 4 > file.length || at > size - 4) return 'a relocation is outside the hunk';
      for (let k = 0; k < 4; k++) reloc[at + k] = 1 + k;
    }
  }
  return { b, reloc };
}

interface Tables {
  version: Version;
  image: Image;
  base: Partial<Record<Role, number>>;
}

/** rr_find_version + rr_bind_roles (the addresses; the role hash is a refusal check the grid does not repeat). */
function locate(file: Uint8Array): Tables | string {
  const image = loadImage(file);
  if (typeof image === 'string') return image;
  if (u32(image, 0) !== FIRST_WORD || u32(image, 4) !== MAGIC_RIFF || u32(image, 8) !== MAGIC_RAFF) return 'the Riff Raff header words are missing';
  const secondPass = u32(image, 12);
  const init = u32(image, 16);
  const tick = u32(image, 24);
  for (const version of VERSIONS) {
    if (init < HEADER_BYTES || init + version.codeLen + 16 > image.b.length) continue;
    if (secondPass !== init + version.secondPass || tick !== (version.tick !== 0 ? init + version.tick : 0)) continue;
    let hash = FNV_OFFSET;
    for (let i = 0; i < version.codeLen; i++) {
      const byte = image.reloc[init + i] !== 0 ? 0 : image.b[init + i];
      hash = ((hash ^ BigInt(byte)) * FNV_PRIME) & U64;
    }
    if (hash !== version.codeHash) continue;
    const base: Partial<Record<Role, number>> = {};
    for (const [role, at] of version.slots) {
      if (image.reloc[init + at] !== 1) return 'a table slot of the replayer is not a relocated long';
      base[role] = u32(image, init + at);
    }
    return { version, image, base };
  }
  return 'the replayer code is none of the four known versions';
}

export interface RiffRaffStream {
  /** file offset */
  offset: number;
  size: number;
  kind: 'pattern' | 'trackList';
  /** pattern number, or the voice for a track list */
  id: number;
}

export interface RiffRaffGrid {
  version: string;
  patterns: Pattern[];
  songPositions: number[];
  rows: number;
  /** replayer ticks per grid row */
  ticksPerRow: number;
  streams: RiffRaffStream[];
  blockRows: TrackerCell[][];
  /** streamAtStart[pattern][channel] = the pattern stream playing in the pattern's first row, -1 for none */
  streamAtStart: number[][];
  /** notes shown per voice over the whole grid */
  notesPerVoice: number[];
  /** sample table: image offset and byte length of every instrument (instrument id = index + 1) */
  samples: Array<{ offset: number; bytes: number }>;
  enabled: boolean[];
  /** the file bytes (hunk header included) are addressed as image + HUNK_BYTES */
  fileOffsetBase: number;
  /** sources[voice][row over the whole grid], null where no note event starts (phase B: where an edit is written) */
  sources: Array<Array<RiffRaffRowSource | null>>;
  /** effectSources[voice][row]: the byte behind each effect-column command of the row, in effect slot order (phase B) */
  effectSources: Array<Array<StreamEffectSource[]>>;
  /** The tracker note a pattern note byte plays under a transposition (the grid's own period lookup). */
  noteForByte: (byte: number, transpose: number) => number;
}

/** Where a note event's bytes live in the file, and the transposition its period lookup used. */
export interface RiffRaffRowSource {
  /** file offset of the note byte (its rate byte follows) */
  noteAt: number;
  /** file offset of the argument byte of the Set Sample command that chose the instrument, -1 when it is the voice's start state */
  instrumentAt: number;
  transpose: number;
}

/** Where one effect-column command of a row lives: its effTyp and the file offset of the argument byte holding its value (-1: no byte). */
export interface StreamEffectSource { typ: number; at: number }

interface VoiceEvent { tick: number; kind: 'note' | 'rest' | 'silence'; note: number; instrument: number; stream: number; wait: number; noteAt: number; instrumentAt: number; transpose: number; fx: Array<[number, number, number]> }

class Walker {
  readonly commands: Command[];
  readonly oneShot: boolean;
  readonly patternStreams = new Map<number, number>(); // pattern image offset -> streams index
  reason: string | null = null;
  readonly t: Tables;
  readonly streams: RiffRaffStream[];
  constructor(t: Tables, streams: RiffRaffStream[]) {
    this.t = t;
    this.streams = streams;
    this.oneShot = t.version.driver === 'oneShot';
    this.commands = this.oneShot ? ONE_SHOT_COMMANDS : LOOPING_COMMANDS;
  }

  patternAddress(n: number): number {
    const at = (this.t.base.patterns ?? 0) + 4 * n;
    if (at + 4 > this.t.image.b.length || this.t.image.reloc[at] !== 1) { this.reason ??= `pattern ${n} has no relocated address`; return -1; }
    const a = u32(this.t.image, at);
    return a < this.t.image.b.length ? a : -1;
  }

  trackEnds(byte: number): boolean { return this.oneShot ? byte >= COMMAND_BASE : byte === PATTERN_END; }

  /** Registers the byte stream of the pattern at `address` (to its end byte) once; returns its streams index. */
  stream(address: number, id: number): number {
    const known = this.patternStreams.get(address);
    if (known !== undefined) return known;
    const m = this.t.image;
    let at = address;
    for (let steps = 0; steps < MAX_STEPS && at < m.b.length; steps++) {
      const byte = u8(m, at++);
      if (byte === PATTERN_END) break;
      if (byte < COMMAND_BASE) { at++; continue; }
      const command = this.commands[byte - COMMAND_BASE];
      if (command === undefined) { this.reason ??= `pattern ${id} holds the unknown command ${byte.toString(16)}`; break; }
      if (command === 'portamento') { this.reason ??= 'the Portamento command (argument size unknown) is not decoded'; break; }
      at += argBytes(command);
    }
    const index = this.streams.length;
    this.streams.push({ offset: address + HUNK_BYTES, size: at - address, kind: 'pattern', id });
    this.patternStreams.set(address, index);
    return index;
  }
}

/** One voice's events from tick 0 up to `until` (its first track list restart is returned as `wrapTick`). */
function runVoice(w: Walker, voice: number, trackList: number, startTranspose: number, startInstrument: number, until: number): { events: VoiceEvent[]; wrapTick: number } {
  const m = w.t.image;
  const startPattern = w.t.base.startPattern ?? 0;
  const events: VoiceEvent[] = [];
  let wrapTick = -1;
  let trackPos = trackList;
  let patternStart = startPattern;
  let patternPos = startPattern;
  let repeat = 0;
  let transpose = startTranspose;
  let instrument = startInstrument;
  let instrumentAt = -1;
  let currentStream = w.stream(startPattern, -1);
  let pending: Array<[number, number, number]> = [];
  let tick = 0;
  let steps = 0;
  const periods = w.t.base.periods ?? 0;
  const rates = w.t.base.rates ?? 0;
  while (tick < until && !w.reason) {
    // rr_next_event: read until a note or a rest
    let produced = false;
    while (!produced) {
      if (steps++ > MAX_STEPS) { w.reason ??= 'a voice never reaches a note or a rest'; return { events, wrapTick }; }
      const byte = u8(m, patternPos++);
      if (byte === PATTERN_END) {
        repeat -= 1;
        if (repeat < 0) {
          // rr_next_track_entry
          for (;;) {
            if (steps++ > MAX_STEPS) { w.reason ??= 'a track list never names a pattern'; return { events, wrapTick }; }
            const entry = u8(m, trackPos++);
            if (w.trackEnds(entry)) { trackPos = trackList; if (wrapTick < 0) wrapTick = tick; continue; }
            if (!w.oneShot && entry === TRANSPOSE) { transpose = u8(m, trackPos++); continue; }
            const address = w.patternAddress(entry);
            if (address < 0) { w.reason ??= `track list of voice ${voice} names a pattern outside the module`; return { events, wrapTick }; }
            patternStart = address;
            patternPos = address;
            repeat = u8(m, trackPos++);
            currentStream = w.stream(address, entry);
            break;
          }
        } else {
          patternPos = patternStart;
        }
        continue;
      }
      if (byte >= COMMAND_BASE) {
        const command = w.commands[byte - COMMAND_BASE];
        if (command === undefined || command === 'portamento') { w.reason ??= 'a pattern holds a command the grid does not decode'; return { events, wrapTick }; }
        const arg = [0, 0];
        const argAt = patternPos;
        for (let i = 0; i < argBytes(command); i++) arg[i] = u8(m, patternPos++);
        // state commands show on the next note or rest row (the voice's state when that event plays)
        // each entry: effTyp, value, file offset of the argument byte that holds it (-1: the command has none)
        const fileAt = (i: number): number => argAt + i + HUNK_BYTES;
        if (command === 'setVolume') pending.push([RR_FX.setVolume, arg[0], fileAt(0)]);
        else if (command === 'volumeSlide') pending.push([RR_FX.volumeSlide, arg[0], fileAt(0)], [RR_FX.volumeSlideRate, arg[1], fileAt(1)]);
        else if (command === 'masterFade') pending.push([RR_FX.masterFade, arg[0], fileAt(0)], [RR_FX.masterFadeRate, arg[1], fileAt(1)]);
        else if (command === 'pitchSlide') pending.push([RR_FX.pitchSlide, arg[0], fileAt(0)], [RR_FX.pitchSlideLow, arg[1], fileAt(1)]);
        else if (command === 'pitchSlideOff') pending.push([RR_FX.pitchSlideOff, 0, -1]);
        if (command === 'setSample') { instrument = arg[0]; instrumentAt = argAt + HUNK_BYTES; }
        if (command === 'rest' || command === 'restSilence') {
          const wait = u16(m, rates + 2 * arg[0]);
          if (wait === 0) { w.reason ??= 'a rest uses a rate of 0'; return { events, wrapTick }; }
          events.push({ tick, kind: command === 'rest' ? 'rest' : 'silence', note: 0, instrument, stream: currentStream, wait, noteAt: -1, instrumentAt: -1, transpose, fx: pending });
          pending = [];
          tick += wait;
          produced = true;
        }
        continue;
      }
      const noteAt = patternPos - 1 + HUNK_BYTES;
      const rateIndex = u8(m, patternPos++);
      const wait = u16(m, rates + 2 * rateIndex);
      if (wait === 0) { w.reason ??= 'a note uses a rate of 0'; return { events, wrapTick }; }
      const period = u16(m, periods + 2 * ((byte + transpose) & 0xffff));
      events.push({ tick, kind: 'note', note: periodToNote(period), instrument, stream: currentStream, wait, noteAt, instrumentAt, transpose, fx: pending });
      pending = [];
      tick += wait;
      produced = true;
    }
  }
  return { events, wrapTick };
}

export function buildRiffRaffGrid(file: Uint8Array): RiffRaffGrid | string {
  const t = locate(file);
  if (typeof t === 'string') return t;
  const { version, image: m, base } = t;
  const tracks: number[] = [];
  const voicesBase = base.voices ?? 0;
  if (version.driver === 'oneShot') {
    for (let v = 0; v < VOICES; v++) tracks.push(base[`trackStart${v}` as Role] ?? 0);
  } else {
    const table = base.tracks ?? 0;
    for (let v = 0; v < VOICES; v++) {
      if (m.reloc[table + 4 * v] !== 1) return 'a track list pointer is not relocated';
      tracks.push(u32(m, table + 4 * v));
    }
  }
  if (tracks.some((a) => a >= m.b.length)) return 'a track list lies outside the module';
  let mask = 0xf;
  if (version.maskSource === 'file') mask = u16(m, base.mask ?? 0);
  else if (version.maskSource === 'subsongs') mask = u16(m, (base.tracks ?? 0) + 16);
  const enabled = Array.from({ length: VOICES }, (_, v) => ((mask >> v) & 1) !== 0);
  if (!enabled.some(Boolean)) return 'no voice is enabled';

  const streams: RiffRaffStream[] = [];
  const w = new Walker(t, streams);
  // pass 1: the first track list restart of each voice (until MAX_TICKS)
  const start = (v: number): { transpose: number; instrument: number } => version.driver === 'oneShot'
    ? { transpose: 0, instrument: 0 }
    : { transpose: u16(m, voicesBase + v * version.recordBytes + VOICE_TRANSPOSE_OFFSET), instrument: u16(m, voicesBase + v * version.recordBytes + VOICE_INSTRUMENT_OFFSET) };
  let songEnd = 0;
  for (let v = 0; v < VOICES; v++) {
    if (!enabled[v]) continue;
    const s = start(v);
    const first = runVoice(w, v, tracks[v], s.transpose, s.instrument, MAX_TICKS);
    if (w.reason) return w.reason;
    if (first.wrapTick < 0) return 'a voice never restarts its track list within the tick limit';
    songEnd = Math.max(songEnd, first.wrapTick);
  }
  if (songEnd <= 0) return 'the song has no length';
  // pass 2: every voice up to the song end (a voice that restarted earlier loops)
  const voiceEvents: VoiceEvent[][] = [];
  for (let v = 0; v < VOICES; v++) {
    if (!enabled[v]) { voiceEvents.push([]); continue; }
    const s = start(v);
    voiceEvents.push(runVoice(w, v, tracks[v], s.transpose, s.instrument, songEnd).events.filter((e) => e.tick < songEnd));
  }
  if (w.reason) return w.reason;

  let step = songEnd;
  for (const events of voiceEvents) for (const e of events) step = gcd(step, e.tick === 0 ? songEnd : e.tick);
  const rows = Math.ceil(songEnd / step);
  const patternCount = Math.ceil(rows / ROWS_PER_PATTERN);

  // track list carriers: from the list start to its end byte (inclusive)
  for (let v = 0; v < VOICES; v++) {
    let at = tracks[v];
    while (at < m.b.length) {
      const byte = u8(m, at);
      if (w.trackEnds(byte)) { at++; break; }
      at += !w.oneShot && byte === TRANSPOSE ? 2 : 2;
    }
    streams.push({ offset: tracks[v] + HUNK_BYTES, size: at - tracks[v], kind: 'trackList', id: v });
  }

  const notesPerVoice = new Array<number>(VOICES).fill(0);
  const sources: Array<Array<RiffRaffRowSource | null>> = Array.from({ length: VOICES }, () => new Array<RiffRaffRowSource | null>(patternCount * ROWS_PER_PATTERN).fill(null));
  const effectSources: StreamEffectSource[][][] = Array.from({ length: VOICES }, () => Array.from({ length: patternCount * ROWS_PER_PATTERN }, () => []));
  const columns: TrackerCell[][] = Array.from({ length: VOICES }, () => Array.from({ length: patternCount * ROWS_PER_PATTERN }, emptyCell));
  const firstStream: number[][] = Array.from({ length: patternCount }, () => new Array<number>(VOICES).fill(-1));
  for (let v = 0; v < VOICES; v++) {
    for (const e of voiceEvents[v]) {
      const row = e.tick / step;
      const cell = columns[v][row];
      for (const [typ, val, at] of e.fx) if (addCellEffect(cell, typ, val)) effectSources[v][row].push({ typ, at });
      if (e.kind === 'note') { cell.note = e.note; cell.instrument = e.instrument + 1; notesPerVoice[v]++; sources[v][row] = { noteAt: e.noteAt, instrumentAt: e.instrumentAt, transpose: e.transpose }; }
      else if (e.kind === 'silence') cell.note = NOTE_OFF;
      const p = Math.floor(row / ROWS_PER_PATTERN);
      if (row % ROWS_PER_PATTERN === 0 && e.stream >= 0) firstStream[p][v] = e.stream;
    }
  }
  const blockRows = streams.map((s) => {
    const out: TrackerCell[] = [];
    for (let o = s.offset; o < s.offset + s.size; o++) out.push({ ...emptyCell(), cutoff: 2, period: file[o] ?? 0 });
    return out;
  });
  const patterns: Pattern[] = Array.from({ length: patternCount }, (_, p) => {
    const length = Math.min(ROWS_PER_PATTERN, rows - p * ROWS_PER_PATTERN);
    const channels: ChannelData[] = columns.map((col, ch) => ({
      id: `channel-${ch}`, name: `Channel ${ch + 1}`, muted: !enabled[ch], solo: false, collapsed: false,
      volume: 100, pan: ch === 0 || ch === 3 ? -50 : 50, instrumentId: null, color: null,
      rows: col.slice(p * ROWS_PER_PATTERN, p * ROWS_PER_PATTERN + length),
      ...effectColumnsMeta(col.slice(p * ROWS_PER_PATTERN, p * ROWS_PER_PATTERN + length)),
    }));
    return { id: `pattern-${p}`, name: `Pattern ${p}`, length, channels };
  });

  // the sample table (pointer table, then the length table): n entries, n = (lens - ptrs) / 4
  const ptrs = base.samplePtrs ?? 0;
  const lens = base.sampleLens ?? 0;
  const samples: Array<{ offset: number; bytes: number }> = [];
  if (lens > ptrs && (lens - ptrs) % 4 === 0) {
    const n = Math.min((lens - ptrs) / 4, 256);
    for (let i = 0; i < n; i++) {
      const bytes = u16(m, lens + 2 * i) * 2;
      const offset = m.reloc[ptrs + 4 * i] === 1 ? u32(m, ptrs + 4 * i) & ~1 : -1;
      samples.push(offset >= 0 && bytes > 0 && offset + bytes <= m.b.length ? { offset, bytes } : { offset: -1, bytes: 0 });
    }
  }
  return {
    version: version.name, patterns, songPositions: patterns.map((_, i) => i), rows, ticksPerRow: step, streams, blockRows,
    streamAtStart: firstStream, notesPerVoice, samples, enabled, fileOffsetBase: HUNK_BYTES, sources, effectSources,
    noteForByte: (byte, transpose) => periodToNote(u16(m, (base.periods ?? 0) + 2 * ((byte + transpose) & 0xffff))),
  };
}
