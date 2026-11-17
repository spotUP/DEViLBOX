/**
 * Vectrex torture song: a small A-minor tune in twelve named sections that exercises every AY-3-8910
 * command and macro the Furnace dispatch drives (effect codes from furnace src/engine/sysDef.cpp, macro
 * codes from platform/ay.cpp). Built as a FurnaceModuleSong, exported with exportFurnaceAyScramble('vectrex').
 */
import type { FurnaceModuleSong } from '../FurnaceModuleExporter';
import type { Pattern, TrackerCell } from '@/types/tracker';
import type { InstrumentConfig } from '@/types/instrument';

export const TORTURE_ROWS = 32;
export const TORTURE_SPEED = 6;
export const TORTURE_BPM = 125; // 50 Hz ticks
type Fx = readonly [number, number];
/** Furnace effect codes. */
export const FX = {
  ARP: 0x00, UP: 0x01, DOWN: 0x02, PORTA: 0x03, VIBRATO: 0x04, VOLSLIDE: 0x0A, JUMP: 0x0B, BREAK: 0x0D, SPEED: 0x0F,
  MIX: 0x20, NOISE: 0x21, ENV_SHAPE: 0x22, ENV_LO: 0x23, ENV_HI: 0x24, ENV_UP: 0x25, ENV_DOWN: 0x26, AUTO_ENV: 0x29,
  FINE: 0xE5, CUT: 0xEC, DELAY: 0xED, TEMPO: 0xF0,
} as const;
const OFF = 97, RELEASE = 255;
const NAMES: Record<string, number> = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };
/** Note name to cell.note (C-3 = 37). `A#2`, `C3`. */
export function note(name: string): number {
  const m = /^([A-G])(#?)(\d)$/.exec(name);
  if (!m) throw new Error(`bad note ${name}`);
  return 12 * Number(m[3]) + NAMES[m[1]] + (m[2] ? 1 : 0) + 1;
}

interface Mac { code: number; data: number[]; loop?: number; speed?: number }
function inst(id: number, name: string, macros: Mac[]): InstrumentConfig {
  return {
    id, name, type: 'synth', synthType: 'FurnaceAY', envelope: { attack: 0, decay: 0, sustain: 0, release: 0 }, effects: [], volume: 0, pan: 0,
    furnace: { chipType: 6, macros: macros.map((m) => ({ code: m.code, type: m.code, data: m.data, loop: m.loop ?? 255, release: 255, mode: 0, delay: 0, speed: m.speed ?? 1 })) },
  } as unknown as InstrumentConfig;
}
/** Macro codes: 0 volume, 1 arpeggio, 2 duty (noise period, 31 - value), 3 wave (1 tone, 2 noise, 4 envelope), 4 pitch, 6 envelope shape, 7/8 auto-envelope numerator/denominator, 16 envelope period. */
export const TORTURE_INSTRUMENTS: InstrumentConfig[] = [
  inst(1, 'Lead', [{ code: 0, data: [15, 14, 13, 12, 11, 10, 9, 8, 8, 7, 7, 6, 6, 5, 5, 4] }, { code: 3, data: [1] }]),
  inst(2, 'Bass', [{ code: 0, data: [15, 15, 13, 12, 12, 11, 11, 10] }, { code: 3, data: [1] }]),
  inst(3, 'Hat', [{ code: 0, data: [15, 10, 6, 3, 1, 0] }, { code: 2, data: [31, 20, 10, 4] }, { code: 3, data: [2] }]),
  inst(4, 'Snare', [{ code: 0, data: [15, 13, 10, 7, 4, 2, 1, 0] }, { code: 2, data: [8, 12, 16, 20, 24] }, { code: 3, data: [3, 3, 2, 2, 2] }]),
  inst(5, 'Chord Arp', [{ code: 0, data: [13] }, { code: 1, data: [0, 4, 7], loop: 0 }, { code: 3, data: [1] }]),
  inst(6, 'Pitch Vibrato', [{ code: 0, data: [12, 12, 12, 12, 10, 10, 10, 9] }, { code: 4, data: [0, 3, 6, 3, 0, -3, -6, -3], loop: 0 }, { code: 3, data: [1] }]),
  inst(7, 'Envelope Bass', [{ code: 0, data: [15] }, { code: 3, data: [5] }, { code: 6, data: [10] }, { code: 16, data: [64] }]),
  inst(8, 'Auto Envelope', [{ code: 0, data: [15] }, { code: 3, data: [5] }, { code: 6, data: [12] }, { code: 7, data: [1] }, { code: 8, data: [2] }]),
  inst(9, 'Mixer Sweep', [{ code: 0, data: [14] }, { code: 2, data: [31, 24, 16, 8, 2], loop: 0, speed: 2 }, { code: 3, data: [1, 2, 3, 0, 1, 3, 2, 0], loop: 0, speed: 3 }]),
  inst(10, 'Envelope Effects', [{ code: 0, data: [15] }, { code: 3, data: [5] }]),
  inst(11, 'Pad', [{ code: 0, data: [15] }, { code: 3, data: [1] }]),
];

function emptyCell(): TrackerCell {
  return { note: 0, instrument: 0, volume: 0, effTyp: 0, eff: 0, effTyp2: 0, eff2: 0 };
}
type Lane = TrackerCell[];
function put(lane: Lane, row: number, n: string | number, ins: number, ...fx: Fx[]): void {
  const c = lane[row];
  c.note = typeof n === 'string' ? (n === 'off' ? OFF : n === 'rel' ? RELEASE : note(n)) : n;
  c.instrument = ins;
  fx.forEach(([t, v], i) => { putFx(c, i, t, v); });
}
function putFx(c: TrackerCell, slot: number, t: number, v: number): void {
  const k = slot === 0 ? '' : String(slot + 1);
  (c as unknown as Record<string, number>)['effTyp' + k] = t;
  (c as unknown as Record<string, number>)['eff' + k] = v;
}
function fx(lane: Lane, row: number, ...list: Fx[]): void { list.forEach(([t, v], i) => { putFx(lane[row], i + (lane[row].effTyp || lane[row].eff ? 1 : 0), t, v); }); }

const BASS = ['A2', 'F2', 'C3', 'G2'];
const LEAD = ['A4', 'C5', 'E5', 'D5', 'C5', 'A4', 'G4', 'E4'];

interface Section { name: string; build(l: [Lane, Lane, Lane]): void }
/** Common backbone: bass root on every 8th row, hat every second row, snare on beats 2 and 4. */
function backbone(l: [Lane, Lane, Lane], bassInst = 2, drums = true): void {
  for (let b = 0; b < 4; b++) put(l[1], b * 8, BASS[b], bassInst);
  if (!drums) return;
  for (let r = 0; r < TORTURE_ROWS; r += 2) put(l[2], r, 'C5', r % 8 === 4 ? 4 : 3);
}
function melody(l: [Lane, Lane, Lane], ins: number): void { LEAD.forEach((n, i) => { put(l[0], i * 4, n, ins); }); }

const SECTIONS: Section[] = [
  { name: 'Intro', build: (l) => {
    for (let b = 0; b < 4; b++) put(l[0], b * 8, ['A3', 'F3', 'C4', 'G3'][b], 5, [FX.ARP, 0x47]);
    for (let b = 0; b < 4; b++) put(l[1], b * 8, BASS[b], 2);
    for (let r = 0; r < TORTURE_ROWS; r += 4) put(l[2], r, 'C5', 3);
    put(l[0], 31, 'off', 0);
  } },
  { name: 'Verse A', build: (l) => { melody(l, 1); backbone(l); fx(l[2], 4, [FX.NOISE, 0x0C]); fx(l[2], 12, [FX.NOISE, 0x06]); fx(l[2], 20, [FX.NOISE, 0x14]); } },
  { name: 'Verse B Pitch', build: (l) => {
    melody(l, 6); backbone(l);
    fx(l[0], 2, [FX.VIBRATO, 0x46]); fx(l[0], 10, [FX.UP, 0x08]); fx(l[0], 14, [FX.DOWN, 0x10]);
    put(l[0], 24, 'E5', 1, [FX.PORTA, 0x0C]); put(l[0], 28, 'G5', 0, [FX.PORTA, 0x10]);
    fx(l[1], 4, [FX.FINE, 0xE2]); put(l[1], 20, 'G2', 2, [FX.FINE, 0xE6]);
  } },
  { name: 'Pre Chorus Dynamics', build: (l) => {
    backbone(l, 2, false);
    put(l[0], 0, 'A4', 11, [FX.VOLSLIDE, 0x04]); put(l[0], 8, 'C5', 11, [FX.VOLSLIDE, 0x40], [FX.ARP, 0x37]);
    put(l[0], 12, 'E5', 1, [FX.CUT, 0x02]); put(l[0], 14, 'D5', 1, [FX.DELAY, 0x03]); put(l[0], 16, 'C5', 1);
    put(l[0], 18, 'rel', 0); put(l[0], 20, 'A4', 1); put(l[0], 24, 'off', 0); put(l[0], 26, 'G4', 1); put(l[0], 28, 'rel', 0);
    for (let r = 0; r < 32; r += 4) put(l[2], r, 'C5', r === 28 ? 4 : 3);
  } },
  { name: 'Chorus A Envelope Shapes', build: (l) => {
    melody(l, 1);
    const shapes = [8, 9, 10, 11, 12, 13, 14, 15];
    shapes.forEach((s, i) => { put(l[1], i * 4 + 2, BASS[i % 4], 10, [FX.ENV_SHAPE, s * 16 + 1], [FX.ENV_LO, 0x40 + i * 8]); });
    for (let r = 0; r < TORTURE_ROWS; r += 2) put(l[2], r, 'C5', r % 8 === 4 ? 4 : 3);
  } },
  { name: 'Chorus B Envelope Period', build: (l) => {
    melody(l, 1);
    [0, 1, 2, 3, 4, 5, 6, 7].forEach((s, i) => { put(l[1], i * 4, BASS[i % 4], 10, [FX.ENV_SHAPE, s * 16 + 1], [FX.ENV_HI, 0x00 + (i & 3)], [FX.ENV_LO, 0x30 + i * 10]); });
    fx(l[1], 2, [FX.ENV_UP, 0x04]); fx(l[1], 10, [FX.ENV_DOWN, 0x04]); fx(l[1], 18, [FX.ENV_UP, 0x08]); fx(l[1], 26, [FX.ENV_DOWN, 0x08]);
    put(l[1], 30, BASS[3], 10, [FX.ENV_SHAPE, 0xC1]);   // same shape again: retrigger
    put(l[1], 31, BASS[3], 10, [FX.ENV_SHAPE, 0xC1]);
    for (let r = 0; r < TORTURE_ROWS; r += 2) put(l[2], r, 'C5', r % 8 === 4 ? 4 : 3);
  } },
  { name: 'Bridge Auto Envelope Fast', build: (l) => {
    put(l[0], 0, 'A3', 8, [FX.SPEED, 4], [FX.AUTO_ENV, 0x12]);
    put(l[0], 8, 'C4', 8, [FX.AUTO_ENV, 0x21]); put(l[0], 16, 'E4', 8, [FX.AUTO_ENV, 0x31]); put(l[0], 24, 'D4', 8, [FX.AUTO_ENV, 0x11]);
    put(l[1], 0, 'A2', 9, [FX.MIX, 0x01]); put(l[1], 8, 'F2', 9, [FX.MIX, 0x02]); put(l[1], 16, 'C3', 9, [FX.MIX, 0x03]); put(l[1], 24, 'G2', 9, [FX.MIX, 0x00]);
    for (let r = 0; r < 28; r += 2) put(l[2], r, 'C5', 3, [FX.NOISE, (r * 3) & 0x1F]);
    fx(l[2], 27, [FX.BREAK, 0x00]);   // pattern break: this section is 28 rows long
  } },
  { name: 'Bridge Slow Tempo', build: (l) => {
    put(l[0], 0, 'E4', 1, [FX.SPEED, 8], [FX.TEMPO, 100]);
    LEAD.forEach((n, i) => { put(l[0], i * 4, n, 6); });
    for (let b = 0; b < 4; b++) put(l[1], b * 8, BASS[b], 10, [FX.ENV_SHAPE, (b * 2) * 16 + 1], [FX.ENV_LO, 0x80]);
    for (let r = 0; r < TORTURE_ROWS; r += 4) put(l[2], r, 'C5', r % 8 === 4 ? 4 : 3);
  } },
  { name: 'Break', build: (l) => {
    put(l[0], 0, 'A4', 11, [FX.SPEED, TORTURE_SPEED], [FX.TEMPO, TORTURE_BPM]);
    put(l[0], 16, 'E5', 11, [FX.PORTA, 0x04]);
    put(l[1], 0, 'A2', 2); put(l[1], 16, 'E2', 2);
    put(l[2], 0, 'A3', 11); put(l[2], 8, 'C4', 11); put(l[2], 16, 'E4', 11);   // voice 3 pad: low tone notes
    for (let r = 24; r < TORTURE_ROWS; r += 2) put(l[2], r, 'C5', 4);
    fx(l[2], 31, [FX.JUMP, 9]);   // jump to the next order (Chorus Final)
  } },
  { name: 'Chorus Final', build: (l) => {
    melody(l, 1); backbone(l, 10);
    [0, 8, 16, 24].forEach((r, i) => { fx(l[1], r, [FX.ENV_SHAPE, [0x81, 0xA1, 0xC1, 0xE1][i]], [FX.ENV_LO, 0x40]); });
    for (let r = 4; r < TORTURE_ROWS; r += 8) put(l[0], r + 2, LEAD[r >> 2], 5, [FX.ARP, 0x4C]);
  } },
  { name: 'Outro Descent', build: (l) => {
    for (let i = 0; i < 8; i++) put(l[0], i * 4, ['A5', 'G5', 'E5', 'D5', 'C5', 'A4', 'G4', 'E4'][i], 6, [FX.VIBRATO, 0x23]);
    for (let b = 0; b < 4; b++) put(l[1], b * 8, BASS[b], 2, [FX.DOWN, 0x04]);
    for (let r = 0; r < TORTURE_ROWS; r += 4) put(l[2], r, 'C5', 3, [FX.NOISE, 0x10 - r / 2]);
  } },
  { name: 'Outro Fade', build: (l) => {
    put(l[0], 0, 'A3', 11, [FX.VOLSLIDE, 0x02], [FX.ARP, 0x37]);
    put(l[1], 0, 'A2', 11, [FX.VOLSLIDE, 0x01]);
    put(l[0], 24, 'off', 0); put(l[1], 28, 'rel', 0); put(l[2], 0, 'E3', 11); put(l[2], 30, 'off', 0);
  } },
];

export const TORTURE_SECTION_NAMES = SECTIONS.map((s) => s.name);

function pattern(i: number, s: Section): Pattern {
  const lanes: [Lane, Lane, Lane] = [0, 1, 2].map(() => Array.from({ length: TORTURE_ROWS }, emptyCell)) as [Lane, Lane, Lane];
  s.build(lanes);
  return {
    id: `torture-${i}`, name: s.name, length: TORTURE_ROWS,
    channels: lanes.map((rows, c) => ({
      id: `torture-${i}-${c}`, name: `Voice ${c + 1}`, rows, muted: false, solo: false, collapsed: false, volume: 100, pan: 0, instrumentId: null, color: null,
      channelMeta: { importedFromMOD: false, effectNotation: 'furnace', furnaceType: 1 },
    })),
  } as unknown as Pattern;
}

export function buildTortureSong(): FurnaceModuleSong {
  return {
    name: 'Vectrex Torture Test', patterns: SECTIONS.map((s, i) => pattern(i, s)), instruments: TORTURE_INSTRUMENTS,
    songPositions: SECTIONS.map((_, i) => i), initialSpeed: TORTURE_SPEED, initialBPM: TORTURE_BPM, hz: 50, keepOutsideContract: true,
  } as FurnaceModuleSong;
}
