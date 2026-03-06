/**
 * OpenMPTSoundlib — TypeScript wrapper for the OpenMPT CSoundFile WASM module
 *
 * Provides full read/write access to tracker modules via the reference
 * OpenMPT implementation compiled to WebAssembly. Supports:
 * - Loading 56+ formats (MOD, XM, IT, S3M, MPTM, MO3, 669, AMF, AMS, DBM, DIGI, DMF, DSM, FAR, GDM, etc.)
 * - Reading/writing pattern cells (note, instrument, volume, effects)
 * - Reading/writing sample PCM data
 * - Reading instrument/sample metadata
 * - Saving to MOD, XM, IT, S3M
 */

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type WasmModule = any;

export interface ModuleInfo {
  title: string;
  type: string;
  numChannels: number;
  numOrders: number;
  numPatterns: number;
  numInstruments: number;
  numSamples: number;
  initialSpeed: number;
  initialBPM: number;
  linearSlides: boolean;
}

export interface PatternCell {
  note: number;       // 0=none, 1-120=notes, 255=keyoff, 254=notecut, 253=fade
  instrument: number; // 0=none, 1-based
  volcmd: number;     // Volume column command
  vol: number;        // Volume column value
  command: number;    // Effect command
  param: number;      // Effect parameter
}

export interface SampleInfo {
  name: string;
  length: number;
  loopStart: number;
  loopEnd: number;
  sustainStart: number;
  sustainEnd: number;
  c5Speed: number;
  globalVol: number;
  defaultVol: number;
  pan: number;
  relativeTone: number;
  fineTune: number;
  is16Bit: boolean;
  isStereo: boolean;
  hasLoop: boolean;
  hasSustainLoop: boolean;
  pingPongLoop: boolean;
}

export type SaveFormat = 'mod' | 'xm' | 'it' | 's3m';

let wasmInstance: WasmModule | null = null;
let loadPromise: Promise<WasmModule> | null = null;

/**
 * Load the WASM module (cached after first call)
 */
async function getModule(): Promise<WasmModule> {
  if (wasmInstance) return wasmInstance;
  if (loadPromise) return loadPromise;

  loadPromise = (async () => {
    // The Emscripten JS glue uses IIFE / CommonJS — inject via <script> tag
    // so `createOpenMPTSoundlib` lands on globalThis.
    const scriptUrl = '/openmpt/OpenMPTSoundlib.js';

    await new Promise<void>((resolve, reject) => {
      const script = document.createElement('script');
      script.src = scriptUrl;
      script.onload = () => resolve();
      script.onerror = () => reject(new Error('Failed to load OpenMPTSoundlib.js'));
      document.head.appendChild(script);
    });

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const factory = (globalThis as any).createOpenMPTSoundlib;
    if (!factory) throw new Error('createOpenMPTSoundlib not found after script load');

    wasmInstance = await factory({
      locateFile: (path: string) => `/openmpt/${path}`,
    });
    return wasmInstance;
  })();

  return loadPromise;
}

// ─── Module lifecycle ──────────────────────────────────────────────────────

/**
 * Load a tracker module from an ArrayBuffer.
 * Supports 56+ formats: MOD, XM, IT, S3M, MPTM, MO3, and many more.
 */
export async function loadModule(buffer: ArrayBuffer): Promise<boolean> {
  const m = await getModule();
  const ptr = m._malloc(buffer.byteLength);
  m.HEAPU8.set(new Uint8Array(buffer), ptr);
  const result = m._osl_load(ptr, buffer.byteLength);
  m._free(ptr);
  return result === 1;
}

/**
 * Create a new empty module.
 * @param format 0=MOD, 1=XM, 2=IT, 3=S3M
 */
export async function createNewModule(
  format: 0 | 1 | 2 | 3,
  numChannels: number,
  numPatterns: number,
): Promise<boolean> {
  const m = await getModule();
  return m._osl_create_new(format, numChannels, numPatterns) === 1;
}

/** Free the currently loaded module */
export async function destroyModule(): Promise<void> {
  const m = await getModule();
  m._osl_destroy();
}

// ─── Metadata ──────────────────────────────────────────────────────────────

export async function getModuleInfo(): Promise<ModuleInfo> {
  const m = await getModule();
  const ptr = m._osl_get_info_json();
  const json = m.UTF8ToString(ptr);
  return JSON.parse(json);
}

export async function getInstrumentNames(): Promise<string[]> {
  const m = await getModule();
  const ptr = m._osl_get_instrument_names_json();
  return JSON.parse(m.UTF8ToString(ptr));
}

export async function getSampleNames(): Promise<string[]> {
  const m = await getModule();
  const ptr = m._osl_get_sample_names_json();
  return JSON.parse(m.UTF8ToString(ptr));
}

// ─── Pattern read/write ────────────────────────────────────────────────────

export async function getNumPatterns(): Promise<number> {
  const m = await getModule();
  return m._osl_get_num_patterns();
}

export async function getNumChannels(): Promise<number> {
  const m = await getModule();
  return m._osl_get_num_channels();
}

export async function getNumOrders(): Promise<number> {
  const m = await getModule();
  return m._osl_get_num_orders();
}

export async function getOrderPattern(order: number): Promise<number> {
  const m = await getModule();
  return m._osl_get_order_pattern(order);
}

export async function setOrderPattern(order: number, pattern: number): Promise<void> {
  const m = await getModule();
  m._osl_set_order(order, pattern);
}

export async function getPatternNumRows(pattern: number): Promise<number> {
  const m = await getModule();
  return m._osl_get_pattern_num_rows(pattern);
}

/**
 * Read all cells from a pattern as a flat array.
 * Returns [rows][channels] of PatternCell.
 */
export async function getPatternData(pattern: number): Promise<PatternCell[][]> {
  const m = await getModule();
  const numRows = m._osl_get_pattern_num_rows(pattern);
  const numChannels = m._osl_get_num_channels();
  const ptr = m._osl_get_pattern_data(pattern);

  if (!ptr || numRows === 0) return [];

  const buf = new Uint8Array(m.HEAPU8.buffer, ptr, numRows * numChannels * 6);
  const rows: PatternCell[][] = [];

  let offset = 0;
  for (let r = 0; r < numRows; r++) {
    const row: PatternCell[] = [];
    for (let c = 0; c < numChannels; c++) {
      row.push({
        note: buf[offset],
        instrument: buf[offset + 1],
        volcmd: buf[offset + 2],
        vol: buf[offset + 3],
        command: buf[offset + 4],
        param: buf[offset + 5],
      });
      offset += 6;
    }
    rows.push(row);
  }
  return rows;
}

/**
 * Write a single cell in a pattern.
 */
export async function setPatternCell(
  pattern: number, row: number, channel: number,
  cell: PatternCell,
): Promise<void> {
  const m = await getModule();
  m._osl_set_pattern_cell(
    pattern, row, channel,
    cell.note, cell.instrument,
    cell.volcmd, cell.vol,
    cell.command, cell.param,
  );
}

export async function resizePattern(pattern: number, newRows: number): Promise<boolean> {
  const m = await getModule();
  return m._osl_resize_pattern(pattern, newRows) === 1;
}

export async function addPattern(numRows: number): Promise<number> {
  const m = await getModule();
  return m._osl_add_pattern(numRows);
}

// ─── Speed / Tempo ─────────────────────────────────────────────────────────

export async function setInitialSpeed(speed: number): Promise<void> {
  const m = await getModule();
  m._osl_set_initial_speed(speed);
}

export async function setInitialTempo(tempo: number): Promise<void> {
  const m = await getModule();
  m._osl_set_initial_tempo(tempo);
}

// ─── Sample data ───────────────────────────────────────────────────────────

export async function getSampleInfo(sampleIndex: number): Promise<SampleInfo> {
  const m = await getModule();
  const ptr = m._osl_get_sample_info_json(sampleIndex);
  return JSON.parse(m.UTF8ToString(ptr));
}

/**
 * Get raw sample PCM data as a typed array.
 * 8-bit samples return Int8Array, 16-bit return Int16Array.
 */
export async function getSampleData(sampleIndex: number): Promise<{
  data: Int8Array | Int16Array;
  info: SampleInfo;
}> {
  const m = await getModule();
  const infoPtr = m._osl_get_sample_info_json(sampleIndex);
  const info: SampleInfo = JSON.parse(m.UTF8ToString(infoPtr));

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

/**
 * Replace sample PCM data.
 */
export async function setSampleData(
  sampleIndex: number,
  data: Int8Array | Int16Array,
  c5Speed: number,
  stereo = false,
): Promise<boolean> {
  const m = await getModule();
  const is16Bit = data instanceof Int16Array;
  const byteSize = data.byteLength;
  const numFrames = is16Bit
    ? data.length / (stereo ? 2 : 1)
    : data.length / (stereo ? 2 : 1);

  const ptr = m._malloc(byteSize);
  new Uint8Array(m.HEAPU8.buffer, ptr, byteSize).set(new Uint8Array(data.buffer, data.byteOffset, byteSize));

  const result = m._osl_set_sample_data(
    sampleIndex, ptr, numFrames,
    is16Bit ? 16 : 8,
    stereo ? 2 : 1,
    c5Speed,
  );
  m._free(ptr);
  return result === 1;
}

// ─── Save / Export ─────────────────────────────────────────────────────────

/**
 * Save the currently loaded module to a format.
 * Returns the file data as an ArrayBuffer, or null on failure.
 */
export async function saveModule(format: SaveFormat): Promise<ArrayBuffer | null> {
  const m = await getModule();

  let ok: number;
  switch (format) {
    case 'mod': ok = m._osl_save_mod(); break;
    case 'xm':  ok = m._osl_save_xm(); break;
    case 'it':  ok = m._osl_save_it(); break;
    case 's3m': ok = m._osl_save_s3m(); break;
    default: return null;
  }

  if (!ok) return null;

  const bufPtr = m._osl_get_save_buffer();
  const bufSize = m._osl_get_save_buffer_size();

  if (!bufPtr || bufSize === 0) return null;

  // Copy out of WASM heap
  const result = new ArrayBuffer(bufSize);
  new Uint8Array(result).set(new Uint8Array(m.HEAPU8.buffer, bufPtr, bufSize));

  m._osl_free_save_buffer();
  return result;
}

// ─── Order list helpers ────────────────────────────────────────────────────

export async function getOrderList(): Promise<number[]> {
  const m = await getModule();
  const numOrders = m._osl_get_num_orders();
  const orders: number[] = [];
  for (let i = 0; i < numOrders; i++) {
    orders.push(m._osl_get_order_pattern(i));
  }
  return orders;
}
