let wasmInstance = null;
let loadPromise = null;
async function getModule() {
  if (wasmInstance) return wasmInstance;
  if (loadPromise) return loadPromise;
  loadPromise = (async () => {
    const scriptUrl = "/furnace-fileops/FurnaceFileOps.js";
    await new Promise((resolve, reject) => {
      const script = document.createElement("script");
      script.src = scriptUrl;
      script.onload = () => resolve();
      script.onerror = () => reject(new Error("Failed to load FurnaceFileOps.js"));
      document.head.appendChild(script);
    });
    const factory = globalThis.createFurnaceFileOps;
    if (!factory) throw new Error("createFurnaceFileOps not found on globalThis");
    const m = await factory();
    wasmInstance = m;
    return m;
  })();
  return loadPromise;
}
function getAPI(m) {
  return {
    fur_load: m.cwrap("fur_load", "number", ["number", "number"]),
    fur_save: m.cwrap("fur_save", "number", ["number"]),
    fur_free_buffer: m.cwrap("fur_free_buffer", null, ["number"]),
    fur_get_error: m.cwrap("fur_get_error", "string", []),
    fur_get_num_subsongs: m.cwrap("fur_get_num_subsongs", "number", []),
    fur_get_num_channels: m.cwrap("fur_get_num_channels", "number", []),
    fur_get_num_instruments: m.cwrap("fur_get_num_instruments", "number", []),
    fur_get_num_samples: m.cwrap("fur_get_num_samples", "number", []),
    fur_get_num_wavetables: m.cwrap("fur_get_num_wavetables", "number", []),
    fur_get_system_len: m.cwrap("fur_get_system_len", "number", []),
    fur_get_system_id: m.cwrap("fur_get_system_id", "number", ["number"]),
    fur_get_system_channels: m.cwrap("fur_get_system_channels", "number", ["number"]),
    fur_get_system_flags: m.cwrap("fur_get_system_flags", "string", ["number"]),
    fur_get_pat_len: m.cwrap("fur_get_pat_len", "number", ["number"]),
    fur_get_orders_len: m.cwrap("fur_get_orders_len", "number", ["number"]),
    fur_get_effect_cols: m.cwrap("fur_get_effect_cols", "number", ["number", "number"]),
    fur_get_speed: m.cwrap("fur_get_speed", "number", ["number", "number"]),
    fur_get_tempo: m.cwrap("fur_get_tempo", "number", ["number"]),
    fur_get_hz: m.cwrap("fur_get_hz", "number", ["number"]),
    fur_get_virtual_tempo: m.cwrap("fur_get_virtual_tempo", "number", ["number", "number"]),
    fur_get_groove: m.cwrap("fur_get_groove", "number", ["number", "number", "number"]),
    fur_get_song_name: m.cwrap("fur_get_song_name", "string", []),
    fur_get_song_author: m.cwrap("fur_get_song_author", "string", []),
    fur_get_subsong_name: m.cwrap("fur_get_subsong_name", "string", ["number"]),
    fur_get_channel_name: m.cwrap("fur_get_channel_name", "string", ["number", "number"]),
    fur_get_order: m.cwrap("fur_get_order", "number", ["number", "number", "number"]),
    fur_get_cell: m.cwrap("fur_get_cell", "number", ["number", "number", "number", "number", "number"]),
    fur_set_cell: m.cwrap("fur_set_cell", null, ["number", "number", "number", "number", "number", "number"]),
    fur_get_ins_data: m.cwrap("fur_get_ins_data", "number", ["number", "number", "number"]),
    fur_get_sample_info: m.cwrap("fur_get_sample_info", "number", ["number", "number"]),
    fur_get_sample_data: m.cwrap("fur_get_sample_data", "number", ["number", "number"]),
    fur_get_wave_info: m.cwrap("fur_get_wave_info", "number", ["number", "number"]),
    fur_get_wave_data: m.cwrap("fur_get_wave_data", "number", ["number", "number"]),
    fur_get_tuning: m.cwrap("fur_get_tuning", "number", []),
    fur_get_packed_compat_flags: m.cwrap("fur_get_packed_compat_flags", "number", ["number"]),
    fur_get_speed_len: m.cwrap("fur_get_speed_len", "number", ["number"]),
    fur_get_dispatch_compat_flags: m.cwrap("fur_get_dispatch_compat_flags", "number", []),
    fur_get_dispatch_compat_flags_size: m.cwrap("fur_get_dispatch_compat_flags_size", "number", [])
  };
}
let cachedAPI = null;
async function loadFurFileWasm(buffer) {
  const m = await getModule();
  if (!cachedAPI) cachedAPI = getAPI(m);
  const api = cachedAPI;
  const data = new Uint8Array(buffer);
  const ptr = m._malloc(data.length);
  if (!ptr) throw new Error("WASM malloc failed");
  m.HEAPU8.set(data, ptr);
  const result = api.fur_load(ptr, data.length);
  m._free(ptr);
  if (result !== 0) {
    throw new Error(`Furnace WASM load failed: ${api.fur_get_error()}`);
  }
  const name = api.fur_get_song_name();
  const author = api.fur_get_song_author();
  const numChannels = api.fur_get_num_channels();
  const numSubsongs = api.fur_get_num_subsongs();
  const systemLen = api.fur_get_system_len();
  const chipIds = [];
  const chipFlags = [];
  for (let i = 0; i < systemLen; i++) {
    chipIds.push(api.fur_get_system_id(i));
    chipFlags.push(api.fur_get_system_flags(i));
  }
  const grooves = [];
  for (let g = 0; ; g++) {
    const first = api.fur_get_groove(0, g, 0);
    if (first < 0) break;
    const val = [first];
    for (let p = 1; ; p++) {
      const v = api.fur_get_groove(0, g, p);
      if (v < 0) break;
      val.push(v);
    }
    grooves.push({ len: val.length, val });
  }
  const subsongs = [];
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
    let speedPattern;
    if (speedLen > 0) {
      speedPattern = [];
      for (let i = 0; i < speedLen; i++) {
        speedPattern.push(api.fur_get_speed(s, i));
      }
    }
    const orders = [];
    for (let ch = 0; ch < numChannels; ch++) {
      const chOrders = [];
      for (let pos = 0; pos < ordersLen; pos++) {
        chOrders.push(api.fur_get_order(s, ch, pos));
      }
      orders.push(chOrders);
    }
    const channels = [];
    for (let ch = 0; ch < numChannels; ch++) {
      const effectCols = api.fur_get_effect_cols(s, ch);
      const chName = api.fur_get_channel_name(s, ch);
      const usedPatterns = /* @__PURE__ */ new Set();
      for (let pos = 0; pos < ordersLen; pos++) {
        usedPatterns.add(orders[ch][pos]);
      }
      const patterns = /* @__PURE__ */ new Map();
      for (const patIdx of usedPatterns) {
        const rows = [];
        for (let row = 0; row < patLen; row++) {
          const rawNote = api.fur_get_cell(s, ch, patIdx, row, 0);
          const note = rawNote >= 252 ? rawNote : rawNote === -1 ? -1 : rawNote - 60;
          const ins = api.fur_get_cell(s, ch, patIdx, row, 1);
          const vol = api.fur_get_cell(s, ch, patIdx, row, 2);
          const effects = [];
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
    const subsongData = {
      name: subsongName,
      patLen,
      ordersLen,
      orders,
      channels,
      speed1,
      speed2,
      hz,
      virtualTempoN,
      virtualTempoD
    };
    if (speedPattern) {
      subsongData.speedPattern = speedPattern;
    }
    subsongs.push(subsongData);
  }
  const numInstruments = api.fur_get_num_instruments();
  const instrumentBinaries = [];
  for (let i = 0; i < numInstruments; i++) {
    const reqSize = api.fur_get_ins_data(i, 0, 0);
    if (reqSize <= 0) {
      instrumentBinaries.push(new Uint8Array(0));
      continue;
    }
    const insBuf = m._malloc(reqSize);
    const written = api.fur_get_ins_data(i, insBuf, reqSize);
    if (written > 0) {
      const binary = new Uint8Array(m.HEAPU8.buffer, insBuf, written).slice();
      instrumentBinaries.push(binary);
    } else {
      instrumentBinaries.push(new Uint8Array(0));
    }
    m._free(insBuf);
  }
  const numWavetables = api.fur_get_num_wavetables();
  const wavetables = [];
  for (let i = 0; i < numWavetables; i++) {
    const len = api.fur_get_wave_info(i, 0);
    const max = api.fur_get_wave_info(i, 2);
    const data2 = [];
    for (let p = 0; p < len; p++) {
      data2.push(api.fur_get_wave_data(i, p));
    }
    wavetables.push({ data: data2, width: len, height: max + 1 });
  }
  const numSamples = api.fur_get_num_samples();
  const samples = [];
  for (let i = 0; i < numSamples; i++) {
    const centerRate = api.fur_get_sample_info(i, 0);
    const loopStart = api.fur_get_sample_info(i, 1);
    const loopEnd = api.fur_get_sample_info(i, 2);
    const depth = api.fur_get_sample_info(i, 3);
    const hasLoop = api.fur_get_sample_info(i, 4);
    const numSampleFrames = api.fur_get_sample_info(i, 5);
    const outLenPtr = m._malloc(4);
    const sampleDataPtr = api.fur_get_sample_data(i, outLenPtr);
    const actualLen = m.getValue(outLenPtr, "i32");
    m._free(outLenPtr);
    let sampleData;
    if (depth === 16) {
      const src = new Int16Array(m.HEAPU8.buffer, sampleDataPtr, numSampleFrames);
      sampleData = new Int16Array(src);
    } else if (depth === 8) {
      const src = new Int8Array(m.HEAPU8.buffer, sampleDataPtr, actualLen);
      sampleData = new Int8Array(src);
    } else {
      const src = new Uint8Array(m.HEAPU8.buffer, sampleDataPtr, actualLen);
      sampleData = new Uint8Array(src);
    }
    samples.push({
      data: sampleData,
      rate: centerRate,
      depth,
      // Preserve actual depth (1=DPCM, 3=YMZ, 5=ADPCM-A, etc.)
      samples: numSampleFrames,
      // Frame count (used for compressed formats in uploadModuleSamplesToPlatform)
      loopStart,
      loopEnd,
      loopMode: hasLoop ? 1 : 0,
      name: `Sample ${i}`
    });
  }
  const tuning = api.fur_get_tuning();
  const packedFlags = api.fur_get_packed_compat_flags(0);
  const packedFlagsExt = api.fur_get_packed_compat_flags(1);
  const pitchSlideSpeed = api.fur_get_packed_compat_flags(2);
  const dispatchFlagsPtr = api.fur_get_dispatch_compat_flags();
  const dispatchFlagsSize = api.fur_get_dispatch_compat_flags_size();
  const dispatchFlagsBytes = new Uint8Array(m.HEAPU8.buffer, dispatchFlagsPtr, dispatchFlagsSize).slice();
  const compatFlags = {
    _packed: true,
    // Signal to serializer that these are pre-packed
    _flags: packedFlags,
    _flagsExt: packedFlagsExt,
    _pitchSlideSpeed: pitchSlideSpeed,
    _dispatchFlags: dispatchFlagsBytes,
    // Raw DivCompatFlags struct bytes for dispatch
    // Also store linearPitch for the dispatch engine compat flag setter
    linearPitch: packedFlagsExt & 3
  };
  const nativeData = {
    subsongs,
    activeSubsong: 0,
    chipIds,
    chipFlags,
    compatFlags,
    tuning: tuning !== 440 ? tuning : void 0,
    grooves: grooves.length > 0 ? grooves : void 0
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
    samples
  };
}
async function saveFurFileWasm() {
  const m = await getModule();
  if (!cachedAPI) cachedAPI = getAPI(m);
  const api = cachedAPI;
  const outLenPtr = m._malloc(4);
  const bufPtr = api.fur_save(outLenPtr);
  const len = m.getValue(outLenPtr, "i32");
  m._free(outLenPtr);
  if (!bufPtr) {
    throw new Error(`Furnace WASM save failed: ${api.fur_get_error()}`);
  }
  const result = new Uint8Array(m.HEAPU8.buffer, bufPtr, len).slice();
  api.fur_free_buffer(bufPtr);
  return result.buffer;
}
export {
  loadFurFileWasm,
  saveFurFileWasm
};
