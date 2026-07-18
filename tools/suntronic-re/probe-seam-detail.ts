/** Per-tick native-vs-UADE PER+VOL across the loop seam (tick 2540-2580).
 * Shows WHICH voice diverges at the restart and by how much. */
import { readFileSync } from 'fs';
import { join } from 'path';
import { loadUADEModule } from '../uade-audit/uadeRenderCore';
import { CORPUS_DIR, addCompanions, loadInstrCompanions } from './suntronicLib';
import { parseSunTronicV13Score } from '../../src/lib/import/formats/SunTronicV13';
import { SunTronicPlayer } from '../../src/engine/suntronic/SunTronicPlayer';
import { paulaAudxVol } from '../../src/engine/suntronic/SunTronicNativeRender';
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyMod = any;
const REG_PER = 3, REG_VOL = 4;
async function main(): Promise<void> {
  const name = process.argv[2] ?? 'ready';
  const lo = parseInt(process.argv[3] ?? '2540', 10), hi = parseInt(process.argv[4] ?? '2585', 10);
  const data = new Uint8Array(readFileSync(join(CORPUS_DIR, name)));
  const mod: AnyMod = await loadUADEModule(false);
  if (mod._uade_wasm_init(44100) !== 0) throw new Error('init');
  addCompanions(mod, loadInstrCompanions());
  const ptr = mod._malloc(data.byteLength); mod.HEAPU8.set(data, ptr);
  const hp = mod._malloc(name.length * 4 + 1); mod.stringToUTF8(name, hp, name.length * 4 + 1);
  mod._uade_wasm_stop(); mod._uade_wasm_set_looping(1); mod._uade_wasm_set_one_subsong(1);
  if (mod._uade_wasm_load(ptr, data.byteLength, hp) !== 0) throw new Error('load');
  mod._free(ptr); mod._free(hp);
  const L = mod._malloc(882*4), R = mod._malloc(882*4), lg = mod._malloc(512*3*4);
  mod._uade_wasm_enable_paula_log(1);
  const uP: number[][] = [[],[],[],[]], uV: number[][] = [[],[],[],[]];
  const curV = [-1,-1,-1,-1], hP = [-1,-1,-1,-1], hV = [-1,-1,-1,-1];
  for (let c=0;c<hi+2;c++){ if (mod._uade_wasm_render(L,R,882)<=0) break;
    const n=mod._uade_wasm_get_paula_log(lg,512); const h=new Uint32Array(mod.HEAPU8.buffer); const b=lg>>2;
    for (let i=0;i<n;i++){ const pk=h[b+i*3]; const ch=(pk>>>24)&0xff,rg=(pk>>>16)&0xff,vl=pk&0xffff;
      if(ch>3)continue; if(rg===REG_VOL)curV[ch]=vl; else if(rg===REG_PER){hP[ch]=vl;hV[ch]=curV[ch];} }
    for(let v=0;v<4;v++){uP[v].push(hP[v]);uV[v].push(hV[v]);} }
  mod._free(L);mod._free(R);mod._free(lg); try{mod._uade_wasm_cleanup();}catch{/**/}
  const score = parseSunTronicV13Score(data);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const p: any = new (SunTronicPlayer as any)(score);
  console.log('tick | pos | v0 nP/uP nV/uV | v1 | v2 | v3   (* = mismatch)');
  for (let c=0;c<hi+1;c++){ const s=p.stepVblankOnce();
    if(c<lo) continue;
    const pos=p.debugVoice(0).position;
    let row=`${String(c).padStart(4)} | ${String(pos).padStart(3)} |`;
    for(let v=0;v<4;v++){ const nP=s.voices[v].period, nV=paulaAudxVol(s.voices[v].outVolume&0xff);
      const up=uP[v][c],uv=uV[v][c];
      const pm=Math.abs(nP-up)>8?'*':' ', vm=nV!==uv?'*':' ';
      row+=` ${String(nP).padStart(4)}/${String(up).padStart(4)}${pm}${String(nV).padStart(2)}/${String(uv).padStart(2)}${vm}|`; }
    console.log(row); }
}
main().catch(e=>{console.error(e);process.exit(1);});
