// @vitest-environment node
/**
 * Every VSTBridge synth's default patch (C4, velocity 100) lands on the same
 * level as the project's other synths.
 *
 * Target definition (src/test-runner.ts TARGET_PEAK): peak -10 dBFS at the
 * instrument output, measured at config volume DEFAULT_INSTRUMENT_VOLUME_DB
 * (-12) plus the registry offset. So raw WASM peak + (-12) + volumeOffsetDb
 * must be -10 dBFS. Offsets live in SYNTH_REGISTRY (volumeOffsetDb), the one
 * source of truth.
 */
import { existsSync, readFileSync, appendFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { describe, it, expect } from 'vitest';
import { SYNTH_REGISTRY } from '../synth-registry';

const TARGET_PEAK_DB = -10;
const CONFIG_VOLUME_DB = -12; // DEFAULT_INSTRUMENT_VOLUME_DB
const TOLERANCE_DB = 2;
/** Synths that cannot be measured through this harness, with the reason. */
const SKIPPED: Record<string, string> = {};

interface SynthInstance {
  initialize(sampleRate: number): boolean | void;
  noteOn(note: number, velocity: number): void;
  process(l: number, r: number, n: number): void;
}
interface WasmModule { _malloc(n: number): number; [key: string]: unknown }

async function rawPeak(dir: string, file: string, factory: string, cls: string): Promise<number> {
  const root = resolve(__dirname, '../../../../public', dir);
  const wasmBinary = readFileSync(resolve(root, `${file}.wasm`));
  let memory: WebAssembly.Memory | null = null;
  const orig = WebAssembly.instantiate;
  WebAssembly.instantiate = (async (...args: unknown[]) => {
    const result = await (orig as (...a: unknown[]) => Promise<unknown>).apply(WebAssembly, args);
    const instance = (result as { instance?: WebAssembly.Instance }).instance ?? (result as WebAssembly.Instance);
    for (const v of Object.values(instance.exports)) if (v instanceof WebAssembly.Memory) memory = v;
    return result;
  }) as typeof WebAssembly.instantiate;
  let mod: WasmModule;
  try {
    const imported = await import(/* @vite-ignore */ pathToFileURL(resolve(root, `${file}.js`)).href);
    const create = (imported.default ?? imported[factory]) as (o: object) => Promise<WasmModule>;
    mod = await create({ wasmBinary });
  } finally {
    WebAssembly.instantiate = orig;
  }
  const synth = new (mod[cls] as new () => SynthInstance)();
  synth.initialize(48000);
  const frames = 128;
  const l = mod._malloc(frames * 4);
  const r = mod._malloc(frames * 4);
  synth.noteOn(60, 100);
  let peak = 0;
  for (let b = 0; b < 750; b++) { // 2 s held
    synth.process(l, r, frames);
    const buf = (memory as WebAssembly.Memory | null)!.buffer;
    const lo = new Float32Array(buf, l, frames);
    const ro = new Float32Array(buf, r, frames);
    for (let i = 0; i < frames; i++) {
      if (!Number.isFinite(lo[i]) || !Number.isFinite(ro[i])) return NaN;
      peak = Math.max(peak, Math.abs(lo[i]), Math.abs(ro[i]));
    }
  }
  return peak > 0 ? 20 * Math.log10(peak) : -Infinity;
}

describe('VSTBridge default-patch level sits on the target', () => {
  it('enumerates the registry', () => {
    expect(SYNTH_REGISTRY.size).toBe(9);
  });
  for (const desc of SYNTH_REGISTRY.values()) {
    // A WASM binary that is not tracked in git (checkout snapshot) cannot be measured; it is measured wherever it exists.
    const present = existsSync(resolve(__dirname, '../../../../public', desc.wasmDir, `${desc.wasmFile}.wasm`));
    it.skipIf(!present)(`${desc.id}: raw peak + volume + offset is within ${TOLERANCE_DB} dB of ${TARGET_PEAK_DB} dBFS`, async () => {
      if (SKIPPED[desc.id]) return;
      const raw = await rawPeak(desc.wasmDir, desc.wasmFile, desc.moduleFactoryName, desc.synthClassName);
      if (process.env.VSTB_CAL_OUT) appendFileSync(process.env.VSTB_CAL_OUT, `${desc.id}\t${raw.toFixed(2)}\t${desc.volumeOffsetDb ?? 0}\n`);
      expect(Number.isFinite(raw), `${desc.id} raw peak ${raw}`).toBe(true);
      const level = raw + CONFIG_VOLUME_DB + (desc.volumeOffsetDb ?? 0);
      expect(Math.abs(level - TARGET_PEAK_DB)).toBeLessThanOrEqual(TOLERANCE_DB);
    }, 60000);
  }
});
