/** Dump native INTERNAL voice[V] (not snapshot): pitch, pitchSlide, period, volume,
 *  cursor, instrOff per vblank for a song — to see the actual slide native applies. */
import { readFileSync } from 'fs'; import { join } from 'path';
import { CORPUS_DIR } from './suntronicLib';
import { parseSunTronicV13Score } from '../../src/lib/import/formats/SunTronicV13';
import { SunTronicPlayer } from '../../src/engine/suntronic/SunTronicPlayer';
const name = process.argv[2] ?? 'suntronic-k3.src'; const V = parseInt(process.argv[3] ?? '0', 10);
const data = new Uint8Array(readFileSync(join(CORPUS_DIR, name)));
const score = parseSunTronicV13Score(data);
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const player: any = new (SunTronicPlayer as any)(score);
console.log('tick\tpitch\tslide\tperiod\tvol\tcursor\tinstrOff');
for (let c = 0; c < 20; c++) {
  player.stepVblankOnce();
  const v = player.voices[V];
  console.log([c, '0x'+(v.pitch&0xffff).toString(16), v.pitchSlide, v.period, v.volume&0xff, '0x'+(v.cursor>>>0).toString(16), v.instrOff].join('\t'));
}
