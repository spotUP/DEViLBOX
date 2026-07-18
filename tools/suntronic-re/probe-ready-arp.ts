import { readFileSync } from 'fs';
import { parseSunTronicV13Score } from '../../src/lib/import/formats/SunTronicV13';
import { SunTronicPlayer } from '../../src/engine/suntronic/SunTronicPlayer';

const path = '/Users/spot/Code/DEViLBOX/public/data/songs/SUNTronicTunes/ready';
const buf = new Uint8Array(readFileSync(path));
const score = parseSunTronicV13Score(buf);
console.log('arpShift', score.arpShift, 'drinLen', score.drin?.length, 'drinNonzero',
  score.drin ? score.drin.reduce((a, b) => a + (b !== 0 ? 1 : 0), 0) : 'no-drin');

const player = new SunTronicPlayer(score);

// Record per-tick per-voice: noteOn fired?, arpSel, arpPhase, resolved transpose (drin), audible
type Rec = { tick: number; voice: number; noteOn: boolean; arpSel: number; drinVal: number; period: number; outVol: number };
const recs: Rec[] = [];
let noteOnThisTick: boolean[] = [false, false, false, false];

player.rowRecorder = (ch: number) => { noteOnThisTick[ch] = true; };

const drin = score.drin ?? new Int8Array(256 << score.arpShift);
const TICKS = 2600; // ready loops ~2555
for (let t = 0; t < TICKS; t++) {
  noteOnThisTick = [false, false, false, false];
  player.stepVblankOnce();
  for (let v = 0; v < 4; v++) {
    const vv = (player as any).voices[v];
    const d5 = ((vv.arpSel & 0xff) << score.arpShift) + (vv.arpPhase & ((1 << score.arpShift) - 1));
    recs.push({
      tick: t, voice: v, noteOn: noteOnThisTick[v],
      arpSel: vv.arpSel & 0xff, drinVal: drin[d5] ?? 0,
      period: vv.period, outVol: vv.outVolume,
    });
  }
}

// For each voice: how many ticks are AUDIBLE (outVol>0) with a MOVING arp (drinVal!=0) and NO noteOn?
for (let v = 0; v < 4; v++) {
  const vr = recs.filter(r => r.voice === v);
  const audible = vr.filter(r => r.outVol > 0);
  const arpMoved = vr.filter(r => r.outVol > 0 && r.drinVal !== 0 && !r.noteOn);
  const arpSelSet = new Set(vr.map(r => r.arpSel));
  console.log(`voice ${v}: audibleTicks=${audible.length} arpMovedNoNoteOn=${arpMoved.length} arpSels=${[...arpSelSet].join(',')}`);
}
