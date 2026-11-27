// Builds public/data/songs/furnace/nes/nes_feature_test.fur: the shortest NES (2A03) Furnace song that
// exercises every NES effect, macro type and channel once, for per-frame lockstep against the FamiStudio ROM.
// Re-run: nice -n 19 npx tsx --tsconfig tsconfig.app.json tools/make-nes-feature-test.ts
// Writes the .fur through the repo's own writer (exportFurnaceModule, `chip` option) and a feature -> frame table
// to thoughts/spot/2026-11-17-nes-feature-test-song.md (the check results are appended to it by hand).
import fs from 'node:fs';
import path from 'node:path';
import { exportFurnaceModule } from '../src/lib/export/FurnaceModuleExporter';
import { DEFAULT_FURNACE } from '../src/types/instrument/defaults';
import { EMPTY_CELL } from '../src/types/tracker';
import type { ChannelData, Pattern, TrackerCell } from '../src/types/tracker';
import type { FurnaceConfig, FurnaceMacro, InstrumentConfig } from '../src/types/instrument';

const ROOT = path.resolve(import.meta.dirname, '..');
const OUT = path.join(ROOT, 'public/data/songs/furnace/nes/nes_feature_test.fur');
const DOC = path.join(ROOT, 'thoughts/spot/2026-11-17-nes-feature-test-song.md');
const CH = 5; // pulse 1, pulse 2, triangle, noise, DPCM
const SPEED_SLOT = 4; // every pattern sets its speed in effect column 4 of channel 0, row 0
const OFF = 97;
const note = (oct: number, semi: number): number => oct * 12 + semi + 1; // cell.note: C-0 = 1
const C = (o: number) => note(o, 0), E = (o: number) => note(o, 4), G = (o: number) => note(o, 7);
const FIXED = 0x40000000; // arp macro step bit: absolute note instead of an offset

// -- Instruments ------------------------------------------------------------------
const mac = (code: number, data: number[], extra: Partial<FurnaceMacro> = {}): FurnaceMacro =>
  ({ code, type: 0, data, loop: -1, release: -1, mode: 0, ...extra });
const longVol = Array.from({ length: 250 }, (_, i) => Math.round(15 * (1 - i / 250)));
const dpcmData = Int16Array.from({ length: 1024 }, (_, i) => (((i >> 5) & 1) ? 12000 : -12000) | 0);
const INS: Array<{ name: string; macros: FurnaceMacro[]; sample?: boolean }> = [
  { name: 'BASIC', macros: [] },
  { name: 'VOL ENV', macros: [mac(0, [15, 12, 9, 6, 3, 1, 0])] },
  { name: 'LOOP REL', macros: [mac(0, [15, 12, 10, 10, 8, 6, 3, 0], { loop: 2, release: 5 })] },
  { name: 'DUTY', macros: [mac(2, [0, 1, 2, 3, 2, 1])] },
  { name: 'ARP REL', macros: [mac(1, [0, 4, 7, 12], { loop: 0 })] },
  { name: 'ARP FIXED', macros: [mac(1, [48, 52, 55, 60].map((n) => n | FIXED), { loop: 0 })] },
  { name: 'PITCH ABS', macros: [mac(4, [0, 4, 8, 12, 16, 12, 8, 4, 0])] },
  { name: 'PITCH REL', macros: [mac(4, [2, 2, 2, 2, -2, -2, -2, -2], { mode: 1, loop: 0 })] },
  { name: 'PHASE', macros: [mac(14, [1, 0, 1, 0])] },
  { name: 'NOISE MODE', macros: [mac(2, [0, 1, 0, 1], { loop: 0 }), mac(0, [15, 10, 5, 0])] },
  { name: 'LONG 250', macros: [mac(0, longVol)] },
  { name: 'MACRO SPEED', macros: [mac(0, [15, 10, 5, 0], { speed: 2, delay: 2 })] },
  { name: 'DPCM', macros: [], sample: true },
];
const insId = (name: string): number => INS.findIndex((i) => i.name === name) + 1;
const instruments: InstrumentConfig[] = INS.map((d, k) => ({
  id: k + 1, name: d.name, type: 'synth', synthType: 'FurnaceNES',
  furnace: {
    ...DEFAULT_FURNACE, chipType: 6, divInsType: 0, operators: [], macros: d.macros, opMacros: [], wavetables: [],
    ...(d.sample ? { userSample: { data: dpcmData, rate: 16000, name: 'DPCM square' } } : {}),
  } as FurnaceConfig,
} as unknown as InstrumentConfig));

// -- Patterns ---------------------------------------------------------------------
interface Spec { cell: Partial<TrackerCell>; }
type Fx = [number, number];
interface Hit { ch: number; row: number; n?: number; ins?: string; vol?: number; fx?: Fx[]; }
interface Feature { name: string; label: string; speed: number; len: number; hits: Hit[]; }

const features: Feature[] = [];
function feat(name: string, label: string, speed: number, len: number, hits: Hit[]): void { features.push({ name, label, speed, len, hits }); }
/** Same hits on pulse 1 and triangle (an effect that every melodic channel takes). */
function both(name: string, label: string, speed: number, len: number, rows: Array<Omit<Hit, 'ch'>>): void {
  feat(name, label, speed, len, rows.flatMap((r) => [{ ...r, ch: 0 }, { ...r, ch: 2, n: r.n ? r.n - 12 : r.n }]));
}

feat('NOTES', 'note on, hold, note off, all 5 channels', 4, 4, [
  { ch: 0, row: 0, n: C(4), ins: 'BASIC' }, { ch: 1, row: 0, n: E(4), ins: 'BASIC' }, { ch: 2, row: 0, n: C(3), ins: 'BASIC' },
  { ch: 3, row: 0, n: note(2, 0), ins: 'BASIC' }, { ch: 4, row: 0, n: C(4), ins: 'DPCM' },
  ...[0, 1, 2, 3, 4].map((ch) => ({ ch, row: 2, n: OFF })),
]);
feat('RANGE', 'out of range low then high note (C-0, B-7) on every channel', 3, 4, [
  ...[0, 1, 2, 3, 4].flatMap((ch) => [
    { ch, row: 0, n: 1, ins: ch === 4 ? 'DPCM' : 'BASIC' }, { ch, row: 1, n: 96, ins: ch === 4 ? 'DPCM' : 'BASIC' }, { ch, row: 2, n: OFF }]),
]);
feat('VOLCOL', 'volume column set mid-note (pulse, triangle, noise)', 2, 5, [
  { ch: 0, row: 0, n: C(4), ins: 'BASIC', vol: 0x50 }, { ch: 0, row: 1, vol: 0x30 }, { ch: 0, row: 2, vol: 0x10 }, { ch: 0, row: 3, vol: 0x50 },
  { ch: 1, row: 0, n: E(4), ins: 'BASIC', vol: 0x40 }, { ch: 1, row: 2, vol: 0x20 },
  { ch: 2, row: 0, n: C(3), ins: 'BASIC' }, { ch: 2, row: 1, vol: 0x10 },
  { ch: 3, row: 0, n: note(2, 0), ins: 'BASIC', vol: 0x50 }, { ch: 3, row: 2, vol: 0x28 },
]);
feat('E11 DMC LEVEL', '11xx write delta counter (no sample playing)', 2, 4, [
  { ch: 4, row: 0, fx: [[0x11, 0x40]] }, { ch: 4, row: 2, fx: [[0x11, 0x10]] },
]);
feat('E12 DUTY NOISE', '12xx pulse duty 0-3 and noise long/short', 2, 6, [
  { ch: 0, row: 0, n: C(4), ins: 'BASIC', fx: [[0x12, 0]] }, { ch: 0, row: 1, fx: [[0x12, 1]] }, { ch: 0, row: 2, fx: [[0x12, 2]] }, { ch: 0, row: 3, fx: [[0x12, 3]] },
  { ch: 3, row: 0, n: note(2, 0), ins: 'BASIC', fx: [[0x12, 0]] }, { ch: 3, row: 2, fx: [[0x12, 1]] },
]);
feat('E13 SWEEP UP', '13xy sweep up on both pulses, then 1300 off', 2, 4, [
  { ch: 0, row: 0, n: C(4), ins: 'BASIC', fx: [[0x13, 0x26]] }, { ch: 1, row: 0, n: C(3), ins: 'BASIC', fx: [[0x13, 0x13]] },
  { ch: 0, row: 2, fx: [[0x13, 0]] }, { ch: 1, row: 2, fx: [[0x13, 0]] },
]);
feat('E14 SWEEP DOWN', '14xy sweep down on both pulses, then 1400 off', 2, 4, [
  { ch: 0, row: 0, n: C(5), ins: 'BASIC', fx: [[0x14, 0x26]] }, { ch: 1, row: 0, n: C(5), ins: 'BASIC', fx: [[0x14, 0x13]] },
  { ch: 0, row: 2, fx: [[0x14, 0]] }, { ch: 1, row: 2, fx: [[0x14, 0]] },
]);
feat('E15 ENV MODE', '15xx envelope mode 0-3 (pulse), 0 and 2 (noise)', 2, 5, [
  { ch: 0, row: 0, n: C(4), ins: 'BASIC', vol: 0x30, fx: [[0x15, 0]] }, { ch: 0, row: 1, n: C(4), ins: 'BASIC', vol: 0x30, fx: [[0x15, 1]] },
  { ch: 0, row: 2, n: C(4), ins: 'BASIC', vol: 0x30, fx: [[0x15, 2]] }, { ch: 0, row: 3, n: C(4), ins: 'BASIC', vol: 0x30, fx: [[0x15, 3]] },
  { ch: 3, row: 0, n: note(2, 0), ins: 'BASIC', vol: 0x30, fx: [[0x15, 0]] }, { ch: 3, row: 2, n: note(2, 0), ins: 'BASIC', vol: 0x30, fx: [[0x15, 2]] },
]);
feat('E16 LENGTH', '16xx length counter (with 1501 length mode)', 2, 4, [
  { ch: 0, row: 0, n: C(4), ins: 'BASIC', fx: [[0x15, 1], [0x16, 0x10]] }, { ch: 1, row: 0, n: C(4), ins: 'BASIC', fx: [[0x15, 1], [0x16, 0x08]] },
  { ch: 3, row: 0, n: note(2, 0), ins: 'BASIC', fx: [[0x15, 1], [0x16, 0x10]] },
]);
feat('E17 FRAME COUNTER', '17xx frame counter 4-step then 5-step', 2, 4, [
  { ch: 0, row: 0, n: C(4), ins: 'BASIC', fx: [[0x15, 1], [0x16, 0x10], [0x17, 0]] }, { ch: 0, row: 2, n: C(4), ins: 'BASIC', fx: [[0x17, 1]] },
]);
feat('E18 PCM MODE', '18xx DPCM (hardware) then software PCM', 3, 4, [
  { ch: 4, row: 0, n: C(4), ins: 'DPCM', fx: [[0x18, 1]] }, { ch: 4, row: 2, n: C(4), ins: 'DPCM', fx: [[0x18, 0]] },
]);
feat('E19 LINEAR', '19xx triangle linear counter 40, 10, halt 80', 2, 4, [
  { ch: 2, row: 0, n: C(3), ins: 'BASIC', fx: [[0x19, 0x40]] }, { ch: 2, row: 1, fx: [[0x19, 0x10]] }, { ch: 2, row: 2, fx: [[0x19, 0x80]] },
]);
feat('E20 DPCM RATE', '20xx DPCM rate 05 and 0F', 3, 4, [
  { ch: 4, row: 0, n: C(4), ins: 'DPCM', fx: [[0x18, 1], [0x20, 5]] }, { ch: 4, row: 2, n: C(4), ins: 'DPCM', fx: [[0x20, 0x0f]] },
]);
both('ARP 00', '00xy arpeggio, stopped by 0000', 2, 5, [{ row: 0, n: C(4), ins: 'BASIC', fx: [[0x00, 0x47]] }, { row: 2, fx: [[0x00, 0x00]] }]);
both('SLIDE 01 02', '01xx slide up, 02xx slide down', 2, 5, [{ row: 0, n: C(4), ins: 'BASIC', fx: [[0x01, 0x04]] }, { row: 2, fx: [[0x02, 0x04]] }]);
both('PORTA 03', '03xx portamento to the next note', 2, 5, [{ row: 0, n: C(4), ins: 'BASIC' }, { row: 1, n: G(4), fx: [[0x03, 0x08]] }]);
both('VIBRATO 04', '04xy vibrato then 0400', 2, 5, [{ row: 0, n: C(4), ins: 'BASIC', fx: [[0x04, 0x47]] }, { row: 3, fx: [[0x04, 0]] }]);
both('TREMOLO 07', '07xy tremolo', 2, 5, [{ row: 0, n: C(4), ins: 'BASIC', fx: [[0x07, 0x47]] }]);
feat('SPEED 09 0F', '09xx and 0Fxx speed changes mid-pattern', 3, 5, [
  { ch: 0, row: 0, n: C(4), ins: 'BASIC' }, { ch: 0, row: 1, fx: [[0x09, 1]] }, { ch: 0, row: 3, fx: [[0x0f, 2]] },
]);
feat('VOLSLIDE 0A', '0Axy volume slide down then up', 2, 6, [
  { ch: 0, row: 0, n: C(4), ins: 'BASIC', vol: 0x50, fx: [[0x0a, 0x02]] }, { ch: 0, row: 3, fx: [[0x0a, 0x10]] },
  { ch: 1, row: 0, n: C(4), ins: 'BASIC', vol: 0x20, fx: [[0x0a, 0x20]] },
]);
both('RETRIG 0C', '0Cxx retrigger every 2 ticks', 4, 3, [{ row: 0, n: C(4), ins: 'BASIC', fx: [[0x0c, 2]] }]);
both('ARP SPEED E0', 'E0xx arpeggio speed 2 with 0047', 2, 5, [{ row: 0, n: C(4), ins: 'BASIC', fx: [[0xe0, 2], [0x00, 0x47]] }]);
both('NOTE SLIDE E1 E2', 'E1xy note slide up, E2xy note slide down', 2, 5, [{ row: 0, n: C(4), ins: 'BASIC', fx: [[0xe1, 0x23]] }, { row: 2, fx: [[0xe2, 0x23]] }]);
both('VIB SHAPE E3 E4', 'E3xx vibrato shape, E4xx vibrato range', 2, 5, [{ row: 0, n: C(4), ins: 'BASIC', fx: [[0xe3, 2], [0xe4, 0x10], [0x04, 0x47]] }]);
both('FINE PITCH E5', 'E5xx set pitch 00, 80, FF', 2, 5, [
  { row: 0, n: C(4), ins: 'BASIC', fx: [[0xe5, 0]] }, { row: 1, fx: [[0xe5, 0x80]] }, { row: 2, fx: [[0xe5, 0xff]] }]);
both('LEGATO E6 E8 E9 EA', 'E6xy, E8xy, E9xy quick legato, EA01 legato', 4, 6, [
  { row: 0, n: C(4), ins: 'BASIC', fx: [[0xe8, 0x23]] }, { row: 2, n: C(4), fx: [[0xe9, 0x23]] }, { row: 3, n: C(4), fx: [[0xe6, 0x23]] },
  { row: 4, n: C(4), fx: [[0xea, 1]] }]);
both('MACRO RELEASE E7 FC', 'E7xx macro release, FCxx note release (LOOP REL)', 3, 6, [
  { row: 0, n: C(4), ins: 'LOOP REL', fx: [[0xe7, 3]] }, { row: 3, n: C(4), ins: 'LOOP REL', fx: [[0xfc, 3]] }]);
both('CUT DELAY EC ED', 'ECxx note cut, EDxx note delay', 4, 4, [
  { row: 0, n: C(4), ins: 'BASIC', fx: [[0xec, 2]] }, { row: 2, n: E(4), ins: 'BASIC', fx: [[0xed, 2]] }]);
both('TICK F1 F2', 'F1xx F2xx single tick pitch up and down', 2, 4, [{ row: 0, n: C(4), ins: 'BASIC', fx: [[0xf1, 0x20]] }, { row: 1, fx: [[0xf2, 0x20]] }]);
both('FINE VOL F3 F4', 'F3xx F4xx fine volume slide up and down', 2, 4, [
  { row: 0, n: C(4), ins: 'BASIC', vol: 0x30, fx: [[0xf3, 0x20]] }, { row: 2, fx: [[0xf4, 0x20]] }]);
both('TICK VOL F8 F9 FA', 'F8xx F9xx single tick volume, FAxy fast volume slide', 2, 5, [
  { row: 0, n: C(4), ins: 'BASIC', vol: 0x30, fx: [[0xf8, 3]] }, { row: 1, fx: [[0xf9, 3]] }, { row: 2, fx: [[0xfa, 0x10]] }]);
both('VOL PORTA D3 D4 DC', 'D3xx D4xx volume portamento, DCxx delayed mute', 2, 6, [
  { row: 0, n: C(4), ins: 'BASIC', vol: 0x10, fx: [[0xd3, 2]] }, { row: 1, vol: 0x50 }, { row: 3, n: C(4), vol: 0x50, fx: [[0xdc, 2]] }]);
both('MACRO CTRL F5 F6 F7', 'F5xx disable, F6xx enable, F7xx restart macro', 2, 6, [
  { row: 0, n: C(4), ins: 'VOL ENV', fx: [[0xf5, 0]] }, { row: 2, fx: [[0xf6, 0]] }, { row: 3, fx: [[0xf7, 0]] }]);
// Macros
feat('MAC VOL', 'volume macro, no loop', 1, 8, [{ ch: 0, row: 0, n: C(4), ins: 'VOL ENV' }, { ch: 0, row: 7, n: OFF }]);
feat('MAC LOOP REL', 'volume macro with loop and release point, note off', 2, 8, [
  { ch: 0, row: 0, n: C(4), ins: 'LOOP REL' }, { ch: 0, row: 5, n: OFF }]);
feat('MAC DUTY', 'duty macro on pulse', 1, 8, [{ ch: 0, row: 0, n: C(4), ins: 'DUTY' }, { ch: 0, row: 7, n: OFF }]);
feat('MAC NOISE', 'noise mode macro (long, periodic) plus volume macro', 1, 8, [{ ch: 3, row: 0, n: note(2, 0), ins: 'NOISE MODE' }, { ch: 3, row: 7, n: OFF }]);
feat('MAC ARP', 'arp macro relative, then fixed-note steps (pulse, noise, triangle)', 1, 10, [
  { ch: 0, row: 0, n: C(4), ins: 'ARP REL' }, { ch: 0, row: 5, n: C(4), ins: 'ARP FIXED' },
  { ch: 2, row: 0, n: C(3), ins: 'ARP REL' }, { ch: 2, row: 5, n: C(3), ins: 'ARP FIXED' },
  { ch: 3, row: 5, n: note(2, 0), ins: 'ARP FIXED' }]);
feat('MAC PITCH', 'pitch macro absolute, then relative', 1, 12, [
  { ch: 0, row: 0, n: C(4), ins: 'PITCH ABS' }, { ch: 0, row: 6, n: C(4), ins: 'PITCH REL' },
  { ch: 2, row: 0, n: C(3), ins: 'PITCH ABS' }, { ch: 2, row: 6, n: C(3), ins: 'PITCH REL' }]);
feat('MAC PHASE', 'phase reset macro with 1500 envelope', 1, 6, [
  { ch: 0, row: 0, n: C(4), ins: 'PHASE', vol: 0x30, fx: [[0x15, 0]] }]);
feat('MAC SPEED DELAY', 'volume macro with macro speed 2 and delay 2', 1, 10, [{ ch: 0, row: 0, n: C(4), ins: 'MACRO SPEED' }]);
feat('MAC LONG 250', 'volume macro 250 steps (over 240 frames)', 8, 32, [{ ch: 0, row: 0, n: C(4), ins: 'LONG 250' }]);

function channel(i: number): ChannelData {
  return {
    id: `c${i}`, name: `Ch ${i + 1}`, rows: [], muted: false, solo: false, collapsed: false, volume: 100, pan: 0, instrumentId: null, color: null,
    channelMeta: { effectNotation: 'furnace', effectCols: 1 },
  } as unknown as ChannelData;
}

const patterns: Pattern[] = features.map((f, pi) => {
  const chans = Array.from({ length: CH }, (_, i) => channel(i));
  for (const ch of chans) ch.rows = Array.from({ length: f.len }, () => ({ ...EMPTY_CELL }));
  for (const h of f.hits) {
    const c: Record<string, number> = { ...chans[h.ch].rows[h.row] } as unknown as Record<string, number>;
    if (h.n) c.note = h.n;
    if (h.ins) c.instrument = insId(h.ins);
    if (h.vol) c.volume = h.vol;
    (h.fx ?? []).forEach(([t, v], k) => { c[k === 0 ? 'effTyp' : `effTyp${k + 1}`] = t; c[k === 0 ? 'eff' : `eff${k + 1}`] = v; });
    chans[h.ch].rows[h.row] = c as unknown as TrackerCell;
  }
  const r0 = chans[0].rows[0] as unknown as Record<string, number>;
  r0[`effTyp${SPEED_SLOT}`] = 0x0f; r0[`eff${SPEED_SLOT}`] = f.speed;
  return { id: `p${pi}`, name: f.name, length: f.len, channels: chans } as Pattern;
});

// -- Frame table: speed 0F/09 on any row changes the ticks per row from that row on ----
const lines: string[] = [];
let frame = 0;
features.forEach((f, pi) => {
  let speed = f.speed;
  let frames = 0;
  for (let r = 0; r < f.len; r++) {
    for (const h of f.hits) if (h.row === r) for (const [t, v] of h.fx ?? []) if ((t === 0x0f || t === 0x09) && v > 0) speed = v;
    frames += speed;
  }
  lines.push(`| ${pi} | ${f.name} | ${f.label} | ${f.speed} | ${f.len} | ${frame} | ${frame + frames - 1} |`);
  frame += frames;
});

const song = {
  name: 'NES feature test', author: 'DEViLBOX', patterns, instruments, songPositions: patterns.map((_, i) => i),
  initialSpeed: 3, initialBPM: 150, hz: 60,
  chip: { id: 0x06, channels: CH, synthType: 'FurnaceNES', volMax: () => 15, chipFlags: '', name: 'NES (Ricoh 2A03)' },
};
const res = exportFurnaceModule(song as unknown as Parameters<typeof exportFurnaceModule>[0]);
fs.mkdirSync(path.dirname(OUT), { recursive: true });
fs.writeFileSync(OUT, res.bytes);
fs.mkdirSync(path.dirname(DOC), { recursive: true });
fs.writeFileSync(DOC, [
  '# NES feature test song', '',
  `Generated by tools/make-nes-feature-test.ts into public/data/songs/furnace/nes/nes_feature_test.fur (${res.bytes.length} bytes, ${frame} frames at 60 Hz).`, '',
  '| Pattern | Feature | What | Speed | Rows | First frame | Last frame |', '|---|---|---|---|---|---|---|', ...lines, '',
].join('\n'));
console.log(`wrote ${OUT} (${res.bytes.length} bytes, ${frame} frames, ${patterns.length} patterns); warnings: ${res.warnings.join(' | ') || 'none'}`);
void ({} as Spec);
