/**
 * probe-note-stream.ts — coordinate-free display-fidelity oracle.
 *
 * Compares the ORDERED note-on subsequence produced by walkV13Voice (the editable
 * grid the user sees) against the ordered note-on subsequence the SunTronicPlayer
 * fires, per voice. No position/row keying — pure stream order. If the grid decodes
 * the same command stream as the player, the two ordered lists are IDENTICAL.
 * Any divergence is a real display bug (a note shown out of order / missing / extra).
 *
 * Run: npx tsx tools/suntronic-re/probe-note-stream.ts <file.src>
 */
import { readFileSync } from 'fs';
import { join } from 'path';
import { parseSunTronicFile } from '../../src/lib/import/formats/SunTronicParser';
import { parseSunTronicV13Score, sunPitchToNote } from '../../src/lib/import/formats/SunTronicV13';
import { SunTronicPlayer } from '../../src/engine/suntronic/SunTronicPlayer';

const name = process.argv[2] ?? 'analgestic2.src';
const path = join(process.cwd(), 'public/data/songs/formats/SUNTronicTunes', name);
const buf = readFileSync(path);
const ab = buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength);

// ── grid: ordered note-on list per channel (pattern rows are already in stream order) ──
const song: any = parseSunTronicFile(ab, name);
const gridSeq: number[][] = [[], [], [], []];
for (const pat of song.patterns) {
  for (let ch = 0; ch < Math.min(4, pat.channels.length); ch++) {
    for (const cell of pat.channels[ch].rows) {
      if (cell && cell.note && cell.note > 0) gridSeq[ch].push(cell.note);
    }
  }
}

// ── player: ordered note-on list per channel (fire order) ──
const score = parseSunTronicV13Score(new Uint8Array(ab));
const player: any = new SunTronicPlayer(score);
const playSeq: number[][] = [[], [], [], []];
player.rowRecorder = (ch: number, _pos: number, _row: number, note: number) => {
  if (ch >= 0 && ch < 4) playSeq[ch].push(sunPitchToNote(note));
};
let started = false, prevPos0 = 0;
for (let t = 0; t < 200000; t++) {
  player.stepVblankOnce();
  const pos0 = player.debugVoice(0).position;
  if (pos0 > 0) started = true;
  if (started && pos0 === 0 && prevPos0 > 0) break;
  prevPos0 = pos0;
}

// ── diff ordered subsequences per voice ──
for (let ch = 0; ch < 4; ch++) {
  const g = gridSeq[ch], p = playSeq[ch];
  let i = 0;
  while (i < g.length && i < p.length && g[i] === p[i]) i++;
  const tag = i === g.length && i === p.length ? 'MATCH' : `DIVERGE@${i}`;
  console.log(`ch ${ch}: grid ${g.length} notes, play ${p.length} notes — ${tag}`);
  if (i !== g.length || i !== p.length) {
    console.log(`  grid[${i}..]: ${g.slice(i, i + 12).join(',')}`);
    console.log(`  play[${i}..]: ${p.slice(i, i + 12).join(',')}`);
  }
}
