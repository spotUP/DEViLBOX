/**
 * tonyWilliamsWalk.ts - the Tony Williams (Sound Images) song structure and a tick walk of it.
 *
 * Layout (read from the player, future basketball main.tw): a song record is 5 words at
 * base + song*10 (four voice-list offsets relative to base, then the tempo word). A voice list is
 * big-endian words: word 0 is the first block, each later word the next block (offsets relative
 * to base), a 0 word ends the list and the word after it is the loop target (relative to base).
 * A block is a command stream ending in 0x80. Note bytes (< 0x80) play for the sticky duration
 * (0xE0..0xFF = 1..32 ticks); 0x85/0x86 rest for the duration. See thoughts/spot/2026-11-04_tw-editability.md.
 */
export const TW_VOICES = 4;
export const TW_MAX_TICKS = 65536;

/** Operand bytes after a command byte, read from the player's handlers. */
export function twOperandLen(b: number): number {
  if (b < 0x80) return 0;
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
export function twEndsBlock(b: number): boolean {
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

export function twSongInfo(b: Uint8Array, song: number): TwSongInfo | null {
  if (b.length < 0x400 || u16(b, 0) !== 0x6000) return null;
  const base = scanLea(b, 10);
  if (base < 0) return null;
  const first = u16(b, base);
  const songs = Math.floor(first / 10);
  if (songs < 1 || songs > 32 || song >= songs) return null;
  const lists: number[] = [];
  for (let v = 0; v < TW_VOICES; v++) {
    const off = base + u16(b, base + song * 10 + v * 2);
    if (off + 4 > b.length) return null;
    lists.push(off);
  }
  const speed = b[base + song * 10 + 8] ?? 0;
  return { base, songs, lists, instrumentTable: scanLea(b, 12), speed: speed > 0 ? speed : 1 };
}

export function readTwBlock(b: Uint8Array, start: number): TwCommand[] | null {
  const cmds: TwCommand[] = [];
  let p = start;
  for (let guard = 0; guard < 8192 && p < b.length; guard++) {
    const op = b[p] ?? 0;
    const n = twOperandLen(op);
    if (p + 1 + n > b.length) return null;
    const args: number[] = [];
    for (let k = 0; k < n; k++) args.push(b[p + 1 + k] ?? 0);
    cmds.push({ offset: p, length: 1 + n, op, args });
    p += 1 + n;
    if (twEndsBlock(op)) return cmds;
  }
  return null;
}

/** Walk one song's four voices through their lists once, on the 50 Hz tick timeline. */
export function walkTonyWilliams(input: ArrayBuffer | Uint8Array, song = 0): TwWalk | null {
  const b = input instanceof Uint8Array ? input : new Uint8Array(input);
  const info = twSongInfo(b, song);
  if (!info) return null;
  const events: TwEvent[] = [];
  const blocks: number[] = [];
  const voiceBlocks: number[][] = [];
  let ticks = 0;
  for (let ch = 0; ch < TW_VOICES; ch++) {
    const entries: number[] = [];
    for (let p = info.lists[ch] ?? 0, n = 0; p + 2 <= b.length && n < 4096; p += 2, n++) {
      const w = u16(b, p);
      if (w === 0 && n > 0) break;
      entries.push(info.base + w);
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
