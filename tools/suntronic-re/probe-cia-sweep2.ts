import { readFileSync } from 'fs';
import { join, resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import { parseSunTronicV13Score } from '../../src/lib/import/formats/SunTronicV13';
import { SunTronicPlayer } from '../../src/engine/suntronic/SunTronicPlayer';
const HERE = dirname(fileURLToPath(import.meta.url));
const REPO = resolve(HERE, '../..');
const CORPUS = resolve(REPO, 'public/data/songs/formats/SUNTronicTunes');
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const golden: any = JSON.parse(readFileSync(resolve(REPO,'src/engine/suntronic/__tests__/sunTronicNoteTimeline.golden.json'),'utf8'));
function run(name: string, cia: number){
  const samples = golden.modules[name];
  const score = parseSunTronicV13Score(new Uint8Array(readFileSync(join(CORPUS,name))));
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const pl = new SunTronicPlayer(score, { subsong: 0, ciaTickSamples: cia } as any);
  const tl = pl.renderTimeline(samples.length);
  let mm=0; const det:string[]=[];
  for(let i=1;i<samples.length;i++){const g=samples[i-1].voices,mv=tl[i].voices;
    for(let v=0;v<4;v++){ if(g[v].period!==mv[v].period||g[v].acc!==(mv[v].acc&0xffff)){mm++; if(det.length<3)det.push(`t${i}v${v}dP${mv[v].period-g[v].period}`);}}}
  return `${mm}/316 ${det.join(' ')}`;
}
for(const cia of [882.759, 881, 880, 878, 876, 874, 872, 870, 884, 886]){
  // eslint-disable-next-line no-console
  console.log(`cia=${cia}  gliders=${run('gliders.src',cia).padEnd(24)}  ballblaser=${run('ballblaser.src',cia)}`);
}
