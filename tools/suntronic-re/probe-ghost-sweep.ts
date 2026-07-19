/**
 * probe-ghost-sweep.ts — measure residual ghost notes across the whole SunTronic
 * corpus. A "ghost" = a player noteOn (rowRecorder) with no matching grid cell
 * (walkV13Voice / gridNoteKeys). Reuses the exact ghostCount logic from
 * sunTronicGhostNotes.test.ts so the numbers line up with the regression gate.
 *
 * Run: npx tsx tools/suntronic-re/probe-ghost-sweep.ts [file.src]
 */
import { readFileSync, readdirSync } from 'fs';
import { join } from 'path';
import {
  parseSunTronicV13Score,
  sunCommandLen,
  sunPitchToNote,
  type SunV13Score,
} from '../../src/lib/import/formats/SunTronicV13';
import { SunTronicPlayer } from '../../src/engine/suntronic/SunTronicPlayer';

const CORPUS = join(process.cwd(), 'public/data/songs/formats/SUNTronicTunes');
const load = (name: string): Uint8Array => new Uint8Array(readFileSync(join(CORPUS, name)));

/** Grid note per key. The value is the FIRST note byte in the group (mirrors
 * decodeSunGroup "first note wins" — what the editable cell displays). We also
 * record every note byte in the group to detect multi-note groups. */
function gridNoteMap(score: SunV13Score): { first: Map<string, number>; all: Map<string, number[]> } {
  const s = score as any;
  const h1: Uint8Array = s.h1;
  const bmap: Map<number, number> = s.blockIndexByOffset;
  const sub = s.subsongs[0];
  const widths = { arpShift: s.arpShift, volSlideRateFromStream: s.volSlideRateFromStream };
  const first = new Map<string, number>();
  const all = new Map<string, number[]>();
  if (!sub) return { first, all };
  for (let voice = 0; voice < 4; voice++) {
    let rowsPerPos = s.rowsPerPositionDefault;
    for (let posIdx = 0; posIdx < sub.entries.length; posIdx++) {
      const entry = sub.entries[posIdx];
      const ptr = entry.trackPtrs[voice] >>> 0;
      const transpose = entry.transposes[voice];
      const fp = bmap.get(ptr) ?? -1;
      if (fp < 0 || ptr >= h1.length) continue;
      let pos = ptr;
      for (let r = 0; r < rowsPerPos; r++) {
        const key = `${voice}:${posIdx}:${r}`;
        for (;;) {
          if (pos >= h1.length) break;
          const b = h1[pos];
          const len = sunCommandLen(h1, pos, widths);
          if (b === 0x00) { pos += len; break; }
          if (b >= 0xb8) {
            const note = sunPitchToNote(((~b) & 0xff) - transpose);
            if (note !== 0) {
              if (!first.has(key)) first.set(key, note);
              (all.get(key) ?? all.set(key, []).get(key)!).push(note);
            }
          } else if (b === 0x8c || b === 0x8b) {
            const a = h1[pos + 1]; if (a >= 1) rowsPerPos = a;
          }
          pos += len;
        }
      }
    }
  }
  return { first, all };
}

function gridNoteKeys(score: SunV13Score): Set<string> {
  return new Set(gridNoteMap(score).first.keys());
}

interface GhostRec { key: string; note: number; }

function ghostDetails(name: string): { ghosts: GhostRec[]; fires: number } {
  const score = parseSunTronicV13Score(load(name));
  const grid = gridNoteKeys(score);
  const player: any = new SunTronicPlayer(score);
  const ghosts: GhostRec[] = [];
  let fires = 0;
  player.rowRecorder = (ch: number, position: number, row: number, note: number) => {
    fires++;
    if (!grid.has(`${ch}:${position}:${row - 1}`)) ghosts.push({ key: `${ch}:${position}:${row - 1}`, note });
  };
  let started = false, prevPos0 = 0;
  for (let t = 0; t < 30000; t++) {
    player.stepVblankOnce();
    const pos0 = player.debugVoice(0).position;
    if (pos0 > 0) started = true;
    if (started && pos0 === 0 && prevPos0 > 0) break;
    prevPos0 = pos0;
  }
  return { ghosts, fires };
}

/** Deeper comparison: player note value at each key vs grid FIRST note.
 * mismatch = grid shows a note but the player's fire at that key is a DIFFERENT
 * pitch (wrong-note ghost, invisible to the presence-only metric). Also reports
 * multi-note groups (grid.all[key].length > 1 = the "first note wins" drop). */
function valueMismatch(name: string): { mismatches: Array<{ key: string; grid: number; played: number }>; multi: Array<{ key: string; notes: number[] }> } {
  const score = parseSunTronicV13Score(load(name));
  const { first, all } = gridNoteMap(score);
  const player: any = new SunTronicPlayer(score);
  // Last player note per key (last fire wins audibly on a single voice).
  const playedLast = new Map<string, number>();
  player.rowRecorder = (ch: number, position: number, row: number, note: number) => {
    playedLast.set(`${ch}:${position}:${row - 1}`, note);
  };
  let started = false, prevPos0 = 0;
  for (let t = 0; t < 30000; t++) {
    player.stepVblankOnce();
    const pos0 = player.debugVoice(0).position;
    if (pos0 > 0) started = true;
    if (started && pos0 === 0 && prevPos0 > 0) break;
    prevPos0 = pos0;
  }
  const mismatches: Array<{ key: string; grid: number; played: number }> = [];
  for (const [key, played] of playedLast) {
    const g = first.get(key);
    if (g !== undefined && g !== played) mismatches.push({ key, grid: g, played });
  }
  const multi: Array<{ key: string; notes: number[] }> = [];
  for (const [key, notes] of all) if (notes.length > 1) multi.push({ key, notes });
  return { mismatches, multi };
}

const arg = process.argv[2];
if (arg === '--values') {
  const files = readdirSync(CORPUS).filter((f) => /\.(src|sun|tsm|pc)$/i.test(f) || f === 'ready');
  let dirty = 0;
  for (const f of files) {
    try {
      const { mismatches, multi } = valueMismatch(f);
      if (mismatches.length > 0 || multi.length > 0) {
        dirty++;
        console.log(`${f}: ${mismatches.length} wrong-note, ${multi.length} multi-note-groups`);
        for (const m of mismatches.slice(0, 4)) console.log(`   mism ${m.key} grid=${m.grid} played=${m.played}`);
        for (const m of multi.slice(0, 4)) console.log(`   multi ${m.key} notes=${m.notes.join(',')}`);
      }
    } catch { /* skip */ }
  }
  console.log(`\n${dirty} files with wrong-note or multi-note divergence`);
} else if (arg) {
  const { ghosts, fires } = ghostDetails(arg);
  console.log(`${arg}: ${ghosts.length} ghosts / ${fires} fires`);
  const { mismatches, multi } = valueMismatch(arg);
  console.log(`  wrong-note: ${mismatches.length}, multi-note-groups: ${multi.length}`);
  for (const m of mismatches.slice(0, 20)) console.log(`   mism ${m.key} grid=${m.grid} played=${m.played}`);
  for (const m of multi.slice(0, 20)) console.log(`   multi ${m.key} notes=${m.notes.join(',')}`);
} else {
  const files = readdirSync(CORPUS).filter((f) => /\.(src|sun|tsm|pc)$/i.test(f) || f === 'ready');
  const rows: Array<{ name: string; ghosts: number; fires: number }> = [];
  for (const f of files) {
    try {
      const { ghosts, fires } = ghostDetails(f);
      rows.push({ name: f, ghosts: ghosts.length, fires });
    } catch (e) {
      rows.push({ name: f, ghosts: -1, fires: -1 });
    }
  }
  rows.sort((a, b) => b.ghosts - a.ghosts);
  let dirty = 0;
  for (const r of rows) {
    if (r.ghosts > 0) { dirty++; console.log(`${r.ghosts.toString().padStart(5)} / ${r.fires.toString().padStart(5)}  ${r.name}`); }
  }
  console.log(`\n${dirty}/${rows.length} files have residual ghosts`);
}
