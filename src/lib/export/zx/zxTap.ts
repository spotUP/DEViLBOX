/**
 * ZX Spectrum 128 .tap: BASIC loader + player CODE + one CODE block per 16 KB data bank,
 * built around public/zx/player.bin (register-stream player, see player.asm).
 */
import { captureToFrames, encodeFrames, packSongs } from './zxAyStream';
import type { RegisterWrite } from '../VGMExporter';

export interface ZxPlayer {
  bytes: Uint8Array;
  loadAddress: number;
  entry: number;
  bankTableOffset: number;
  maxBanks: number;
  dataAddress: number;
  usableBanks: number[];
  /** Offsets of the 32 character title and author blocks (screen.inc) and their length. */
  titleOffset: number; authorOffset: number; textLength: number;
  /** Song table (bank index, address lo, hi per song), song count byte, table size, and the status line text. */
  songTableOffset: number; songCountOffset: number; maxSongs: number; statusTextOffset: number;
}

/** Upper case ASCII 0x20-0x5F only (the screen font has 64 tiles), truncated and space padded to `length`. */
export function screenText(text: string, length: number): Uint8Array {
  const out = new Uint8Array(length).fill(0x20);
  Array.from(text.toUpperCase().slice(0, length)).forEach((ch, i) => {
    const c = ch.charCodeAt(0);
    out[i] = c >= 0x20 && c <= 0x5F ? c : 0x20;
  });
  return out;
}

/** Writes the song title and author into the player's screen text blocks. */
export function patchScreenText(code: Uint8Array, p: Pick<ZxPlayer, 'titleOffset' | 'authorOffset' | 'textLength'>, title: string, author: string): void {
  code.set(screenText(title, p.textLength), p.titleOffset);
  code.set(screenText(author, p.textLength), p.authorOffset);
}

export function loadZxPlayerFrom(bin: Uint8Array, meta: Omit<ZxPlayer, 'bytes'>): ZxPlayer {
  return { ...meta, bytes: bin };
}

/** Fetch public/zx/player.bin + player.json (browser). */
export async function fetchZxPlayer(): Promise<ZxPlayer> {
  const base = import.meta.env.BASE_URL;
  const [bin, meta] = await Promise.all([
    fetch(`${base}zx/player.bin`).then((r) => r.arrayBuffer()),
    fetch(`${base}zx/player.json`).then((r) => r.json()),
  ]);
  return loadZxPlayerFrom(new Uint8Array(bin), meta);
}

const xor = (flag: number, data: Uint8Array) => data.reduce((c, b) => c ^ b, flag);

/** One tap block: length (flag + data + checksum), flag, data, xor checksum. */
export function tapBlock(flag: number, data: Uint8Array): Uint8Array {
  const out = new Uint8Array(data.length + 4);
  const n = data.length + 2;
  out[0] = n & 0xFF; out[1] = n >> 8; out[2] = flag;
  out.set(data, 3);
  out[out.length - 1] = xor(flag, data);
  return out;
}

export function header(type: number, name: string, length: number, p1: number, p2: number): Uint8Array {
  const h = new Uint8Array(17);
  h[0] = type;
  for (let i = 0; i < 10; i++) h[1 + i] = name.charCodeAt(i) || 0x20;
  h[11] = length & 0xFF; h[12] = length >> 8;
  h[13] = p1 & 0xFF; h[14] = p1 >> 8;
  h[15] = p2 & 0xFF; h[16] = p2 >> 8;
  return h;
}

export const codeBlocks = (name: string, address: number, data: Uint8Array) =>
  [tapBlock(0x00, header(3, name, data.length, address, 32768)), tapBlock(0xFF, data)];

type BasicItem = number | string; // number = token byte, string = literal text
const TOK = { CLEAR: 0xFD, POKE: 0xF4, OUT: 0xDF, LOAD: 0xEF, CODE: 0xAF, RANDOMIZE: 0xF9, USR: 0xC0 };

/** A number in a BASIC line: digits, then 0x0E and the 5-byte integer form. */
function num(n: number): number[] {
  return [...String(n).split('').map((c) => c.charCodeAt(0)), 0x0E, 0, 0, n & 0xFF, n >> 8, 0];
}

function basicLine(lineNo: number, items: BasicItem[]): number[] {
  const body = items.flatMap((i) => (typeof i === 'number' ? [i] : [...i].map((c) => c.charCodeAt(0))));
  const content = [...body, 0x0D];
  return [lineNo >> 8, lineNo & 0xFF, content.length & 0xFF, content.length >> 8, ...content];
}

/**
 * CLEAR 32767; LOAD ""CODE 32768; per bank POKE 23388,16+bank: OUT 32765,16+bank: LOAD ""CODE 49152; RANDOMIZE USR 32768.
 * Tape block order must match. The POKE keeps BANK_M (23388) in step: 128 BASIC (the Tape Loader) re-pages port 32765
 * from BANK_M around LOAD, so a bare OUT is undone and every bank lands in bank 0.
 */
export function basicLoader(banks: number[], p: Pick<ZxPlayer, 'loadAddress' | 'entry' | 'dataAddress'>): Uint8Array {
  const colon = ':';
  const load = (addr: number) => [TOK.LOAD, '""', TOK.CODE, ...num(addr)];
  const lines: number[] = [];
  const flat = (xs: Array<BasicItem | number[]>): BasicItem[] => xs.flatMap((x) => (Array.isArray(x) ? x : [x]));
  lines.push(...basicLine(10, flat([TOK.CLEAR, ...num(p.loadAddress - 1)])));
  lines.push(...basicLine(20, flat(load(p.loadAddress))));
  banks.forEach((b, i) => {
    lines.push(...basicLine(30 + i * 10, flat([TOK.POKE, ...num(23388), ',', ...num(16 + b), colon, TOK.OUT, ...num(32765), ',', ...num(16 + b), colon, ...load(p.dataAddress)])));
  });
  lines.push(...basicLine(30 + banks.length * 10, flat([TOK.RANDOMIZE, TOK.USR, ...num(p.entry)])));
  return Uint8Array.from(lines);
}

export interface ZxTapResult { tap: Uint8Array; frames: number; banks: number; dataBytes: number; seconds: number; songs: number }

/** One song or several (subsongs, played with O and P on the Spectrum); each is one recorded playthrough. */
export function buildZxTap(writes: readonly RegisterWrite[] | ReadonlyArray<readonly RegisterWrite[]>, sampleRate: number, player: ZxPlayer, title = 'devilbox', author = ''): ZxTapResult {
  const songs = (writes.length > 0 && Array.isArray(writes[0]) ? writes : [writes]) as ReadonlyArray<readonly RegisterWrite[]>;
  if (songs.length > player.maxSongs || songs.length > 99) throw new Error(`The ZX Spectrum player holds at most ${Math.min(player.maxSongs, 99)} songs; this export has ${songs.length}.`);
  const songFrames = songs.map((w) => captureToFrames(w, sampleRate));
  if (songFrames.some((f) => f.length === 0)) throw new Error('No AY register writes were captured. Play a ZX Spectrum 128 (AY-3-8910) song through while recording.');
  const { banks, starts } = packSongs(songFrames.map(encodeFrames), player.usableBanks.length);
  const frames = songFrames.reduce((n, f) => n + f.length, 0);
  const code = Uint8Array.from(player.bytes);
  banks.forEach((_, i) => { code[player.bankTableOffset + i] = 0x10 | player.usableBanks[i]; });
  code[player.songCountOffset] = starts.length;
  starts.forEach((st, i) => {
    const addr = player.dataAddress + st.offset;
    code.set([st.bank, addr & 0xFF, addr >> 8], player.songTableOffset + i * 3);
  });
  code.set(screenText(String(starts.length).padStart(2, '0'), 2), player.statusTextOffset + 8); // "SONG 01/nn"
  patchScreenText(code, player, title, author);
  const name = title.replace(/[^\x20-\x7E]/g, '?').slice(0, 10);
  const loader = basicLoader(player.usableBanks.slice(0, banks.length), player);
  const parts = [
    tapBlock(0x00, header(0, name, loader.length, 10, loader.length)), tapBlock(0xFF, loader),
    ...codeBlocks('player', player.loadAddress, code),
    ...banks.flatMap((b, i) => codeBlocks(`bank${player.usableBanks[i]}`, player.dataAddress, b)),
  ];
  const tap = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
  let o = 0;
  for (const p of parts) { tap.set(p, o); o += p.length; }
  return { tap, frames, banks: banks.length, dataBytes: banks.reduce((n, b) => n + b.length, 0), seconds: frames / 50, songs: starts.length };
}

/** public/zx/beeper.bin + beeper.json (tools/build-zx-beeper.sh): 128K 6 voice beeper player. */
export interface ZxBeeperPlayer {
  bytes: Uint8Array; loadAddress: number; entry: number;
  /** Drum bits go at loadAddress + dataOffset, at most maxDrumBytes. */
  dataOffset: number; maxDrumBytes: number;
  /** Record stream: one 16K bank per usable bank, paged in at dataAddress. */
  dataAddress: number; bankSize: number; usableBanks: number[];
  iterT: number; drumByteT: number; clock: number;
  titleOffset: number; authorOffset: number; textLength: number;
}

/** Fetch public/zx/beeper.bin + beeper.json, or quadtone.bin + quadtone.json (same layout; browser). */
export async function fetchZxBeeperPlayer(name: 'beeper' | 'quadtone' = 'beeper'): Promise<ZxBeeperPlayer> {
  const base = import.meta.env.BASE_URL;
  const [bin, meta] = await Promise.all([
    fetch(`${base}zx/${name}.bin`).then((r) => r.arrayBuffer()),
    fetch(`${base}zx/${name}.json`).then((r) => r.json()),
  ]);
  return { ...meta, bytes: new Uint8Array(bin) };
}

/** 128K tap: BASIC loader, one CODE block of player + drum bits, then one CODE block per stream bank (player banktab order). */
export function buildZxBeeperTap(player: ZxBeeperPlayer, drums: Uint8Array, banks: readonly Uint8Array[], title = 'devilbox', author = ''): Uint8Array {
  if (drums.length > player.maxDrumBytes) throw new Error(`The drum samples need ${drums.length} bytes; the player has room for ${player.maxDrumBytes}.`);
  if (banks.length > player.usableBanks.length) throw new Error(`The song needs ${banks.length} banks; the player has ${player.usableBanks.length}.`);
  const code = new Uint8Array(player.dataOffset + drums.length);
  code.set(player.bytes.subarray(0, player.dataOffset));
  code.set(drums, player.dataOffset);
  patchScreenText(code, player, title, author);
  const name = title.replace(/[^\x20-\x7E]/g, '?').slice(0, 10);
  const used = player.usableBanks.slice(0, banks.length);
  const loader = basicLoader(used, player);
  const parts = [
    tapBlock(0x00, header(0, name, loader.length, 10, loader.length)), tapBlock(0xFF, loader),
    ...codeBlocks('beeper', player.loadAddress, code),
    ...banks.flatMap((b, i) => codeBlocks(`bank${used[i]}`, player.dataAddress, b)),
  ];
  const tap = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
  let o = 0;
  for (const p of parts) { tap.set(p, o); o += p.length; }
  return tap;
}
