/**
 * renderWord.mjs — headless TMS5220/TMC0281 render harness.
 *
 * Loads DEViLBOX's shipped MAME chip bundle (public/mame/TMS5220.{js,wasm}) outside a
 * browser, feeds it the real Speak & Spell VSM ROMs, speaks from a byte address, and
 * writes the result to a WAV plus prints level statistics.
 *
 * Exists because "sounds shitty" is not a measurement. This makes the chip's actual
 * output inspectable: silence, clipping, truncation and garbling all look different.
 *
 * Usage:
 *   npx tsx tools/tms5220-audit/renderWord.ts <byteAddr> [seconds] [out.wav]
 */
import { readFileSync, writeFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, '../..');
const SAMPLE_RATE = 44100;

interface ChipModule {
  TMS5220Synth: new () => {
    initialize(sampleRate: number): void;
    loadROM(ptr: number, size: number): void;
    speakAtByte(byteAddr: number): void;
    loadFrameBuffer(ptr: number, numFrames: number): void;
    speakFrameBuffer(): void;
    isSpeaking(): boolean;
    process(ptrL: number, ptrR: number, numSamples: number): void;
  };
  _malloc(size: number): number;
  _free(ptr: number): void;
  heapU8(): Uint8Array;
  heapF32(): Float32Array;
}

export interface RomWordRender {
  samples: Float32Array;
  sampleRate: number;
  byteAddr: string;
  romBytes: number;
  seconds: number;
  peak: number;
  rms: number;
  peakDbfs: number | null;
  nonzeroFraction: number;
  speechEndsAtSec: number | null;
  stillSpeaking: boolean;
  blocksWhileSpeaking: number;
}

async function loadChip(): Promise<ChipModule> {
  const jsPath = join(ROOT, 'public/mame/TMS5220.js');
  const wasmPath = join(ROOT, 'public/mame/TMS5220.wasm');
  const wasmBinary = readFileSync(wasmPath);

  // The bundle is a UMD-ish script defining `createTMS5220Module` and assigning to
  // module.exports when one exists. Neither shape is importable as an ES module, so
  // evaluate it and take the factory off the sandbox (same trick uadeRenderCore uses).
  const { runInNewContext } = await import('vm');

  // The bundle exports no HEAP views (only _malloc/_free/ccall and the embind class),
  // so capture the WebAssembly.Memory during instantiation — exactly what
  // public/mame/TMS5220.worklet.js does to build its own heap views.
  let capturedMemory: WebAssembly.Memory | null = null;
  const patchedWasm: typeof WebAssembly = Object.create(WebAssembly);
  patchedWasm.instantiate = (async (...args: unknown[]) => {
    const result = await (WebAssembly.instantiate as (...a: unknown[]) => Promise<
      WebAssembly.WebAssemblyInstantiatedSource | WebAssembly.Instance
    >)(...args);
    const inst = 'instance' in result ? result.instance : result;
    if (inst.exports) {
      for (const v of Object.values(inst.exports)) {
        if (v instanceof WebAssembly.Memory) { capturedMemory = v as WebAssembly.Memory; break; }
      }
    }
    return result;
  }) as typeof WebAssembly.instantiate;

  // The bundle probes globalThis for its environment, so the sandbox must reference
  // itself under that name.
  const sandbox: Record<string, unknown> = {
    globalThis: null, console, process, TextDecoder, TextEncoder, URL,
    WebAssembly: patchedWasm, Buffer, performance, fetch,
  };
  sandbox.globalThis = sandbox;
  runInNewContext(readFileSync(jsPath, 'utf8'), sandbox);
  const factory = sandbox.createTMS5220Module as
    | ((opts: { wasmBinary: Buffer }) => Promise<unknown>)
    | undefined;
  if (typeof factory !== 'function') {
    throw new Error('TMS5220.js did not define createTMS5220Module');
  }

  const Module = (await factory({ wasmBinary })) as ChipModule;
  const memory = capturedMemory as WebAssembly.Memory | null;
  if (!memory) throw new Error('could not capture the wasm memory');
  // Views must be rebuilt whenever memory grows.
  Module.heapU8 = () => new Uint8Array(memory.buffer);
  Module.heapF32 = () => new Float32Array(memory.buffer);
  return Module;
}

export function writeWav(path: string, samples: Float32Array, sampleRate: number): void {
  const n = samples.length;
  const buf = Buffer.alloc(44 + n * 2);
  buf.write('RIFF', 0);
  buf.writeUInt32LE(36 + n * 2, 4);
  buf.write('WAVE', 8);
  buf.write('fmt ', 12);
  buf.writeUInt32LE(16, 16);
  buf.writeUInt16LE(1, 20);
  buf.writeUInt16LE(1, 22);
  buf.writeUInt32LE(sampleRate, 24);
  buf.writeUInt32LE(sampleRate * 2, 28);
  buf.writeUInt16LE(2, 32);
  buf.writeUInt16LE(16, 34);
  buf.write('data', 36);
  buf.writeUInt32LE(n * 2, 40);
  for (let i = 0; i < n; i++) {
    const v = Math.max(-1, Math.min(1, samples[i]));
    buf.writeInt16LE(Math.round(v * 32767), 44 + i * 2);
  }
  writeFileSync(path, buf);
}

/**
 * Render one ROM word from the shipped chip bundle.
 * Returns the samples plus level statistics.
 */
export async function renderRomWord(byteAddr: number, seconds = 2): Promise<RomWordRender> {
  const Module = await loadChip();
  const synth = new Module.TMS5220Synth();
  synth.initialize(SAMPLE_RATE);

  const rom = loadVsmRom();
  const romPtr = Module._malloc(rom.length);
  Module.heapU8().set(rom, romPtr);
  synth.loadROM(romPtr, rom.length);

  synth.speakAtByte(byteAddr);
  const { out, speakingBlocks } = collectSamples(Module, synth, seconds);
  const stats = computeStats(out, synth.isSpeaking(), speakingBlocks);
  return { samples: out, sampleRate: SAMPLE_RATE, byteAddr: '0x' + byteAddr.toString(16), romBytes: rom.length, seconds, ...stats };
}

/**
 * Render a packed frame buffer (phoneme TTS) from the shipped chip bundle.
 * The buffer must be in the 12-byte format produced by packFrameBuffer.
 * Returns the samples plus level statistics.
 */
export async function renderFrameBuffer(
  packed: { data: Uint8Array; numFrames: number },
  seconds = 2,
): Promise<RomWordRender> {
  const Module = await loadChip();
  const synth = new Module.TMS5220Synth();
  synth.initialize(SAMPLE_RATE);

  const rom = loadVsmRom();
  const romPtr = Module._malloc(rom.length);
  Module.heapU8().set(rom, romPtr);
  synth.loadROM(romPtr, rom.length);

  const bufPtr = Module._malloc(packed.data.length);
  Module.heapU8().set(packed.data, bufPtr);
  synth.loadFrameBuffer(bufPtr, packed.numFrames);
  synth.speakFrameBuffer();

  const { out, speakingBlocks } = collectSamples(Module, synth, seconds);
  const stats = computeStats(out, synth.isSpeaking(), speakingBlocks);
  return {
    samples: out,
    sampleRate: SAMPLE_RATE,
    byteAddr: `frames:${packed.numFrames}`,
    romBytes: rom.length,
    seconds,
    ...stats,
  };
}

function loadVsmRom(): Buffer {
  return Buffer.concat([
    readFileSync(join(ROOT, 'public/roms/snspell/tmc0351n2l.vsm')),
    readFileSync(join(ROOT, 'public/roms/snspell/tmc0352n2l.vsm')),
  ]);
}

function collectSamples(
  Module: ChipModule,
  synth: InstanceType<ChipModule['TMS5220Synth']>,
  seconds: number,
): { out: Float32Array; speakingBlocks: number } {
  const total = Math.floor(seconds * SAMPLE_RATE);
  const block = 512;
  const ptrL = Module._malloc(block * 4);
  const ptrR = Module._malloc(block * 4);
  const out = new Float32Array(total);

  let speakingBlocks = 0;
  for (let done = 0; done < total; done += block) {
    const n = Math.min(block, total - done);
    synth.process(ptrL, ptrR, n);
    const view = Module.heapF32().subarray(ptrL / 4, ptrL / 4 + n);
    out.set(view, done);
    if (synth.isSpeaking()) speakingBlocks++;
  }

  return { out, speakingBlocks };
}

function computeStats(
  out: Float32Array,
  stillSpeaking: boolean,
  blocksWhileSpeaking: number,
) {
  let peak = 0, sum = 0, nonzero = 0, lastNonzero = -1;
  for (let i = 0; i < out.length; i++) {
    const a = Math.abs(out[i]);
    if (a > peak) peak = a;
    sum += out[i] * out[i];
    if (a > 1e-4) { nonzero++; lastNonzero = i; }
  }
  const rms = Math.sqrt(sum / out.length);

  return {
    peak: +peak.toFixed(4),
    rms: +rms.toFixed(5),
    peakDbfs: peak > 0 ? +(20 * Math.log10(peak)).toFixed(2) : null,
    nonzeroFraction: +(nonzero / out.length).toFixed(4),
    speechEndsAtSec: lastNonzero >= 0 ? +(lastNonzero / SAMPLE_RATE).toFixed(3) : null,
    stillSpeaking,
    blocksWhileSpeaking,
  };
}

// CLI: node tools/tms5220-audit/renderWord.mjs <byteAddr> [seconds] [out.wav]
if (process.argv[1] && import.meta.url.endsWith(process.argv[1].split('/').pop()!)) {
  const byteAddr = parseInt(process.argv[2] ?? '0', 10);
  const seconds = parseFloat(process.argv[3] ?? '2');
  const outPath = process.argv[4] ?? join(ROOT, 'tms5220-word.wav');
  const { samples, sampleRate, ...stats } = await renderRomWord(byteAddr, seconds);
  console.log(JSON.stringify(stats, null, 2));
  writeWav(outPath, samples, sampleRate);
  console.log('wrote', outPath);
}
