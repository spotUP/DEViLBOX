/**
 * test-synths.ts — Headless per-instrument audio tester for Furnace chip platforms
 *
 * Parses a .fur file, finds every (channel, instrument) pair used in the patterns,
 * triggers each one at C-4, renders ~1 second of audio, and measures RMS.
 * Reports PASS (audio produced) / FAIL (silence).
 *
 * Also scans each chip channel with every loaded instrument in --probe mode.
 *
 * Usage:
 *   npx tsx tools/furnace-audit/test-synths.ts <file.fur>
 *   npx tsx tools/furnace-audit/test-synths.ts <file.fur> --probe      # try all ch×ins combos
 *   npx tsx tools/furnace-audit/test-synths.ts --batch <category>      # all demos in dir
 *   npx tsx tools/furnace-audit/test-synths.ts --batch                  # all categories
 */

import { readFileSync, readdirSync, statSync, existsSync } from 'fs';
import { join, basename, dirname, relative } from 'path';
import { createRequire } from 'module';

// ── Constants ────────────────────────────────────────────────────────────────

const SAMPLE_RATE = 44100;
const BUFFER_SIZE = 128;
const TEST_DURATION_SECS = 1.0;   // render this long to detect audio
const SILENCE_THRESHOLD = 0.0005; // RMS below this = silent
const PROJECT_ROOT = join(dirname(new URL(import.meta.url).pathname), '../..');
const WASM_JS_PATH = join(PROJECT_ROOT, 'public/furnace-dispatch/FurnaceDispatch.js');
const WASM_BIN_PATH = join(PROJECT_ROOT, 'public/furnace-dispatch/FurnaceDispatch.wasm');
const DEMOS_DIR = '/Users/spot/Code/Reference Code/furnace-master/demos';

// DIV_CMD_ enum values (from furnace/src/engine/dispatch.h)
const DIV_CMD_NOTE_ON       = 0;
const DIV_CMD_NOTE_OFF      = 1;
const DIV_CMD_INSTRUMENT    = 4;
const DIV_CMD_VOLUME        = 5;
const DIV_CMD_WAVE          = 64;  // set wavetable index (PCE, GB wave, etc.)
const DIV_CMD_NES_ENV_MODE  = 78;  // NES envelope mode (0-3)

// Middle C in Furnace note space (C-4 = semitone 48)
const TEST_NOTE = 48;

// Chip tick rate (60Hz default, matching worklet behavior)
const TICK_RATE_HZ = 60;
const SAMPLES_PER_TICK = Math.floor(SAMPLE_RATE / TICK_RATE_HZ); // 735

// ── WASM Module Loader ────────────────────────────────────────────────────────

interface WasmModule {
  _furnace_init(sampleRate: number): void;
  _furnace_dispatch_create(platformType: number, sampleRate: number): number;
  _furnace_dispatch_destroy(handle: number): void;
  _furnace_dispatch_reset(handle: number): void;
  _furnace_dispatch_cmd(handle: number, cmd: number, chan: number, val1: number, val2: number): void;
  _furnace_dispatch_render(handle: number, outL: number, outR: number, numSamples: number): void;
  _furnace_dispatch_get_num_channels(handle: number): number;
  _furnace_dispatch_set_tick_rate(handle: number, rate: number): void;
  _furnace_dispatch_set_compat_flag(handle: number, flag: number, val: number): void;
  _furnace_dispatch_set_flags(handle: number, flagsPtr: number, len: number): void;
  _furnace_dispatch_load_ins2(insIndex: number, dataPtr: number, dataLen: number): void;
  _furnace_dispatch_set_wavetable(handle: number, waveIndex: number, dataPtr: number, dataLen: number): void;
  _furnace_dispatch_set_sample(handle: number, sampleIndex: number, dataPtr: number, dataLen: number): void;
  _furnace_dispatch_render_samples(handle: number): void;
  _furnace_dispatch_tick(handle: number): void;
  _malloc(size: number): number;
  _free(ptr: number): void;
  HEAPU8: Uint8Array;
  HEAPF32: Float32Array;
  HEAP32: Int32Array;
}

let _cachedWasm: WasmModule | null = null;

async function loadWasmModule(): Promise<WasmModule> {
  if (_cachedWasm) return _cachedWasm;

  const wasmBinaryBuf = readFileSync(WASM_BIN_PATH);
  const wasmBinary = wasmBinaryBuf.buffer.slice(
    wasmBinaryBuf.byteOffset,
    wasmBinaryBuf.byteOffset + wasmBinaryBuf.byteLength,
  );

  const jsCode = readFileSync(WASM_JS_PATH, 'utf8');
  let capturedMemory: WebAssembly.Memory | null = null;
  const origInstantiate = WebAssembly.instantiate;
  (WebAssembly as any).instantiate = async (source: any, imports: any) => {
    const result = await origInstantiate(source, imports);
    const instance = 'instance' in result ? result.instance : result;
    if (instance.exports.memory) capturedMemory = instance.exports.memory as WebAssembly.Memory;
    return result;
  };

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
      print: () => {},
      printErr: (t: string) => { if (!t.includes('warning')) process.stderr.write(`[wasm] ${t}\n`); },
      locateFile: (path: string) => path.endsWith('.wasm') ? WASM_BIN_PATH : path,
    }) as WasmModule;

    if (capturedMemory) {
      const buf = capturedMemory.buffer;
      module.HEAPU8 = new Uint8Array(buf);
      module.HEAPF32 = new Float32Array(buf);
      module.HEAP32 = new Int32Array(buf);
      (module as any)._wasmMemory = capturedMemory;
    }
    _cachedWasm = module;
    return module;
  } finally {
    WebAssembly.instantiate = origInstantiate;
  }
}

function refreshHeap(wasm: WasmModule): void {
  const mem = (wasm as any)._wasmMemory as WebAssembly.Memory | undefined;
  if (!mem) return;
  const buf = mem.buffer;
  if (wasm.HEAPU8.buffer !== buf) {
    wasm.HEAPU8 = new Uint8Array(buf);
    wasm.HEAPF32 = new Float32Array(buf);
    wasm.HEAP32 = new Int32Array(buf);
  }
}

// ── Chip name table ───────────────────────────────────────────────────────────

// Keyed by DIV_SYSTEM enum value (from FurnaceDispatchWrapper.cpp DivSystemLocal)
// These match what FILE_ID_TO_ENUM returns and what furnace_dispatch_create expects.
const CHIP_NAMES: Record<number, string> = {
  1: 'YMU759',        2: 'Genesis',       3: 'Genesis ext',   4: 'SMS',
  5: 'SMS+OPLL',      6: 'Game Boy',      7: 'PC Engine',     8: 'NES',
  9: 'NES+VRC7',      10: 'NES+FDS',      11: 'C64/6581',     12: 'C64/8580',
  13: 'Arcade',       14: 'MSX2',         15: 'YM2610',       16: 'YM2610 ext',
  17: 'AY-3-8910',    18: 'Amiga',        19: 'YM2151',       20: 'YM2612',
  21: 'TIA',          22: 'SAA1099',      23: 'AY8930',       24: 'VIC-20',
  25: 'PET',          26: 'SNES',         27: 'VRC6',         28: 'OPLL',
  29: 'FDS',          30: 'MMC5',         31: 'N163',         32: 'YM2203',
  33: 'YM2203 ext',   34: 'YM2608',       35: 'YM2608 ext',   36: 'OPL',
  37: 'OPL2',         38: 'OPL3',         39: 'MultiPCM',     40: 'PC Speaker',
  41: 'POKEY',        42: 'RF5C68',       43: 'Swan',         44: 'OPZ',
  45: 'Pokemon Mini', 46: 'SegaPCM',      47: 'Virtual Boy',  48: 'VRC7',
  49: 'YM2610B',      50: 'SFX Beeper',   52: 'YM2612 ext',   53: 'SCC',
  54: 'OPL drums',    55: 'OPL2 drums',   56: 'OPL3 drums',   59: 'OPLL drums',
  60: 'Lynx',         61: 'QSound',       62: 'VERA',         65: 'X1-010',
  69: 'ES5506',       73: 'Sound Unit',   74: 'MSM6295',      75: 'MSM6258',
  76: 'YMZ280B',      80: 'YM2612 DPCM',  83: 'T6W28',        86: 'PCM DAC',
  88: 'Dummy',
};

function chipName(id: number): string {
  return CHIP_NAMES[id] ?? `0x${id.toString(16)}`;
}

// ── Fur Parser ────────────────────────────────────────────────────────────────

async function parseFur(filePath: string) {
  const { parseFurnaceSong, buildFurnaceNativeData } = await import(
    '../../src/lib/import/formats/FurnaceSongParser.js'
  );
  const buf = readFileSync(filePath);
  const ab = buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength);
  const song = await parseFurnaceSong(ab);
  const native = buildFurnaceNativeData(song);
  return { song, native };
}

// ── Asset upload helpers (shared logic from render-devilbox.ts) ───────────────

async function uploadAssets(wasm: WasmModule, handle: number, parsed: Awaited<ReturnType<typeof parseFur>>) {
  const { song } = parsed;

  // Instruments (INS2 binary blobs)
  for (let i = 0; i < song.instruments.length; i++) {
    const ins = song.instruments[i];
    if (!ins.rawBinaryData || ins.rawBinaryData.byteLength === 0) continue;
    const raw = new Uint8Array(ins.rawBinaryData);
    refreshHeap(wasm);
    const ptr = wasm._malloc(raw.length);
    refreshHeap(wasm);
    wasm.HEAPU8.set(raw, ptr);
    try { wasm._furnace_dispatch_load_ins2(i, ptr, raw.length); } catch {}
    wasm._free(ptr);
  }

  // Wavetables
  for (let i = 0; i < song.wavetables.length; i++) {
    const wt = song.wavetables[i] as any;
    if (!wt.data || wt.data.length === 0) continue;
    const len = wt.data.length;
    const max = wt.height ?? wt.max ?? 15;
    const packed = new Int32Array(2 + len);
    packed[0] = len; packed[1] = max;
    for (let j = 0; j < len; j++) packed[2 + j] = wt.data[j];
    refreshHeap(wasm);
    const ptr = wasm._malloc(packed.byteLength);
    refreshHeap(wasm);
    wasm.HEAPU8.set(new Uint8Array(packed.buffer), ptr);
    try { wasm._furnace_dispatch_set_wavetable(handle, i, ptr, packed.byteLength); } catch {}
    wasm._free(ptr);
  }

  // Samples
  for (let i = 0; i < song.samples.length; i++) {
    const smp = song.samples[i] as any;
    if (!smp.data || smp.data.length === 0) continue;
    const depth = smp.depth ?? 16;
    let sampleCount: number, pcmBytes: number;
    if (depth === 16) {
      sampleCount = smp.data instanceof Int16Array ? smp.data.length : Math.floor(smp.data.length / 2);
      pcmBytes = sampleCount * 2;
    } else if (depth === 8) {
      sampleCount = smp.data.length;
      pcmBytes = smp.data.length;
    } else {
      sampleCount = smp.samples ?? smp.length ?? smp.data.length;
      pcmBytes = smp.data.length;
    }
    const blob = new Uint8Array(32 + pcmBytes);
    const dv = new DataView(blob.buffer);
    dv.setUint32(0, sampleCount, true);
    dv.setInt32(4, smp.loopStart ?? 0, true);
    dv.setInt32(8, smp.loopEnd ?? 0, true);
    dv.setUint8(12, depth);
    dv.setUint8(13, smp.loopDirection ?? smp.loopMode ?? 0);
    dv.setUint8(14, smp.brrEmphasis === false ? 0 : 1);
    dv.setUint8(15, smp.brrNoFilter ? 1 : 0);
    dv.setUint32(16, smp.c4Rate ?? smp.rate ?? 0, true);
    dv.setUint8(22, smp.loop ? 1 : 0);
    if (smp.data instanceof Int16Array) {
      const view = new DataView(blob.buffer, 32);
      for (let j = 0; j < smp.data.length; j++) view.setInt16(j * 2, smp.data[j], true);
    } else {
      blob.set(new Uint8Array(smp.data.buffer, smp.data.byteOffset, smp.data.byteLength), 32);
    }
    refreshHeap(wasm);
    const ptr = wasm._malloc(blob.length);
    refreshHeap(wasm);
    wasm.HEAPU8.set(blob, ptr);
    try { wasm._furnace_dispatch_set_sample(handle, i, ptr, blob.length); } catch {}
    wasm._free(ptr);
  }

  // Render samples into chip RAM
  try { wasm._furnace_dispatch_render_samples(handle); } catch {}
}

// ── RMS measurement ───────────────────────────────────────────────────────────

function renderAndMeasureRMS(
  wasm: WasmModule,
  handle: number,
  outPtrL: number,
  outPtrR: number,
  numFrames: number,
  tickRateHz: number = TICK_RATE_HZ,
): number {
  let sumSq = 0;
  let totalSamples = 0;
  let remaining = numFrames;
  let tickAccumulator = 0;
  const samplesPerTick = Math.floor(SAMPLE_RATE / tickRateHz);

  while (remaining > 0) {
    // Fire tick(s) when accumulator reaches threshold — matches worklet behavior
    tickAccumulator += BUFFER_SIZE;
    while (tickAccumulator >= samplesPerTick) {
      try { wasm._furnace_dispatch_tick(handle); } catch { /* ignore */ }
      tickAccumulator -= samplesPerTick;
    }

    const chunk = Math.min(remaining, BUFFER_SIZE);
    try {
      wasm._furnace_dispatch_render(handle, outPtrL, outPtrR, chunk);
    } catch {
      break;
    }
    refreshHeap(wasm);
    const outL = new Float32Array(wasm.HEAPU8.buffer, outPtrL, chunk);
    const outR = new Float32Array(wasm.HEAPU8.buffer, outPtrR, chunk);
    for (let i = 0; i < chunk; i++) {
      const v = (outL[i] + outR[i]) * 0.5;
      sumSq += v * v;
      totalSamples++;
    }
    remaining -= chunk;
  }
  return totalSamples > 0 ? Math.sqrt(sumSq / totalSamples) : 0;
}

// ── Result types ──────────────────────────────────────────────────────────────

interface TestResult {
  file: string;
  chipId: number;
  chan: number;
  insIdx: number;
  insName: string;
  rms: number;
  pass: boolean;
  error?: string;
}

// ── Core tester ───────────────────────────────────────────────────────────────

async function testFile(furPath: string, probeMode: boolean): Promise<TestResult[]> {
  const results: TestResult[] = [];
  const file = basename(furPath);

  let parsed: Awaited<ReturnType<typeof parseFur>>;
  try {
    parsed = await parseFur(furPath);
  } catch (e) {
    return [{ file, chipId: 0, chan: 0, insIdx: 0, insName: '', rms: 0, pass: false, error: `parse: ${(e as Error).message}` }];
  }

  const { song, native } = parsed;
  const sub = native?.subsongs?.[0];
  if (!sub) return [{ file, chipId: 0, chan: 0, insIdx: 0, insName: '', rms: 0, pass: false, error: 'no subsong' }];

  const chipIds: number[] = native.chipIds ?? [];
  if (chipIds.length === 0) return [{ file, chipId: 0, chan: 0, insIdx: 0, insName: '', rms: 0, pass: false, error: 'no chips' }];

  const wasm = await loadWasmModule();
  wasm._furnace_init(SAMPLE_RATE);

  // Build chip instances + channel-to-chip map
  interface ChipInst { handle: number; chipId: number; firstChan: number; numChans: number; }
  const chips: ChipInst[] = [];
  let chanOffset = 0;

  for (const chipId of chipIds) {
    let handle: number;
    try {
      handle = wasm._furnace_dispatch_create(chipId, SAMPLE_RATE);
    } catch (e) {
      results.push({ file, chipId, chan: 0, insIdx: 0, insName: '', rms: 0, pass: false, error: `create: ${(e as Error).message}` });
      continue;
    }
    if (handle <= 0) {
      results.push({ file, chipId, chan: 0, insIdx: 0, insName: '', rms: 0, pass: false, error: 'create returned 0' });
      continue;
    }
    wasm._furnace_dispatch_set_tick_rate(handle, sub.hz ?? 60);
    wasm._furnace_dispatch_set_compat_flag(handle, 0, native.compatFlags?.linearPitch ?? 2);

    // Apply chip flags if present
    const flagStr = native.chipFlags?.[chips.length];
    if (flagStr) {
      const flagBytes = new TextEncoder().encode(flagStr);
      refreshHeap(wasm);
      const ptr = wasm._malloc(flagBytes.length + 1);
      refreshHeap(wasm);
      wasm.HEAPU8.set(flagBytes, ptr);
      wasm.HEAPU8[ptr + flagBytes.length] = 0;
      try { wasm._furnace_dispatch_set_flags(handle, ptr, flagBytes.length); } catch {}
      wasm._free(ptr);
      wasm._furnace_dispatch_reset(handle);
    }

    const numChans = wasm._furnace_dispatch_get_num_channels(handle);
    chips.push({ handle, chipId, firstChan: chanOffset, numChans });
    chanOffset += numChans;
  }

  if (chips.length === 0) return results;

  // Upload assets to ALL chips
  for (const chip of chips) {
    await uploadAssets(wasm, chip.handle, parsed);
  }

  // Allocate render buffers (shared across all tests)
  const outPtrL = wasm._malloc(BUFFER_SIZE * 4);
  const outPtrR = wasm._malloc(BUFFER_SIZE * 4);
  const numTestFrames = Math.floor(SAMPLE_RATE * TEST_DURATION_SECS);
  const tickRateHz = sub.hz ?? 60;

  // Build (globalChannel, insIdx) test pairs
  // Scan patterns for actually-used pairs; in probe mode also test all ch×ins combos
  const testPairs = new Map<string, { chip: ChipInst; localChan: number; insIdx: number }>();

  const parsedSub = song.subsongs?.[0] as any;
  const channels = parsedSub?.channels ?? sub.channels ?? [];

  for (let globalChan = 0; globalChan < channels.length; globalChan++) {
    const chanData = channels[globalChan];
    if (!chanData) continue;
    // Find which chip owns this global channel
    const ownerChip = chips.find(c => globalChan >= c.firstChan && globalChan < c.firstChan + c.numChans);
    if (!ownerChip) continue;
    const localChan = globalChan - ownerChip.firstChan;

    if (probeMode) {
      // Probe: try every instrument on every channel
      for (let insIdx = 0; insIdx < song.instruments.length; insIdx++) {
        const key = `${ownerChip.chipId}:${localChan}:${insIdx}`;
        if (!testPairs.has(key)) testPairs.set(key, { chip: ownerChip, localChan, insIdx });
      }
    } else {
      // Normal: only test pairs that appear in pattern data
      const patternEntries: Map<number, any> = chanData.patterns ?? new Map();
      for (const [, patData] of patternEntries) {
        const rows: Record<number, any> = patData?.rows ?? {};
        for (const row of Object.values(rows)) {
          if (!row) continue;
          if (row.note !== -1 && row.ins !== -1) {
            const key = `${ownerChip.chipId}:${localChan}:${row.ins}`;
            if (!testPairs.has(key)) testPairs.set(key, { chip: ownerChip, localChan, insIdx: row.ins });
          }
        }
      }
    }
  }

  // If no pairs found (e.g. song has no note data), fall back: test instrument 0 on channel 0 of each chip
  if (testPairs.size === 0) {
    for (const chip of chips) {
      const insIdx = 0;
      const key = `${chip.chipId}:0:${insIdx}`;
      testPairs.set(key, { chip, localChan: 0, insIdx });
    }
  }

  // Run tests
  for (const { chip, localChan, insIdx } of testPairs.values()) {
    const insName = (song.instruments[insIdx] as any)?.name ?? `#${insIdx}`;
    let rms = 0;
    let error: string | undefined;

    try {
      // Reset chip to clean state (preserves sampleMem/copyOfSampleMem from renderSamples)
      wasm._furnace_dispatch_reset(chip.handle);

      // Set instrument
      wasm._furnace_dispatch_cmd(chip.handle, DIV_CMD_INSTRUMENT, localChan, insIdx, 1);

      // Clamp volume to chip-specific max to avoid corrupting control register bits
      const vol = chip.chipId === 8 ? 15 : chip.chipId === 4 ? 15 : chip.chipId === 21 ? 15
        : chip.chipId === 7 ? 31 : chip.chipId === 18 ? 64 : 100;
      wasm._furnace_dispatch_cmd(chip.handle, DIV_CMD_VOLUME, localChan, vol, 0);

      // Trigger note
      wasm._furnace_dispatch_cmd(chip.handle, DIV_CMD_NOTE_ON, localChan, TEST_NOTE, 0);

      // NES: force constant-volume + length-counter-halt so the note sustains
      if (chip.chipId === 8) {
        wasm._furnace_dispatch_cmd(chip.handle, DIV_CMD_NES_ENV_MODE, localChan, 3, 0);
      }

      // Pre-tick: most chips need tick() before the first render
      try { wasm._furnace_dispatch_tick(chip.handle); } catch {}

      // Render and measure (with tick interleaving at the song's tick rate)
      rms = renderAndMeasureRMS(wasm, chip.handle, outPtrL, outPtrR, numTestFrames, tickRateHz);

      // Note off
      wasm._furnace_dispatch_cmd(chip.handle, DIV_CMD_NOTE_OFF, localChan, 0, 0);
    } catch (e) {
      error = (e as Error).message;
    }

    results.push({
      file,
      chipId: chip.chipId,
      chan: localChan,
      insIdx,
      insName,
      rms,
      pass: rms > SILENCE_THRESHOLD,
      error,
    });
  }

  // Clean up
  wasm._free(outPtrL);
  wasm._free(outPtrR);
  for (const chip of chips) {
    try { wasm._furnace_dispatch_destroy(chip.handle); } catch {}
  }

  return results;
}

// ── Synthetic instrument builders ─────────────────────────────────────────────
//
// Construct minimal INS2 binary blobs for each chip/mode without needing a .fur file.
// INS2 format: "INS2" + blockLen(u32) + version(u16) + type(u8) + reserved(u8) + features + "EN"
// Each feature: fc0(u8) + fc1(u8) + featLen(u16 LE) + data...
//
// insType values (DIV_INS_* enum):
//   0=STD, 1=FM, 2=GB, 3=C64, 4=AMIGA, 5=PCE, 6=AY, 13=OPLL, 14=OPL, 15=FDS, 29=SNES, 34=NES

const INS2_VERSION = 195; // widely compatible Furnace version

function buildINS2(insType: number, features: { code: string; data: Uint8Array }[]): Uint8Array {
  // Calculate total feature byte count
  let featuresSize = 0;
  for (const f of features) featuresSize += 2 + 2 + f.data.length; // code(2) + len(2) + data
  featuresSize += 2; // "EN" end marker

  const totalSize = 4 + 4 + 2 + 1 + 1 + featuresSize; // "INS2" + blockLen + version + type + reserved
  const buf = new Uint8Array(totalSize);
  const dv = new DataView(buf.buffer);

  // Header
  buf[0] = 0x49; buf[1] = 0x4E; buf[2] = 0x53; buf[3] = 0x32; // "INS2"
  dv.setUint32(4, featuresSize + 4, true); // blockLen = features + version(2) + type(1) + reserved(1)
  dv.setUint16(8, INS2_VERSION, true);
  buf[10] = insType;
  buf[11] = 0; // reserved

  let pos = 12;
  for (const f of features) {
    buf[pos++] = f.code.charCodeAt(0);
    buf[pos++] = f.code.charCodeAt(1);
    dv.setUint16(pos, f.data.length, true); pos += 2;
    buf.set(f.data, pos); pos += f.data.length;
  }
  // End marker
  buf[pos++] = 0x45; // 'E'
  buf[pos++] = 0x4E; // 'N'

  return buf;
}

function feat(code: string, data: Uint8Array) { return { code, data }; }

/** Build a Game Boy instrument.
 *  envVol: 0-15 (initial volume)
 *  envDir: 0=down, 1=up
 *  envLen: 0-7 (envelope speed; 0 = no change)
 */
function buildGBInstrument(envVol = 15, envDir = 0, envLen = 0): Uint8Array {
  // GB feature "GB": byte0 = (envLen<<5)|(envDir<<4)|envVol, byte1=soundLen, byte2=flags, byte3=hwSeqLen
  const d = new Uint8Array([
    ((envLen & 7) << 5) | ((envDir & 1) << 4) | (envVol & 15),
    0,   // soundLen = 0 → no length counter
    0,   // flags
    0,   // hwSeqLen = 0
  ]);
  return buildINS2(2 /* DIV_INS_GB */, [feat('GB', d)]);
}

/** Build a C64 SID instrument.
 *  waveform: 1=tri, 2=saw, 4=pulse, 8=noise (bitmask, combinable)
 *  ADSR: attack(0-15), decay(0-15), sustain(0-15), release(0-15)
 *  duty: 0-4095 (pulse width, only matters for pulse waveform)
 */
function buildC64Instrument(waveform: number, a = 0, d = 8, s = 15, r = 4, duty = 2048): Uint8Array {
  // "64" feature: 8 bytes
  const buf = new Uint8Array(8);
  const dv = new DataView(buf.buffer);
  // byte0: bits: dutyIsAbs(7) initFilter(6) volIsCutoff(5) toFilter(4) noise(3) pulse(2) saw(1) tri(0)
  buf[0] = waveform & 15; // lower 4 bits = tri/saw/pulse/noise
  buf[1] = 0; // oscSync=0, ringMod=0, lp=0
  buf[2] = ((a & 15) << 4) | (d & 15); // A nibble | D nibble
  buf[3] = ((s & 15) << 4) | (r & 15); // S nibble | R nibble
  dv.setUint16(4, duty & 0xFFF, true);  // duty (12-bit)
  dv.setUint16(6, 0, true);             // cut=0, res=0
  return buildINS2(3 /* DIV_INS_C64 */, [feat('64', buf)]);
}

/** Build a 4-operator FM instrument (YM2612/OPM/OPN).
 *  algorithm: 0-7
 *  feedback: 0-7
 *  Operators default to op1=carrier (tl=0=loudest, ar=31=instant attack, rr=15=instant release).
 */
function buildFMInstrument(algorithm: number, feedback = 0): Uint8Array {
  // FM feature: byte0=opCount/enable, byte1=alg/fb, byte2=fms/ams, byte3=ams2/ops, then 4×8 op bytes
  const buf = new Uint8Array(4 + 4 * 8);
  buf[0] = 0xF4;  // opCount=4, all ops enabled (bits 4-7)
  buf[1] = ((algorithm & 7) << 4) | (feedback & 7);
  buf[2] = 0;      // fms=0, ams=0
  buf[3] = 0x20;   // ops=4 (bit5 set)

  // Each operator: 8 bytes packed
  // [ksr|dt|mult, tl, rs|ar, am|dr, dt2|d2r, sl|rr, ssgEnv, pad]
  const ops = [
    // All carriers loud (tl=0), fast attack (ar=31), full sustain, fast release (rr=15)
    [0x01, 0x00, 0x1F, 0x00, 0x00, 0x0F, 0x00, 0x00], // op0
    [0x01, 0x00, 0x1F, 0x00, 0x00, 0x0F, 0x00, 0x00], // op1
    [0x01, 0x00, 0x1F, 0x00, 0x00, 0x0F, 0x00, 0x00], // op2
    [0x01, 0x00, 0x1F, 0x00, 0x00, 0x0F, 0x00, 0x00], // op3
  ];

  // For algorithms where not all ops are carriers, modulators need high TL
  // ALG 0: op3 is the only carrier → ops 0,1,2 are modulators (tl can be anything)
  // ALG 7: all 4 ops are carriers → all tl=0 (max volume)
  // For simplicity we set all tl=0 (max) — modulators at max = very bright FM but always audible

  for (let i = 0; i < 4; i++) {
    const base = 4 + i * 8;
    for (let j = 0; j < 8; j++) buf[base + j] = ops[i][j];
  }

  return buildINS2(1 /* DIV_INS_FM */, [feat('FM', buf)]);
}

/** Build a NES instrument with volume macro (simple envelope). */
function buildNESInstrument(duty = 2): Uint8Array {
  // NE feature: byte0 = duty<<6 | ...various flags
  // Actually NES instruments work with vol/duty macros. Minimal: just insType=NES with no features.
  // The NES chip uses the volume from DIV_CMD_VOLUME and the note directly.
  // For duty cycle we use the NE feature if available.
  // Byte0: detune(7-6)=0, duty(5-4), loop(3), envDisable(2), ...(actually this varies)
  // Looking at the WASM wrapper NE block: let's use a simple volume macro 'MA' instead.
  // For simplicity: just type=NES with no feature blocks (will use chip defaults).
  const dutyByte = new Uint8Array([(duty & 3) << 6]);
  // NE feature byte0 = duty<<6
  return buildINS2(34 /* DIV_INS_NES */, []);
}

/** Build a minimal SNES instrument pointing to sample 0. */
function buildSNESInstrument(sampleIdx = 0): Uint8Array {
  // SM feature: initSample(i16 LE) + flags(u8) + waveLen(u8)
  // flags bit1 = useSample
  const sm = new Uint8Array(4);
  const smDv = new DataView(sm.buffer);
  smDv.setInt16(0, sampleIdx, true);   // initSample
  sm[2] = 0x02;                         // useSample=1
  sm[3] = 0;                            // waveLen
  return buildINS2(29 /* DIV_INS_SNES */, [feat('SM', sm)]);
}

/** Build a minimal BRR sample blob (1 block = 16 samples, ~728 Hz sawtooth at 44100). */
function buildSyntheticBRRSample(loopMode = 0): Uint8Array {
  // BRR block: 9 bytes (1 header + 8 data bytes = 16 4-bit samples)
  // Use shift=12 for near-full-scale amplitude, filter=0 (no prediction)
  const loopBit = loopMode > 0 ? 0x02 : 0x00;
  const blockData = [0x01, 0x23, 0x45, 0x67, 0x89, 0xAB, 0xCD, 0xEF];

  // Build multiple BRR blocks for a longer sample (better RMS detection for no-loop)
  const numBlocks = 32; // 32 blocks × 16 samples = 512 samples ≈ 64ms at 8kHz
  const brrData: number[] = [];
  for (let b = 0; b < numBlocks; b++) {
    const isEnd = b === numBlocks - 1;
    const header = 0xC0 | (isEnd ? 0x01 : 0x00) | loopBit; // shift=12, filter=0
    brrData.push(header, ...blockData);
  }
  const data = new Uint8Array(brrData);

  const sampleCount = numBlocks * 16;
  const blob = new Uint8Array(32 + data.length);
  const bdv = new DataView(blob.buffer);
  bdv.setUint32(0, sampleCount, true);
  bdv.setInt32(4, 0, true);
  bdv.setInt32(8, sampleCount, true);
  bdv.setUint8(12, 9);                    // depth = DIV_SAMPLE_DEPTH_BRR = 9
  bdv.setUint8(13, loopMode);
  bdv.setUint8(14, 1);                    // brrEmphasis
  bdv.setUint8(15, 0);
  bdv.setUint32(16, 8000, true);          // centerRate (Hz)
  bdv.setUint8(22, loopMode > 0 ? 1 : 0);
  blob.set(data, 32);
  return blob;
}

/** Build a minimal 16-bit PCM sample for Amiga/generic PCM chips. */
function buildSyntheticPCMSample(loopMode = 0): Uint8Array {
  // One cycle of a sawtooth at 440Hz @ 44100 → 100 samples
  const count = 100;
  const pcmBytes = count * 2; // 16-bit
  const blob = new Uint8Array(32 + pcmBytes);
  const bdv = new DataView(blob.buffer);
  bdv.setUint32(0, count, true);
  bdv.setInt32(4, 0, true);
  bdv.setInt32(8, count - 1, true);
  bdv.setUint8(12, 16);  // depth=16
  bdv.setUint8(13, loopMode);
  bdv.setUint8(22, loopMode > 0 ? 1 : 0);
  bdv.setUint32(16, 44100, true); // centerRate
  const pcmDv = new DataView(blob.buffer, 32);
  for (let i = 0; i < count; i++) {
    const v = Math.round(((i / count) * 2 - 1) * 32767); // sawtooth
    pcmDv.setInt16(i * 2, v, true);
  }
  return blob;
}

// ── Synthetic chip test suite ──────────────────────────────────────────────────

interface SyntheticTest {
  label: string;       // human-readable description
  chipId: number;      // DIV_SYSTEM enum value
  chan: number;        // channel index on the chip
  insIdx: number;      // instrument slot to use
  insData: Uint8Array; // INS2 blob
  sampleIdx?: number;  // upload to this sample slot (optional)
  sampleData?: Uint8Array; // sample blob for furnace_dispatch_set_sample
  wavetable?: { idx: number; data: number[]; height: number }; // wavetable (optional)
  note?: number;       // override note (default = TEST_NOTE)
  durationSecs?: number; // override render duration
}

function buildSyntheticTestSuite(): SyntheticTest[] {
  const tests: SyntheticTest[] = [];

  // ── Game Boy (chipId=6) ─────────────────────────────────────────────────────
  // ch0/ch1: pulse channels, ch2: wave channel, ch3: noise channel
  tests.push({ label: 'GB pulse ch0 (sustain max vol)',      chipId: 6, chan: 0, insIdx: 0, insData: buildGBInstrument(15, 0, 0) });
  tests.push({ label: 'GB pulse ch1 (volume fade down)',     chipId: 6, chan: 1, insIdx: 0, insData: buildGBInstrument(15, 0, 3) }); // envLen=3
  tests.push({ label: 'GB pulse ch1 (fade up from 0)',       chipId: 6, chan: 1, insIdx: 0, insData: buildGBInstrument(0, 1, 2) });  // envDir=up
  tests.push({ label: 'GB wave ch2 (wavetable)',             chipId: 6, chan: 2, insIdx: 0, insData: buildGBInstrument(15, 0, 0),
    wavetable: { idx: 0, data: [0,1,2,3,4,5,6,7,8,9,10,11,12,13,14,15,15,14,13,12,11,10,9,8,7,6,5,4,3,2,1,0], height: 15 } });
  tests.push({ label: 'GB noise ch3 (short noise)',          chipId: 6, chan: 3, insIdx: 0, insData: buildGBInstrument(15, 0, 0) });

  // ── NES (chipId=8) ─────────────────────────────────────────────────────────
  // ch0/ch1: pulse, ch2: triangle, ch3: noise, ch4: DPCM
  tests.push({ label: 'NES pulse ch0',   chipId: 8, chan: 0, insIdx: 0, insData: buildNESInstrument(2) });
  tests.push({ label: 'NES pulse ch1',   chipId: 8, chan: 1, insIdx: 0, insData: buildNESInstrument(2) });
  tests.push({ label: 'NES triangle ch2', chipId: 8, chan: 2, insIdx: 0, insData: buildNESInstrument() });
  tests.push({ label: 'NES noise ch3',    chipId: 8, chan: 3, insIdx: 0, insData: buildNESInstrument() });

  // ── YM2612 (chipId=20) — one test per FM algorithm ────────────────────────
  for (let alg = 0; alg <= 7; alg++) {
    tests.push({ label: `YM2612 alg ${alg} feedback=4`, chipId: 20, chan: 0, insIdx: alg, insData: buildFMInstrument(alg, 4) });
  }
  // Also test different channels
  tests.push({ label: 'YM2612 alg7 ch1', chipId: 20, chan: 1, insIdx: 0, insData: buildFMInstrument(7, 0) });
  tests.push({ label: 'YM2612 alg7 ch2', chipId: 20, chan: 2, insIdx: 0, insData: buildFMInstrument(7, 0) });
  tests.push({ label: 'YM2612 alg7 ch3', chipId: 20, chan: 3, insIdx: 0, insData: buildFMInstrument(7, 0) });
  tests.push({ label: 'YM2612 alg7 ch4', chipId: 20, chan: 4, insIdx: 0, insData: buildFMInstrument(7, 0) });
  tests.push({ label: 'YM2612 alg7 ch5', chipId: 20, chan: 5, insIdx: 0, insData: buildFMInstrument(7, 0) });

  // ── C64 6581 (chipId=11) — each waveform type ─────────────────────────────
  tests.push({ label: 'C64 triangle waveform',  chipId: 11, chan: 0, insIdx: 0, insData: buildC64Instrument(0b0001) });
  tests.push({ label: 'C64 sawtooth waveform',  chipId: 11, chan: 0, insIdx: 0, insData: buildC64Instrument(0b0010) });
  tests.push({ label: 'C64 pulse waveform',     chipId: 11, chan: 0, insIdx: 0, insData: buildC64Instrument(0b0100, 0, 8, 15, 4, 2048) });
  tests.push({ label: 'C64 noise waveform',     chipId: 11, chan: 0, insIdx: 0, insData: buildC64Instrument(0b1000) });
  tests.push({ label: 'C64 tri+saw combined',   chipId: 11, chan: 0, insIdx: 0, insData: buildC64Instrument(0b0011) });
  tests.push({ label: 'C64 ch1 sawtooth',       chipId: 11, chan: 1, insIdx: 0, insData: buildC64Instrument(0b0010) });
  tests.push({ label: 'C64 ch2 sawtooth',       chipId: 11, chan: 2, insIdx: 0, insData: buildC64Instrument(0b0010) });

  // ── C64 8580 (chipId=12) — verify both SID models ─────────────────────────
  tests.push({ label: 'C64/8580 sawtooth', chipId: 12, chan: 0, insIdx: 0, insData: buildC64Instrument(0b0010) });
  tests.push({ label: 'C64/8580 pulse',    chipId: 12, chan: 0, insIdx: 0, insData: buildC64Instrument(0b0100, 0, 8, 15, 4, 2048) });

  // ── SNES (chipId=26) — BRR sample, no loop vs loop ────────────────────────
  // No-loop test: use very short duration so 16-sample BRR block is within window
  tests.push({ label: 'SNES BRR no loop ch0',   chipId: 26, chan: 0, insIdx: 0, insData: buildSNESInstrument(0),
    sampleIdx: 0, sampleData: buildSyntheticBRRSample(0), durationSecs: 0.15 });
  tests.push({ label: 'SNES BRR loop forward ch1', chipId: 26, chan: 1, insIdx: 0, insData: buildSNESInstrument(0),
    sampleIdx: 0, sampleData: buildSyntheticBRRSample(1), durationSecs: 0.5 });
  tests.push({ label: 'SNES BRR ch2',          chipId: 26, chan: 2, insIdx: 0, insData: buildSNESInstrument(0),
    sampleIdx: 0, sampleData: buildSyntheticBRRSample(1), durationSecs: 0.5 }); // looping

  // ── Amiga/PCM (chipId=18) — PCM sample playback ───────────────────────────
  const amigaIns = buildINS2(4 /* DIV_INS_AMIGA */, [
    feat('SM', (() => { const d = new Uint8Array(4); new DataView(d.buffer).setInt16(0, 0, true); d[2] = 0x02; return d; })()),
  ]);
  tests.push({ label: 'Amiga PCM ch0 no loop', chipId: 18, chan: 0, insIdx: 0, insData: amigaIns,
    sampleIdx: 0, sampleData: buildSyntheticPCMSample(0) });
  tests.push({ label: 'Amiga PCM ch1 loop',    chipId: 18, chan: 1, insIdx: 0, insData: amigaIns,
    sampleIdx: 0, sampleData: buildSyntheticPCMSample(1), durationSecs: 0.5 });

  // ── SMS/SN76489 (chipId=4) — 3 tone + 1 noise ────────────────────────────
  tests.push({ label: 'SMS tone ch0', chipId: 4, chan: 0, insIdx: 0, insData: buildINS2(0 /* STD */, []) });
  tests.push({ label: 'SMS tone ch1', chipId: 4, chan: 1, insIdx: 0, insData: buildINS2(0, []) });
  tests.push({ label: 'SMS tone ch2', chipId: 4, chan: 2, insIdx: 0, insData: buildINS2(0, []) });
  tests.push({ label: 'SMS noise ch3', chipId: 4, chan: 3, insIdx: 0, insData: buildINS2(0, []) });

  // ── PC Engine (chipId=7) — wavetable channels ─────────────────────────────
  const pceWave = { idx: 0, data: [0,2,4,6,8,10,12,14,16,18,20,22,24,26,28,30,31,29,27,25,23,21,19,17,15,13,11,9,7,5,3,1], height: 31 };
  for (let ch = 0; ch < 6; ch++) {
    tests.push({ label: `PCE wave ch${ch}`, chipId: 7, chan: ch, insIdx: 0,
      insData: buildINS2(5 /* DIV_INS_PCE */, []), wavetable: pceWave });
  }

  // ── Multi-instrument switch on same channel ───────────────────────────────
  // (These are handled specially in runSyntheticTests)

  return tests;
}

async function runSyntheticTests(wasm: WasmModule): Promise<TestResult[]> {
  const results: TestResult[] = [];
  const tests = buildSyntheticTestSuite();

  // Group by chipId so we only create each chip once
  const byChip = new Map<number, SyntheticTest[]>();
  for (const t of tests) {
    if (!byChip.has(t.chipId)) byChip.set(t.chipId, []);
    byChip.get(t.chipId)!.push(t);
  }

  for (const [chipId, chipTests] of byChip) {
    let handle: number;
    try {
      handle = wasm._furnace_dispatch_create(chipId, SAMPLE_RATE);
    } catch (e) {
      for (const t of chipTests) results.push({ file: '--synthetic', chipId, chan: t.chan, insIdx: t.insIdx, insName: t.label, rms: 0, pass: false, error: `create: ${(e as Error).message}` });
      continue;
    }
    if (handle <= 0) {
      for (const t of chipTests) results.push({ file: '--synthetic', chipId, chan: t.chan, insIdx: t.insIdx, insName: t.label, rms: 0, pass: false, error: 'create returned 0' });
      continue;
    }

    wasm._furnace_dispatch_set_tick_rate(handle, 60);
    wasm._furnace_dispatch_set_compat_flag(handle, 0, 2); // linearPitch=2

    const outPtrL = wasm._malloc(BUFFER_SIZE * 4);
    const outPtrR = wasm._malloc(BUFFER_SIZE * 4);

    for (const t of chipTests) {
      let rms = 0;
      let error: string | undefined;

      try {
        // Upload sample if needed
        if (t.sampleIdx !== undefined && t.sampleData) {
          refreshHeap(wasm);
          const ptr = wasm._malloc(t.sampleData.length);
          refreshHeap(wasm);
          wasm.HEAPU8.set(t.sampleData, ptr);
          wasm._furnace_dispatch_set_sample(handle, t.sampleIdx, ptr, t.sampleData.length);
          wasm._free(ptr);
          wasm._furnace_dispatch_render_samples(handle);
        }

        // Upload wavetable if needed
        if (t.wavetable) {
          const wt = t.wavetable;
          const packed = new Int32Array(2 + wt.data.length);
          packed[0] = wt.data.length; packed[1] = wt.height;
          for (let j = 0; j < wt.data.length; j++) packed[2 + j] = wt.data[j];
          refreshHeap(wasm);
          const ptr = wasm._malloc(packed.byteLength);
          refreshHeap(wasm);
          wasm.HEAPU8.set(new Uint8Array(packed.buffer), ptr);
          wasm._furnace_dispatch_set_wavetable(handle, wt.idx, ptr, packed.byteLength);
          wasm._free(ptr);
        }

        // Upload instrument INS2
        refreshHeap(wasm);
        const insPtr = wasm._malloc(t.insData.length);
        refreshHeap(wasm);
        wasm.HEAPU8.set(t.insData, insPtr);
        wasm._furnace_dispatch_load_ins2(t.insIdx, insPtr, t.insData.length);
        wasm._free(insPtr);

        // Reset chip, set instrument + volume, trigger note
        wasm._furnace_dispatch_reset(handle);
        wasm._furnace_dispatch_cmd(handle, DIV_CMD_INSTRUMENT, t.chan, t.insIdx, 1);
        // PCE: explicitly load wavetable 0 into the channel's wave RAM
        if (chipId === 7) {
          wasm._furnace_dispatch_cmd(handle, DIV_CMD_WAVE, t.chan, 0, 0);
        }
        // Clamp volume to chip-specific max to avoid corrupting control register bits
        const volume = chipId === 8 ? 15 : chipId === 7 ? 31 : chipId === 18 ? 64 : chipId === 21 ? 15 : chipId === 4 ? 15 : 100;
        wasm._furnace_dispatch_cmd(handle, DIV_CMD_VOLUME, t.chan, volume, 0);
        wasm._furnace_dispatch_cmd(handle, DIV_CMD_NOTE_ON, t.chan, t.note ?? TEST_NOTE, 0);
        // NES: force constant-volume + length-counter-halt so the note sustains
        if (chipId === 8) {
          wasm._furnace_dispatch_cmd(handle, DIV_CMD_NES_ENV_MODE, t.chan, 3, 0);
        }
        // Pre-tick: most chips need tick() before the first render to write essential registers
        try { wasm._furnace_dispatch_tick(handle); } catch {}

        const secs = t.durationSecs ?? TEST_DURATION_SECS;
        rms = renderAndMeasureRMS(wasm, handle, outPtrL, outPtrR, Math.floor(SAMPLE_RATE * secs));

        wasm._furnace_dispatch_cmd(handle, DIV_CMD_NOTE_OFF, t.chan, 0, 0);
      } catch (e) {
        error = (e as Error).message;
      }

      results.push({ file: '--synthetic', chipId, chan: t.chan, insIdx: t.insIdx, insName: t.label, rms, pass: rms > SILENCE_THRESHOLD, error });
    }

    wasm._free(outPtrL);
    wasm._free(outPtrR);
    try { wasm._furnace_dispatch_destroy(handle); } catch {}
  }

  // ── Multi-instrument switch test ──────────────────────────────────────────
  // Trigger ins A, switch to ins B mid-note on same channel, verify audio throughout
  const multiResults = await runMultiInstrumentTest(wasm);
  results.push(...multiResults);

  // ── Macro sweep tests ─────────────────────────────────────────────────────
  // These render for longer (3s) to exercise instruments with slow macro envelopes
  const sweepResults = await runMacroSweepTests(wasm);
  results.push(...sweepResults);

  return results;
}

/** Test switching instruments mid-note on the same channel. */
async function runMultiInstrumentTest(wasm: WasmModule): Promise<TestResult[]> {
  const results: TestResult[] = [];
  // Test: GB pulse ch0 — play ins0, switch to ins1 (different envelope), verify audio continuous
  const handle = wasm._furnace_dispatch_create(6 /* GB */, SAMPLE_RATE);
  if (handle <= 0) return results;

  wasm._furnace_dispatch_set_tick_rate(handle, 60);
  wasm._furnace_dispatch_set_compat_flag(handle, 0, 2);

  const ins0 = buildGBInstrument(15, 0, 0); // loud sustain
  const ins1 = buildGBInstrument(8, 0, 0);  // mid volume

  const uploadIns = (idx: number, data: Uint8Array) => {
    refreshHeap(wasm);
    const ptr = wasm._malloc(data.length);
    refreshHeap(wasm);
    wasm.HEAPU8.set(data, ptr);
    wasm._furnace_dispatch_load_ins2(idx, ptr, data.length);
    wasm._free(ptr);
  };
  uploadIns(0, ins0);
  uploadIns(1, ins1);

  const outPtrL = wasm._malloc(BUFFER_SIZE * 4);
  const outPtrR = wasm._malloc(BUFFER_SIZE * 4);
  const halfFrames = Math.floor(SAMPLE_RATE * 0.25);

  let rms = 0;
  let error: string | undefined;
  try {
    wasm._furnace_dispatch_reset(handle);
    wasm._furnace_dispatch_cmd(handle, DIV_CMD_INSTRUMENT, 0, 0, 1);
    wasm._furnace_dispatch_cmd(handle, DIV_CMD_VOLUME, 0, 100, 0);
    wasm._furnace_dispatch_cmd(handle, DIV_CMD_NOTE_ON, 0, TEST_NOTE, 0);

    // Render first quarter-second with ins0
    const rms0 = renderAndMeasureRMS(wasm, handle, outPtrL, outPtrR, halfFrames);

    // Switch to ins1 mid-note
    wasm._furnace_dispatch_cmd(handle, DIV_CMD_INSTRUMENT, 0, 1, 1);

    // Render second quarter-second with ins1
    const rms1 = renderAndMeasureRMS(wasm, handle, outPtrL, outPtrR, halfFrames);
    rms = (rms0 + rms1) / 2;
  } catch (e) {
    error = (e as Error).message;
  }

  wasm._free(outPtrL);
  wasm._free(outPtrR);
  try { wasm._furnace_dispatch_destroy(handle); } catch {}

  results.push({ file: '--synthetic', chipId: 6, chan: 0, insIdx: -1, insName: 'GB multi-instrument switch (ins0→ins1 mid-note)', rms, pass: rms > SILENCE_THRESHOLD, error });
  return results;
}

/** Test instruments that have slow macros — render 3 seconds to exercise them. */
async function runMacroSweepTests(wasm: WasmModule): Promise<TestResult[]> {
  const results: TestResult[] = [];
  const sweeps: Array<{ label: string; chipId: number; chan: number; ins: Uint8Array }> = [
    // GB: fade-up envelope (starts silent, grows louder)
    { label: 'GB fade-up envelope sweep (3s)', chipId: 6, chan: 0, ins: buildGBInstrument(0, 1, 1) },
    // C64: slow attack
    { label: 'C64 slow-attack saw sweep (3s)', chipId: 11, chan: 0, ins: buildC64Instrument(0b0010, 15, 8, 15, 8) },
    // YM2612: alg0 with feedback
    { label: 'YM2612 alg0 feedback=7 sweep (3s)', chipId: 20, chan: 0, ins: buildFMInstrument(0, 7) },
  ];

  for (const s of sweeps) {
    let handle: number;
    try {
      handle = wasm._furnace_dispatch_create(s.chipId, SAMPLE_RATE);
    } catch { continue; }
    if (handle <= 0) continue;

    wasm._furnace_dispatch_set_tick_rate(handle, 60);
    wasm._furnace_dispatch_set_compat_flag(handle, 0, 2);

    refreshHeap(wasm);
    const ptr = wasm._malloc(s.ins.length);
    refreshHeap(wasm);
    wasm.HEAPU8.set(s.ins, ptr);
    wasm._furnace_dispatch_load_ins2(0, ptr, s.ins.length);
    wasm._free(ptr);

    const outPtrL = wasm._malloc(BUFFER_SIZE * 4);
    const outPtrR = wasm._malloc(BUFFER_SIZE * 4);

    let rms = 0;
    let error: string | undefined;
    try {
      wasm._furnace_dispatch_reset(handle);
      wasm._furnace_dispatch_cmd(handle, DIV_CMD_INSTRUMENT, s.chan, 0, 1);
      wasm._furnace_dispatch_cmd(handle, DIV_CMD_VOLUME, s.chan, 100, 0);
      wasm._furnace_dispatch_cmd(handle, DIV_CMD_NOTE_ON, s.chan, TEST_NOTE, 0);
      rms = renderAndMeasureRMS(wasm, handle, outPtrL, outPtrR, SAMPLE_RATE * 3); // 3 seconds
      wasm._furnace_dispatch_cmd(handle, DIV_CMD_NOTE_OFF, s.chan, 0, 0);
    } catch (e) { error = (e as Error).message; }

    wasm._free(outPtrL);
    wasm._free(outPtrR);
    try { wasm._furnace_dispatch_destroy(handle); } catch {}

    results.push({ file: '--synthetic', chipId: s.chipId, chan: s.chan, insIdx: 0, insName: s.label, rms, pass: rms > SILENCE_THRESHOLD, error });
  }

  return results;
}

// ── Formatting ────────────────────────────────────────────────────────────────

const PASS = '\x1b[32mPASS\x1b[0m';
const FAIL = '\x1b[31mFAIL\x1b[0m';
const ERR  = '\x1b[33mERR \x1b[0m';

function printResults(results: TestResult[], showFile = false): void {
  for (const r of results) {
    const chip = chipName(r.chipId);
    const status = r.error ? ERR : r.pass ? PASS : FAIL;
    const rmsStr = r.rms.toFixed(4).padStart(7);
    const loc = showFile ? `${r.file.padEnd(30)} ` : '';
    const detail = r.error ? ` [${r.error}]` : '';
    console.log(`  ${status} ${loc}${chip.padEnd(18)} ch${String(r.chan).padStart(2)} ins${String(r.insIdx).padStart(3)} "${r.insName.substring(0, 20).padEnd(20)}" RMS=${rmsStr}${detail}`);
  }
}

function summarize(results: TestResult[]): void {
  const pass = results.filter(r => r.pass).length;
  const fail = results.filter(r => !r.pass && !r.error).length;
  const err  = results.filter(r => r.error).length;
  const total = results.length;
  const pct = total > 0 ? ((pass / total) * 100).toFixed(1) : '0.0';
  console.log(`\n  Summary: ${pass}/${total} pass (${pct}%)  |  ${fail} silent  |  ${err} errors`);
}

// ── Batch mode ────────────────────────────────────────────────────────────────

async function runBatch(category: string | undefined, probeMode: boolean): Promise<void> {
  const searchDirs: string[] = [];

  if (category) {
    searchDirs.push(join(DEMOS_DIR, category));
  } else {
    // All categories
    for (const entry of readdirSync(DEMOS_DIR)) {
      const full = join(DEMOS_DIR, entry);
      if (statSync(full).isDirectory()) searchDirs.push(full);
    }
  }

  const allResults: TestResult[] = [];
  let fileCount = 0;

  for (const dir of searchDirs) {
    if (!existsSync(dir)) { console.error(`  No such directory: ${dir}`); continue; }
    const catName = basename(dir);

    const furFiles = readdirSync(dir)
      .filter(f => f.endsWith('.fur'))
      .map(f => join(dir, f));

    if (furFiles.length === 0) continue;
    console.log(`\n─── ${catName} (${furFiles.length} files) ───`);

    for (const f of furFiles) {
      console.log(`  ${basename(f)}`);
      const results = await testFile(f, probeMode);
      printResults(results);
      allResults.push(...results);
      fileCount++;
    }
  }

  console.log(`\n═══ Batch complete: ${fileCount} files ═══`);
  summarize(allResults);

  // Group failures by chip
  const failures = allResults.filter(r => !r.pass && !r.error);
  if (failures.length > 0) {
    console.log('\n  Silent by chip:');
    const byChip = new Map<string, number>();
    for (const r of failures) {
      const n = chipName(r.chipId);
      byChip.set(n, (byChip.get(n) ?? 0) + 1);
    }
    for (const [name, count] of [...byChip.entries()].sort((a, b) => b[1] - a[1])) {
      console.log(`    ${name.padEnd(20)} ${count} silent`);
    }
  }
}

// ── Entry point ───────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  const args = process.argv.slice(2);

  if (args.length === 0) {
    console.log('Usage:');
    console.log('  npx tsx tools/furnace-audit/test-synths.ts <file.fur> [--probe]');
    console.log('  npx tsx tools/furnace-audit/test-synths.ts --batch [category] [--probe]');
    console.log('  npx tsx tools/furnace-audit/test-synths.ts --synthetic');
    process.exit(1);
  }

  const probeMode = args.includes('--probe');
  const batchIdx = args.indexOf('--batch');

  if (args.includes('--synthetic')) {
    console.log('Running synthetic chip test suite...\n');
    const wasm = await loadWasmModule();
    wasm._furnace_init(SAMPLE_RATE);
    const results = await runSyntheticTests(wasm);
    printResults(results);
    summarize(results);
    return;
  }

  if (batchIdx !== -1) {
    const category = args[batchIdx + 1]?.startsWith('--') ? undefined : args[batchIdx + 1];
    await runBatch(category, probeMode);
    return;
  }

  const furPath = args[0];
  if (!furPath.endsWith('.fur') || !existsSync(furPath)) {
    console.error(`File not found or not a .fur: ${furPath}`);
    process.exit(1);
  }

  console.log(`Testing: ${basename(furPath)}${probeMode ? ' [probe mode]' : ''}`);
  const results = await testFile(furPath, probeMode);
  printResults(results);
  summarize(results);
}

main().catch(e => { console.error(e); process.exit(1); });

