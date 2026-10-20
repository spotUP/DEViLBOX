// @vitest-environment node
/**
 * Vital bundled presets: index matches the shipped files, presets load through the same
 * 'loadPreset' command the UI picker and the Import Preset File action use (worklet ->
 * synth.handleCommand), sound differs from Init, wavetables in the file reach the audio,
 * and a new Vital instrument starts on the default bundled preset.
 */
import { readFileSync, readdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { describe, it, expect } from 'vitest';
import { VITAL_PRESETS } from '@constants/vitalPresetIndex';
import { DEFAULT_VITAL_PRESET_ID, VITAL_PRESET_PARAM_KEY, findVitalPreset } from '../vitalPreset';
import { SYNTH_REGISTRY } from '../synth-registry';
import { applySynthTypeDefaults } from '@stores/instrument/synthTypeDefaults';
import type { InstrumentConfig } from '@typedefs/instrument';

const PUBLIC = resolve(__dirname, '../../../../public');
const PRESET_DIR = resolve(PUBLIC, 'data/vital-presets');
const FRAMES = 128;
const BLOCKS = 750; // 2 s held
const LIVE_VELOCITY = 127;

interface SynthInstance {
  initialize(sampleRate: number): boolean | void;
  noteOn(note: number, velocity: number): void;
  process(l: number, r: number, n: number): void;
  handleCommand(commandType: string, data: Uint8Array): boolean;
}
interface WasmModule { _malloc(n: number): number; [key: string]: unknown }

interface Render { peakDb: number; finite: boolean; samples: Float32Array }

async function createSynth(): Promise<{ synth: SynthInstance; render: () => Render }> {
  const root = resolve(PUBLIC, 'vital');
  const wasmBinary = readFileSync(resolve(root, 'Vital.wasm'));
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
    const imported = await import(/* @vite-ignore */ pathToFileURL(resolve(root, 'Vital.js')).href);
    const create = (imported.default ?? imported.createVitalModule) as (o: object) => Promise<WasmModule>;
    mod = await create({ wasmBinary });
  } finally {
    WebAssembly.instantiate = orig;
  }
  const synth = new (mod.VitalSynth as new () => SynthInstance)();
  synth.initialize(48000);
  const l = mod._malloc(FRAMES * 4);
  const r = mod._malloc(FRAMES * 4);
  const render = (): Render => {
    synth.noteOn(60, LIVE_VELOCITY);
    let peak = 0;
    let finite = true;
    const samples = new Float32Array(BLOCKS * FRAMES);
    for (let b = 0; b < BLOCKS; b++) {
      synth.process(l, r, FRAMES);
      const lo = new Float32Array((memory as WebAssembly.Memory | null)!.buffer, l, FRAMES);
      for (let i = 0; i < FRAMES; i++) {
        if (!Number.isFinite(lo[i])) finite = false;
        peak = Math.max(peak, Math.abs(lo[i]));
        samples[b * FRAMES + i] = lo[i];
      }
    }
    return { peakDb: peak > 0 ? 20 * Math.log10(peak) : -Infinity, finite, samples };
  };
  return { synth, render };
}

/** Relative energy of the difference between two renders (0 = identical). */
function difference(a: Float32Array, b: Float32Array): number {
  let d = 0;
  let e = 0;
  for (let i = 0; i < a.length; i++) {
    d += (a[i] - b[i]) ** 2;
    e += a[i] ** 2 + b[i] ** 2;
  }
  return e > 0 ? d / e : 0;
}

function presetBytes(id: string): Uint8Array {
  const entry = findVitalPreset(id);
  if (!entry) throw new Error(`no preset ${id}`);
  return new Uint8Array(readFileSync(resolve(PUBLIC, decodeURI(entry.path).replace(/^\//, ''))));
}

async function renderPreset(bytes: Uint8Array | null): Promise<{ result: Render; handled: boolean }> {
  const { synth, render } = await createSynth();
  const handled = bytes ? synth.handleCommand('loadPreset', bytes) : true;
  return { result: render(), handled };
}

describe('bundled Vital preset index', () => {
  it('lists exactly the shipped .vital files', () => {
    const shipped = readdirSync(PRESET_DIR, { recursive: true, encoding: 'utf8' })
      .filter((f) => f.endsWith('.vital'));
    expect(shipped.length).toBeGreaterThan(0);
    expect(VITAL_PRESETS.length).toBe(shipped.length);
    for (const p of VITAL_PRESETS) {
      expect(shipped).toContain(decodeURI(p.path).replace('/data/vital-presets/', ''));
    }
    expect(new Set(VITAL_PRESETS.map((p) => p.id)).size).toBe(VITAL_PRESETS.length);
  });

  it('ships the licence texts next to the packs', () => {
    expect(readFileSync(resolve(PRESET_DIR, 'vitalium/LICENSE'), 'utf8')).toContain('GNU GENERAL PUBLIC LICENSE');
    expect(readFileSync(resolve(PRESET_DIR, 'abstractionmage/LICENSE'), 'utf8')).toContain('CC0 1.0 Universal');
  });

  it('does not ship the preset credited to another designer', () => {
    expect(VITAL_PRESETS.some((p) => p.name === 'Mystic Mallet')).toBe(false);
  });
});

describe('Vital loadPreset through the worklet command entry point', () => {
  it('renders non-silent, bounded audio that differs from Init for presets of three categories', async () => {
    const init = (await renderPreset(null)).result;
    const categories = ['Bass', 'Keys', 'Percussion'];
    for (const category of categories) {
      const entry = VITAL_PRESETS.find((p) => p.category === category);
      expect(entry, `a ${category} preset is bundled`).toBeDefined();
      const { result, handled } = await renderPreset(presetBytes(entry!.id));
      expect(handled, `${entry!.id} accepted`).toBe(true);
      expect(result.finite, `${entry!.id} finite`).toBe(true);
      expect(result.peakDb, `${entry!.id} audible`).toBeGreaterThan(-60);
      expect(result.peakDb, `${entry!.id} bounded`).toBeLessThan(6);
      expect(difference(result.samples, init.samples), `${entry!.id} differs from Init`).toBeGreaterThan(0.01);
    }
  }, 120000);

  it('custom wavetables in a file change the sound versus the same preset without them', async () => {
    const candidates = ['vitalium/talking', 'vitalium/something', 'vitalium/base high'];
    const diffs: Record<string, number> = {};
    for (const id of candidates) {
      const bytes = presetBytes(id);
      const json = JSON.parse(new TextDecoder().decode(bytes)) as { settings: Record<string, unknown> };
      expect((json.settings.wavetables as unknown[]).length).toBeGreaterThan(0);
      delete json.settings.wavetables;
      const full = await renderPreset(bytes);
      const without = await renderPreset(new TextEncoder().encode(JSON.stringify(json)));
      expect(full.handled && without.handled).toBe(true);
      diffs[id] = difference(full.result.samples, without.result.samples);
    }
    if (process.env.VITAL_DEFAULT_OUT) console.log('WT_DIFFS ' + JSON.stringify(diffs));
    for (const [id, d] of Object.entries(diffs)) expect(d, `${id} wavetable audible`).toBeGreaterThan(0.01);
  }, 120000);

  it('rejects text that is not a Vital preset', async () => {
    const { synth } = await createSynth();
    expect(synth.handleCommand('loadPreset', new TextEncoder().encode('{"nope":1}'))).toBe(false);
    expect(synth.handleCommand('loadPreset', new TextEncoder().encode('not json'))).toBe(false);
  }, 60000);

  it('default preset peak keeps the calibrated level (offset unchanged)', async () => {
    const { result } = await renderPreset(presetBytes(DEFAULT_VITAL_PRESET_ID));
    const offset = SYNTH_REGISTRY.get('Vital')!.volumeOffsetDb ?? 0;
    const level = result.peakDb - 12 + offset;
    if (process.env.VITAL_DEFAULT_OUT) console.log(`VITAL_DEFAULT raw=${result.peakDb.toFixed(2)} level=${level.toFixed(2)}`);
    expect(offset).toBe(11);
    expect(result.finite).toBe(true);
    expect(result.peakDb).toBeGreaterThan(-60);
  }, 60000);
});

describe('new Vital instrument', () => {
  it('starts on the default bundled preset', () => {
    const instrument = { id: 1, name: 'New', type: 'synth', synthType: 'Synth', effects: [], volume: -12, pan: 0 } as unknown as InstrumentConfig;
    applySynthTypeDefaults(instrument, 'Vital', false);
    expect(instrument.synthType).toBe('Vital');
    expect((instrument.parameters as Record<string, unknown>)[VITAL_PRESET_PARAM_KEY]).toBe(DEFAULT_VITAL_PRESET_ID);
    expect(findVitalPreset(DEFAULT_VITAL_PRESET_ID)?.category).toBe('Bass');
  });
});
