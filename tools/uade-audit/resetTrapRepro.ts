/**
 * resetTrapRepro.ts — F1 of thoughts/shared/plans/2026-10-02-format-breakage-todos.md
 *
 * Reproduces, headless and deterministic, the trap the UADE worklet hits on
 * every load after a rendered song:
 *
 *   protocol error: receiving in S state is forbidden
 *   uadecore: Invalid input. Expected score name.
 *   [uade-wasm] FATAL: unguarded exit(1)
 *   RuntimeError: unreachable            (from _uade_wasm_full_reset)
 *
 * Same result on HEAD's bundle and on the 2026-09-24 bundle (a3fb9afa6), so it
 * is not a regression of the 09-28/29 rebuilds; the worklet has been hiding it
 * with a full WASM reinit per load.
 *
 *   npx tsx --tsconfig tsconfig.app.json tools/uade-audit/resetTrapRepro.ts \
 *     public/uade/UADE.js public/uade/UADE.wasm \
 *     "public/data/songs/formats/wicked.wb" "public/data/songs/formats/eco.gray"
 *
 *   PRE=stop|cleanup|render-to-end  runs that call before the reset (none help).
 *
 * Prints VERDICT OK once the reset survives a rendered song.
 */
import { readFileSync } from 'node:fs';
import { runInThisContext } from 'node:vm';

const [, , jsPath, wasmPath, songA, songB, chunksArg] = process.argv;
const CHUNKS = Number(chunksArg ?? 12);
const CHUNK = 4096;

const lines: string[] = [];
let memory: WebAssembly.Memory | null = null;
const say = (s: string) => { lines.push(s); process.stdout.write(s + '\n'); };

async function load(): Promise<any> {
  const wasmBuf = readFileSync(wasmPath);
  const wasmBinary = wasmBuf.buffer.slice(wasmBuf.byteOffset, wasmBuf.byteOffset + wasmBuf.byteLength);
  let jsCode = readFileSync(jsPath, 'utf8');
  const NODE_CHECK1 = 'if(currentNodeVersion<TARGET_NOT_SUPPORTED){throw new Error("not compiled for this environment (did you build to HTML and try to run it not on the web, or set ENVIRONMENT to something - like node - and run it someplace else - like on the web?)")}';
  // eslint-disable-next-line no-template-curly-in-string
  const NODE_CHECK2 = 'if(currentNodeVersion<2147483647){throw new Error(`This emscripten-generated code requires node v${packedVersionToHumanReadable(2147483647)} (detected v${packedVersionToHumanReadable(currentNodeVersion)})`)}';
  jsCode = jsCode.replace(NODE_CHECK1, '/* patched */').replace(NODE_CHECK2, '/* patched */');
  const origInstantiate = WebAssembly.instantiate;
  (WebAssembly as any).instantiate = async (source: any, imports: any) => {
    const result = await origInstantiate(source, imports);
    const instance = ('instance' in result ? result.instance : result) as WebAssembly.Instance;
    if (instance.exports.memory) memory = instance.exports.memory as WebAssembly.Memory;
    return result;
  };
  const g = globalThis as any;
  if (typeof g.self === 'undefined') g.self = globalThis;
  if (!g.self.location) g.self.location = { href: jsPath };
  if (typeof g.WorkerGlobalScope === 'undefined') g.WorkerGlobalScope = class {};
  runInThisContext(jsCode);
  const createUADE = g.createUADE;
  let mod: any;
  try {
    mod = await createUADE({
      wasmBinary,
      locateFile: (p: string) => (p.endsWith('.wasm') ? wasmPath : p),
      print: (t: string) => say('[out] ' + t),
      printErr: (t: string) => say('[err] ' + t),
      onAbort: (r: string) => say('[abort] ' + r),
    });
  } finally {
    WebAssembly.instantiate = origInstantiate;
  }
  refresh(mod);
  return mod;
}

function refresh(mod: any) {
  const buf = memory ? memory.buffer : mod.HEAPU8.buffer;
  if (!mod.HEAPU8 || mod.HEAPU8.buffer !== buf) { mod.HEAPU8 = new Uint8Array(buf); mod.HEAPF32 = new Float32Array(buf); }
}

function loadSong(mod: any, path: string): number {
  const data = new Uint8Array(readFileSync(path));
  const name = path.split('/').pop()!;
  const ptr = mod._malloc(data.byteLength); refresh(mod); mod.HEAPU8.set(data, ptr);
  const hintLen = name.length * 4 + 1; const hintPtr = mod._malloc(hintLen); mod.stringToUTF8(name, hintPtr, hintLen);
  mod._uade_wasm_stop(); mod._uade_wasm_set_looping(1); mod._uade_wasm_set_one_subsong(1);
  const ret = mod._uade_wasm_load(ptr, data.byteLength, hintPtr);
  mod._free(ptr); mod._free(hintPtr);
  return ret;
}

function render(mod: any, chunks: number): { frames: number; rms: number } {
  const ptrL = mod._malloc(CHUNK * 4), ptrR = mod._malloc(CHUNK * 4);
  let frames = 0, e = 0;
  for (let c = 0; c < chunks; c++) {
    const ret = mod._uade_wasm_render(ptrL, ptrR, CHUNK);
    if (ret <= 0) { say(`[render] ret=${ret} at chunk ${c}`); break; }
    refresh(mod);
    const f = new Float32Array(mod.HEAPU8.buffer); const i0 = ptrL >> 2;
    for (let i = 0; i < CHUNK; i++) e += f[i0 + i] * f[i0 + i];
    frames += CHUNK;
  }
  mod._free(ptrL); mod._free(ptrR);
  return { frames, rms: Math.sqrt(e / Math.max(1, frames)) };
}

(async () => {
  const mod = await load();
  say(`init=${mod._uade_wasm_init(48000)}`);
  say(`loadA=${loadSong(mod, songA)} (${songA.split('/').pop()})`);
  const a = render(mod, CHUNKS); say(`renderA frames=${a.frames} rms=${a.rms.toFixed(4)}`);
  let resetRet: number | string = 'n/a';
  const pre = process.env.PRE ?? '';
  say(`pre-step=${pre || 'none'}`);
  try {
    if (pre === 'stop') mod._uade_wasm_stop();
    if (pre === 'cleanup') mod._uade_wasm_cleanup();
    if (pre === 'render-to-end') { mod._uade_wasm_set_looping(0); for (let i = 0; i < 400; i++) { if (render(mod, 1).frames === 0) break; } }
    resetRet = mod._uade_wasm_full_reset();
  } catch (err) { resetRet = 'THREW ' + String(err); }
  say(`full_reset -> ${resetRet}`);
  if (typeof resetRet === 'number') {
    try {
      say(`loadB=${loadSong(mod, songB)} (${songB.split('/').pop()})`);
      const b = render(mod, 4); say(`renderB frames=${b.frames} rms=${b.rms.toFixed(4)}`);
    } catch (err) { say('loadB THREW ' + String(err)); }
  }
  const bad = lines.filter((l) => /forbidden|Expected score name|unguarded exit|THREW|abort/.test(l));
  say(`VERDICT ${bad.length ? 'TRAP' : 'OK'} (${bad.length} bad lines)`);
})();
