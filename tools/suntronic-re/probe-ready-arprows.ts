import { readFileSync } from 'fs';
import { parseSunTronicV13Score } from '../../src/lib/import/formats/SunTronicV13';
import { SunTronicPlayer } from '../../src/engine/suntronic/SunTronicPlayer';

const buf = new Uint8Array(readFileSync('/Users/spot/Code/DEViLBOX/public/data/songs/SUNTronicTunes/ready'));
const score = parseSunTronicV13Score(buf);
const player = new SunTronicPlayer(score);
const drin = score.drin ?? new Int8Array(256 << score.arpShift);
const mask = (1 << score.arpShift) - 1;

// Resolved integer semitone per tick for voice 1 = (pitch>>8) - drin[d5], grouped by grammar row.
const rows: Record<string, number[]> = {};
const rowNoteOn: Record<string, boolean> = {};
let noteOn = false;
player.rowRecorder = (ch: number) => { if (ch === 1) noteOn = true; };

for (let t = 0; t < 2555; t++) {
  noteOn = false;
  player.stepVblankOnce();
  const vv = (player as any).voices[1];
  const dbg = (player as any).debugVoice ? (player as any).debugVoice(1) : { position: vv.position, tempoNote: vv.tempoNote };
  const key = `${dbg.position}:${dbg.tempoNote}`;
  const d5 = ((vv.arpSel & 0xff) << score.arpShift) + (vv.arpPhase & mask);
  const note = ((vv.pitch >> 8) & 0xff) - (drin[d5] ?? 0);
  if (vv.outVolume > 0) (rows[key] ??= []).push(note);
  if (noteOn) rowNoteOn[key] = true;
}

const keys = Object.keys(rows);
let oneN = 0, multiN = 0, blankAudible = 0;
for (const k of keys) {
  const distinct = new Set(rows[k]).size;
  if (distinct <= 1) oneN++; else multiN++;
  if (!rowNoteOn[k]) blankAudible++;   // audible row, no note-on this row = "blank cell, note plays"
}
console.log(`voice1 grammar-rows with audio: ${keys.length}`);
console.log(`  1 distinct semitone: ${oneN}`);
console.log(`  >1 distinct semitone (arp steps within row): ${multiN}`);
console.log(`  audible rows with NO note-on (blank cell, note plays): ${blankAudible}`);
console.log('sample multi-semitone rows:',
  keys.filter(k => new Set(rows[k]).size > 1).slice(0, 6)
    .map(k => `${k}{${[...new Set(rows[k])].sort((a,b)=>a-b).join(',')}}`).join('  '));
