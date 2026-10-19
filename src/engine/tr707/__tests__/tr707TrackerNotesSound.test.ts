/**
 * TR-707 silent in the tracker (owner 2026-10-20: "tr-707 plays silent").
 *
 * The chip maps drums to MIDI 35-56 (B-1 to G#-2 in GM drum layout), and the tracker's
 * default octave writes C-4 = MIDI 60. getDrumHit returned nullptr for every note
 * outside that window, so noteOn did nothing. Notes outside the window now fold onto
 * it by octave, so C-4 plays the bass drum (as MIDI 36 does), C#4 the rimshot and so on.
 *
 * Drives the shipped bundle (public/mame/TR707.{js,wasm}) with the real ROMs from
 * public/roms/tr707/tr707.zip, the same files the app loads.
 */
import { describe, it, expect } from 'vitest';
import { existsSync, readFileSync } from 'fs';
import { join } from 'path';
import { runInNewContext } from 'vm';
import JSZip from 'jszip';

const ROOT = process.cwd();
const BUNDLE = join(ROOT, 'public/mame/TR707.js');
const WASM = join(ROOT, 'public/mame/TR707.wasm');
const ZIP = join(ROOT, 'public/roms/tr707/tr707.zip');
const RATE = 44100;
const BLOCK = 128;

interface TR707Instance {
  initialize(sampleRate: number): void;
  loadROM(offset: number, ptr: number, size: number): void;
  noteOn(note: number, velocity: number): void;
  process(ptrL: number, ptrR: number, numSamples: number): void;
}
interface TR707Module {
  TR707Synth: new () => TR707Instance;
  _malloc(size: number): number;
}

async function loadChip(): Promise<{ Module: TR707Module; memory: WebAssembly.Memory }> {
  // The bundle is an ES module built for web/worker only. The wasm binary is passed in,
  // so its import.meta.url is never used to fetch: strip the module syntax and evaluate it
  // as a script. Capture the memory during instantiation, as public/mame/TR707.worklet.js
  // does for its heap views.
  let memory: WebAssembly.Memory | null = null;
  const patched: typeof WebAssembly = Object.create(WebAssembly);
  patched.instantiate = (async (...args: unknown[]) => {
    const result = await (WebAssembly.instantiate as (...a: unknown[]) => Promise<
      WebAssembly.WebAssemblyInstantiatedSource | WebAssembly.Instance
    >)(...args);
    const inst = 'instance' in result ? result.instance : result;
    for (const v of Object.values(inst.exports)) {
      if (v instanceof WebAssembly.Memory) { memory = v; break; }
    }
    return result;
  }) as typeof WebAssembly.instantiate;
  const sandbox: Record<string, unknown> = {
    globalThis: null, console, process, TextDecoder, TextEncoder, URL, WebAssembly: patched, Buffer, performance,
  };
  sandbox.globalThis = sandbox;
  const source = readFileSync(BUNDLE, 'utf8')
    .replace(/import\.meta\.url/g, '"file:///TR707.js"')
    .replace(/export default createTR707Module;?\s*$/, '');
  runInNewContext(source, sandbox);
  const factory = sandbox.createTR707Module as (opts: { wasmBinary: Buffer }) => Promise<TR707Module>;
  const Module = await factory({ wasmBinary: readFileSync(WASM) });
  if (!memory) throw new Error('could not capture the wasm memory');
  return { Module, memory };
}

/** Peak output over 0.25 s after one noteOn on a fresh chip. */
async function peakAfterNote(note: number): Promise<number> {
  const { Module, memory } = await loadChip();
  const synth = new Module.TR707Synth();
  synth.initialize(RATE);
  const zip = await JSZip.loadAsync(readFileSync(ZIP));
  for (const [name, offset] of [['tr707_voices.bin', 0], ['tr707_crash.bin', 0x10000], ['tr707_ride.bin', 0x18000]] as const) {
    const data = await zip.file(name)!.async('uint8array');
    const ptr = Module._malloc(data.length);
    new Uint8Array(memory.buffer).set(data, ptr);
    synth.loadROM(offset, ptr, data.length);
  }
  const ptrL = Module._malloc(BLOCK * 4);
  const ptrR = Module._malloc(BLOCK * 4);
  synth.noteOn(note, 127);
  let peak = 0;
  for (let n = 0; n < RATE / 4; n += BLOCK) {
    synth.process(ptrL, ptrR, BLOCK);
    const l = new Float32Array(memory.buffer, ptrL, BLOCK);
    for (let i = 0; i < BLOCK; i++) peak = Math.max(peak, Math.abs(l[i]));
  }
  return peak;
}

describe('TR-707 plays the notes the tracker writes', () => {
  it.skipIf(!existsSync(BUNDLE) || !existsSync(ZIP))('C-4, C#4, D-4 and C-1 all sound, like their in-window octaves', async () => {
    const inWindow = await peakAfterNote(36); // bass drum, always mapped
    expect(inWindow).toBeGreaterThan(0.01);
    for (const note of [60, 61, 62, 24]) {
      expect(await peakAfterNote(note), `MIDI ${note}`).toBeGreaterThan(0.01);
    }
    // C-4 folds onto the same bass drum as MIDI 36.
    expect(await peakAfterNote(60)).toBeCloseTo(inWindow, 5);
  }, 60_000);
});
