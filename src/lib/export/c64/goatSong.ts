/**
 * Furnace C64 (SID) song -> GoatTracker 2 song data for Cadaver's GT2 playroutine
 * (gtultra-wasm/players/player.s, free licence), relocated by the GTUltra WASM
 * relocator (gt_export_prg) and booted by c64Prg.ts.
 *
 * Milestone 1 scope: notes, note off/release, instrument changes, instrument
 * ADSR, waveform, ring/sync, initial duty, initial filter, speed (tempo) and
 * the PAL/NTSC tick rate. Everything else is reported in `lossy`.
 */
import type { FurnaceModule } from '../../import/formats/FurnaceSongParser';
import type { FurnaceInstrument } from '../../import/formats/furnace/FurnaceInstrumentParser';
import { convertFurnaceNoteValue } from '../../import/formats/furnace/FurnacePatternParser';
import {
  emptyGTInstrument, GT_FIRSTNOTE, GT_LOOPSONG, GT_MAX_INSTR, GT_REST,
  type GTInstrument, type GTPlaySettings, type GTSongData,
} from '../../import/formats/GoatTrackerSid';
import { Lossy } from '../md/mdsSong';

/** Furnace file ids of the SID systems (DIV_SYSTEM_C64_8580, DIV_SYSTEM_C64_6581). */
export const C64_SYSTEM_IDS = [0x07, 0x47];
const GT_KEYOFF = 0xbe;
const GT_MAX_ROWS = 128;
const GT_MAX_PATT = 208;
const CMD_SETTEMPO = 0x0f;

export interface GoatSong { song: GTSongData; settings: GTPlaySettings; lossy: string[] }

export function goatSystemsSupported(sys: readonly number[]): boolean {
  return sys.length === 1 && C64_SYSTEM_IDS.includes(sys[0]);
}

/** One instrument: ADSR, a one-row wave program (waveform + gate), initial duty, initial filter. */
function instrumentOf(ins: FurnaceInstrument | undefined, idx: number, tables: GTSongData['tables'], lossy: Lossy): GTInstrument {
  const g = emptyGTInstrument();
  const c = ins?.c64;
  if (!ins || !c) return g;
  g.name = ins.name.slice(0, 16);
  g.ad = ((c.a & 15) << 4) | (c.d & 15);
  g.sr = ((c.s & 15) << 4) | (c.r & 15);
  // GT's default hard restart: 2 frames gate off before the note, test bit + gate on its first frame.
  g.gatetimer = 2;
  g.firstwave = c.noTest ? 0x01 : 0x09;
  const wave = (c.noiseOn ? 0x80 : 0) | (c.pulseOn ? 0x40 : 0) | (c.sawOn ? 0x20 : 0) | (c.triOn ? 0x10 : 0)
    | (c.ringMod ? 0x04 : 0) | (c.oscSync ? 0x02 : 0) | 0x01;
  const add = (t: number, rows: Array<[number, number]>): number => {
    const tb = tables[t];
    const pos = tb.left.length + 1;
    for (const [l, r] of rows) { tb.left.push(l); tb.right.push(r); }
    return pos;
  };
  g.ptr[0] = add(0, [[wave, 0x00], [0xff, 0x00]]);
  if (c.pulseOn) g.ptr[1] = add(1, [[0x80 | ((c.duty >> 8) & 15), c.duty & 0xff], [0xff, 0x00]]);
  if (c.initFilter) {
    const mode = (c.lp ? 0x10 : 0) | (c.bp ? 0x20 : 0) | (c.hp ? 0x40 : 0) | (c.ch3off ? 0x80 : 0);
    // shortcut: the filter routes this instrument's channel only when it starts the filter, toFilter elsewhere is lossy.
    g.ptr[2] = add(2, [[0x80 | (mode & 0x70), ((c.res & 15) << 4) | 0x07], [0x00, (c.cut >> 3) & 0xff], [0xff, 0x00]]);
  } else if (c.toFilter) lossy.add('filter routing without init filter');
  if (ins.macros.some((m) => m.length > 0)) lossy.add(`instrument ${idx} macros`);
  return g;
}

export function furnaceToGoatTracker(m: FurnaceModule, subsong: number): GoatSong {
  if (!goatSystemsSupported(m.systems)) {
    throw new Error(`C64 export needs a song with one SID chip; systems are ${m.systems.map((x) => x.toString(16)).join(',')}`);
  }
  const s = m.subsongs[subsong];
  const lossy = new Lossy();
  const tables: GTSongData['tables'] = [0, 1, 2, 3].map(() => ({ left: [] as number[], right: [] as number[] }));
  if (m.instruments.length > GT_MAX_INSTR - 1) lossy.add('instruments past 63', m.instruments.length - (GT_MAX_INSTR - 1));
  const instruments: GTInstrument[] = [emptyGTInstrument()];
  for (let i = 0; i < Math.min(m.instruments.length, GT_MAX_INSTR - 1); i++) instruments.push(instrumentOf(m.instruments[i], i, tables, lossy));

  const ntsc = Math.round(s.hz) === 60;
  if (Math.round(s.hz) !== 50 && !ntsc) lossy.add(`tick rate ${s.hz} Hz (played at 50 Hz)`);
  if (s.speed1 !== s.speed2) lossy.add('alternating speeds (speed 1 used)');
  if (s.virtualTempo !== s.virtualTempoD) lossy.add('virtual tempo');
  const tempo = Math.max(3, s.speed1);
  if (s.speed1 < 3) lossy.add(`speed ${s.speed1} (GT tempo minimum 3)`);

  // One GT pattern per (Furnace pattern, 128-row slice); shared across channels like Furnace's per-channel patterns are not.
  const patterns: number[][][] = [];
  const byKey = new Map<string, number>();
  const orderlists: number[][] = [[], [], []];
  const slices = Math.ceil(s.patLen / GT_MAX_ROWS);
  for (let ch = 0; ch < 3; ch++) {
    for (let o = 0; o < s.ordersLen; o++) {
      const pat = s.orders[ch]?.[o] ?? 0;
      for (let sl = 0; sl < slices; sl++) {
        const first = ch === 0 && o === 0 && sl === 0;
        const key = first ? 'tempo' : `${ch}_${pat}_${sl}`;
        let gi = byKey.get(key);
        if (gi === undefined) {
          const rows: number[][] = [];
          const src = m.patterns.get(`${subsong}_${ch}_${pat}`);
          for (let r = sl * GT_MAX_ROWS; r < Math.min(s.patLen, (sl + 1) * GT_MAX_ROWS); r++) {
            const cell = src?.rows[r];
            let note = GT_REST, ins = 0, cmd = 0, data = 0;
            if (cell) {
              const nv = convertFurnaceNoteValue(cell);
              if (nv === 253 || nv === 254) note = GT_KEYOFF;
              else if (nv === 255) lossy.add('macro release');
              else if (nv >= 0) {
                const gt = nv + 12; // Furnace value 45 = A-4 = GT note index 57
                if (gt < 0 || gt > 95) lossy.add('note outside GT range');
                else note = GT_FIRSTNOTE + gt;
              }
              if (cell.instrument >= 0) {
                if (cell.instrument < GT_MAX_INSTR - 1) ins = cell.instrument + 1;
                else lossy.add('instrument past 63');
              }
              if (cell.volume >= 0) lossy.add('volume column');
              for (const e of cell.effects) if (e.type >= 0) lossy.add(`effect ${e.type.toString(16).padStart(2, '0')}`);
            }
            if (first && r === 0) { cmd = CMD_SETTEMPO; data = tempo; }
            rows.push([note, ins, cmd, data]);
          }
          gi = patterns.length;
          patterns.push(rows);
          byKey.set(key, gi);
        }
        orderlists[ch].push(gi);
      }
    }
    orderlists[ch].push(GT_LOOPSONG, 0);
  }
  if (patterns.length > GT_MAX_PATT) throw new Error(`song needs ${patterns.length} GT patterns (maximum ${GT_MAX_PATT})`);
  for (let t = 0; t < 3; t++) if (tables[t].left.length > 255) throw new Error(`GT table ${t} overflows (${tables[t].left.length} rows)`);

  const song: GTSongData = { name: m.name.slice(0, 32), author: m.author.slice(0, 32), copyright: '', orderlists: [orderlists], instruments, tables, patterns };
  return { song, settings: { multiplier: 1, ntsc, adparam: 0x0f00, optimizeRealtime: true }, lossy: lossy.list() };
}
