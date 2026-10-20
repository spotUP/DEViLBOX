// @vitest-environment node
/**
 * Odin2 factory soundbank (GPL presets converted from the plugin's .odin files by
 * tools/convertOdinPresets.ts).
 *
 * (a) the converter keeps every .odin file, each with name and category;
 * (b) reachability: a preset picked in the instrument preset dropdown is a FACTORY_PRESETS config;
 *     its `odin2` map goes through VSTBridgeSynth's own key resolver (resolveConfigParamId, the
 *     code applyConfig runs) into the real Odin2 WASM, which renders audible, bounded audio that
 *     differs from the Init patch;
 * (c) a new Odin2 instrument starts on the chosen default preset, not the Init beep.
 */
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { resolve, join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { describe, it, expect } from 'vitest';
import { convertOdinBank, ODIN_BANK_DIR } from '../../../tools/convertOdinPresets';
import { ODIN2_PRESETS } from '../odin2Presets';
import { FACTORY_PRESETS, getFirstPresetForSynthType } from '../factoryPresets';
import { SYNTH_REGISTRY, type VSTBridgeDescriptor } from '../../engine/vstbridge/synth-registry';
import { resolveConfigParamId } from '../../engine/vstbridge/VSTBridgeSynth';

const DEFAULT_PRESET_NAME = 'Odin2 Bass - Growly FM Bass';
const LIVE_VELOCITY = 127;
const CONFIG_VOLUME_DB = -12; // DEFAULT_INSTRUMENT_VOLUME_DB

const desc = SYNTH_REGISTRY.get('Odin2') as VSTBridgeDescriptor;
const wasmPath = resolve(__dirname, '../../../public', desc.wasmDir, `${desc.wasmFile}.wasm`);
const present = existsSync(wasmPath);

function countOdinFiles(dir: string): number {
  let n = 0;
  for (const e of readdirSync(dir)) {
    const p = join(dir, e);
    if (statSync(p).isDirectory()) n += countOdinFiles(p);
    else if (e.endsWith('.odin')) n++;
  }
  return n;
}

const odin2Factory = FACTORY_PRESETS.filter((p) => p.synthType === 'Odin2');
const presetByName = (name: string) => {
  const p = odin2Factory.find((x) => x.name === name);
  if (!p) throw new Error(`no Odin2 factory preset ${name}`);
  return p;
};

interface SynthInstance {
  initialize(sr: number): boolean | void;
  noteOn(note: number, velocity: number): void;
  setParameter(id: number, value: number): void;
  process(l: number, r: number, n: number): void;
  getParameterCount(): number;
  getParameterName(i: number): string;
}
interface WasmModule { _malloc(n: number): number; [key: string]: unknown }
interface Render { peak: number; samples: Float32Array; unresolved: string[] }

async function loadModule(): Promise<{ mod: WasmModule; memory: () => WebAssembly.Memory }> {
  const root = resolve(__dirname, '../../../public', desc.wasmDir);
  const wasmBinary = readFileSync(resolve(root, `${desc.wasmFile}.wasm`));
  let memory: WebAssembly.Memory | null = null;
  const orig = WebAssembly.instantiate;
  WebAssembly.instantiate = (async (...args: unknown[]) => {
    const result = await (orig as (...a: unknown[]) => Promise<unknown>).apply(WebAssembly, args);
    const instance = (result as { instance?: WebAssembly.Instance }).instance ?? (result as WebAssembly.Instance);
    for (const v of Object.values(instance.exports)) if (v instanceof WebAssembly.Memory) memory = v;
    return result;
  }) as typeof WebAssembly.instantiate;
  try {
    const imported = await import(/* @vite-ignore */ pathToFileURL(resolve(root, `${desc.wasmFile}.js`)).href);
    const create = (imported.default ?? imported[desc.moduleFactoryName]) as (o: object) => Promise<WasmModule>;
    const mod = await create({ wasmBinary });
    return { mod, memory: () => memory as WebAssembly.Memory };
  } finally {
    WebAssembly.instantiate = orig;
  }
}

/** Render 2 s of a held C4 at live velocity after applying `odin2` exactly as VSTBridgeSynth.applyConfig does. */
async function render(odin2: Record<string, number> | undefined): Promise<Render> {
  const { mod, memory } = await loadModule();
  const synth = new (mod[desc.synthClassName] as new () => SynthInstance)();
  synth.initialize(48000);
  const params = Array.from({ length: synth.getParameterCount() }, (_, id) => ({ id, name: synth.getParameterName(id) }));
  const unresolved: string[] = [];
  for (const [key, value] of Object.entries(odin2 ?? {})) {
    const id = resolveConfigParamId(key, desc.paramMapping, params);
    if (id === undefined) unresolved.push(key);
    else synth.setParameter(id, value);
  }
  const frames = 128;
  const blocks = 750;
  const l = mod._malloc(frames * 4);
  const r = mod._malloc(frames * 4);
  synth.noteOn(60, LIVE_VELOCITY);
  const samples = new Float32Array(blocks * frames);
  let peak = 0;
  for (let b = 0; b < blocks; b++) {
    synth.process(l, r, frames);
    const lo = new Float32Array(memory().buffer, l, frames);
    const ro = new Float32Array(memory().buffer, r, frames);
    for (let i = 0; i < frames; i++) {
      const s = lo[i];
      samples[b * frames + i] = s;
      if (!Number.isFinite(s) || !Number.isFinite(ro[i])) return { peak: NaN, samples, unresolved };
      peak = Math.max(peak, Math.abs(s), Math.abs(ro[i]));
    }
  }
  return { peak, samples, unresolved };
}

const db = (x: number) => (x > 0 ? 20 * Math.log10(x) : -Infinity);

// The pre-commit snapshot omits third-party/odin2-master (upstream build input), so the
// converter check runs only where the soundbank directory exists.
describe('Odin2 preset converter', () => {
  it.skipIf(!existsSync(ODIN_BANK_DIR))('keeps every .odin file, each with name and category', () => {
    const bank = convertOdinBank();
    expect(bank.length).toBe(countOdinFiles(ODIN_BANK_DIR));
    expect(bank.length).toBeGreaterThan(200);
    for (const p of bank) {
      expect(p.name.length).toBeGreaterThan(0);
      expect(p.category.length).toBeGreaterThan(0);
    }
    expect(ODIN2_PRESETS.length).toBe(bank.length);
    expect(odin2Factory.length).toBe(bank.length);
    expect(new Set(odin2Factory.map((p) => p.name)).size).toBe(bank.length);
  });
});

describe.skipIf(!present)('Odin2 preset pick reaches the WASM synth', () => {
  const picks = ['Odin2 Bass - Growly FM Bass', 'Odin2 Keys - Electric Piano', 'Odin2 Leads - ' + (ODIN2_PRESETS.find((p) => p.category === 'Leads')?.name ?? '')];
  it('3 presets from different categories render audible bounded audio that differs from Init', async () => {
    const init = await render(undefined);
    expect(init.peak).toBeGreaterThan(0);
    const seen = new Set<string>();
    for (const name of picks) {
      const cfg = presetByName(name);
      const odin2 = (cfg as { odin2?: Record<string, number> }).odin2;
      expect(odin2 && Object.keys(odin2).length, `${name} has odin2 params`).toBeGreaterThan(0);
      const out = await render(odin2);
      expect(out.unresolved, `${name} keys without a WASM parameter`).toEqual([]);
      expect(Number.isFinite(out.peak), name).toBe(true);
      expect(db(out.peak) + CONFIG_VOLUME_DB + (desc.volumeOffsetDb ?? 0), `${name} audible`).toBeGreaterThan(-60);
      expect(out.peak, `${name} bounded`).toBeLessThan(8);
      let diff = 0;
      for (let i = 0; i < out.samples.length; i++) diff = Math.max(diff, Math.abs(out.samples[i] - init.samples[i]));
      expect(diff, `${name} differs from Init`).toBeGreaterThan(1e-4);
      seen.add(name);
    }
    expect(seen.size).toBe(3);
  }, 120000);

  it('every preset key resolves to a WASM parameter', async () => {
    const { mod } = await loadModule();
    const synth = new (mod[desc.synthClassName] as new () => SynthInstance)();
    synth.initialize(48000);
    const params = Array.from({ length: synth.getParameterCount() }, (_, id) => ({ id, name: synth.getParameterName(id) }));
    const bad: string[] = [];
    for (const p of ODIN2_PRESETS) for (const k of Object.keys(p.params)) if (resolveConfigParamId(k, desc.paramMapping, params) === undefined) bad.push(`${p.name}.${k}`);
    expect(bad.slice(0, 10)).toEqual([]);
  }, 60000);

  it('default preset peak at live velocity (reported)', async () => {
    const cfg = getFirstPresetForSynthType('Odin2') as { odin2?: Record<string, number> };
    const out = await render(cfg.odin2);
    const level = db(out.peak) + CONFIG_VOLUME_DB + (desc.volumeOffsetDb ?? 0);
    if (process.env.ODIN2_REPORT) console.log(`ODIN2_DEFAULT raw=${db(out.peak).toFixed(2)} dB, at instrument output=${level.toFixed(2)} dBFS`);
    expect(Number.isFinite(level)).toBe(true);
    // Same target as vstbridgeLevelCalibration: peak -10 dBFS +/- 2 dB at the instrument output
    expect(Math.abs(level - -10)).toBeLessThanOrEqual(2);
  }, 60000);
});

describe('new Odin2 instrument default', () => {
  it('starts on the chosen preset, with its odin2 config, not Init', () => {
    const def = getFirstPresetForSynthType('Odin2');
    expect(def).not.toBeNull();
    expect(def!.name).toBe(DEFAULT_PRESET_NAME);
    expect(def).toBe(presetByName(DEFAULT_PRESET_NAME));
    expect(Object.keys((def as { odin2?: Record<string, number> }).odin2 ?? {}).length).toBeGreaterThan(5);
    expect(FACTORY_PRESETS.some((p) => p.name === 'Odin2 Init')).toBe(false);
  });
});
