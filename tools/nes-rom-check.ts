// Headless check: capture -> buildNesRom -> Mesen2 bus-write log -> diff against the capture's per-tick writes (nesCaptureToTicks).
// Usage: nice -n 19 npx tsx tools/nes-rom-check.ts [--only <name>] [--failed] [--target cart|nsfe|vrc6cart|vrc6bcart|fme7cart]  (vrc6bcart = mapper-26 (player26.bin, VRC6 register address lines A0/A1 swapped, so the bus sees $x001<->$x002 vs the capture), vrc6cart = mapper-24 original cart, player24.bin, 2A03 + VRC6 songs only; fme7cart = mapper-69 Sunsoft 5B original cart, player69.bin, 2A03 + 5B songs only; nsfe results are keyed "<name>/nsfe"; FDS songs are refused by NSFe)
// Results: test-data/nes-rom-check.json (skips songs whose input hash matches a recorded verdict).
// LIMIT: a real song's capture comes from the browser worklet (no node-side path), so "songs" are synthetic captures. Cycle position is not compared,
// only (order, address, value) per tick; chips whose capture address is a register number (vrc7, n163, s5b) are mapped to their bus ports as in nesChipWritersMesen.test.ts.
// Mesen2 flags and the Lua logger live in src/lib/export/__tests__/nesMesenHarness.ts (shared with the vitest checks).
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import type { NesCapture, NesChip, NesEvent } from '../src/lib/export/nes/nesCapture';
import { buildNesRom } from '../src/lib/export/nes/nesExport';
import { buildBoardCartridge, type NesBoard } from '../src/lib/export/nes/nesCartridge';
import { buildNsfe } from '../src/lib/export/nes/nsfe';
import type { NesPlayer } from '../src/lib/export/nes/nesCartridge';
import { CHIP_ORDER, nesCaptureToTicks } from '../src/lib/export/nes/nesStream';
import { MESEN, busWrites as bus, diffWrites, mesen } from '../src/lib/export/__tests__/nesMesenHarness';

const ROOT = path.resolve(import.meta.dirname, '..');
const RESULTS = path.join(ROOT, 'test-data/nes-rom-check.json');
const SR = 48000, TR = 60;
const RANGES: Array<[number, number]> = [[0x4000, 0x4013], [0x4015, 0x4015], [0x4017, 0x4017], [0x4040, 0x408a], [0x4800, 0x4800], [0x5000, 0x5015], [0x8000, 0xffff]];

interface Verdict { inputHash: string; pass: boolean; ticks: number; wanted: number; got: number; diffs: number; first?: string; romBytes?: number; error?: string }

const w = (tick: number, chip: NesChip, addr: number, value: number): NesEvent => ({ kind: 'write', chip, sample: Math.round(tick * SR / TR), addr, value });
const cap = (events: NesEvent[]): NesCapture => ({ events, sampleRate: SR, tickRateHz: TR });

// Mapper 24 sees only the 2A03 and VRC6 audio ports as the song's writes; $8000 / $C000 are the player's bank selects.
const VRC6_RANGES: Array<[number, number]> = [[0x4000, 0x4013], [0x4015, 0x4015], [0x4017, 0x4017], [0x9000, 0xb003]];

const SONGS: Record<string, () => NesCapture> = {
  // 2A03 + VRC6 only, long enough (1500 ticks, varying values) to cross several 8 KB stream banks and exercise SET_BANK.
  'synthetic-vrc6': () => cap(Array.from({ length: 1500 }, (_, t) => [
    w(t, 'nes', 0x4002, (t * 7) & 0xff), w(t, 'nes', 0x4003, 0x08 | (t & 7)), w(t, 'vrc6', 0x9000, (t * 13) & 0xff), w(t, 'vrc6', 0x9001, (t * 5) & 0xff), w(t, 'vrc6', 0x9002, (t * 3 + 0x80) & 0xff),
    w(t, 'vrc6', 0xa000, (t * 17) & 0xff), w(t, 'vrc6', 0xa001, (t * 11) & 0xff), w(t, 'vrc6', 0xb002, (t * 29) & 0xff),
  ]).flat()),
  // 2A03 + Sunsoft 5B only, long enough to cross several 8 KB stream banks and exercise SET_BANK.
  'synthetic-5b': () => cap(Array.from({ length: 1500 }, (_, t) => [
    w(t, 'nes', 0x4002, (t * 7) & 0xff), w(t, 'nes', 0x4003, 0x08 | (t & 7)), w(t, 's5b', 0x00, (t * 13) & 0xff), w(t, 's5b', 0x01, (t * 5) & 0x0f), w(t, 's5b', 0x08, (t * 3) & 0x0f), w(t, 's5b', 0x07, (t * 29) & 0x3f),
  ]).flat()),
  // 2A03 + Namco 163 only: address port writes (autoincrement bit set by the bus mapping) and data writes over 1500 ticks.
  'synthetic-n163': () => cap(Array.from({ length: 1500 }, (_, t) => [
    w(t, 'nes', 0x4002, (t * 7) & 0xff), w(t, 'nes', 0x4003, 0x08 | (t & 7)), w(t, 'n163', 0x78 + (t & 7), (t * 3) & 0xff), w(t, 'n163', 0x40, (t * 5) & 0xff), w(t, 'n163', 0x7f, 0x70 | (t & 15)),
  ]).flat()),
  // 2A03 + VRC7 only: register index plus data writes over 1500 ticks (indices 0x10-0x15 frequency, 0x30-0x35 instrument/volume).
  'synthetic-vrc7': () => cap(Array.from({ length: 1500 }, (_, t) => [
    w(t, 'nes', 0x4002, (t * 7) & 0xff), w(t, 'nes', 0x4003, 0x08 | (t & 7)), w(t, 'vrc7', 0x10 + (t % 6), (t * 9) & 0xff), w(t, 'vrc7', 0x20 + (t % 6), (t * 5) & 0x3f), w(t, 'vrc7', 0x30 + (t % 6), (t * 3) & 0xff),
  ]).flat()),
  // The Phase 11 capture: two pulse notes and a volume change.
  'synthetic-2a03': () => cap([w(0, 'nes', 0x4015, 0x0f), w(0, 'nes', 0x4000, 0xbf), w(0, 'nes', 0x4002, 0xa9), w(0, 'nes', 0x4003, 0x01), w(3, 'nes', 0x4000, 0x9f)]),
  // 2A03 + VRC6 + FDS + MMC5 (real bus addresses) over 40 ticks with changing values.
  'synthetic-multi': () => cap(Array.from({ length: 40 }, (_, t) => [
    w(t, 'nes', 0x4002, (t * 7) & 0xff), w(t, 'nes', 0x4003, 0x08 | (t & 7)), w(t, 'vrc6', 0x9001, (t * 5) & 0xff), w(t, 'vrc6', 0xa002, t & 0xff),
    w(t, 'fds', 0x4082, (t * 3) & 0xff), w(t, 'mmc5', 0x5002, (t * 11) & 0xff),
  ]).flat()),
  // No FDS (NSFe refuses it): 2A03 + VRC6 + MMC5 + N163 + 5B, VRC7 included.
  'synthetic-nofds': () => cap(Array.from({ length: 40 }, (_, t) => [
    w(t, 'nes', 0x4002, (t * 7) & 0xff), w(t, 'nes', 0x4003, 0x08 | (t & 7)), w(t, 'vrc6', 0x9001, (t * 5) & 0xff), w(t, 'vrc6', 0xa002, t & 0xff),
    w(t, 'mmc5', 0x5002, (t * 11) & 0xff), w(t, 'n163', 0x78, (t * 3) & 0xff), w(t, 's5b', 0x01, t & 0x0f), w(t, 'vrc7', 0x10, (t * 9) & 0xff),
  ]).flat()),
};

// Mapper 26 wires VRC6 A0/A1 swapped: the capture's $x001 reaches the bus as $x002.
const vrc6bSwap = (a: number) => (a & ~3) | ((a & 1) << 1) | ((a >> 1) & 1);
// Original-board targets: board, player build, the bus ports counted as the song's writes (the player's own bank selects are left out), chip name on the screen.
const CARTS: Record<string, { board: NesBoard; player: string; ranges: Array<[number, number]>; chipName: string }> = {
  vrc6cart: { board: 'vrc6', player: 'player24', ranges: VRC6_RANGES, chipName: 'VRC6' },
  vrc6bcart: { board: 'vrc6', player: 'player26', ranges: VRC6_RANGES, chipName: 'VRC6' },
  fme7cart: { board: 'fme7', player: 'player69', ranges: [[0x4000, 0x4013], [0x4015, 0x4015], [0x4017, 0x4017], [0xc000, 0xc000], [0xe000, 0xe000]], chipName: '5B' },
  n163cart: { board: 'n163', player: 'player19', ranges: [[0x4000, 0x4013], [0x4015, 0x4015], [0x4017, 0x4017], [0x4800, 0x4800], [0xf800, 0xf800]], chipName: 'N163' },
  vrc7cart: { board: 'vrc7', player: 'player85', ranges: [[0x4000, 0x4013], [0x4015, 0x4015], [0x4017, 0x4017], [0x9010, 0x9010], [0x9030, 0x9030]], chipName: 'VRC7' },
};
const playerName = (target: string) => CARTS[target]?.player ?? 'player';
const hashOf = (song: string, target: string) => createHash('sha1').update(JSON.stringify(SONGS[song]())).update(target).update(readFileSync(path.join(ROOT, `public/nes/${playerName(target)}.bin`))).digest('hex').slice(0, 12);

function check(name: string, target: string): Verdict {
  const capture = SONGS[name]();
  const inputHash = hashOf(name, target);
  const base: Verdict = { inputHash, pass: false, ticks: 0, wanted: 0, got: 0, diffs: 0 };
  try {
    const player: NesPlayer = { ...JSON.parse(readFileSync(path.join(ROOT, `public/nes/${playerName(target)}.json`), 'utf8')), bytes: Uint8Array.from(readFileSync(path.join(ROOT, `public/nes/${playerName(target)}.bin`))) };
    const info = { title: name.slice(0, 16), chips: [...new Set(capture.events.flatMap((e) => (e.kind === 'write' ? [e.chip] : [])))] };
    const cart = CARTS[target];
    const rom = cart ? { rom: buildBoardCartridge(cart.board, [{ ntsc: capture }], player, info.title, { chipName: cart.chipName }).rom } : target === 'nsfe' ? { rom: buildNsfe([{ ntsc: capture }], player, info).nsfe } : buildNesRom([{ ntsc: capture }], player, info);
    const ticks = nesCaptureToTicks(capture);
    const want = ticks.map((t) => CHIP_ORDER.flatMap((c) => (t.writes[c] ?? []).flatMap(([a, v]) => bus(c, c === 'vrc6' && target === 'vrc6bcart' ? vrc6bSwap(a) : a, v))));
    const got = mesen(rom.rom, ticks.length + 3, 60, cart ? cart.ranges : RANGES, target === 'nsfe' ? { fileName: 'p.nsfe', tickAddress: player.nsfPlayAddress } : cart ? { tickAddress: player.nmiAddress } : {}).writes;
    const { diffs, first } = diffWrites(want, got);
    return { ...base, pass: diffs === 0, ticks: ticks.length, wanted: want.flat().length, got: got.flat().length, diffs, first, romBytes: rom.rom.length };
  } catch (e) { return { ...base, error: String((e as Error).message).split('\n')[0] }; }
}

const args = process.argv.slice(2);
const only = args.includes('--only') ? args[args.indexOf('--only') + 1] : null;
const target = args.includes('--target') ? args[args.indexOf('--target') + 1] : 'cart';
if (target !== 'cart' && target !== 'nsfe' && !CARTS[target]) throw new Error(`Unknown target ${target}`);
const failedOnly = args.includes('--failed');
if (!existsSync(MESEN)) throw new Error(`Mesen2 not installed at ${MESEN}`);
if (only && !SONGS[only]) throw new Error(`Unknown song ${only}; have ${Object.keys(SONGS).join(', ')}`);
mkdirSync(path.dirname(RESULTS), { recursive: true });
const results: Record<string, Verdict> = existsSync(RESULTS) ? JSON.parse(readFileSync(RESULTS, 'utf8')) : {};
for (const song of Object.keys(SONGS)) {
  if (only && song !== only) continue;
  const name = target === 'cart' ? song : `${song}/${target}`;
  const prev = results[name];
  if (failedOnly ? !prev || prev.pass : prev && !prev.error && prev.pass && prev.inputHash === hashOf(song, target)) continue;
  results[name] = check(song, target);
  writeFileSync(RESULTS, JSON.stringify(results, null, 2) + '\n');
  const r = results[name];
  console.log(name.padEnd(16), r.pass ? 'PASS' : 'FAIL', `ticks=${r.ticks} wanted=${r.wanted} got=${r.got} diffs=${r.diffs} ${r.first ?? ''} ${r.error ?? ''}`);
}
