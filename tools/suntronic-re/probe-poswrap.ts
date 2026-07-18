/**
 * probe-poswrap.ts — print voice position transitions to find the loop point
 * and every tick where a voice enters position 4.
 *   TSX_TSCONFIG_PATH=tsconfig.app.json npx tsx tools/suntronic-re/probe-poswrap.ts [song] [ticks]
 */
import { readFileSync } from 'fs';
import { join } from 'path';
import { CORPUS_DIR } from './suntronicLib';
import { parseSunTronicV13Score } from '../../src/lib/import/formats/SunTronicV13';
import { SunTronicPlayer } from '../../src/engine/suntronic/SunTronicPlayer';

const name = process.argv[2] ?? 'ready';
const ticks = parseInt(process.argv[3] ?? '2000', 10);
const data = new Uint8Array(readFileSync(join(CORPUS_DIR, name)));
const score = parseSunTronicV13Score(data);
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const player: any = new (SunTronicPlayer as any)(score);
const prev = [-1, -1, -1, -1];
for (let c = 0; c < ticks; c++) {
  player.stepVblankOnce();
  for (let v = 0; v < 4; v++) {
    const p = player.debugVoice(v).position;
    if (p !== prev[v]) {
      const wrap = p < prev[v] ? '  <== WRAP' : '';
      console.log(`tick ${String(c).padStart(4)}  v${v}  pos ${prev[v]} -> ${p}${wrap}`);
      prev[v] = p;
    }
  }
}
