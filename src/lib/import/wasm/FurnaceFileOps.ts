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
  nsf_to_fur(dataPtr: number, len: number, track: number, frames: number, patLen: number, outLenPtr: number): number;
  nsf_get_stat(i: number): number;
  ned_to_fur(dataPtr: number, len: number, outLenPtr: number): number;
  fur_save_text(outLenPtr: number, separatePatterns: number): number;
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
  fur_get_system_name(idx: number): string;
  fur_get_channel_type(chan: number): number;
  fur_get_ins_system(insIdx: number): number;
  fur_get_ins_chip_channel(insIdx: number): number;
  fur_get_system_flags(idx: number): string;
  fur_get_pat_len(subsong: number): number;
  fur_get_orders_len(subsong: number): number;
  fur_get_effect_cols(subsong: number, chan: number): number;
  fur_get_speed(subsong: number, which: number): number;
  fur_get_tempo(subsong: number): number;
  fur_get_hz(subsong: number): number;
  fur_get_virtual_tempo(subsong: number, which: number): number;
  fur_get_arp_len(subsong: number): number;
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
  fur_set_sample(idx: number, dataPtr: number, frames: number, centerRate: number, loopStart: number, loopEnd: number): number;
  fur_get_wave_info(idx: number, field: number): number;
  fur_set_wave(idx: number, valuesPtr: number, len: number, max: number): number;
  fur_truncate_waves(count: number): number;
  fur_remap_waves(mapPtr: number, n: number): void;
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
  fur_ins_load_file(dataPtr: number, len: number, namePtr: number): number;
  fur_ins_from_ins2(buf: number, len: number): number;
  fur_wave_load(dataPtr: number, len: number, namePtr: number): number;
  fur_wave_set(valuesPtr: number, len: number, max: number): number;
  fur_wave_get_max(): number;
  fur_wave_get_value(pos: number): number;
  fur_wave_to_file(fmt: number, buf: number, bufLen: number): number;
  fur_ins_get_name(i: number): string;
  fur_ins_get_type(i: number): number;
  fur_ins_to_fui(i: number, buf: number, bufLen: number): number;
  fur_ins_to_dmp(i: number, buf: number, bufLen: number): number;
  fur_ins_add_wave(values: number, len: number, max: number): number;
}

function getAPI(m: WasmModule): FurnaceFileOpsAPI {
  return {
    fur_load: m.cwrap('fur_load', 'number', ['number', 'number']),
    fur_save: m.cwrap('fur_save', 'number', ['number']),
    nsf_to_fur: m.cwrap('nsf_to_fur', 'number', ['number', 'number', 'number', 'number', 'number', 'number']),
    nsf_get_stat: m.cwrap('nsf_get_stat', 'number', ['number']),
    ned_to_fur: m.cwrap('ned_to_fur', 'number', ['number', 'number', 'number']),
    fur_save_text: m.cwrap('fur_save_text', 'number', ['number', 'number']),
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
    fur_get_system_name: m.cwrap('fur_get_system_name', 'string', ['number']),
    fur_get_channel_type: m.cwrap('fur_get_channel_type', 'number', ['number']),
    fur_get_ins_system: m.cwrap('fur_get_ins_system', 'number', ['number']),
    fur_get_ins_chip_channel: m.cwrap('fur_get_ins_chip_channel', 'number', ['number']),
    fur_get_system_flags: m.cwrap('fur_get_system_flags', 'string', ['number']),
    fur_get_pat_len: m.cwrap('fur_get_pat_len', 'number', ['number']),
    fur_get_orders_len: m.cwrap('fur_get_orders_len', 'number', ['number']),
    fur_get_effect_cols: m.cwrap('fur_get_effect_cols', 'number', ['number', 'number']),
    fur_get_speed: m.cwrap('fur_get_speed', 'number', ['number', 'number']),
    fur_get_tempo: m.cwrap('fur_get_tempo', 'number', ['number']),
    fur_get_hz: m.cwrap('fur_get_hz', 'number', ['number']),
    fur_get_virtual_tempo: m.cwrap('fur_get_virtual_tempo', 'number', ['number', 'number']),
    fur_get_arp_len: m.cwrap('fur_get_arp_len', 'number', ['number']),
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
    fur_set_sample: m.cwrap('fur_set_sample', 'number', ['number', 'number', 'number', 'number', 'number', 'number']),
    fur_set_wave: m.cwrap('fur_set_wave', 'number', ['number', 'number', 'number', 'number']),
    fur_truncate_waves: m.cwrap('fur_truncate_waves', 'number', ['number']),
    fur_remap_waves: m.cwrap('fur_remap_waves', null, ['number', 'number']),
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
    fur_ins_load_file: m.cwrap('fur_ins_load_file', 'number', ['number', 'number', 'number']),
    fur_ins_from_ins2: m.cwrap('fur_ins_from_ins2', 'number', ['number', 'number']),
    fur_wave_load: m.cwrap('fur_wave_load', 'number', ['number', 'number', 'number']),
    fur_wave_set: m.cwrap('fur_wave_set', 'number', ['number', 'number', 'number']),
    fur_wave_get_max: m.cwrap('fur_wave_get_max', 'number', []),
    fur_wave_get_value: m.cwrap('fur_wave_get_value', 'number', ['number']),
    fur_wave_to_file: m.cwrap('fur_wave_to_file', 'number', ['number', 'number', 'number']),
    fur_ins_get_name: m.cwrap('fur_ins_get_name', 'string', ['number']),
    fur_ins_get_type: m.cwrap('fur_ins_get_type', 'number', ['number']),
    fur_ins_to_fui: m.cwrap('fur_ins_to_fui', 'number', ['number', 'number', 'number']),
    fur_ins_to_dmp: m.cwrap('fur_ins_to_dmp', 'number', ['number', 'number', 'number']),
    fur_ins_add_wave: m.cwrap('fur_ins_add_wave', 'number', ['number', 'number', 'number']),
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
  /** Furnace's own display name for each chip in chipIds. */
  systemNames: string[];
  /** Per song channel, its hardware type (DivChanType: 0 FM .. 5 OP), -1 when undefined. */
  channelTypes: number[];
  chipFlags: string[];
  nativeData: FurnaceNativeData;
  instrumentBinaries: Uint8Array[];
  /** Per instrument: the song chip (DivSystem id) it plays on, -1 when none. */
  instrumentSystems: number[];
  /** Per instrument: the channel of that chip it previews on, -1 when none. */
  instrumentChipChannels: number[];
  wavetables: Array<{ data: number[]; width: number; height: number }>;
  samples: Array<{ data: Int16Array | Int8Array | Uint8Array; rate: number; depth: number;
    loopStart: number; loopEnd: number; loopMode: number; name: string; samples: number }>;
  /**
   * Set when the file loaded but part of it was unreadable — a DefleMask file
   * whose zlib checksum failed loses the end of its sample block, and the
   * loader keeps the samples that survived rather than refusing the song.
   * Empty when the file read cleanly.
   */
  loadWarning: string;
}> {
  const m = await getModule();
  if (!cachedAPI) cachedAPI = getAPI(m);
  const api = cachedAPI;

  console.log(`[FurnaceFileOps] loadFurFileWasm called, ${buffer.byteLength} bytes, header: ${new Uint8Array(buffer, 0, 4).join(',')}`);
  // The file goes in as it is: DivEngine::load() inflates it, and its inflate
  // keeps what a DefleMask file's bad adler32 would otherwise cost
  // (fileOpsCommon_patched.cpp). pako's was stricter and refused files the
  // engine reads.
  const data = new Uint8Array(buffer);

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

  // A successful load still reports through fur_get_error() when the file was
  // only partly readable — see the sample-block patch in dmf.cpp.
  const loadWarning = api.fur_get_error() || '';
  if (loadWarning) console.warn(`[FurnaceFileOps] loaded with damage: ${loadWarning}`);

  // Read metadata
  const name = api.fur_get_song_name();
  const author = api.fur_get_song_author();
  const numChannels = api.fur_get_num_channels();
  const numSubsongs = api.fur_get_num_subsongs();
  const channelTypes: number[] = [];
  for (let ch = 0; ch < numChannels; ch++) channelTypes.push(api.fur_get_channel_type(ch));
  const systemLen = api.fur_get_system_len();

  const chipIds: number[] = [];
  const chipFlags: string[] = [];
  // How many of the song's channels each system owns. The sequencer maps song
  // channels to chips by these counts (FurnaceSequencerSerializer); without
  // them it falls back to each chip's runtime channel count, and a DefleMask
  // Genesis song (YM2612 + SN76489, 6 + 4 channels) put all ten channels on
  // the YM2612, whose dispatch reports 10 — the four PSG parts played FM
  // channels, octaves off and in the wrong voice.
  const systemChans: number[] = [];
  const systemNames: string[] = [];
  for (let i = 0; i < systemLen; i++) {
    chipIds.push(api.fur_get_system_id(i));
    systemNames.push(api.fur_get_system_name(i));
    chipFlags.push(api.fur_get_system_flags(i));
    systemChans.push(api.fur_get_system_channels(i));
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
      arpLen: api.fur_get_arp_len(s),
    };
    if (speedPattern) {
      subsongData.speedPattern = speedPattern;
    }
    subsongs.push(subsongData);
  }

  // Read instrument binary data (INS2 format)
  const numInstruments = api.fur_get_num_instruments();
  const instrumentBinaries: Uint8Array[] = [];
  const instrumentSystems: number[] = [];
  const instrumentChipChannels: number[] = [];
  for (let i = 0; i < numInstruments; i++) {
    instrumentSystems.push(api.fur_get_ins_system(i));
    instrumentChipChannels.push(api.fur_get_ins_chip_channel(i));
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
    // height is the wave's max value, as the .fur WAVE block stores it and the TS parser reads it
    // (FurnaceSongParser). As max + 1 the dispatch scaled every sample by max/(max+1): Game Boy
    // wave RAM one step off on every nibble (No Geodudes on Mt Amber.dmf against Furnace's VGM).
    wavetables.push({ data, width: len, height: max });
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
      name: '',
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
    systemChans,
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
    systemNames,
    channelTypes,
    chipFlags,
    nativeData,
    instrumentBinaries,
    instrumentSystems,
    instrumentChipChannels,
    wavetables,
    samples,
    loadWarning,
  };
}

/**
 * Replace module sample `idx` of the song the .fur save writes with edited 16-bit PCM
 * (loopStart/loopEnd < 0 = no loop), so the export holds the edit.
 */
export async function setFurSampleWasm(idx: number, data: Int16Array, rate: number, loopStart: number, loopEnd: number): Promise<void> {
  const m = await getModule();
  if (!cachedAPI) cachedAPI = getAPI(m);
  const ptr = m._malloc(Math.max(2, data.length * 2));
  try {
    m.HEAPU8.set(new Uint8Array(data.buffer, data.byteOffset, data.byteLength), ptr);
    if (cachedAPI.fur_set_sample(idx, ptr, data.length, Math.round(rate), loopStart, loopEnd) !== 0) {
      throw new Error(`Furnace WASM refused sample ${idx}`);
    }
  } finally {
    m._free(ptr);
  }
}

/**
 * Make the song the .fur save writes hold this wavetable list, and move every wave reference of its
 * instruments and 10xx effects with `map` (map[old] = new index; omit for an append).
 */
export async function setFurWaveListWasm(waves: ReadonlyArray<{ data: number[]; height: number }>, map?: readonly number[]): Promise<void> {
  const m = await getModule();
  if (!cachedAPI) cachedAPI = getAPI(m);
  const api = cachedAPI;
  if (map) {
    const mp = m._malloc(Math.max(4, map.length * 4));
    try {
      new Int32Array(m.HEAPU8.buffer, mp, map.length).set(map);
      api.fur_remap_waves(mp, map.length);
    } finally { m._free(mp); }
  }
  for (let i = 0; i < waves.length; i++) {
    const w = waves[i];
    const vp = m._malloc(Math.max(4, w.data.length * 4));
    try {
      new Int32Array(m.HEAPU8.buffer, vp, w.data.length).set(w.data);
      if (api.fur_set_wave(i, vp, w.data.length, w.height) !== 0) throw new Error(`Furnace WASM refused wavetable ${i}`);
    } finally { m._free(vp); }
  }
  api.fur_truncate_waves(waves.length);
}

/** PLAY calls recorded per NSF track when the file gives no length: game-music-emu's 150 s default. */
export const NSF_DEFAULT_FRAMES = 9000;

/**
 * Convert an NSF track to .fur bytes in the wasm (nsfToFur.cpp): one channel
 * per voice, rows on the detected speed. `track` -1 converts every track, one
 * subsong each (only when they fit 256 instruments; the drop path converts one).
 * Feed the result to the normal .fur load path.
 */
export async function nsfToFurWasm(nsf: Uint8Array, track: number, frames: number, patLen = 64): Promise<ArrayBuffer> {
  const m = await getModule();
  if (!cachedAPI) cachedAPI = getAPI(m);
  const api = cachedAPI;
  const dataPtr = m._malloc(nsf.length);
  m.HEAPU8.set(nsf, dataPtr);
  const outLenPtr = m._malloc(4);
  const bufPtr = api.nsf_to_fur(dataPtr, nsf.length, track, frames, patLen, outLenPtr);
  const len = m.getValue(outLenPtr, 'i32');
  m._free(outLenPtr);
  m._free(dataPtr);
  if (!bufPtr) throw new Error(`NSF conversion failed: ${api.fur_get_error()}`);
  const result = new Uint8Array(m.HEAPU8.buffer, bufPtr, len).slice();
  api.fur_free_buffer(bufPtr);
  return result.buffer;
}

/**
 * Convert a NerdTracker II .ned file to .fur bytes in the wasm (nedToFur.cpp):
 * patterns, orders and instruments map directly onto one 2A03 song.
 * Feed the result to the normal .fur load path.
 */
export async function nedToFurWasm(ned: Uint8Array): Promise<ArrayBuffer> {
  const m = await getModule();
  if (!cachedAPI) cachedAPI = getAPI(m);
  const api = cachedAPI;
  const dataPtr = m._malloc(ned.length);
  m.HEAPU8.set(ned, dataPtr);
  const outLenPtr = m._malloc(4);
  const bufPtr = api.ned_to_fur(dataPtr, ned.length, outLenPtr);
  const len = m.getValue(outLenPtr, 'i32');
  m._free(outLenPtr);
  m._free(dataPtr);
  if (!bufPtr) throw new Error(`NerdTracker II conversion failed: ${api.fur_get_error()}`);
  const result = new Uint8Array(m.HEAPU8.buffer, bufPtr, len).slice();
  api.fur_free_buffer(bufPtr);
  return result.buffer;
}

/** Compaction stats of the last nsfToFurWasm call (gridFit, parity in permille). */
export interface NsfConvertStats {
  speed: number; phase: number; gridFit: number; parity: number; matchFrames: number; activeFrames: number;
  dpcmHits: number; dpcmTrigs: number; channelPatterns: number; orders: number; instruments: number;
  /** Rows per pattern, chosen so the song start, loop start and end fall on pattern boundaries. */
  patLen: number;
  /** Order the closing 0Bxx jumps to; -2 the song stops (FF00), -1 no loop found (0B00 at the trace end). */
  loopOrder: number;
}

export async function nsfLastStatsWasm(): Promise<NsfConvertStats> {
  const m = await getModule();
  if (!cachedAPI) cachedAPI = getAPI(m);
  const g = cachedAPI.nsf_get_stat;
  return {
    speed: g(0), phase: g(1), gridFit: g(2), parity: g(3), matchFrames: g(4), activeFrames: g(5),
    dpcmHits: g(6), dpcmTrigs: g(7), channelPatterns: g(8), orders: g(9), instruments: g(10),
    patLen: g(14), loopOrder: g(15),
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

/** Furnace's own text export (DivEngine::saveText) of the song the WASM engine holds. */
export async function saveFurTextWasm(separatePatterns = false): Promise<string> {
  const m = await getModule();
  if (!cachedAPI) cachedAPI = getAPI(m);
  const api = cachedAPI;
  const outLenPtr = m._malloc(4);
  const bufPtr = api.fur_save_text(outLenPtr, separatePatterns ? 1 : 0);
  const len = m.getValue(outLenPtr, 'i32');
  m._free(outLenPtr);
  if (!bufPtr) {
    throw new Error(`Furnace WASM text export failed: ${api.fur_get_error()}`);
  }
  const text = new TextDecoder().decode(new Uint8Array(m.HEAPU8.buffer, bufPtr, len));
  api.fur_free_buffer(bufPtr);
  return text;
}

/** One instrument read by Furnace's own instrumentFromFile, as the bytes the editor opens or saves. */
export interface FurnaceInstrumentFile {
  name: string;
  /** DivInstrumentType of the instrument. */
  type: number;
  /** .fui bytes (DivInstrument::putInsData2), which FurnaceParser.parse reads. */
  fui: Uint8Array;
  /** .dmp bytes (DivInstrument::saveDMP); null when the instrument type has no .dmp form. */
  dmp: Uint8Array | null;
}

/**
 * Read an instrument file of any format Furnace's instrument loader knows (.fui .dmp .tfi .vgi .opni .y12
 * .opli .sbi .wopl .bnk .wopn .s3i .eif .ff .gyb .opm .fti .bti). The extension of fileName picks the format;
 * a bank file returns several instruments.
 */
export async function instrumentsFromFileWasm(buffer: ArrayBuffer, fileName: string): Promise<FurnaceInstrumentFile[]> {
  const m = await getModule();
  if (!cachedAPI) cachedAPI = getAPI(m);
  const api = cachedAPI;

  const data = new Uint8Array(buffer);
  const dataPtr = m._malloc(data.length);
  m.HEAPU8.set(data, dataPtr);
  const nameBytes = new TextEncoder().encode(fileName + '\0');
  const namePtr = m._malloc(nameBytes.length);
  m.HEAPU8.set(nameBytes, namePtr);
  const count = api.fur_ins_load_file(dataPtr, data.length, namePtr);
  m._free(dataPtr);
  m._free(namePtr);
  if (count < 0) throw new Error(`Furnace instrument load failed: ${api.fur_get_error()}`);

  const result: FurnaceInstrumentFile[] = [];
  for (let i = 0; i < count; i++) result.push(readInstrumentSlot(m, api, i));
  return result;
}

function readInstrumentSlot(m: WasmModule, api: FurnaceFileOpsAPI, i: number): FurnaceInstrumentFile {
  const out = (write: (i: number, ptr: number, len: number) => number): Uint8Array | null => {
    const size = write(i, 0, 0);
    if (size < 0) return null;
    const ptr = m._malloc(size);
    const n = write(i, ptr, size);
    const bytes = n < 0 ? null : new Uint8Array(m.HEAPU8.buffer, ptr, n).slice();
    m._free(ptr);
    return bytes;
  };
  const fui = out(api.fur_ins_to_fui);
  if (!fui) throw new Error(`Furnace instrument ${i} could not be written as .fui`);
  return { name: api.fur_ins_get_name(i), type: api.fur_ins_get_type(i), fui, dmp: out(api.fur_ins_to_dmp) };
}

/**
 * The editor's instrument as an INS2 block (encodeInstrumentAsINS2) read by Furnace's own readInsData, then written
 * back by Furnace as .fui and .dmp: the files carry the CURRENT edited state, written by Furnace's C++.
 */
/** `waves` is the instrument's own wavetable list (its wave macro indexes it); Furnace embeds the used ones in the .fui. */
export async function instrumentFromIns2Wasm(ins2: Uint8Array, waves: readonly FurnaceWavetableFile[] = []): Promise<FurnaceInstrumentFile> {
  const m = await getModule();
  if (!cachedAPI) cachedAPI = getAPI(m);
  const api = cachedAPI;
  const ptr = m._malloc(ins2.length);
  m.HEAPU8.set(ins2, ptr);
  const n = api.fur_ins_from_ins2(ptr, ins2.length);
  m._free(ptr);
  if (n < 0) throw new Error(`Furnace instrument read failed: ${api.fur_get_error()}`);
  for (const w of waves) {
    const vPtr = m._malloc(w.data.length * 4);
    new Int32Array(m.HEAPU8.buffer, vPtr, w.data.length).set(w.data);
    const r = api.fur_ins_add_wave(vPtr, w.data.length, w.max);
    m._free(vPtr);
    if (r < 0) throw new Error('Wavetable length must be 1 to 256 for Furnace files');
  }
  return readInstrumentSlot(m, api, 0);
}

export interface FurnaceWavetableFile { data: number[]; max: number }

/** A .fuw / .dmw / raw binary wavetable read by Furnace's own DivEngine::waveFromFile. */
export async function wavetableFromFileWasm(buffer: ArrayBuffer, fileName: string): Promise<FurnaceWavetableFile> {
  const m = await getModule();
  if (!cachedAPI) cachedAPI = getAPI(m);
  const api = cachedAPI;
  const data = new Uint8Array(buffer);
  const dataPtr = m._malloc(data.length);
  m.HEAPU8.set(data, dataPtr);
  const nameBytes = new TextEncoder().encode(fileName + '\0');
  const namePtr = m._malloc(nameBytes.length);
  m.HEAPU8.set(nameBytes, namePtr);
  const len = api.fur_wave_load(dataPtr, data.length, namePtr);
  m._free(dataPtr);
  m._free(namePtr);
  if (len < 0) throw new Error(`Furnace wavetable load failed: ${api.fur_get_error()}`);
  const values: number[] = [];
  for (let i = 0; i < len; i++) values.push(api.fur_wave_get_value(i));
  return { data: values, max: api.fur_wave_get_max() };
}

/** The wavetable as .fuw or .dmw bytes written by Furnace's DivWavetable::save / saveDMW. */
export async function wavetableToFileWasm(wave: FurnaceWavetableFile, format: 'fuw' | 'dmw'): Promise<Uint8Array> {
  const m = await getModule();
  if (!cachedAPI) cachedAPI = getAPI(m);
  const api = cachedAPI;
  const vPtr = m._malloc(wave.data.length * 4);
  new Int32Array(m.HEAPU8.buffer, vPtr, wave.data.length).set(wave.data);
  const n = api.fur_wave_set(vPtr, wave.data.length, wave.max);
  m._free(vPtr);
  if (n < 0) throw new Error('Wavetable length must be 1 to 256 for Furnace files');
  const fmt = format === 'fuw' ? 0 : 1;
  const size = api.fur_wave_to_file(fmt, 0, 0);
  if (size < 0) throw new Error('Furnace could not write the wavetable');
  const ptr = m._malloc(size);
  api.fur_wave_to_file(fmt, ptr, size);
  const bytes = m.HEAPU8.slice(ptr, ptr + size);
  m._free(ptr);
  return bytes;
}
