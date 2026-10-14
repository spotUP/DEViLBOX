/**
 * EaglePlayer.js + EaglePlayer.wasm from the app's public folder, instantiated in the calling thread (the row-preview
 * worker's own instance; the audio worklet receives the same two files by message from EaglePlayerEngine).
 */
import type { EaglePlayerWasm } from '../rowPreview/adapters/eaglePlayerAdapter';

export async function loadEaglePlayerModuleFromPublic(): Promise<EaglePlayerWasm> {
  const base = import.meta.env.BASE_URL || '/';
  const [js, wasm] = await Promise.all([
    fetch(`${base}eagleplayer/EaglePlayer.js`).then((r) => { if (!r.ok) throw new Error(`EaglePlayer.js: HTTP ${r.status}`); return r.text(); }),
    fetch(`${base}eagleplayer/EaglePlayer.wasm`).then((r) => { if (!r.ok) throw new Error(`EaglePlayer.wasm: HTTP ${r.status}`); return r.arrayBuffer(); }),
  ]);
  const factory = new Function(`${js}\nreturn createEaglePlayer;`)() as (cfg: object) => Promise<EaglePlayerWasm>;
  return factory({ wasmBinary: wasm });
}
