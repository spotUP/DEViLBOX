/**
 * probe-grid-vs-player-pos.ts — compare the REAL editable grid (parseSunTronicFile,
 * i.e. walkV13Voice) against SunTronicPlayer fires, per song-position. Unlike
 * probe-ghost-sweep.ts (which reimplements the grid walk), this reads the ACTUAL
 * parser output cells (sunPosition-stamped) so any walkV13Voice-only bug shows up.
 *
 * Run: npx tsx tools/suntronic-re/probe-grid-vs-player-pos.ts <file.src> [pos]
 */
import { readFileSync } from 'fs';
import { join } from 'path';
import { parseSunTronicFile } from '../../src/lib/import/formats/SunTronicParser';
import { parseSunTronicV13Score, sunPitchToNote } from '../../src/lib/import/formats/SunTronicV13';
import { SunTronicPlayer } from '../../src/engine/suntronic/SunTronicPlayer';

const name = process.argv[2] ?? 'analgestic2.src';
const focusPos = process.argv[3] !== undefined ? parseInt(process.argv[3], 10) : -1;
const path = join(process.cwd(), 'public/data/songs/formats/SUNTronicTunes', name);
const buf = readFileSync(path);
const ab = buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength);

// ── grid: real parser cells, indexed by (channel, sunPosition) -> set of notes ──
const song: any = parseSunTronicFile(ab, name);
// Rebuild per-voice cell lists from patterns (channelMeta order = channel).
// parseSunTronicV13File stamps sunPosition on each cell; collect note per (ch,pos).
const gridByChPos = new Map<string, Set<number>>();
const gridRowNote = new Map<string, number>(); // ch:pos:row -> note
for (const pat of song.patterns) {
  for (let ch = 0; ch < pat.channels.length; ch++) {
    for (const cell of pat.channels[ch].rows) {
      if (!cell) continue;
      const p = cell.sunPosition;
      if (p === undefined) continue;
      if (cell.note && cell.note > 0) {
        const k = `${ch}:${p}`;
        (gridByChPos.get(k) ?? gridByChPos.set(k, new Set()).get(k)!).add(cell.note);
        if (cell.sunRowInBlock !== undefined) gridRowNote.set(`${ch}:${p}:${cell.sunRowInBlock}`, cell.note);
      }
    }
  }
}

// ── player: fires per (channel, position) ──
const score = parseSunTronicV13Score(new Uint8Array(ab));
const player: any = new SunTronicPlayer(score);
const playByChPos = new Map<string, Set<number>>();
const playRowNote = new Map<string, number>(); // ch:pos:row -> note (last fire wins)
player.rowRecorder = (ch: number, position: number, row: number, note: number) => {
  const gridNote = sunPitchToNote(note); // player emits raw pitch; grid stores raw+13
  const k = `${ch}:${position}`;
  (playByChPos.get(k) ?? playByChPos.set(k, new Set()).get(k)!).add(gridNote);
  playRowNote.set(`${ch}:${position}:${row - 1}`, gridNote);
};
let started = false, prevPos0 = 0;
for (let t = 0; t < 60000; t++) {
  player.stepVblankOnce();
  const pos0 = player.debugVoice(0).position;
  if (pos0 > 0) started = true;
  if (started && pos0 === 0 && prevPos0 > 0) break;
  prevPos0 = pos0;
}

// ── diff ──
let ghostTotal = 0;
const positions = new Set<number>();
for (const k of playByChPos.keys()) positions.add(parseInt(k.split(':')[1], 10));
for (const k of gridByChPos.keys()) positions.add(parseInt(k.split(':')[1], 10));
const sorted = [...positions].sort((a, b) => a - b);
for (const p of sorted) {
  if (focusPos >= 0 && p !== focusPos) continue;
  for (let ch = 0; ch < 4; ch++) {
    const k = `${ch}:${p}`;
    const grid = gridByChPos.get(k) ?? new Set();
    const play = playByChPos.get(k) ?? new Set();
    const ghosts = [...play].filter((n) => !grid.has(n)); // played, not in grid
    const orphans = [...grid].filter((n) => !play.has(n)); // grid, never played
    if (ghosts.length || orphans.length || focusPos >= 0) {
      ghostTotal += ghosts.length;
      console.log(
        `pos ${p} ch ${ch}: grid={${[...grid].sort((a,b)=>a-b).join(',')}} play={${[...play].sort((a,b)=>a-b).join(',')}}` +
        (ghosts.length ? `  GHOST(played,no-cell)=${ghosts.join(',')}` : '') +
        (orphans.length ? `  ORPHAN(cell,unplayed)=${orphans.join(',')}` : ''),
      );
    }
  }
}
console.log(`\n${name}: ${ghostTotal} ghost note-values (played but absent from grid position)`);

// ── ROW-LEVEL diff: note plays at a row whose grid cell is blank/different ──
console.log('\n--- row-level (hear notes, grid row blank) ---');
let rowGhost = 0;
const allRowKeys = new Set([...playRowNote.keys(), ...gridRowNote.keys()]);
const rk = [...allRowKeys].sort();
for (const key of rk) {
  const [ch, p, r] = key.split(':').map(Number);
  if (focusPos >= 0 && p !== focusPos) continue;
  const g = gridRowNote.get(key);
  const pl = playRowNote.get(key);
  if (pl !== undefined && g === undefined) { rowGhost++; console.log(`ch ${ch} pos ${p} row ${r}: PLAYS ${pl}, grid cell BLANK`); }
  else if (pl !== undefined && g !== undefined && pl !== g) { rowGhost++; console.log(`ch ${ch} pos ${p} row ${r}: plays ${pl}, grid shows ${g} (mismatch)`); }
}
console.log(`\n${name}: ${rowGhost} row-level ghosts`);
