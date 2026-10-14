/**
 * Creating a UADE WASM instance outside the audio worklet, and putting a companion file into its filesystem.
 *
 * Two workers each host their own UADE instance - the DJ render worker (offline decks) and the row-preview worker (a row
 * of the song rendered by a private player) - and both build it here: the glue transform that lets Emscripten's output
 * run in a worker, the instantiation with a copy of the binary (a fresh memory), `uade_wasm_init`, and the companion
 * registration (`_uade_wasm_add_extra_file`, the mechanism the worklet's _addCompanionFile uses).
 */

/** The slice of the UADE module the hosts call. Wider users cast further. */
export interface UadeWasm {
  _uade_wasm_init(sampleRate: number): number;
  _uade_wasm_load(ptr: number, len: number, hintPtr: number): number;
  _uade_wasm_render(ptrL: number, ptrR: number, frames: number): number;
  _uade_wasm_stop(): void;
  _uade_wasm_full_reset(): number;
  _uade_wasm_set_looping(on: number): void;
  _uade_wasm_set_subsong(subsong: number): void;
  _uade_wasm_get_subsong_min(): number;
  _uade_wasm_get_subsong_max(): number;
  _uade_wasm_get_subsong_count(): number;
  _uade_wasm_get_tick_count(): number;
  _uade_wasm_get_player_tick_count(): number;
  _uade_wasm_mute_channels(mask: number): void;
  _uade_wasm_isolate_channels(mask: number): void;
  _uade_wasm_read_channel_samples(c0: number, c1: number, c2: number, c3: number, maxFrames: number): number;
  _uade_wasm_add_extra_file(namePtr: number, dataPtr: number, len: number): number;
  _malloc(n: number): number;
  _free(p: number): void;
  HEAPU8: Uint8Array;
  HEAPF32: Float32Array;
  stringToUTF8(s: string, ptr: number, max: number): void;
}

/**
 * UADE.js as a script a worker can run: `import.meta.url` and the ES export replaced, the environment forced to worker, a
 * `document.currentScript` for the glue's own base-URL lookup (same transform as UADEEngine.uadeTransform on the worklet side).
 */
export function uadeGlueForWorker(jsCode: string, baseUrl: string): string {
  let js = jsCode;
  js = js.replace(/import\.meta\.url/g, `"${baseUrl}/uade/UADE.js"`);
  js = js.replace(/export\s+default\s+/g, 'var createUADE = ');
  js = js.replace(/export\s*\{[^}]*\}/g, '');
  js = js.replace(/ENVIRONMENT_IS_WEB\s*=\s*!0/g, 'ENVIRONMENT_IS_WEB=false');
  js = js.replace(/ENVIRONMENT_IS_WORKER\s*=\s*!1/g, 'ENVIRONMENT_IS_WORKER=true');
  return 'var document = { currentScript: { src: "' + baseUrl + '/uade/UADE.js" }, title: "" };\n' + js;
}

/** A fresh, initialised UADE instance from the glue (uadeGlueForWorker) and a copy of the wasm binary. */
export async function instantiateUadeWasm<T extends UadeWasm = UadeWasm>(
  glue: string, wasmBinary: ArrayBuffer, sampleRate: number, tag: string,
): Promise<T> {
  const factory = new Function(glue + '\n;return typeof createUADE !== "undefined" ? createUADE : Module;')();
  const wasm = await factory({
    wasmBinary: wasmBinary.slice(0), // a clone: fresh memory
    print: (msg: string) => console.log(`[${tag}/UADE]`, msg),
    printErr: (msg: string) => console.warn(`[${tag}/UADE]`, msg),
  }) as T;
  // CRITICAL: loading fails if this is not called.
  const initRet = wasm._uade_wasm_init(sampleRate);
  if (initRet !== 0) throw new Error(`uade_wasm_init failed with code ${initRet}`);
  return wasm;
}

/**
 * Write a companion file into UADE's virtual filesystem. After instantiation and before `_uade_wasm_load`. The name is
 * kept as it is: a player asks for its companion under the module's own base name (smpl.<tune>), spaces and all.
 */
export function addUadeCompanion(wasm: UadeWasm, filename: string, buffer: ArrayBuffer, tag: string): boolean {
  const data = new Uint8Array(buffer);
  const dataPtr = wasm._malloc(data.byteLength);
  if (!dataPtr) {
    console.warn(`[${tag}/UADE] malloc failed for companion: ${filename}`);
    return false;
  }
  wasm.HEAPU8.set(data, dataPtr);
  const nameLen = filename.length * 3 + 1;
  const namePtr = wasm._malloc(nameLen);
  if (!namePtr) {
    wasm._free(dataPtr);
    console.warn(`[${tag}/UADE] malloc failed for companion name: ${filename}`);
    return false;
  }
  wasm.stringToUTF8(filename, namePtr, nameLen);
  const ret = wasm._uade_wasm_add_extra_file(namePtr, dataPtr, data.byteLength);
  wasm._free(dataPtr);
  wasm._free(namePtr);
  if (ret !== 0) {
    console.warn(`[${tag}/UADE] Failed to register companion: ${filename} (ret=${ret})`);
    return false;
  }
  return true;
}

/** What the public folder serves, fetched once per worker: every new instance is made from the same two files. */
let publicSources: Promise<{ wasm: ArrayBuffer; glue: string }> | null = null;

/** UADE.js + UADE.wasm from the app's public folder, instantiated in the calling worker at `sampleRate` (a fresh instance). */
export async function loadUadeWasmFromPublic(sampleRate: number, tag: string): Promise<UadeWasm> {
  const base = (import.meta.env.BASE_URL || '/').replace(/\/$/, '');
  publicSources ??= Promise.all([
    fetch(`${base}/uade/UADE.wasm`).then((r) => { if (!r.ok) throw new Error(`UADE.wasm: HTTP ${r.status}`); return r.arrayBuffer(); }),
    fetch(`${base}/uade/UADE.js`).then((r) => { if (!r.ok) throw new Error(`UADE.js: HTTP ${r.status}`); return r.text(); }),
  ]).then(([wasm, js]) => ({ wasm, glue: uadeGlueForWorker(js, self.location.origin + base) }));
  publicSources.catch(() => { publicSources = null; });
  const { wasm, glue } = await publicSources;
  return instantiateUadeWasm(glue, wasm, sampleRate, tag);
}
