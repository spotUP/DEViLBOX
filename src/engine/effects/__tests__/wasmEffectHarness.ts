/**
 * Runs a WASM effect (public/<dir>/<Stem>.js + .wasm) headless: create an
 * instance, set parameters through its C setters, process a buffer, and read
 * each frequency's gain with a Goertzel filter.
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { ROOT } from '@engine/__tests__/workletHarness';

type Mod = Record<string, (...a: number[]) => number>;

export async function loadWasmEffect(dir: string, stem: string): Promise<{ m: Mod; heap: () => Float32Array }> {
  const js = readFileSync(resolve(ROOT, `public/${dir}/${stem}.js`), 'utf8');
  const factoryName = js.match(/var (create\w+)\s*=/)![1];
  const factory = new Function(`${js}\nreturn ${factoryName};`)() as (o: object) => Promise<Mod>;
  let memory: WebAssembly.Memory | null = null;
  const instantiate = WebAssembly.instantiate;
  const capture = async (source: BufferSource, imports?: WebAssembly.Imports) => {
    const r = await instantiate(source, imports);
    memory = Object.values(r.instance.exports).find((v) => v instanceof WebAssembly.Memory) as WebAssembly.Memory;
    return r;
  };
  WebAssembly.instantiate = capture as unknown as typeof instantiate;
  const versions = Object.getOwnPropertyDescriptor(process, 'versions')!;
  Object.defineProperty(process, 'versions', { value: {}, configurable: true });
  try {
    const m = await factory({ wasmBinary: readFileSync(resolve(ROOT, `public/${dir}/${stem}.wasm`)) });
    return { m, heap: () => new Float32Array(memory!.buffer) };
  } finally {
    WebAssembly.instantiate = instantiate;
    Object.defineProperty(process, 'versions', versions);
  }
}

export function goertzel(y: Float32Array, f: number, sr = 48000): number {
  const c = 2 * Math.cos(2 * Math.PI * f / sr);
  let s1 = 0, s2 = 0;
  for (const v of y) { const s0 = v + c * s1 - s2; s2 = s1; s1 = s0; }
  return Math.sqrt(s1 * s1 + s2 * s2 - c * s1 * s2) * 2 / y.length;
}

/**
 * Gain in dB at each frequency for a multitone (all `freqs` at amplitude
 * `amp`) through effect `prefix` with `params` set via `_<prefix>_set_<key>`.
 */
export async function multitoneGainDb(
  dir: string, stem: string, prefix: string, params: Record<string, number>, freqs: number[], amp = 0.05,
): Promise<number[]> {
  const { m, heap } = await loadWasmEffect(dir, stem);
  const h = m[`_${prefix}_create`](48000);
  for (const [k, v] of Object.entries(params)) {
    const setter = m[`_${prefix}_set_${k}`];
    if (!setter) throw new Error(`${stem}: no setter for ${k}`);
    setter(h, v);
  }
  const n = 96000, bytes = n * 4;
  const iL = m._malloc(bytes), iR = m._malloc(bytes), oL = m._malloc(bytes), oR = m._malloc(bytes);
  const x = new Float32Array(n);
  for (let i = 0; i < n; i++) { let v = 0; for (const f of freqs) v += amp * Math.sin(2 * Math.PI * f * i / 48000 + f); x[i] = v; }
  heap().set(x, iL >> 2); heap().set(x, iR >> 2);
  for (let off = 0; off < n; off += 128) m[`_${prefix}_process`](h, iL + off * 4, iR + off * 4, oL + off * 4, oR + off * 4, 128);
  const y = heap().slice((oL >> 2) + n / 2, (oL >> 2) + n);
  return freqs.map((f) => 20 * Math.log10(goertzel(y, f) / amp));
}
