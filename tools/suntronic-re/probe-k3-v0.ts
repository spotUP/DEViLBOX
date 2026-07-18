/** Dump native voice-0 internals per vblank for suntronic-k3: is the octave cycle
 *  from the arp path (arpSel/arpIndex/drin) or the base note/pitch-slide decode?
 *  UADE does a ×1.35/tick pitch SLIDE; native cycles 6 octave periods. */
import { readFileSync } from 'fs'; import { join } from 'path';
import { CORPUS_DIR } from './suntronicLib';
import { parseSunTronicV13Score } from '../../src/lib/import/formats/SunTronicV13';
import { SunTronicPlayer } from '../../src/engine/suntronic/SunTronicPlayer';
const name = process.argv[2] ?? 'suntronic-k3.src'; const V = parseInt(process.argv[3] ?? '0', 10);
const data = new Uint8Array(readFileSync(join(CORPUS_DIR, name)));
const score = parseSunTronicV13Score(data);
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const player: any = new (SunTronicPlayer as any)(score);
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const s: any = score;
console.log('arpShift=', s.arpShift, 'arpPhaseMask=', s.arpPhaseMask, 'version=', s.version);
const keys = ['period','pitch','arpSel','arpIndex','arpPhase','volume','pitchSlide','flags','instrOff'];
console.log('tick ' + keys.join('\t'));
for (let c = 0; c < 24; c++) {
  const v = player.stepVblankOnce().voices[V];
  console.log(c + '   ' + keys.map(k => (k in v ? v[k] : '·')).join('\t'));
}
