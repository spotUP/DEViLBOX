/**
 * FurnaceFileOps — TypeScript wrapper for the FurnaceFileOps WASM module
 *
 * Uses Furnace's REAL C++ parser (loadFur/saveFur) compiled to WASM.
 * Replaces the TypeScript FurnaceSongParser for byte-identical parsing.
 */

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type WasmModule = any;

let wasmInstance: WasmModule | null = null;
let loadPromise: Promise<WasmModule> | null = null;

async function getModule(): Promise<WasmModule> {
  if (wasmInstance) return wasmInstance;
  if (loadPromise) return loadPromise;

  loadPromise = (async () => {
    const scriptUrl = '/furnace-fileops/FurnaceFileOps.js';

    await new Promise<void>((resolve, reject) => {
      const script = document.createElement('script');
      script.src = scriptUrl;
      script.onload = () => resolve();
      script.onerror = () => reject(new Error('Failed to load FurnaceFileOps.js'));
      document.head.appendChild(script);
    });

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const factory = (globalThis as any).createFurnaceFileOps;
    if (!factory) throw new Error('createFurnaceFileOps not found on globalThis');

    const m = await factory();
    wasmInstance = m;
    return m;
  })();

  return loadPromise;
}

// ── C API wrappers ──────────────────────────────────────────

interface FurnaceFileOpsAPI {
  fur_load(dataPtr: number, len: number): number;
  fur_save(outLenPtr: number): number;
  fur_free_buffer(ptr: number): void;
  fur_get_error(): string;
  fur_get_num_subsongs(): number;
  fur_get_num_channels(): number;
  fur_get_num_instruments(): number;
  fur_get_num_samples(): number;
  fur_get_num_wavetables(): number;
  fur_get_system_len(): number;
  fur_get_system_id(idx: number): number;
  fur_get_system_channels(idx: number): number;
  fur_get_system_flags(idx: number): string;
  fur_get_pat_len(subsong: number): number;
  fur_get_orders_len(subsong: number): number;
  fur_get_effect_cols(subsong: number, chan: number): number;
  fur_get_speed(subsong: number, which: number): number;
  fur_get_tempo(subsong: number): number;
  fur_get_hz(subsong: number): number;
  fur_get_virtual_tempo(subsong: number, which: number): number;
  fur_get_groove(subsong: number, grooveIdx: number, pos: number): number;
  fur_get_song_name(): string;
  fur_get_song_author(): string;
  fur_get_subsong_name(subsong: number): string;
  fur_get_channel_name(subsong: number, chan: number): string;
  fur_get_order(subsong: number, chan: number, pos: number): number;
  fur_get_cell(subsong: number, chan: number, pat: number, row: number, col: number): number;
  fur_set_cell(subsong: number, chan: number, pat: number, row: number, col: number, val: number): void;
  fur_get_ins_data(idx: number, buf: number, bufLen: number): number;
  fur_get_sample_info(idx: number, field: number): number;
  fur_get_sample_data(idx: number, outLenPtr: number): number;
  fur_get_wave_info(idx: number, field: number): number;
  fur_get_wave_data(idx: number, pos: number): number;
  fur_get_tuning(): number;
  fur_get_packed_compat_flags(which: number): number;
  fur_get_speed_len(subsong: number): number;
  fur_get_dispatch_compat_flags(): number;
  fur_get_dispatch_compat_flags_size(): number;
  fur_get_master_vol(): number;
  fur_get_system_vol(idx: number): number;
  fur_get_system_pan(idx: number): number;
  fur_get_system_pan_fr(idx: number): number;
}

function getAPI(m: WasmModule): FurnaceFileOpsAPI {
  return {
    fur_load: m.cwrap('fur_load', 'number', ['number', 'number']),
    fur_save: m.cwrap('fur_save', 'number', ['number']),
    fur_free_buffer: m.cwrap('fur_free_buffer', null, ['number']),
    fur_get_error: m.cwrap('fur_get_error', 'string', []),
    fur_get_num_subsongs: m.cwrap('fur_get_num_subsongs', 'number', []),
    fur_get_num_channels: m.cwrap('fur_get_num_channels', 'number', []),
    fur_get_num_instruments: m.cwrap('fur_get_num_instruments', 'number', []),
    fur_get_num_samples: m.cwrap('fur_get_num_samples', 'number', []),
    fur_get_num_wavetables: m.cwrap('fur_get_num_wavetables', 'number', []),
    fur_get_system_len: m.cwrap('fur_get_system_len', 'number', []),
    fur_get_system_id: m.cwrap('fur_get_system_id', 'number', ['number']),
    fur_get_system_channels: m.cwrap('fur_get_system_channels', 'number', ['number']),
    fur_get_system_flags: m.cwrap('fur_get_system_flags', 'string', ['number']),
    fur_get_pat_len: m.cwrap('fur_get_pat_len', 'number', ['number']),
    fur_get_orders_len: m.cwrap('fur_get_orders_len', 'number', ['number']),
    fur_get_effect_cols: m.cwrap('fur_get_effect_cols', 'number', ['number', 'number']),
    fur_get_speed: m.cwrap('fur_get_speed', 'number', ['number', 'number']),
    fur_get_tempo: m.cwrap('fur_get_tempo', 'number', ['number']),
    fur_get_hz: m.cwrap('fur_get_hz', 'number', ['number']),
    fur_get_virtual_tempo: m.cwrap('fur_get_virtual_tempo', 'number', ['number', 'number']),
    fur_get_groove: m.cwrap('fur_get_groove', 'number', ['number', 'number', 'number']),
    fur_get_song_name: m.cwrap('fur_get_song_name', 'string', []),
    fur_get_song_author: m.cwrap('fur_get_song_author', 'string', []),
    fur_get_subsong_name: m.cwrap('fur_get_subsong_name', 'string', ['number']),
    fur_get_channel_name: m.cwrap('fur_get_channel_name', 'string', ['number', 'number']),
    fur_get_order: m.cwrap('fur_get_order', 'number', ['number', 'number', 'number']),
    fur_get_cell: m.cwrap('fur_get_cell', 'number', ['number', 'number', 'number', 'number', 'number']),
    fur_set_cell: m.cwrap('fur_set_cell', null, ['number', 'number', 'number', 'number', 'number', 'number']),
    fur_get_ins_data: m.cwrap('fur_get_ins_data', 'number', ['number', 'number', 'number']),
    fur_get_sample_info: m.cwrap('fur_get_sample_info', 'number', ['number', 'number']),
    fur_get_sample_data: m.cwrap('fur_get_sample_data', 'number', ['number', 'number']),
    fur_get_wave_info: m.cwrap('fur_get_wave_info', 'number', ['number', 'number']),
    fur_get_wave_data: m.cwrap('fur_get_wave_data', 'number', ['number', 'number']),
    fur_get_tuning: m.cwrap('fur_get_tuning', 'number', []),
    fur_get_packed_compat_flags: m.cwrap('fur_get_packed_compat_flags', 'number', ['number']),
    fur_get_speed_len: m.cwrap('fur_get_speed_len', 'number', ['number']),
    fur_get_dispatch_compat_flags: m.cwrap('fur_get_dispatch_compat_flags', 'number', []),
    fur_get_dispatch_compat_flags_size: m.cwrap('fur_get_dispatch_compat_flags_size', 'number', []),
    fur_get_master_vol: m.cwrap('fur_get_master_vol', 'number', []),
    fur_get_system_vol: m.cwrap('fur_get_system_vol', 'number', ['number']),
    fur_get_system_pan: m.cwrap('fur_get_system_pan', 'number', ['number']),
    fur_get_system_pan_fr: m.cwrap('fur_get_system_pan_fr', 'number', ['number']),
  };
}

let cachedAPI: FurnaceFileOpsAPI | null = null;

// ── Public API ──────────────────────────────────────────────

import type {
  FurnaceNativeData,
  FurnaceSubsong,
  FurnaceChannelData,
  FurnacePatternData,
  FurnaceRow,
} from '@/types/tracker';

/**
 * Load a .fur file via the WASM parser and extract all data.
 * Returns FurnaceNativeData (for the WASM sequencer) plus metadata.
 */
export async function loadFurFileWasm(buffer: ArrayBuffer): Promise<{
  name: string;
  author: string;
  numChannels: number;
  numSubsongs: number;
  chipIds: number[];
  chipFlags: string[];
  nativeData: FurnaceNativeData;
  instrumentBinaries: Uint8Array[];
  wavetables: Array<{ data: number[]; width: number; height: number }>;
  samples: Array<{ data: Int16Array | Int8Array | Uint8Array; rate: number; depth: number;
    loopStart: number; loopEnd: number; loopMode: number; name: string; samples: number }>;
}> {
  const m = await getModule();
  if (!cachedAPI) cachedAPI = getAPI(m);
  const api = cachedAPI;

  console.log(`[FurnaceFileOps] loadFurFileWasm called, ${buffer.byteLength} bytes, header: ${new Uint8Array(buffer, 0, 4).join(',')}`);
  // Pre-decompress zlib data (e.g. DefleMask DMF) so the WASM receives raw data.
  // This avoids relying on the WASM's internal zlib which can crash on files
  // with corrupted adler32 checksums.
  let data = new Uint8Array(buffer);
  if (data[0] === 0x78 && (data[1] === 0x9c || data[1] === 0x01 || data[1] === 0xDA)) {
    try {
      const pako = await import('pako');
      data = pako.inflateRaw(data.slice(2));
      console.log(`[FurnaceFileOps] Pre-decompressed zlib → ${data.length} bytes`);
    } catch (e) {
      console.warn('[FurnaceFileOps] JS zlib pre-decompress failed, letting WASM try:', e);
    }
  }

  // Copy buffer to WASM heap
  const ptr = m._malloc(data.length);
  if (!ptr) throw new Error('WASM malloc failed');
  m.HEAPU8.set(data, ptr);

  let result: number;
  try {
    result = api.fur_load(ptr, data.length);
  } catch (wasmErr) {
    m._free(ptr);
    // WASM abort throws a raw number (heap pointer). Try to read the error string.
    let errDetail = String(wasmErr);
    try { errDetail = api.fur_get_error() || errDetail; } catch { /* WASM may be dead */ }
    throw new Error(`Furnace WASM abort during fur_load: ${errDetail}`);
  }
  m._free(ptr);

  if (result !== 0) {
    throw new Error(`Furnace WASM load failed: ${api.fur_get_error()}`);
  }

  // Read metadata
  const name = api.fur_get_song_name();
  const author = api.fur_get_song_author();
  const numChannels = api.fur_get_num_channels();
  const numSubsongs = api.fur_get_num_subsongs();
  const systemLen = api.fur_get_system_len();

  const chipIds: number[] = [];
  const chipFlags: string[] = [];
  for (let i = 0; i < systemLen; i++) {
    chipIds.push(api.fur_get_system_id(i));
    chipFlags.push(api.fur_get_system_flags(i));
  }

  // Read grooves
  const grooves: Array<{ len: number; val: number[] }> = [];
  for (let g = 0; ; g++) {
    const first = api.fur_get_groove(0, g, 0);
    if (first < 0) break;
    const val: number[] = [first];
    for (let p = 1; ; p++) {
      const v = api.fur_get_groove(0, g, p);
      if (v < 0) break;
      val.push(v);
    }
    grooves.push({ len: val.length, val });
  }

  // Read subsongs
  const subsongs: FurnaceSubsong[] = [];
  for (let s = 0; s < numSubsongs; s++) {
    const patLen = api.fur_get_pat_len(s);
    const ordersLen = api.fur_get_orders_len(s);
    const speedLen = api.fur_get_speed_len(s);
    const speed1 = api.fur_get_speed(s, 0);
    const speed2 = speedLen >= 2 ? api.fur_get_speed(s, 1) : speed1;
    const hz = api.fur_get_hz(s);
    const virtualTempoN = api.fur_get_virtual_tempo(s, 0);
    const virtualTempoD = api.fur_get_virtual_tempo(s, 1);
    const subsongName = api.fur_get_subsong_name(s);

    // Read full speed pattern for groove-style speeds (len > 2)
    let speedPattern: number[] | undefined;
    if (speedLen > 0) {
      speedPattern = [];
      for (let i = 0; i < speedLen; i++) {
        speedPattern.push(api.fur_get_speed(s, i));
      }
    }

    // Read orders
    const orders: number[][] = [];
    for (let ch = 0; ch < numChannels; ch++) {
      const chOrders: number[] = [];
      for (let pos = 0; pos < ordersLen; pos++) {
        chOrders.push(api.fur_get_order(s, ch, pos));
      }
      orders.push(chOrders);
    }

    // Read channels and pattern data
    const channels: FurnaceChannelData[] = [];
    for (let ch = 0; ch < numChannels; ch++) {
      const effectCols = api.fur_get_effect_cols(s, ch);
      const chName = api.fur_get_channel_name(s, ch);

      // Collect unique pattern indices from orders
      const usedPatterns = new Set<number>();
      for (let pos = 0; pos < ordersLen; pos++) {
        usedPatterns.add(orders[ch][pos]);
      }

      const patterns = new Map<number, FurnacePatternData>();
      for (const patIdx of usedPatterns) {
        const rows: FurnaceRow[] = [];
        for (let row = 0; row < patLen; row++) {
          // Read cell data: col 0=note, 1=ins, 2=vol, 3+=effects
          // fur_get_cell returns newData[row][0] which is Furnace internal format:
          // splitNoteToNote applies +60 offset (C-0=61, C-4=109, special 252-255).
          // Strip the +60 to match TS parser format (C-0=1, C-4=49) — the serializer
          // adds +60 when uploading to the WASM sequencer.
          const rawNote = api.fur_get_cell(s, ch, patIdx, row, 0);
          const note = rawNote >= 252 ? rawNote  // Special: off/release/macro-release/null
                     : rawNote === -1 ? -1       // Empty
                     : rawNote - 60;             // Regular note: strip +60 offset
          const ins = api.fur_get_cell(s, ch, patIdx, row, 1);
          const vol = api.fur_get_cell(s, ch, patIdx, row, 2);

          const effects: Array<{ cmd: number; val: number }> = [];
          for (let fx = 0; fx < effectCols; fx++) {
            const cmd = api.fur_get_cell(s, ch, patIdx, row, 3 + fx * 2);
            const val = api.fur_get_cell(s, ch, patIdx, row, 4 + fx * 2);
            effects.push({ cmd, val });
          }

          rows.push({ note, ins, vol, effects });
        }
        patterns.set(patIdx, { rows });
      }

      channels.push({ name: chName, effectCols, patterns });
    }

    const subsongData: FurnaceSubsong = {
      name: subsongName,
      patLen,
      ordersLen,
      orders,
      channels,
      speed1,
      speed2,
      hz,
      virtualTempoN,
      virtualTempoD,
    };
    if (speedPattern) {
      subsongData.speedPattern = speedPattern;
    }
    subsongs.push(subsongData);
  }

  // Read instrument binary data (INS2 format)
  const numInstruments = api.fur_get_num_instruments();
  const instrumentBinaries: Uint8Array[] = [];
  for (let i = 0; i < numInstruments; i++) {
    // First call with null buf to get required size
    const reqSize = api.fur_get_ins_data(i, 0, 0);
    if (reqSize <= 0) {
      instrumentBinaries.push(new Uint8Array(0));
      continue;
    }
    const insBuf = m._malloc(reqSize);
    const written = api.fur_get_ins_data(i, insBuf, reqSize);
    if (written > 0) {
      const binary = new Uint8Array(m.HEAPU8.buffer, insBuf, written).slice(); // Copy out
      instrumentBinaries.push(binary);
    } else {
      instrumentBinaries.push(new Uint8Array(0));
    }
    m._free(insBuf);
  }

  // Read wavetables
  const numWavetables = api.fur_get_num_wavetables();
  const wavetables: Array<{ data: number[]; width: number; height: number }> = [];
  for (let i = 0; i < numWavetables; i++) {
    const len = api.fur_get_wave_info(i, 0);
    const max = api.fur_get_wave_info(i, 2);
    const data: number[] = [];
    for (let p = 0; p < len; p++) {
      data.push(api.fur_get_wave_data(i, p));
    }
    wavetables.push({ data, width: len, height: max + 1 });
  }

  // Read samples
  const numSamples = api.fur_get_num_samples();
  const samples: Array<{ data: Int16Array | Int8Array | Uint8Array; rate: number; depth: number;
    loopStart: number; loopEnd: number; loopMode: number; name: string; samples: number }> = [];
  for (let i = 0; i < numSamples; i++) {
    const centerRate = api.fur_get_sample_info(i, 0);
    const loopStart = api.fur_get_sample_info(i, 1);
    const loopEnd = api.fur_get_sample_info(i, 2);
    const depth = api.fur_get_sample_info(i, 3);
    const hasLoop = api.fur_get_sample_info(i, 4);
    const numSampleFrames = api.fur_get_sample_info(i, 5);
    // Get sample data pointer
    const outLenPtr = m._malloc(4);
    const sampleDataPtr = api.fur_get_sample_data(i, outLenPtr);
    const actualLen = m.getValue(outLenPtr, 'i32');
    m._free(outLenPtr);

    let sampleData: Int16Array | Int8Array | Uint8Array;
    if (depth === 16) {
      // 16-bit PCM: Int16Array, one element per sample frame
      const src = new Int16Array(m.HEAPU8.buffer, sampleDataPtr, numSampleFrames);
      sampleData = new Int16Array(src); // Copy out of WASM heap
    } else if (depth === 8) {
      // 8-bit PCM: Int8Array, one element per sample frame
      const src = new Int8Array(m.HEAPU8.buffer, sampleDataPtr, actualLen);
      sampleData = new Int8Array(src);
    } else {
      // Compressed format (DPCM depth=1, ADPCM, BRR, etc.): raw bytes
      const src = new Uint8Array(m.HEAPU8.buffer, sampleDataPtr, actualLen);
      sampleData = new Uint8Array(src);
    }

    samples.push({
      data: sampleData,
      rate: centerRate,
      depth,                     // Preserve actual depth (1=DPCM, 3=YMZ, 5=ADPCM-A, etc.)
      samples: numSampleFrames,  // Frame count (used for compressed formats in uploadModuleSamplesToPlatform)
      loopStart,
      loopEnd,
      loopMode: hasLoop ? 1 : 0,
      name: `Sample ${i}`,
    });
  }

  // Extract tuning
  const tuning = api.fur_get_tuning();

  // Extract compat flags pre-packed for the WASM sequencer (no TS intermediary)
  const packedFlags = api.fur_get_packed_compat_flags(0);
  const packedFlagsExt = api.fur_get_packed_compat_flags(1);
  const pitchSlideSpeed = api.fur_get_packed_compat_flags(2);

  // Extract raw dispatch compat flags (DivCompatFlags struct bytes)
  const dispatchFlagsPtr = api.fur_get_dispatch_compat_flags();
  const dispatchFlagsSize = api.fur_get_dispatch_compat_flags_size();
  const dispatchFlagsBytes = new Uint8Array(m.HEAPU8.buffer, dispatchFlagsPtr, dispatchFlagsSize).slice();

  // Store as pre-packed format that uploadFurnaceToSequencer can send directly
  const compatFlags: Record<string, unknown> = {
    _packed: true,  // Signal to serializer that these are pre-packed
    _flags: packedFlags,
    _flagsExt: packedFlagsExt,
    _pitchSlideSpeed: pitchSlideSpeed,
    _dispatchFlags: dispatchFlagsBytes,  // Raw DivCompatFlags struct bytes for dispatch
    // Also store linearPitch for the dispatch engine compat flag setter
    linearPitch: packedFlagsExt & 0x3,
  };

  // Extract mix volumes (matching upstream Furnace playback.cpp nextBuf)
  const masterVol = api.fur_get_master_vol();
  const systemVol: number[] = [];
  const systemPan: number[] = [];
  const systemPanFR: number[] = [];
  for (let i = 0; i < systemLen; i++) {
    systemVol.push(api.fur_get_system_vol(i));
    systemPan.push(api.fur_get_system_pan(i));
    systemPanFR.push(api.fur_get_system_pan_fr(i));
  }

  const nativeData: FurnaceNativeData = {
    subsongs,
    activeSubsong: 0,
    chipIds,
    chipFlags,
    compatFlags,
    tuning: tuning !== 440.0 ? tuning : undefined,
    grooves: grooves.length > 0 ? grooves : undefined,
    masterVol,
    systemVol: systemVol.length > 0 ? systemVol : undefined,
    systemPan: systemPan.length > 0 ? systemPan : undefined,
    systemPanFR: systemPanFR.length > 0 ? systemPanFR : undefined,
  };

  return {
    name,
    author,
    numChannels,
    numSubsongs,
    chipIds,
    chipFlags,
    nativeData,
    instrumentBinaries,
    wavetables,
    samples,
  };
}

/**
 * Save the currently loaded song as .fur format.
 * Returns the raw .fur file bytes.
 */
export async function saveFurFileWasm(): Promise<ArrayBuffer> {
  const m = await getModule();
  if (!cachedAPI) cachedAPI = getAPI(m);
  const api = cachedAPI;

  const outLenPtr = m._malloc(4);
  const bufPtr = api.fur_save(outLenPtr);
  const len = m.getValue(outLenPtr, 'i32');
  m._free(outLenPtr);

  if (!bufPtr) {
    throw new Error(`Furnace WASM save failed: ${api.fur_get_error()}`);
  }

  const result = new Uint8Array(m.HEAPU8.buffer, bufPtr, len).slice(); // Copy out
  api.fur_free_buffer(bufPtr);
  return result.buffer;
}
