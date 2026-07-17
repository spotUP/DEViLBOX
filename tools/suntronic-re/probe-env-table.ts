/** Compare UADE's real volEnv table bytes (instr ptr 4(A0) -> deref -> bytes)
 *  vs native parsed inst.volEnv, for voice V of a song. Uses PC/base heuristic. */
import { readFileSync } from 'fs';
import { join } from 'path';
import { loadUADEModule } from '../uade-audit/uadeRenderCore';
import { CORPUS_DIR, addCompanions, loadInstrCompanions } from './suntronicLib';
import { parseSunTronicV13Score } from '../../src/lib/import/formats/SunTronicV13';
import { SunTronicPlayer } from '../../src/engine/suntronic/SunTronicPlayer';
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyMod = any;
const SCAN_LO = 0x20000, SCAN_HI = 0x40000, STRIDE = 0x1ba;
async function main(): Promise<void> {
  const name = process.argv[2] ?? 'play11';
  const V = parseInt(process.argv[3] ?? '0', 10);
  const settle = parseInt(process.argv[4] ?? '4', 10);
  const data = new Uint8Array(readFileSync(join(CORPUS_DIR, name)));
  const mod: AnyMod = await loadUADEModule(false);
  if (mod._uade_wasm_init(44100) !== 0) throw new Error('init');
  addCompanions(mod, loadInstrCompanions());
  const load = (): void => {
    const p = mod._malloc(data.byteLength); mod.HEAPU8.set(data, p);
    const h = mod._malloc(name.length * 4 + 1); mod.stringToUTF8(name, h, name.length * 4 + 1);
    mod._uade_wasm_stop(); mod._uade_wasm_set_looping(0); mod._uade_wasm_set_one_subsong(1);
    if (mod._uade_wasm_load(p, data.byteLength, h) !== 0) throw new Error('load');
    mod._free(p); mod._free(h);
  };
  const L = mod._malloc(882 * 4), R = mod._malloc(882 * 4), cap = mod._malloc(72), rd = mod._malloc(64);
  const capU32 = (i: number): number => new Uint32Array(mod.HEAPU8.buffer)[(cap >> 2) + i] >>> 0;
  load(); const hist = new Map<number, number>();
  for (let c = 0; c < 400; c++) {
    mod._uade_wasm_arm_capture(SCAN_LO, SCAN_HI - SCAN_LO); mod._uade_wasm_arm_capture_pc(SCAN_LO, SCAN_HI);
    if (mod._uade_wasm_render(L, R, 21) <= 0) break;
    if (mod._uade_wasm_get_capture(cap)) hist.set(capU32(16), (hist.get(capU32(16)) ?? 0) + 1);
  }
  let wpc = 0, wbest = -1; for (const [p, n] of hist) if (n > wbest) { wbest = n; wpc = p; }
  load(); let base0 = 0xffffffff;
  for (let c = 0; c < 120; c++) {
    mod._uade_wasm_arm_capture(SCAN_LO, SCAN_HI - SCAN_LO); mod._uade_wasm_arm_capture_pc(wpc, (wpc + 2) >>> 0);
    if (mod._uade_wasm_render(L, R, 21) <= 0) break;
    if (mod._uade_wasm_get_capture(cap)) { const a0 = capU32(8); if (a0 >= SCAN_LO && a0 < SCAN_HI && a0 < base0) base0 = a0; }
  }
  const b = (base0 + V * STRIDE) >>> 0;
  load();
  const rd32 = (addr: number): number => { mod._uade_wasm_read_memory(addr >>> 0, rd, 4); return ((mod.HEAPU8[rd] << 24) | (mod.HEAPU8[rd+1] << 16) | (mod.HEAPU8[rd+2] << 8) | mod.HEAPU8[rd+3]) >>> 0; };
  const rdBytes = (addr: number, n: number): number[] => { mod._uade_wasm_read_memory(addr >>> 0, rd, n); const o: number[] = []; for (let i = 0; i < n; i++) o.push(mod.HEAPU8[rd + i]); return o; };
  for (let c = 0; c < settle; c++) mod._uade_wasm_render(L, R, 882);
  const instrPtr = rd32(b + 4);          // 4(A0)
  const envBase = rd32(instrPtr);         // (A1)
  const lenLoop = rdBytes(instrPtr + 4, 4); // 4(A1)=len word, 6(A1)=loop word
  console.log(`voice${V} base=0x${b.toString(16)} instrPtr=0x${instrPtr.toString(16)} envBase=0x${envBase.toString(16)}`);
  console.log('UADE env[0..15]:', rdBytes(envBase, 16).join(','));
  console.log('UADE len(word@+4)=', (lenLoop[0]<<8)|lenLoop[1], 'loop(word@+6)=', (lenLoop[2]<<8)|lenLoop[3]);
  const score = parseSunTronicV13Score(data);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const player: any = new (SunTronicPlayer as any)(score);
  for (let c = 0; c < settle; c++) player.stepVblankOnce();
  const vs = player.voices[V]; const inst = vs.instr ?? vs.sampled;
  console.log('NATIVE volEnv:', inst ? Array.from(inst.volEnv.slice(0,16)).join(',') : 'null', 'len=', inst?.volEnvLen, 'loop=', inst?.volEnvLoop, 'volEnvIdx=', vs.volEnvIndex);
  console.log('tick\t$0C\t$0D\t$10\t$15\t|\tnvol\tnidx\tnout');
  for (let c = 0; c < 12; c++) {
    const bb = rdBytes(b + 0x0c, 2); const idx = rdBytes(b + 0x10, 2); const o = rdBytes(b + 0x15, 1)[0];
    const nv = player.voices[V];
    console.log([c, bb[0], (bb[1]<<24>>24), (idx[0]<<8)|idx[1], o, '|', nv.volume&0xff, nv.volEnvIndex, nv.outVolume&0xff].join('\t'));
    mod._uade_wasm_render(L, R, 882); player.stepVblankOnce();
  }
}
main().catch((e) => { console.error(e); process.exit(1); });
