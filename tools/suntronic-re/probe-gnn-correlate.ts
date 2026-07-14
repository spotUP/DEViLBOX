/** probe-gnn-correlate.ts — correlate native GNN (note-boundary) ticks with UADE's +16000
 * vibrato ticks. Native GNN tick = tempoTick returns to 0. If they coincide, note-boundary
 * ticks get an extra vibrato advance in UADE. NOT committed. */
import { readFileSync } from 'fs';
import { join } from 'path';
import { CORPUS_DIR } from './suntronicLib';
import { parseSunTronicV13Score } from '../../src/lib/import/formats/SunTronicV13';
import { SunTronicPlayer } from '../../src/engine/suntronic/SunTronicPlayer';
const NAME = process.argv[2] ?? 'gliders.src';
const data = new Uint8Array(readFileSync(join(CORPUS_DIR, NAME)));
const score = parseSunTronicV13Score(data);
const player = new SunTronicPlayer(score, { subsong: 0 });
const gnn: number[] = [];
let prevTT = -1;
for (let i = 0; i < 20; i++) {
  player.tick();
  const tt = player.debugVoice(0).tempoTick;
  // GNN fired this tick if tempoTick reset to 0 (or advanced then wrapped)
  if (tt === 0) gnn.push(i);
  prevTT = tt;
}
void prevTG(); function prevTG(): void {}
console.log(`${NAME} native v0 GNN-ish ticks (tempoTick==0): ${gnn.join(',')}`);
console.log(`speed=${player.debugVoice(0).speed} rowsPerPos=${player.debugVoice(0).rowsPerPos}`);
console.log(`UADE +16000 vib ticks (from clean emitter): gliders 4,11,17 | ballblaser 4,11,17`);
