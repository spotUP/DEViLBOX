/**
 * tonyWilliamsWalk.ts - the Tony Williams (Sound Images) song structure and a tick walk of it.
 *
 * Layout (read from the player, future basketball main.tw): a song record is 5 words at
 * base + song*10 (four voice-list offsets relative to base, then the tempo word). A voice list is
 * big-endian words: word 0 is the first block, each later word the next block (offsets relative
 * to base), a 0 word ends the list and the word after it is the loop target (relative to base).
 * A block is a command stream ending in 0x80. Note bytes (< 0x80) play for the sticky duration
 * (0xE0..0xFF = 1..32 ticks); 0x85/0x86 rest for the duration. See thoughts/spot/2026-11-04_tw-editability.md.
 *
 * Dialect 2 ("Sound Images Generation 2 sound drivers (c) 1993", warinthegulf): one song, a table of three voice-list
 * words relative to the table, lists of block words relative to the table, other opcodes. Disassembly in
 * thoughts/spot/2026-11-24-tw-gen2.md.
 */
export const TW_VOICES = 4;
export const TW_MAX_TICKS = 65536;

export type TwDialect = 1 | 2;

/** Operand bytes after a command byte at file offset `at`, read from the player's handlers. */
export function twOperandLen(b: number, dialect: TwDialect = 1, at = 0): number {
  if (b < 0x80) return 0;
  if (dialect === 2) {
    if (b >= 0xb0 && b <= 0xbf) return 3;
    switch (b) {
      case 0x81: return 2;
      case 0x85: case 0x89: return 1;
      case 0x86: return 3;
      // the handler aligns the operand pointer to even, then reads a word
      case 0x8b: return ((at + 1) & 1) + 2;
      default: return 0;
    }
  }
  if (b >= 0xc0 && b <= 0xcf) return 3;
  switch (b) {
    case 0x82: case 0x84: return 2;
    case 0x87: return 1;
    case 0x88: case 0x8b: case 0x8c: return 3;
    case 0x89: return 5;
    default: return 0;
  }
}

/** A command that ends a block (end of pattern, loop jump, song end, stop). */
export function twEndsBlock(b: number, dialect: TwDialect = 1): boolean {
  if (dialect === 2) return b === 0x80 || b === 0x81 || b === 0x82 || b === 0x8b;
  return b === 0x80 || b === 0x82 || b === 0x83 || b === 0x94;
}

export interface TwCommand { offset: number; length: number; op: number; args: number[] }

export interface TwEvent {
  tick: number;
  channel: number;
  /** file offset of the block the command is in */
  block: number;
  cmd: TwCommand;
  /** tracker-relative pitch index of a note (byte + transpose), else -1 */
  pitch: number;
  /** transpose in force for a note */
  transpose: number;
}

export interface TwSongInfo {
  base: number;
  songs: number;
  lists: number[];
  instrumentTable: number;
  /** frames per stream step: high byte of the song record's 5th word (init 0x934 -> a5@(18); the 50 Hz IRQ steps the voices when a5@(19) counts down to 0) */
  speed: number;
  dialect: TwDialect;
  /** voices the driver steps */
  voices: number;
  bpm: number;
}

export interface TwWalk {
  channels: number;
  ticks: number;
  events: TwEvent[];
  info: TwSongInfo;
  /** every block start (file offset) any voice plays, in first-seen order */
  blocks: number[];
  /** per voice: block offsets in list order */
  voiceBlocks: number[][];
}

const u16 = (b: Uint8Array, o: number): number => ((b[o] ?? 0) << 8) | (b[o + 1] ?? 0);

/** Scan the init routine: `muluw #10,d0` then `lea pc@(base,d0.w),aN`; and `muluw #12,d0` + lea for the instrument table. */
function scanLea(b: Uint8Array, mul: number): number {
  for (let i = 0; i + 8 < Math.min(b.length, 0x4000); i += 2) {
    if (u16(b, i) !== 0xc0fc || u16(b, i + 2) !== mul) continue;
    for (let j = i + 4; j <= i + 8; j += 2) {
      if ((u16(b, j) & 0xf1ff) === 0x41fb) {
        const ext = u16(b, j + 2);
        const disp = (ext & 0xff) >= 0x80 ? (ext & 0xff) - 256 : ext & 0xff;
        const target = j + 2 + disp;
        if (target > 0 && target < b.length) return target;
      }
    }
  }
  return -1;
}

const GEN2_ID = 'Sound Images Generation 2';

/** Generation 2: the song-start code `move.w (a1)+,d0; beq; lea pc@(table),a2` names the voice-list table. */
function twGen2Info(b: Uint8Array, song: number): TwSongInfo | null {
  if (song !== 0 || !new TextDecoder('latin1').decode(b.subarray(0, 0x100)).includes(GEN2_ID)) return null;
  for (let i = 0; i + 8 < Math.min(b.length, 0x4000); i += 2) {
    if (u16(b, i) !== 0x3019 || b[i + 2] !== 0x67 || u16(b, i + 4) !== 0x45fb) continue;
    const ext = u16(b, i + 6);
    const base = i + 6 + ((ext & 0xff) >= 0x80 ? (ext & 0xff) - 256 : ext & 0xff);
    const lists: number[] = [];
    for (let v = 0; v < 3; v++) {
      const off = base + u16(b, base + v * 2);
      if (off + 2 > b.length) return null;
      lists.push(off);
    }
    // the tick adds 137 to an accumulator and steps the voices each time it passes 250: speed 2 at BPM 137
    return { base, songs: 1, lists, instrumentTable: -1, speed: 2, dialect: 2, voices: 3, bpm: 137 };
  }
  return null;
}

export function twSongInfo(b: Uint8Array, song: number): TwSongInfo | null {
  if (b.length < 0x400) return null;
  if (u16(b, 0) !== 0x6000) return twGen2Info(b, song);
  const base = scanLea(b, 10);
  if (base < 0) return null;
  const first = u16(b, base);
  const songs = Math.floor(first / 10);
  if (songs < 1 || songs > 32 || song >= songs) return null;
  const lists: number[] = [];
  for (let v = 0; v < TW_VOICES; v++) {
    const rel = u16(b, base + song * 10 + v * 2);
    // sound-effect build (blinkys): an unused voice has a 0 list offset; -1 marks it empty
    if (rel === 0 && v > 0) { lists.push(-1); continue; }
    const off = base + rel;
    if (off + 4 > b.length) return null;
    lists.push(off);
  }
  const speed = b[base + song * 10 + 8] ?? 0;
  return { base, songs, lists, instrumentTable: scanLea(b, 12), speed: speed > 0 ? speed : 1, dialect: 1, voices: TW_VOICES, bpm: 125 };
}

export function readTwBlock(b: Uint8Array, start: number, dialect: TwDialect = 1): TwCommand[] | null {
  const cmds: TwCommand[] = [];
  let p = start;
  for (let guard = 0; guard < 8192 && p < b.length; guard++) {
    const op = b[p] ?? 0;
    const n = twOperandLen(op, dialect, p);
    if (p + 1 + n > b.length) return null;
    const args: number[] = [];
    for (let k = 0; k < n; k++) args.push(b[p + 1 + k] ?? 0);
    cmds.push({ offset: p, length: 1 + n, op, args });
    p += 1 + n;
    if (twEndsBlock(op, dialect)) return cmds;
  }
  return null;
}

/** Walk one song's four voices through their lists once, on the 50 Hz tick timeline. */
export function walkTonyWilliams(input: ArrayBuffer | Uint8Array, song = 0): TwWalk | null {
  const b = input instanceof Uint8Array ? input : new Uint8Array(input);
  const info = twSongInfo(b, song);
  if (!info) return null;
  if (info.dialect === 2) return walkGen2(b, info);
  const events: TwEvent[] = [];
  const blocks: number[] = [];
  const voiceBlocks: number[][] = [];
  let ticks = 0;
  for (let ch = 0; ch < TW_VOICES; ch++) {
    const entries: number[] = [];
    const listAt = info.lists[ch] ?? -1;
    for (let p = listAt, n = 0; listAt >= 0 && p + 2 <= b.length && n < 4096; p += 2, n++) {
      const w = u16(b, p);
      if (w === 0 && n > 0) break;
      entries.push(info.base + w);
      // sound-effect build: a block ending in song end / stop is the last one; the words after it are not a list
      const last = readTwBlock(b, info.base + w);
      const end = last?.[last.length - 1]?.op;
      if (end === 0x83 || end === 0x94) break;
    }
    voiceBlocks.push(entries);
    let tick = 0;
    let dur = 1;
    let transpose = 0;
    for (const start of entries) {
      if (!blocks.includes(start)) blocks.push(start);
      const cmds = readTwBlock(b, start);
      if (!cmds) return null;
      for (const cmd of cmds) {
        const op = cmd.op;
        let pitch = -1;
        if (op < 0x80) pitch = (op + transpose) & 0x3f;
        events.push({ tick, channel: ch, block: start, cmd, pitch, transpose });
        if (op >= 0xe0) dur = op - 0xdf;
        else if (op === 0x87) transpose = (cmd.args[0] ?? 0) << 24 >> 24;
        else if (op < 0x80 || op === 0x85 || op === 0x86) tick += dur;
        if (tick > TW_MAX_TICKS) return null;
      }
    }
    ticks = Math.max(ticks, tick);
  }
  return { channels: TW_VOICES, ticks: Math.max(1, ticks), events, info, blocks, voiceBlocks };
}

/**
 * Generation 2 walk. Notes, 0x83 (hold) and 0x84 (rest) end a step and wait the sticky duration; 0x85 sets the
 * transpose; 0x89 n .. 0x8a plays its body n times. A voice ends at a block that ends in 0x8b (the driver's jump,
 * used here as an endless loop), 0x82 or 0x81, or at a 0 list word (the word after it is the loop target).
 */
function walkGen2(b: Uint8Array, info: TwSongInfo): TwWalk | null {
  const events: TwEvent[] = [];
  const blocks: number[] = [];
  const voiceBlocks: number[][] = [];
  let ticks = 0;
  for (let ch = 0; ch < info.voices; ch++) {
    const entries: number[] = [];
    const listAt = info.lists[ch] ?? -1;
    for (let p = listAt, n = 0; p + 2 <= b.length && n < 4096; p += 2, n++) {
      const w = u16(b, p);
      if (w === 0) break;
      entries.push(info.base + w);
      const last = readTwBlock(b, info.base + w, 2);
      if (!last) return null;
      if ((last[last.length - 1]?.op ?? 0x80) !== 0x80) break;
    }
    voiceBlocks.push(entries);
    let tick = 0;
    let dur = 1;
    let transpose = 0;
    for (const start of entries) {
      if (!blocks.includes(start)) blocks.push(start);
      const cmds = readTwBlock(b, start, 2);
      if (!cmds) return null;
      let loopAt = -1;
      let count = 0;
      for (let i = 0; i < cmds.length; i++) {
        const cmd = cmds[i]!;
        const op = cmd.op;
        events.push({ tick, channel: ch, block: start, cmd, pitch: op < 0x80 ? (op + transpose) & 0x3f : -1, transpose });
        if (op >= 0xe0) dur = op - 0xdf;
        else if (op === 0x85) transpose = (cmd.args[0] ?? 0) << 24 >> 24;
        else if (op < 0x80 || op === 0x83 || op === 0x84) tick += dur;
        else if (op === 0x89) { loopAt = i; count = cmd.args[0] ?? 0; }
        else if (op === 0x8a && loopAt >= 0 && --count > 0) i = loopAt;
        if (tick > TW_MAX_TICKS) return null;
      }
    }
    ticks = Math.max(ticks, tick);
  }
  return { channels: info.voices, ticks: Math.max(1, ticks), events, info, blocks, voiceBlocks };
}
