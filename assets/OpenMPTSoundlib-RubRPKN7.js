let wasmInstance = null;
let loadPromise = null;
async function getModule() {
  if (wasmInstance) return wasmInstance;
  if (loadPromise) return loadPromise;
  loadPromise = (async () => {
    const scriptUrl = "/openmpt/OpenMPTSoundlib.js";
    await new Promise((resolve, reject) => {
      const script = document.createElement("script");
      script.src = scriptUrl;
      script.onload = () => resolve();
      script.onerror = () => reject(new Error("Failed to load OpenMPTSoundlib.js"));
      document.head.appendChild(script);
    });
    const factory = globalThis.createOpenMPTSoundlib;
    if (!factory) throw new Error("createOpenMPTSoundlib not found after script load");
    wasmInstance = await factory({
      locateFile: (path) => `/openmpt/${path}`
    });
    return wasmInstance;
  })();
  return loadPromise;
}
async function loadModule(buffer) {
  const m = await getModule();
  const ptr = m._malloc(buffer.byteLength);
  m.HEAPU8.set(new Uint8Array(buffer), ptr);
  const result = m._osl_load(ptr, buffer.byteLength);
  m._free(ptr);
  return result === 1;
}
async function createNewModule(format, numChannels, numPatterns) {
  const m = await getModule();
  return m._osl_create_new(format, numChannels, numPatterns) === 1;
}
async function destroyModule() {
  const m = await getModule();
  m._osl_destroy();
}
async function getModuleInfo() {
  const m = await getModule();
  const ptr = m._osl_get_info_json();
  const json = m.UTF8ToString(ptr);
  return JSON.parse(json);
}
async function getInstrumentNames() {
  const m = await getModule();
  const ptr = m._osl_get_instrument_names_json();
  return JSON.parse(m.UTF8ToString(ptr));
}
async function getSampleNames() {
  const m = await getModule();
  const ptr = m._osl_get_sample_names_json();
  return JSON.parse(m.UTF8ToString(ptr));
}
async function getNumPatterns() {
  const m = await getModule();
  return m._osl_get_num_patterns();
}
async function getNumChannels() {
  const m = await getModule();
  return m._osl_get_num_channels();
}
async function getNumOrders() {
  const m = await getModule();
  return m._osl_get_num_orders();
}
async function getOrderPattern(order) {
  const m = await getModule();
  return m._osl_get_order_pattern(order);
}
async function setOrderPattern(order, pattern) {
  const m = await getModule();
  m._osl_set_order(order, pattern);
}
async function getPatternNumRows(pattern) {
  const m = await getModule();
  return m._osl_get_pattern_num_rows(pattern);
}
const DSP_EFFECT_MARKER = 80;
async function getMidiMacroString(idx) {
  const m = await getModule();
  const ptr = m._osl_get_midi_macro_string(idx);
  return m.UTF8ToString(ptr);
}
async function setMidiMacroString(idx, str) {
  const m = await getModule();
  const len = m.lengthBytesUTF8(str) + 1;
  const ptr = m._malloc(len);
  m.stringToUTF8(str, ptr, len);
  m._osl_set_midi_macro_string(idx, ptr);
  m._free(ptr);
}
function parseSymphonieDSPMacro(macro) {
  const m = macro.trim().replace(/\s+/g, " ");
  const match = m.match(
    /^F0F080([0-9A-F]{2})\s+F0F081([0-9A-F]{2})\s+F0F082([0-9A-F]{2})$/i
  );
  if (!match) return null;
  return {
    type: parseInt(match[1], 16),
    bufLen: parseInt(match[2], 16),
    feedback: parseInt(match[3], 16)
  };
}
function buildSymphonieDSPMacro(type, bufLen, feedback) {
  const h = (n) => n.toString(16).padStart(2, "0").toUpperCase();
  return `F0F080${h(type & 255)} F0F081${h(bufLen & 255)} F0F082${h(feedback & 255)}`;
}
async function getPatternData(pattern) {
  const m = await getModule();
  const numRows = m._osl_get_pattern_num_rows(pattern);
  const numChannels = m._osl_get_num_channels();
  const ptr = m._osl_get_pattern_data(pattern);
  if (!ptr || numRows === 0) return [];
  const buf = new Uint8Array(m.HEAPU8.buffer, ptr, numRows * numChannels * 6);
  const rows = [];
  let offset = 0;
  for (let r = 0; r < numRows; r++) {
    const row = [];
    for (let c = 0; c < numChannels; c++) {
      row.push({
        note: buf[offset],
        instrument: buf[offset + 1],
        volcmd: buf[offset + 2],
        vol: buf[offset + 3],
        command: buf[offset + 4],
        param: buf[offset + 5]
      });
      offset += 6;
    }
    rows.push(row);
  }
  return rows;
}
async function setPatternCell(pattern, row, channel, cell) {
  const m = await getModule();
  m._osl_set_pattern_cell(
    pattern,
    row,
    channel,
    cell.note,
    cell.instrument,
    cell.volcmd,
    cell.vol,
    cell.command,
    cell.param
  );
}
async function resizePattern(pattern, newRows) {
  const m = await getModule();
  return m._osl_resize_pattern(pattern, newRows) === 1;
}
async function addPattern(numRows) {
  const m = await getModule();
  return m._osl_add_pattern(numRows);
}
async function setInitialSpeed(speed) {
  const m = await getModule();
  m._osl_set_initial_speed(speed);
}
async function setInitialTempo(tempo) {
  const m = await getModule();
  m._osl_set_initial_tempo(tempo);
}
async function getSampleInfo(sampleIndex) {
  const m = await getModule();
  const ptr = m._osl_get_sample_info_json(sampleIndex);
  return JSON.parse(m.UTF8ToString(ptr));
}
async function getSampleData(sampleIndex) {
  const m = await getModule();
  const infoPtr = m._osl_get_sample_info_json(sampleIndex);
  const info = JSON.parse(m.UTF8ToString(infoPtr));
  const size = m._osl_get_sample_data_size(sampleIndex);
  const dataPtr = m._osl_get_sample_data(sampleIndex);
  if (!dataPtr || size === 0) {
    return { data: new Int8Array(0), info };
  }
  if (info.is16Bit) {
    const srcView = new Int16Array(m.HEAPU8.buffer, dataPtr, size / 2);
    return { data: Int16Array.from(srcView), info };
  } else {
    const srcView = new Int8Array(m.HEAPU8.buffer, dataPtr, size);
    return { data: Int8Array.from(srcView), info };
  }
}
async function setSampleData(sampleIndex, data, c5Speed, stereo = false) {
  const m = await getModule();
  const is16Bit = data instanceof Int16Array;
  const byteSize = data.byteLength;
  const numFrames = is16Bit ? data.length / (stereo ? 2 : 1) : data.length / (stereo ? 2 : 1);
  const ptr = m._malloc(byteSize);
  new Uint8Array(m.HEAPU8.buffer, ptr, byteSize).set(new Uint8Array(data.buffer, data.byteOffset, byteSize));
  const result = m._osl_set_sample_data(
    sampleIndex,
    ptr,
    numFrames,
    is16Bit ? 16 : 8,
    stereo ? 2 : 1,
    c5Speed
  );
  m._free(ptr);
  return result === 1;
}
async function saveModule(format) {
  const m = await getModule();
  let ok;
  switch (format) {
    case "mod":
      ok = m._osl_save_mod();
      break;
    case "xm":
      ok = m._osl_save_xm();
      break;
    case "it":
      ok = m._osl_save_it();
      break;
    case "s3m":
      ok = m._osl_save_s3m();
      break;
    default:
      return null;
  }
  if (!ok) return null;
  const bufPtr = m._osl_get_save_buffer();
  const bufSize = m._osl_get_save_buffer_size();
  if (!bufPtr || bufSize === 0) return null;
  const result = new ArrayBuffer(bufSize);
  new Uint8Array(result).set(new Uint8Array(m.HEAPU8.buffer, bufPtr, bufSize));
  m._osl_free_save_buffer();
  return result;
}
async function getOrderList() {
  const m = await getModule();
  const numOrders = m._osl_get_num_orders();
  const orders = [];
  for (let i = 0; i < numOrders; i++) {
    orders.push(m._osl_get_order_pattern(i));
  }
  return orders;
}
export {
  DSP_EFFECT_MARKER,
  addPattern,
  buildSymphonieDSPMacro,
  createNewModule,
  destroyModule,
  getInstrumentNames,
  getMidiMacroString,
  getModuleInfo,
  getNumChannels,
  getNumOrders,
  getNumPatterns,
  getOrderList,
  getOrderPattern,
  getPatternData,
  getPatternNumRows,
  getSampleData,
  getSampleInfo,
  getSampleNames,
  loadModule,
  parseSymphonieDSPMacro,
  resizePattern,
  saveModule,
  setInitialSpeed,
  setInitialTempo,
  setMidiMacroString,
  setOrderPattern,
  setPatternCell,
  setSampleData
};
