/**
 * ready-playertrace.ts — dump the native player timeline (position/instr/period/
 * outVolume/flags per voice per bucket) to find where v2/v3 freeze (t~1.84s).
 */
import { readFileSync } from 'fs';
import { join } from 'path';
import { parseSunTronicV13Score } from '../../src/lib/import/formats/SunTronicV13';
import { SunTronicPlayer } from '../../src/engine/suntronic/SunTronicPlayer';
import { CORPUS_DIR } from './suntronicLib';

const data = new Uint8Array(readFileSync(join(CORPUS_DIR, process.env.SONG ?? 'ready')));
const score = parseSunTronicV13Score(data);
const p = new SunTronicPlayer(score);
const N = Number(process.env.BUCKETS ?? 120);
const voices = (process.env.VOICES ?? '2,3').split(',').map(Number);
let prev: Record<number, string> = {};
for (let b = 0; b < N; b++) {
  const t = p.tick();
  const dbg = voices.map((v) => p.debugVoice(v));
  for (let i = 0; i < voices.length; i++) {
    const v = voices[i];
    const s = t.voices[v];
    const d = dbg[i];
    const line = `pos${d.position} cur? instr${s.instrOff} per${s.period} vol${s.volume} outV${s.outVolume} fl${s.flags.toString(16)} tNote${d.tempoNote} tTick${d.tempoTick}`;
    if (line.replace(/per\d+ /, '').replace(/outV\d+ /, '') !== (prev[v] ?? '').replace(/per\d+ /, '').replace(/outV\d+ /, '') || b < 4) {
      const tsec = (b * 1024 / 44100).toFixed(2);
      console.log(`b${b} t${tsec}s v${v}: ${line}`);
    }
    prev[v] = line;
  }
}
