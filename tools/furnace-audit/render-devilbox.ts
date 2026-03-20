/**
 * render-devilbox.ts — Render Furnace songs to WAV using DEViLBOX's WASM pipeline
 *
 * Drives the FurnaceDispatch WASM module headlessly (no AudioWorklet, no browser)
 * to produce WAV files that can be compared against Furnace CLI reference renders.
 *
 * Usage:
 *   npx tsx tools/furnace-audit/render-devilbox.ts <file.fur> [output.wav]
 *   npx tsx tools/furnace-audit/render-devilbox.ts --batch <category>
 *   npx tsx tools/furnace-audit/render-devilbox.ts --batch              # all categories
 *
 * Output: test-data/furnace-devilbox/<category>/<name>.wav
 */

import { readFileSync, writeFileSync, mkdirSync, readdirSync, existsSync, statSync, unlinkSync, rmSync } from 'fs';
import { join, basename, dirname, relative } from 'path';
import { createRequire } from 'module';

// ── Constants ────────────────────────────────────────────────────────────────

const SAMPLE_RATE = 44100;
const BUFFER_SIZE = 128; // Match worklet quantum
const MAX_RENDER_SECONDS = 300; // 5 minute safety limit
const PROJECT_ROOT = join(dirname(new URL(import.meta.url).pathname), '../..');
const WASM_JS_PATH = join(PROJECT_ROOT, 'public/furnace-dispatch/FurnaceDispatch.js');
const WASM_BIN_PATH = join(PROJECT_ROOT, 'public/furnace-dispatch/FurnaceDispatch.wasm');
const DEMOS_DIR = '/Users/spot/Code/Reference Code/furnace-master/demos';
const OUTPUT_DIR = join(PROJECT_ROOT, 'test-data/furnace-devilbox');

// ── WASM Module Loader ──────────────────────────────────────────────────────

interface WasmModule {
  _furnace_init(sampleRate: number): void;
  _furnace_dispatch_create(platformType: number, sampleRate: number): number;
  _furnace_dispatch_destroy(handle: number): void;
  _furnace_dispatch_reset(handle: number): void;
  _furnace_dispatch_cmd(handle: number, cmd: number, chan: number, val1: number, val2: number): void;
  _furnace_dispatch_tick(handle: number): void;
  _furnace_dispatch_render(handle: number, outL: number, outR: number, numSamples: number): void;
  _furnace_dispatch_get_num_channels(handle: number): number;
  _furnace_dispatch_set_tick_rate(handle: number, rate: number): void;
  _furnace_dispatch_set_compat_flag(handle: number, flag: number, val: number): void;
  _furnace_dispatch_set_compat_flags(handle: number, dataPtr: number, dataLen: number): void;
  _furnace_dispatch_set_flags(handle: number, flagsPtr: number, len: number): void;
  _furnace_dispatch_set_gb_instrument(handle: number, insIndex: number, dataPtr: number, dataLen: number): void;
  _furnace_dispatch_set_wavetable(handle: number, waveIndex: number, dataPtr: number, dataLen: number): void;
  _furnace_dispatch_set_instrument_full(handle: number, insIndex: number, dataPtr: number, dataLen: number): void;
  _furnace_dispatch_load_ins2(insIndex: number, dataPtr: number, dataLen: number): void;
  _furnace_dispatch_set_sample(handle: number, sampleIndex: number, dataPtr: number, dataLen: number): void;
  _furnace_dispatch_render_samples(handle: number): void;
  _furnace_dispatch_force_ins(handle: number): void;
  _furnace_dispatch_poke(handle: number, addr: number, val: number): void;
  // Sequencer API
  _furnace_seq_load_song(numChannels: number, patLen: number, ordersLen: number): void;
  _furnace_seq_set_cell(ch: number, pat: number, row: number, col: number, val: number): void;
  _furnace_seq_set_order(ch: number, pos: number, patIdx: number): void;
  _furnace_seq_set_effect_cols(ch: number, cols: number): void;
  _furnace_seq_play(order: number, row: number): void;
  _furnace_seq_stop(): void;
  _furnace_seq_tick(): number; // returns (order << 16) | row
  _furnace_seq_set_speed(speed1: number, speed2: number): void;
  _furnace_seq_set_speed_pattern(ptr: number, len: number): void;
  _furnace_seq_set_tempo(virtualN: number, virtualD: number): void;
  _furnace_seq_set_divider(hz: number): void;
  _furnace_seq_get_divider(): number;
  _furnace_seq_set_dispatch_handle(handle: number): void;
  _furnace_seq_set_sample_rate(sr: number): void;
  _furnace_seq_set_compat_flags(flags: number, flagsExt: number, pitchSlideSpeed: number): void;
  _furnace_seq_set_groove_entry(index: number, valuesPtr: number, len: number): void;
  _furnace_seq_set_channel_chip(channel: number, chipId: number, subIdx: number): void;
  _furnace_seq_set_channel_dispatch(channel: number, handle: number): void;
  _furnace_seq_set_mute(channel: number, mute: number): void;
  _furnace_seq_is_playing(): number;
  _furnace_seq_get_order(): number;
  _furnace_seq_get_row(): number;
  _furnace_seq_set_remaining_loops(loops: number): void;
  _furnace_seq_get_total_loops(): number;
  // Command log API
  _furnace_cmd_log_enable(enable: number): void;
  _furnace_cmd_log_count(): number;
  _furnace_cmd_log_get(): number; // returns pointer to int array
  _malloc(size: number): number;
  _free(ptr: number): void;
  HEAPU8: Uint8Array;
  HEAP32: Int32Array;
  HEAPF32: Float32Array;
  HEAP32: Int32Array;
}

async function loadWasmModule(): Promise<WasmModule> {
  const wasmBinaryBuf = readFileSync(WASM_BIN_PATH);
  const wasmBinary = wasmBinaryBuf.buffer.slice(
    wasmBinaryBuf.byteOffset,
    wasmBinaryBuf.byteOffset + wasmBinaryBuf.byteLength,
  );

  // Load the Emscripten JS factory
  const jsCode = readFileSync(WASM_JS_PATH, 'utf8');

  // The WASM is built with ENVIRONMENT='web,worker' which skips Node.js setup.
  // We need to intercept WebAssembly.instantiate to capture the memory object,
  // since HEAPU8/HEAPF32 aren't exported by default in this build.
  let capturedMemory: WebAssembly.Memory | null = null;
  const origInstantiate = WebAssembly.instantiate;
  (WebAssembly as any).instantiate = async (source: any, imports: any) => {
    const result = await origInstantiate(source, imports);
    // Capture the memory from the exports
    const instance = 'instance' in result ? result.instance : result;
    if (instance.exports.memory) {
      capturedMemory = instance.exports.memory as WebAssembly.Memory;
    }
    return result;
  };

  // Provide require(), __dirname, __filename for Emscripten's Node.js detection
  const require = createRequire(import.meta.url);
  const __dirname = dirname(WASM_JS_PATH);
  const __filename = WASM_JS_PATH;

  const factory = new Function('globalThis', 'require', '__dirname', '__filename', `
    ${jsCode}
    return createFurnaceDispatch;
  `)(globalThis, require, __dirname, __filename);

  try {
    const module = await factory({
      wasmBinary,
      print: (text: string) => { console.log('[WASM]', text); },
      printErr: (text: string) => { if (!text.includes('warning')) console.error('[WASM ERR]', text); },
      // Provide locateFile so Emscripten finds the .wasm file
      locateFile: (path: string) => {
        if (path.endsWith('.wasm')) return WASM_BIN_PATH;
        return path;
      },
    }) as WasmModule;

    // Patch HEAP views from captured memory
    if (capturedMemory) {
      const buf = capturedMemory.buffer;
      module.HEAPU8 = new Uint8Array(buf);
      module.HEAPF32 = new Float32Array(buf);
      module.HEAP32 = new Int32Array(buf);
      // Store memory ref so we can update views after growth
      (module as any)._wasmMemory = capturedMemory;
    }

    return module;
  } finally {
    WebAssembly.instantiate = origInstantiate;
  }
}

/** Refresh heap views after potential memory growth */
function updateHeapViews(wasm: WasmModule): void {
  const mem = (wasm as any)._wasmMemory as WebAssembly.Memory | undefined;
  if (!mem) return;
  const buf = mem.buffer;
  if (wasm.HEAPU8.buffer !== buf) {
    wasm.HEAPU8 = new Uint8Array(buf);
    wasm.HEAPF32 = new Float32Array(buf);
    wasm.HEAP32 = new Int32Array(buf);
  }
}

// ── Furnace Parser Integration ───────────────────────────────────────────────

// Dynamic import of our parser (uses TypeScript path aliases via tsx)
async function parseFurFile(filePath: string) {
  const { parseFurnaceSong, buildFurnaceNativeData } = await import('../../src/lib/import/formats/FurnaceSongParser.js');
  const buffer = readFileSync(filePath);
  const arrayBuffer = buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength);
  const module = await parseFurnaceSong(arrayBuffer);
  const furnaceNative = buildFurnaceNativeData(module);
  return { module, furnaceNative, instruments: module.instruments, wavetables: module.wavetables, samples: module.samples };
}

// ── Chip Channel Count Table ─────────────────────────────────────────────────

// Mirrors CHIP_CHANNELS from FurnaceSongParser.ts
const CHIP_CHANNELS: Record<number, number> = {
  0x01: 4, // Genesis/YM2612
  0x02: 4, // SMS/SN76489
  0x03: 4, // Game Boy
  0x04: 6, // PC Engine
  0x05: 5, // NES
  0x06: 3, // C64 (6581)
  0x07: 8, // Arcade (YM2151+SegaPCM)
  0x08: 13, // Arcade compound
  0x42: 13, // YM2151
  0x43: 5, // SegaPCM
  0x47: 6, // AY-3-8910
  0x49: 8, // Amiga
  0x80: 4, // Game Boy
  0x81: 6, // YM2612 ext
  0x82: 13, // YM2151
  0x83: 3, // YM2610
  0x84: 6, // AY-3-8914
  0x85: 5, // Amiga
  0x87: 4, // PC Engine
  0x88: 3, // AY-3-8910
  0x89: 4, // SMS
  0x8a: 6, // OPL
  0x8b: 9, // OPL2
  0x8c: 18, // OPL3
  0x8d: 4, // Dummy
  0x8e: 4, // PCSPKR
  0x8f: 4, // Pokemon Mini
  0x90: 6, // AY-3-8910
  0x91: 3, // Genesis ext ch3
  0x92: 3, // C64 8580
  0x93: 4, // YMU759
  0x94: 4, // Lynx
  0x95: 5, // VERA
  0x96: 3, // OPLL (Konami VRC7)
  0x97: 3, // TIA
  0x98: 4, // SAA1099
  0x99: 8, // AY-3-8910 (8ch)
  0x9a: 4, // Amiga
  0x9b: 6, // YM2612 DualPCM
  0x9c: 5, // Seta/Allumer X1-010
  0x9d: 4, // ES5506
  0x9e: 3, // SCC
  0x9f: 9, // OPL drum
  0xa0: 9, // OPLL drum
  0xa1: 6, // VRC6
  0xa2: 6, // ES5503
  0xa3: 2, // T6W28
  0xa4: 6, // K007232
  0xa5: 4, // GA20
  0xa6: 6, // SM8521
  0xa7: 6, // PV-1000
  0xa8: 4, // K053260
  0xa9: 5, // SegaPCM compat
  0xaa: 7, // C140
  0xab: 6, // RF5C68
  0xac: 6, // MSM6295
  0xad: 4, // MSM6258
  0xae: 4, // YMZ280B
  0xaf: 3, // Namco WSG
  0xb0: 8, // Namco C15
  0xb1: 24, // Namco C30
  0xb2: 4, // MSM5232
  0xb3: 4, // Dave
  0xb4: 6, // GBA DMA
  0xb5: 16, // GBA minmod
  0xb6: 4, // ZX beeper
  0xb7: 6, // YM2612 CSM
  0xb8: 10, // YM2610 ext
  0xb9: 1, // PoKey
  0xba: 16, // NDS
  0xbb: 6, // PCM DAC
  0xbc: 4, // Pong
  0xbd: 4, // VIC-20
  0xbe: 5, // Pet
  0xbf: 6, // BSNES
  0xc0: 3, // N163
  0xc1: 5, // FDS
  0xc2: 4, // SU
  0xc3: 8, // Namco C163
  0xc4: 4, // OPN
  0xc5: 6, // OPN ext
  0xc6: 6, // OPNA
  0xc7: 9, // OPNA ext
  0xc8: 6, // OPNA drum
  0xc9: 9, // OPNA drum ext
  0xca: 3, // PC-98
  0xcb: 6, // OPN2 ext
  0xcc: 4, // SegaSonic
  0xcd: 16, // multiPCM
  0xce: 1, // Bifurcator
  0xcf: 4, // SiOPM
  0xd0: 4, // ESFM
  0xd1: 6, // PowerNoise
  0xd2: 7, // Dave
  0xd3: 12, // NDS
  0xd4: 6, // GBA DMA
  0xd5: 4, // 5E01
  0xd6: 4, // SID2
  0xde: 1, // YM2612 ext CSM
  0xe0: 4, // QSound
  0xe1: 3, // MMC5
  0xe5: 6, // OPLL
  0xe7: 4, // FZT
  0xf1: 4, // Sound Unit
  0xf5: 6, // VSU
  0xfc: 6, // K051649
  0xfd: 16, // C219
  0xfe: 32, // Dummy
  0xff: 4, // System
};

// ── Per-Platform getPostAmp() ────────────────────────────────────────────────
// From Furnace source: each platform can override getPostAmp() for volume scaling.
// Default is 1.0. Keys are DivSystem enum values (matching FurnaceDispatchWrapper.cpp).
const POST_AMP: Record<number, number> = {
  // SMS / SN76489 family — 1.5
  4: 1.5,   // DIV_SYSTEM_SMS
  5: 1.5,   // DIV_SYSTEM_SMS_OPLL (compound)
  83: 1.5,  // DIV_SYSTEM_T6W28 (SMS derivative)
  // OPLL family — 1.5
  28: 1.5,  // DIV_SYSTEM_OPLL
  48: 1.5,  // DIV_SYSTEM_VRC7
  59: 1.5,  // DIV_SYSTEM_OPLL_DRUMS
  // NES — 2.0
  8: 2.0,   // DIV_SYSTEM_NES
  106: 2.0, // DIV_SYSTEM_5E01 (NES variant)
  // Genesis / YM2612 — 2.0
  2: 2.0,   // DIV_SYSTEM_GENESIS (compound)
  3: 2.0,   // DIV_SYSTEM_GENESIS_EXT
  20: 2.0,  // DIV_SYSTEM_YM2612
  52: 2.0,  // DIV_SYSTEM_YM2612_EXT
  80: 2.0,  // DIV_SYSTEM_YM2612_DUALPCM
  81: 2.0,  // DIV_SYSTEM_YM2612_DUALPCM_EXT
  89: 2.0,  // DIV_SYSTEM_YM2612_CSM
  // POKEY — 2.0
  41: 2.0,  // DIV_SYSTEM_POKEY
  // FDS — 2.0 (useNP default)
  29: 2.0,  // DIV_SYSTEM_FDS
  // C64 — 3.0 (reSIDfp core)
  11: 3.0,  // DIV_SYSTEM_C64_6581
  12: 3.0,  // DIV_SYSTEM_C64_8580
  // C140/C219 — 3.0
  98: 3.0,  // DIV_SYSTEM_C140
  99: 3.0,  // DIV_SYSTEM_C219
  // MSM6295 — 3.0
  74: 3.0,  // DIV_SYSTEM_MSM6295
  // X1-010, YMZ280B, VERA — 4.0
  65: 4.0,  // DIV_SYSTEM_X1_010
  76: 4.0,  // DIV_SYSTEM_YMZ280B
  62: 4.0,  // DIV_SYSTEM_VERA
  // VSU / Virtual Boy — 6.0
  47: 6.0,  // DIV_SYSTEM_VBOY
  // MMC5 — 64.0
  30: 64.0, // DIV_SYSTEM_MMC5
  // TIA — 0.5
  21: 0.5,  // DIV_SYSTEM_TIA
};

function getPostAmp(chipId: number): number {
  return POST_AMP[chipId] ?? 1.0;
}

// ── Instrument Encoder ───────────────────────────────────────────────────────

async function encodeInstrumentForWasm(
  instrument: any,
  insIndex: number,
): Promise<Uint8Array | null> {
  // If the instrument has rawBinaryData from the .fur parser, use it directly
  if (instrument.rawBinaryData && instrument.rawBinaryData.length > 0) {
    return new Uint8Array(instrument.rawBinaryData);
  }
  return null;
}

// ── WAV Writer ───────────────────────────────────────────────────────────────

function writeWav(
  filePath: string,
  samples: Float32Array, // interleaved stereo
  sampleRate: number,
  channels: number = 2,
): void {
  const bitsPerSample = 16;
  const bytesPerSample = bitsPerSample / 8;
  const numFrames = samples.length / channels;
  const dataSize = numFrames * channels * bytesPerSample;
  const headerSize = 44;
  const buffer = Buffer.alloc(headerSize + dataSize);

  // RIFF header
  buffer.write('RIFF', 0);
  buffer.writeUInt32LE(36 + dataSize, 4);
  buffer.write('WAVE', 8);

  // fmt chunk
  buffer.write('fmt ', 12);
  buffer.writeUInt32LE(16, 16); // chunk size
  buffer.writeUInt16LE(1, 20); // PCM format
  buffer.writeUInt16LE(channels, 22);
  buffer.writeUInt32LE(sampleRate, 24);
  buffer.writeUInt32LE(sampleRate * channels * bytesPerSample, 28); // byte rate
  buffer.writeUInt16LE(channels * bytesPerSample, 32); // block align
  buffer.writeUInt16LE(bitsPerSample, 34);

  // data chunk
  buffer.write('data', 36);
  buffer.writeUInt32LE(dataSize, 40);

  // Convert float samples to 16-bit PCM
  let offset = headerSize;
  for (let i = 0; i < samples.length; i++) {
    const clamped = Math.max(-1, Math.min(1, samples[i]));
    const val = Math.round(clamped * 32767);
    buffer.writeInt16LE(val, offset);
    offset += 2;
  }

  mkdirSync(dirname(filePath), { recursive: true });
  writeFileSync(filePath, buffer);
}

// ── Headless Renderer ────────────────────────────────────────────────────────

interface RenderResult {
  file: string;
  success: boolean;
  error?: string;
  duration?: number;
  wavSize?: number;
}

async function renderFurFile(furPath: string, outPath: string): Promise<RenderResult> {
  const relPath = relative(DEMOS_DIR, furPath);

  try {
    // 1. Parse the .fur file
    const parsed = await parseFurFile(furPath);
    if (!parsed) throw new Error('Parser returned null');

    const module = parsed.module;
    const native = parsed.furnaceNative;
    if (!native) throw new Error('No furnaceNative data');

    const sub = native.subsongs[0];
    if (!sub) throw new Error('No subsongs');

    // 2. Load WASM module
    const wasm = await loadWasmModule();
    wasm._furnace_init(SAMPLE_RATE);

    // 3. Create chips
    const chipIds = native.chipIds || [];
    if (chipIds.length === 0) throw new Error('No chip IDs');
    // Each entry: { handle, chipId } — one per system slot (duplicates allowed)
    const chipInstances: Array<{ handle: number; chipId: number }> = [];
    let totalChannels = 0;

    for (const chipId of chipIds) {
      const handle = wasm._furnace_dispatch_create(chipId, SAMPLE_RATE);
      if (handle <= 0) throw new Error(`Failed to create chip 0x${chipId.toString(16)}`);
      chipInstances.push({ handle, chipId });
      wasm._furnace_dispatch_set_tick_rate(handle, sub.hz || 60);
      // Set linear pitch
      wasm._furnace_dispatch_set_compat_flag(handle, 0, native.compatFlags?.linearPitch ?? 2);
      totalChannels += wasm._furnace_dispatch_get_num_channels(handle);
    }

    // Link first chip to sequencer
    const firstHandle = chipInstances[0].handle;

    // 4. Upload chip flags if available
    if (native.chipFlags) {
      for (let i = 0; i < chipIds.length; i++) {
        const flagStr = native.chipFlags[i];
        if (!flagStr) continue;
        const handle = chipInstances[i]?.handle;
        if (handle == null) continue;
        const flagBytes = new TextEncoder().encode(flagStr);
        const flagPtr = wasm._malloc(flagBytes.length + 1);
        wasm.HEAPU8.set(flagBytes, flagPtr);
        wasm.HEAPU8[flagPtr + flagBytes.length] = 0; // null-terminate
        wasm._furnace_dispatch_set_flags(handle, flagPtr, flagBytes.length);
        wasm._free(flagPtr);
        // Reset dispatch after setFlags() so APU re-inits with new model/clock
        // (matches Furnace: init() does setFlags() then reset() atomically)
        wasm._furnace_dispatch_reset(handle);
      }
    }

    // 4b. Apply tuning if non-standard
    if (native.tuning !== undefined && native.tuning !== 440.0) {
      for (const chip of chipInstances) {
        wasm._furnace_dispatch_set_tuning(chip.handle, native.tuning);
      }
    }

    // 5. Upload instruments using raw INS2 binary data
    updateHeapViews(wasm);
    const instruments = parsed.instruments || [];
    for (let i = 0; i < instruments.length; i++) {
      const inst = instruments[i];
      if (inst.rawBinaryData && inst.rawBinaryData.byteLength > 0) {
        const rawData = new Uint8Array(inst.rawBinaryData);
        updateHeapViews(wasm);
        const dataPtr = wasm._malloc(rawData.length);
        updateHeapViews(wasm);
        wasm.HEAPU8.set(rawData, dataPtr);
        try {
          wasm._furnace_dispatch_load_ins2(i, dataPtr, rawData.length);
        } catch (e) {
          console.error(`[render] Instrument ${i} upload crashed: ${(e as Error).message}`);
        }
        wasm._free(dataPtr);
      }
    }

    // 6. Upload wavetables
    // Format expected by _furnace_dispatch_set_wavetable: [len:i32][max:i32][data:i32*len]
    const wavetables = parsed.wavetables || [];
    for (let i = 0; i < wavetables.length; i++) {
      const wt = wavetables[i];
      if (!wt.data || wt.data.length === 0) continue;
      const wtLen = wt.data.length;
      const wtMax = wt.height ?? wt.max ?? 15; // Parser stores as 'height', not 'max'
      // Pack header + data
      const packed = new Int32Array(2 + wtLen);
      packed[0] = wtLen;
      packed[1] = wtMax;
      for (let j = 0; j < wtLen; j++) packed[2 + j] = wt.data[j];
      updateHeapViews(wasm);
      const wtPtr = wasm._malloc(packed.byteLength);
      updateHeapViews(wasm);
      wasm.HEAPU8.set(new Uint8Array(packed.buffer), wtPtr);
      try {
        // Sync wavetable to ALL chip instances (not just first) — multi-chip songs
        // need wavetables on every dispatch (e.g., FDS needs its own engine.song.wave)
        for (const { handle } of chipInstances) {
          wasm._furnace_dispatch_set_wavetable(handle, i, wtPtr, packed.byteLength);
        }
      } catch (e) {
        console.error(`[render] Wavetable ${i} upload crashed: ${(e as Error).message}`);
      }
      wasm._free(wtPtr);
    }

    // 7. Upload samples (Game Boy has no samples, so this is typically empty for GB)
    // Header format must match FurnaceDispatchEngine.ts uploadModuleSamples() and
    // FurnaceDispatchWrapper.cpp furnace_dispatch_set_sample() — 32-byte header:
    //   [0-3]   samples (uint32, frame count)
    //   [4-7]   loopStart (int32)
    //   [8-11]  loopEnd (int32)
    //   [12]    depth (DIV_SAMPLE_DEPTH)
    //   [13]    loopMode
    //   [14]    brrEmphasis (bool — default true in Furnace DivSample)
    //   [15]    brrNoFilter (bool)
    //   [16-19] centerRate (uint32)
    //   [22]    loop enabled flag
    //   [32+]   sample data
    const samples = parsed.samples || [];
    for (let i = 0; i < samples.length; i++) {
      const smp = samples[i];
      if (!smp.data || smp.data.length === 0) continue;

      // Determine sample count (frame count) and PCM byte size
      // For compressed formats (DPCM, ADPCM, BRR), data.length is BYTE count, not frame count
      // Use smp.samples (frame count from parser) when available
      let sampleCount: number;
      let pcmBytes: number;
      if ((smp.depth || 16) === 16) {
        sampleCount = smp.data instanceof Int16Array ? smp.data.length : Math.floor(smp.data.length / 2);
        pcmBytes = sampleCount * 2;
      } else if ((smp.depth || 16) === 8) {
        sampleCount = smp.data.length;
        pcmBytes = smp.data.length;
      } else {
        // Compressed format: frame count != byte count
        // FurnaceSample uses 'length' for frame count; module samples use 'samples'
        sampleCount = (smp as any).samples || (smp as any).length || smp.data.length;
        pcmBytes = smp.data.length;
      }

      const headerSize = 32;
      const totalLen = headerSize + pcmBytes;
      const blob = new Uint8Array(totalLen);
      const view = new DataView(blob.buffer);
      view.setUint32(0, sampleCount, true);                   // samples (frame count)
      view.setInt32(4, smp.loopStart || 0, true);             // loopStart
      view.setInt32(8, smp.loopEnd || 0, true);               // loopEnd
      view.setUint8(12, smp.depth || 16);                     // depth
      view.setUint8(13, (smp as any).loopDirection ?? (smp as any).loopMode ?? 0); // loopMode
      view.setUint8(14, (smp as any).brrEmphasis === false ? 0 : 1);  // brrEmphasis (default true in Furnace DivSample)
      view.setUint8(15, (smp as any).brrNoFilter ? 1 : 0);  // brrNoFilter
      view.setUint32(16, (smp as any).c4Rate || (smp as any).rate || (smp as any).compatRate || 0, true); // centerRate (0 = use default off=1.0 in chip)
      view.setUint8(22, (smp as any).loop ? 1 : 0); // loop flag (from SMP2 flags bit 0)

      // Copy PCM data after header
      if (smp.data instanceof Int16Array) {
        const pcmView = new DataView(blob.buffer, headerSize);
        for (let j = 0; j < smp.data.length; j++) {
          pcmView.setInt16(j * 2, smp.data[j], true);
        }
      } else {
        blob.set(new Uint8Array(smp.data.buffer, smp.data.byteOffset, smp.data.byteLength), headerSize);
      }

      updateHeapViews(wasm);
      const smpPtr = wasm._malloc(totalLen);
      updateHeapViews(wasm);
      wasm.HEAPU8.set(blob, smpPtr);
      try {
        // Sync sample to ALL chip instances (not just first) — multi-chip songs
        // need samples on every dispatch that references them
        for (const { handle } of chipInstances) {
          wasm._furnace_dispatch_set_sample(handle, i, smpPtr, totalLen);
        }
      } catch (e) {
        console.error(`[render] Sample ${i} upload crashed: ${(e as Error).message}`);
      }
      wasm._free(smpPtr);
    }

    // Render samples in chip
    for (const { handle } of chipInstances) {
      try {
        wasm._furnace_dispatch_render_samples(handle);
      } catch (e) {
        console.error(`[render] renderSamples crashed: ${(e as Error).message}`);
      }
    }

    // 8. Upload sequencer data (patterns, orders, config)
    const numChannels = sub.channels.length;
    const patLen = sub.patLen;
    const ordersLen = sub.ordersLen;

    wasm._furnace_seq_load_song(numChannels, patLen, ordersLen);
    wasm._furnace_seq_set_dispatch_handle(firstHandle);
    wasm._furnace_seq_set_sample_rate(SAMPLE_RATE);
    wasm._furnace_seq_set_divider(sub.hz || 60);

    // Effect columns
    for (let ch = 0; ch < numChannels; ch++) {
      const effectCols = sub.channels[ch]?.effectCols ?? 1;
      wasm._furnace_seq_set_effect_cols(ch, effectCols);
    }

    // Orders
    for (let ch = 0; ch < numChannels; ch++) {
      for (let pos = 0; pos < ordersLen; pos++) {
        const patIdx = sub.orders[ch]?.[pos] ?? 0;
        wasm._furnace_seq_set_order(ch, pos, patIdx);
      }
    }

    // Pattern data
    for (let ch = 0; ch < numChannels; ch++) {
      const chanData = sub.channels[ch];
      if (!chanData) continue;
      const effectCols = chanData.effectCols;

      for (const [patIdx, patData] of chanData.patterns) {
        for (let row = 0; row < patLen; row++) {
          const fRow = patData.rows[row];
          if (!fRow) continue;

          // Note: convert to Furnace C++ convention (note+60)
          if (fRow.note !== -1) {
            const noteForSeq = fRow.note >= 253 ? fRow.note : fRow.note + 60;
            wasm._furnace_seq_set_cell(ch, patIdx, row, 0, noteForSeq);
          }
          if (fRow.ins !== -1) {
            wasm._furnace_seq_set_cell(ch, patIdx, row, 1, fRow.ins);
          }
          if (fRow.vol !== -1) {
            wasm._furnace_seq_set_cell(ch, patIdx, row, 2, fRow.vol);
          }
          for (let fx = 0; fx < effectCols && fx < fRow.effects.length; fx++) {
            const eff = fRow.effects[fx];
            if (!eff) continue;
            if (eff.cmd !== -1) {
              wasm._furnace_seq_set_cell(ch, patIdx, row, 3 + fx * 2, eff.cmd);
            }
            if (eff.val !== -1) {
              wasm._furnace_seq_set_cell(ch, patIdx, row, 4 + fx * 2, eff.val);
            }
          }
        }
      }
    }

    // Speed/tempo — use speedPattern from parsed module (not nativeData which lacks it)
    const parsedSub = module.subsongs?.[0] as any;
    const speedPattern = parsedSub?.speedPattern;
    if (speedPattern && speedPattern.length > 0) {
      const len = Math.min(speedPattern.length, 16);
      const spPtr = wasm._malloc(len * 2); // uint16_t = 2 bytes
      updateHeapViews(wasm);
      const heap16 = new Uint16Array(wasm.HEAPU8.buffer, spPtr, len);
      for (let i = 0; i < len; i++) heap16[i] = speedPattern[i];
      wasm._furnace_seq_set_speed_pattern(spPtr, len);
      wasm._free(spPtr);
      console.log(`[render] Speed pattern: [${speedPattern.join(',')}] (len=${len})`);
    } else {
      wasm._furnace_seq_set_speed(sub.speed1, sub.speed2);
      console.log(`[render] Speed: ${sub.speed1}/${sub.speed2}`);
    }
    wasm._furnace_seq_set_tempo(sub.virtualTempoN || 150, sub.virtualTempoD || 150);

    // Compat flags — sequencer flags (bitmask) + dispatch flags (binary struct)
    if (native.compatFlags) {
      const { flags, flagsExt, pitchSlideSpeed } = packCompatFlags(native.compatFlags);
      wasm._furnace_seq_set_compat_flags(flags, flagsExt, pitchSlideSpeed);

      // Send ALL compat flags to each dispatch instance (matches DivCompatFlags struct order)
      const flagBytes = packDispatchCompatFlags(native.compatFlags);
      const flagPtr = wasm._malloc(flagBytes.length);
      updateHeapViews(wasm);
      wasm.HEAPU8.set(flagBytes, flagPtr);
      for (const { handle } of chipInstances) {
        wasm._furnace_dispatch_set_compat_flags(handle, flagPtr, flagBytes.length);
      }
      wasm._free(flagPtr);
      console.log(`[render] Dispatch compat flags: ${flagBytes.length} bytes sent to ${chipInstances.length} chip(s)`);
      // Log key flags for debugging
      const cf = native.compatFlags as Record<string, unknown>;
      console.log(`[render]   gbInsAffectsEnvelope=${cf.gbInsAffectsEnvelope}, newVolumeScaling=${cf.newVolumeScaling}, brokenOutVol=${cf.brokenOutVol}, brokenOutVol2=${cf.brokenOutVol2}, oldAlwaysSetVolume=${cf.oldAlwaysSetVolume}`);
    }

    // Grooves
    if (native.grooves) {
      for (let i = 0; i < native.grooves.length; i++) {
        const groove = native.grooves[i];
        const len = Math.min(groove.len, 16);
        const ptr = wasm._malloc(len * 2); // uint16_t = 2 bytes
        updateHeapViews(wasm);
        const heap16 = new Uint16Array(wasm.HEAPU8.buffer, ptr, len);
        for (let j = 0; j < len; j++) heap16[j] = groove.val[j] || 6;
        wasm._furnace_seq_set_groove_entry(i, ptr, len);
        wasm._free(ptr);
      }
    }

    // Channel → chip mapping + per-channel dispatch handle for multi-chip routing
    if (chipInstances.length > 0) {
      let chanOffset = 0;
      for (const { handle, chipId } of chipInstances) {
        const chipChans = wasm._furnace_dispatch_get_num_channels(handle);
        for (let subIdx = 0; subIdx < chipChans && (chanOffset + subIdx) < numChannels; subIdx++) {
          wasm._furnace_seq_set_channel_chip(chanOffset + subIdx, chipId, subIdx);
          wasm._furnace_seq_set_channel_dispatch(chanOffset + subIdx, handle);
        }
        chanOffset += chipChans;
      }
    }

    // 9. Reset all dispatches before play (matches Furnace playSub→reset→dispatch->reset())
    // Note: forceIns() is NOT called here — Furnace only calls it when seeking to non-zero position
    for (const { handle } of chipInstances) {
      wasm._furnace_dispatch_reset(handle);
    }

    // 10. Allocate output buffers
    const outPtrL = wasm._malloc(BUFFER_SIZE * 4);
    const outPtrR = wasm._malloc(BUFFER_SIZE * 4);

    // 11. Start playback and render
    const postAmps = chipInstances.map(c => getPostAmp(c.chipId));
    console.log(`[render] Volume: masterVol=${module.masterVol}, systemVol=[${module.systemVol.join(',')}], postAmp=[${postAmps.join(',')}], systemPan=[${module.systemPan.join(',')}]`);
    console.log(`[render] Starting playback: ${numChannels}ch, patLen=${patLen}, orders=${ordersLen}, speed=${sub.speed1}/${sub.speed2}, hz=${sub.hz}, vTempoN=${sub.virtualTempoN}, vTempoD=${sub.virtualTempoD}`);
    // Enable command logging if --cmdlog flag is present
    const cmdLogEnabled = process.argv.includes('--cmdlog');
    if (cmdLogEnabled) {
      wasm._furnace_cmd_log_enable(1);
    }

    // Set remaining loops to 1: play through once, stop at first loop detection
    // Note: Furnace CLI `-loops 0` also does exportLoopCount=1, stops after first loop
    wasm._furnace_seq_set_remaining_loops(1);
    wasm._furnace_seq_play(0, 0);

    const tickRate = sub.hz || 60;
    const maxSamples = MAX_RENDER_SECONDS * SAMPLE_RATE;

    console.log(`[render] samplesPerTick=${(SAMPLE_RATE / tickRate).toFixed(2)}, tickRate=${tickRate}`);

    // Collect all rendered samples
    const outputChunks: Float32Array[] = [];
    let totalRenderedSamples = 0;
    let lastOrder = 0;
    let songEnded = false;
    let tickCount = 0;
    let maxAmplitude = 0;

    // Track if we've seen the song loop (order goes back to 0 after reaching end)
    let maxOrderSeen = 0;

    // Pre-compute per-chip volume/pan (constant for the render)
    const chipVolL: number[] = [];
    const chipVolR: number[] = [];
    for (let ci = 0; ci < chipInstances.length; ci++) {
      const sysVol = module.systemVol[ci] ?? 1.0;
      const postAmp = getPostAmp(chipInstances[ci].chipId);
      const baseVol = sysVol * postAmp * (module.masterVol ?? 1.0);
      const pan = module.systemPan?.[ci] ?? 0.0;
      const panFR = module.systemPanFR?.[ci] ?? 0.0;
      chipVolL.push(baseVol * Math.min(1.0, 1.0 - pan) * Math.min(1.0, 1.0 + panFR));
      chipVolR.push(baseVol * Math.min(1.0, 1.0 + pan) * Math.min(1.0, 1.0 + panFR));
    }

    // Integer tick accumulator with clockDrift (matches Furnace playback.cpp:2004-2025)
    // cycles = samples until next tick; clockDrift accumulates fractional remainder
    let cycles = 0; // 0 means tick fires immediately on first iteration (matches Furnace)
    let divider = tickRate; // may change mid-song via effects 0xC0-0xC3/0xF0
    let clockDrift = 0.0;

    // Helper: process one tick (sequencer + all chips)
    function doTick(): boolean {
      try {
        if (!wasm._furnace_seq_is_playing()) {
          console.log(`[render] Sequencer stopped at tick ${tickCount}`);
          return false;
        }
        const pos = wasm._furnace_seq_tick();
        const currentOrder = (pos >> 16) & 0xFFFF;
        const currentRow = pos & 0xFFFF;

        if (currentRow === 0 && currentOrder !== lastOrder) {
          console.log(`[render] tick ${tickCount}: order=${currentOrder} row=${currentRow}`);
        }
        tickCount++;

        if (currentOrder > maxOrderSeen) {
          maxOrderSeen = currentOrder;
        }
        lastOrder = currentOrder;

        for (const { handle } of chipInstances) {
          wasm._furnace_dispatch_tick(handle);
        }
        return true;
      } catch (e) {
        throw new Error(`Tick crashed at order=${lastOrder} sample=${totalRenderedSamples}: ${(e as Error).message}`);
      }
    }

    // Helper: render exactly `count` samples from all chips, mix into output arrays at `offset`
    function renderSamples(chunkL: Float32Array, chunkR: Float32Array, offset: number, count: number) {
      for (let ci = 0; ci < chipInstances.length; ci++) {
        wasm._furnace_dispatch_render(chipInstances[ci].handle, outPtrL, outPtrR, count);
        updateHeapViews(wasm);
        const heapF32 = wasm.HEAPF32;
        const offL = outPtrL >> 2;
        const offR = outPtrR >> 2;
        const vL = chipVolL[ci];
        const vR = chipVolR[ci];
        for (let i = 0; i < count; i++) {
          chunkL[offset + i] += heapF32[offL + i] * vL;
          chunkR[offset + i] += heapF32[offR + i] * vR;
        }
      }
    }

    // Main render loop: sample-accurate tick-render interleaving
    // Mirrors Furnace playback.cpp:3079-3237 — render between tick boundaries
    while (totalRenderedSamples < maxSamples && !songEnded) {
      const chunkL = new Float32Array(BUFFER_SIZE);
      const chunkR = new Float32Array(BUFFER_SIZE);
      let samplesLeft = BUFFER_SIZE;
      let chunkOffset = 0;

      while (samplesLeft > 0) {
        // If cycles exhausted, fire a tick
        if (cycles <= 0) {
          if (!doTick()) {
            songEnded = true;
            // Render remaining samples before breaking
            if (chunkOffset > 0) {
              // Already have some rendered samples in this chunk
            }
            break;
          }
          // Read current divider from sequencer (may change via effects 0xC0-0xC3/0xF0)
          divider = wasm._furnace_seq_get_divider();
          if (divider < 1) divider = 1;
          // Compute samples until next tick (integer + clockDrift, matches Furnace)
          cycles = Math.floor(SAMPLE_RATE / divider);
          clockDrift += SAMPLE_RATE % divider;
          if (clockDrift >= divider) {
            clockDrift -= divider;
            cycles++;
          }
        }

        // Render min(cycles, samplesLeft) samples
        const toRender = Math.min(cycles, samplesLeft);
        renderSamples(chunkL, chunkR, chunkOffset, toRender);
        chunkOffset += toRender;
        samplesLeft -= toRender;
        cycles -= toRender;
      }

      if (chunkOffset === 0 && songEnded) break;

      // Track max amplitude
      for (let i = 0; i < chunkOffset; i++) {
        const absL = Math.abs(chunkL[i]);
        const absR = Math.abs(chunkR[i]);
        if (absL > maxAmplitude) maxAmplitude = absL;
        if (absR > maxAmplitude) maxAmplitude = absR;
      }

      // Log audio levels periodically (every ~1 second)
      if (totalRenderedSamples > 0 && totalRenderedSamples % SAMPLE_RATE < BUFFER_SIZE) {
        const secNum = Math.floor(totalRenderedSamples / SAMPLE_RATE);
        if (secNum <= 5) {
          console.log(`[render] @${secNum}s: maxAmp=${maxAmplitude.toFixed(6)}, ticks=${tickCount}`);
        }
      }

      // Interleave L/R
      const interleaved = new Float32Array(chunkOffset * 2);
      for (let i = 0; i < chunkOffset; i++) {
        interleaved[i * 2] = chunkL[i];
        interleaved[i * 2 + 1] = chunkR[i];
      }
      outputChunks.push(interleaved);
      totalRenderedSamples += chunkOffset;
    }

    console.log(`[render] Done: ${tickCount} ticks, maxAmp=${maxAmplitude.toFixed(6)}, ${(totalRenderedSamples/SAMPLE_RATE).toFixed(1)}s`);

    // 11. Concatenate and write WAV
    const totalInterleavedSamples = outputChunks.reduce((sum, c) => sum + c.length, 0);
    const allSamples = new Float32Array(totalInterleavedSamples);
    let writeOffset = 0;
    for (const chunk of outputChunks) {
      allSamples.set(chunk, writeOffset);
      writeOffset += chunk.length;
    }

    writeWav(outPath, allSamples, SAMPLE_RATE, 2);

    // Dump command log if enabled
    if (cmdLogEnabled) {
      const logCount = wasm._furnace_cmd_log_count();
      if (logCount > 0) {
        const logPtr = wasm._furnace_cmd_log_get();
        const logData = new Int32Array(wasm.HEAP32.buffer, logPtr, logCount * 6);
        const logPath = outPath.replace('.wav', '.cmdlog.txt');
        const lines: string[] = [`# tick cmd chan val1 val2 ret (${logCount} entries)`];
        for (let i = 0; i < Math.min(logCount, 50000); i++) {
          const tick = logData[i * 6 + 0];
          const cmd = logData[i * 6 + 1];
          const chan = logData[i * 6 + 2];
          const val1 = logData[i * 6 + 3];
          const val2 = logData[i * 6 + 4];
          const ret = logData[i * 6 + 5];
          lines.push(`${tick}\t${cmd}\t${chan}\t${val1}\t${val2}\t${ret}`);
        }
        writeFileSync(logPath, lines.join('\n'));
        console.log(`[render] Command log: ${logCount} entries written to ${logPath}`);
        wasm._free(logPtr);
      }
      wasm._furnace_cmd_log_enable(0);
    }

    // Cleanup
    wasm._free(outPtrL);
    wasm._free(outPtrR);
    for (const { handle } of chipInstances) {
      wasm._furnace_dispatch_destroy(handle);
    }

    const duration = totalRenderedSamples / SAMPLE_RATE;
    const wavSize = statSync(outPath).size;

    return { file: relPath, success: true, duration, wavSize };

  } catch (error) {
    const err = error as Error;
    return { file: relPath, success: false, error: `${err.message}\n${err.stack?.split('\n').slice(1, 4).join('\n')}` };
  }
}

// ── Compat Flags Packer (mirrors FurnaceSequencerSerializer.ts) ─────────────

/**
 * Pack compat flags into binary format for furnace_dispatch_set_compat_flags().
 * Each byte corresponds to a flag value, order matches DivCompatFlags struct
 * as consumed in FurnaceDispatchWrapper.cpp:1275-1332.
 */
function packDispatchCompatFlags(cf: Record<string, unknown>): Uint8Array {
  const flags = new Uint8Array(57); // 57 flags total (indices 0-56)
  let i = 0;
  flags[i++] = (cf.limitSlides as number) || 0;
  flags[i++] = (cf.linearPitch as number) ?? 2;
  flags[i++] = (cf.pitchSlideSpeed as number) || 4;
  flags[i++] = (cf.loopModality as number) || 0;
  flags[i++] = (cf.delayBehavior as number) || 0;
  flags[i++] = (cf.jumpTreatment as number) || 0;
  flags[i++] = (cf.properNoiseLayout as number) || 0;
  flags[i++] = (cf.waveDutyIsVol as number) || 0;
  flags[i++] = (cf.resetMacroOnPorta as number) || 0;
  flags[i++] = (cf.legacyVolumeSlides as number) || 0;
  flags[i++] = (cf.compatibleArpeggio as number) || 0;
  flags[i++] = (cf.noteOffResetsSlides as number) || 0;
  flags[i++] = (cf.targetResetsSlides as number) || 0;
  flags[i++] = (cf.arpNonPorta as number) || 0;
  flags[i++] = (cf.algMacroBehavior as number) || 0;
  flags[i++] = (cf.brokenShortcutSlides as number) || 0;
  flags[i++] = (cf.ignoreDuplicateSlides as number) || 0;
  flags[i++] = (cf.stopPortaOnNoteOff as number) || 0;
  flags[i++] = (cf.continuousVibrato as number) || 0;
  flags[i++] = (cf.brokenDACMode as number) || 0;
  flags[i++] = (cf.oneTickCut as number) || 0;
  flags[i++] = (cf.newInsTriggersInPorta as number) || 0;
  flags[i++] = (cf.arp0Reset as number) || 0;
  flags[i++] = (cf.brokenSpeedSel as number) || 0;
  flags[i++] = (cf.noSlidesOnFirstTick as number) || 0;
  flags[i++] = (cf.rowResetsArpPos as number) || 0;
  flags[i++] = (cf.ignoreJumpAtEnd as number) || 0;
  flags[i++] = (cf.buggyPortaAfterSlide as number) || 0;
  flags[i++] = (cf.gbInsAffectsEnvelope as number) || 0;
  flags[i++] = (cf.sharedExtStat as number) || 0;
  flags[i++] = (cf.ignoreDACModeOutsideChannel as number) || 0;
  flags[i++] = (cf.e1e2AlsoTakePriority as number) || 0;
  flags[i++] = (cf.newSegaPCM as number) || 0;
  flags[i++] = (cf.fbPortaPause as number) || 0;
  flags[i++] = (cf.snDutyReset as number) || 0;
  flags[i++] = (cf.pitchMacroIsLinear as number) || 0;
  flags[i++] = (cf.oldOctaveBoundary as number) || 0;
  flags[i++] = (cf.noOPN2Vol as number) || 0;
  flags[i++] = (cf.newVolumeScaling as number) || 0;
  flags[i++] = (cf.volMacroLinger as number) || 0;
  flags[i++] = (cf.brokenOutVol as number) || 0;
  flags[i++] = (cf.brokenOutVol2 as number) || 0;
  flags[i++] = (cf.e1e2StopOnSameNote as number) || 0;
  flags[i++] = (cf.brokenPortaArp as number) || 0;
  flags[i++] = (cf.snNoLowPeriods as number) || 0;
  flags[i++] = (cf.disableSampleMacro as number) || 0;
  flags[i++] = (cf.oldArpStrategy as number) || 0;
  flags[i++] = (cf.brokenPortaLegato as number) || 0;
  flags[i++] = (cf.brokenFMOff as number) || 0;
  flags[i++] = (cf.preNoteNoEffect as number) || 0;
  flags[i++] = (cf.oldDPCM as number) || 0;
  flags[i++] = (cf.resetArpPhaseOnNewNote as number) || 0;
  flags[i++] = (cf.ceilVolumeScaling as number) || 0;
  flags[i++] = (cf.oldAlwaysSetVolume as number) || 0;
  flags[i++] = (cf.oldSampleOffset as number) || 0;
  flags[i++] = (cf.oldCenterRate as number) || 0;
  flags[i++] = (cf.noVolSlideReset as number) || 0;
  return flags.subarray(0, i);
}

function packCompatFlags(cf: Record<string, unknown>): { flags: number; flagsExt: number; pitchSlideSpeed: number } {
  let flags = 0;
  if (cf.limitSlides)           flags |= (1 << 0);
  if (cf.properNoiseLayout)     flags |= (1 << 1);
  if (cf.waveDutyIsVol)         flags |= (1 << 2);
  if (cf.resetMacroOnPorta)     flags |= (1 << 3);
  if (cf.legacyVolumeSlides)    flags |= (1 << 4);
  if (cf.compatibleArpeggio)    flags |= (1 << 5);
  if (cf.noteOffResetsSlides)   flags |= (1 << 6);
  if (cf.targetResetsSlides)    flags |= (1 << 7);
  if (cf.arpNonPorta)           flags |= (1 << 8);
  if (cf.algMacroBehavior)      flags |= (1 << 9);
  if (cf.brokenShortcutSlides)  flags |= (1 << 10);
  if (cf.ignoreDuplicateSlides) flags |= (1 << 11);
  if (cf.stopPortaOnNoteOff)    flags |= (1 << 12);
  if (cf.continuousVibrato)     flags |= (1 << 13);
  if (cf.oneTickCut)            flags |= (1 << 14);
  if (cf.newInsTriggersInPorta) flags |= (1 << 15);
  if (cf.arp0Reset)             flags |= (1 << 16);
  if (cf.noSlidesOnFirstTick)   flags |= (1 << 17);
  if (cf.brokenPortaLegato)     flags |= (1 << 18);
  if (cf.buggyPortaAfterSlide)  flags |= (1 << 19);
  if (cf.ignoreJumpAtEnd)       flags |= (1 << 20);
  if (cf.brokenSpeedSel)        flags |= (1 << 21);
  if (cf.e1e2StopOnSameNote)    flags |= (1 << 22);
  if (cf.e1e2AlsoTakePriority)  flags |= (1 << 23);
  if (cf.rowResetsArpPos)       flags |= (1 << 24);
  if (cf.oldSampleOffset)       flags |= (1 << 25);
  if (cf.noVolSlideReset)       flags |= (1 << 26);
  if (cf.resetArpPhaseOnNewNote) flags |= (1 << 27);
  if (cf.oldAlwaysSetVolume)     flags |= (1 << 28);
  if (cf.preNoteNoEffect)        flags |= (1 << 29);

  let flagsExt = 0;
  const linearPitch = (cf.linearPitch as number) ?? 2;
  flagsExt |= (linearPitch & 0x3) << 0;
  const loopModality = (cf.loopModality as number) ?? 0;
  flagsExt |= (loopModality & 0x3) << 4;
  const delayBehavior = (cf.delayBehavior as number) ?? 0;
  flagsExt |= (delayBehavior & 0x3) << 6;
  const jumpTreatment = (cf.jumpTreatment as number) ?? 0;
  flagsExt |= (jumpTreatment & 0x3) << 8;

  const pitchSlideSpeed = (cf.pitchSlideSpeed as number) || 4;
  return { flags, flagsExt, pitchSlideSpeed };
}

// ── CLI Entry Point ──────────────────────────────────────────────────────────

async function main() {
  const args = process.argv.slice(2);

  if (args.length === 0) {
    console.log('Usage:');
    console.log('  npx tsx tools/furnace-audit/render-devilbox.ts <file.fur> [output.wav]');
    console.log('  npx tsx tools/furnace-audit/render-devilbox.ts --batch [category]');
    console.log('  npx tsx tools/furnace-audit/render-devilbox.ts --cleanup [category]');
    process.exit(1);
  }

  if (args[0] === '--cleanup') {
    // Manual cleanup: delete all WAVs in output dir (or specific category)
    const category = args[1];
    const dir = category ? join(OUTPUT_DIR, category) : OUTPUT_DIR;
    if (existsSync(dir)) {
      rmSync(dir, { recursive: true });
      console.log(`Cleaned up: ${dir}`);
    } else {
      console.log(`Nothing to clean: ${dir}`);
    }
    return;
  }

  if (args[0] === '--batch') {
    const category = args[1]; // optional
    await runBatch(category);
  } else {
    // Single file mode
    const furPath = args[0];
    // If no explicit output path given, use a temp file and auto-delete after (prevents disk fill)
    const explicitOut = args[1];
    const outPath = explicitOut ?? `/tmp/furnace-render-${Date.now()}.wav`;
    console.log(`Rendering: ${furPath}`);
    const result = await renderFurFile(furPath, outPath);
    if (result.success) {
      console.log(`  OK  ${(result.duration || 0).toFixed(1)}s  ${((result.wavSize || 0) / 1048576).toFixed(1)}MB  → ${outPath}`);
      // Auto-delete temp output to prevent disk accumulation
      if (!explicitOut) {
        try { unlinkSync(outPath); } catch { /* ignore */ }
      }
    } else {
      console.error(`  FAIL  ${result.error}`);
      process.exit(1);
    }
  }
}

/**
 * Remove stale WAVs from the output directory that weren't produced in this run.
 * If rendering a specific category, only cleans that category's subdirectory.
 */
function cleanupStaleWavs(renderedPaths: Set<string>, category?: string) {
  const dirsToClean = category
    ? [join(OUTPUT_DIR, category)]
    : existsSync(OUTPUT_DIR)
      ? readdirSync(OUTPUT_DIR)
          .map(d => join(OUTPUT_DIR, d))
          .filter(d => { try { return statSync(d).isDirectory(); } catch { return false; } })
      : [];

  let removed = 0;
  let freedBytes = 0;

  for (const dir of dirsToClean) {
    if (!existsSync(dir)) continue;
    const files = readdirSync(dir).filter(f => f.endsWith('.wav'));
    for (const f of files) {
      const fullPath = join(dir, f);
      if (!renderedPaths.has(fullPath)) {
        try {
          const size = statSync(fullPath).size;
          unlinkSync(fullPath);
          removed++;
          freedBytes += size;
        } catch { /* ignore */ }
      }
    }
    // Remove empty category dirs
    try {
      const remaining = readdirSync(dir);
      if (remaining.length === 0) rmSync(dir);
    } catch { /* ignore */ }
  }

  if (removed > 0) {
    console.log(`  Cleaned up ${removed} stale WAV(s), freed ${(freedBytes / 1048576).toFixed(1)}MB`);
  }
}

async function runBatch(category?: string) {
  // Find all .fur files in demos dir
  const categories = category
    ? [category]
    : readdirSync(DEMOS_DIR).filter(d => {
      try { return statSync(join(DEMOS_DIR, d)).isDirectory(); } catch { return false; }
    }).sort();

  let pass = 0, fail = 0, total = 0;
  const failures: RenderResult[] = [];
  const renderedPaths = new Set<string>();

  for (const cat of categories) {
    const catDir = join(DEMOS_DIR, cat);
    if (!existsSync(catDir)) continue;

    const furFiles = readdirSync(catDir)
      .filter(f => f.endsWith('.fur'))
      .sort();

    for (const furFile of furFiles) {
      total++;
      const furPath = join(catDir, furFile);
      const outPath = join(OUTPUT_DIR, cat, furFile.replace(/\.fur$/, '.wav'));
      const label = `${cat}/${furFile}`.padEnd(50);

      process.stdout.write(`  [${String(total).padStart(3)}] ${label}`);
      const result = await renderFurFile(furPath, outPath);

      if (result.success) {
        pass++;
        renderedPaths.add(outPath);
        const dur = (result.duration || 0).toFixed(1).padStart(5);
        const size = ((result.wavSize || 0) / 1048576).toFixed(0).padStart(3);
        console.log(`\x1b[32mOK\x1b[0m (${dur}s, ${size}M)`);
      } else {
        fail++;
        failures.push(result);
        console.log(`\x1b[31mFAIL\x1b[0m ${result.error}`);
      }
    }
  }

  // Auto-cleanup stale WAVs from previous runs
  cleanupStaleWavs(renderedPaths, category);

  console.log('');
  console.log('═'.repeat(70));
  console.log(`  RENDER: ${pass} OK / ${fail} FAIL / ${total} TOTAL`);
  console.log('═'.repeat(70));

  if (failures.length > 0) {
    console.log('\nFailures:');
    for (const f of failures) {
      console.log(`  ${f.file}: ${f.error}`);
    }
  }
}

main().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
