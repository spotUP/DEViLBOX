/**
 * DJRenderWorker — Offline audio renderer for DJ pre-rendering
 *
 * Hosts independent UADE + libopenmpt WASM instances, completely separate
 * from the playback audio thread. Renders tracker modules to stereo PCM
 * which is posted back as Float32Array transferables.
 *
 * Format routing:
 *   - MOD + exotic Amiga formats → UADE engine
 *   - XM, IT, S3M + other PC formats → libopenmpt engine
 *
 * Protocol:
 *   Main → Worker:  { type: 'render', id, fileBuffer, filename, subsong? }
 *   Worker → Main:   { type: 'renderComplete', id, left, right, sampleRate, duration }
 *                  or { type: 'renderError', id, error }
 *   Worker → Main:   { type: 'renderProgress', id, progress }  (0-100)
 *   Main → Worker:  { type: 'init' }
 *   Worker → Main:   { type: 'ready' }
 */

// ── Types ────────────────────────────────────────────────────────────────────

interface RenderRequest {
  type: 'render';
  id: string;
  fileBuffer: ArrayBuffer;
  filename: string;
  subsong?: number;
}

interface InitRequest {
  type: 'init';
}

type WorkerMessage = RenderRequest | InitRequest;

// ── UADE extensions for format routing ───────────────────────────────────────
const AMIGA_EXTENSIONS = new Set([
  // ProTracker MOD
  'mod',
  // Common UADE-handled exotic formats (non-exhaustive, covers the most common)
  'aam', 'abk', 'adpcm', 'adsc', 'ahx', 'amc', 'aon', 'aon4', 'aon8', 'aps',
  'ash', 'ast', 'bd', 'bds', 'bp', 'bp3', 'bss', 'bye',
  'cin', 'cm', 'core', 'cus', 'cust', 'custom',
  'dh', 'digi', 'dl', 'dl_deli', 'dln', 'dlm1', 'dlm2', 'dm', 'dm1', 'dm2',
  'dmu', 'dmu2', 'dsr', 'dw', 'dwold', 'dz',
  'ea', 'ems', 'emsv6',
  'fc', 'fc13', 'fc14', 'fp', 'fred', 'fw',
  'gmc', 'gv',
  'hd', 'hipc', 'hot', 'hvl',
  'iff', 'in', 'is', 'is20',
  'jam', 'jcb', 'jd', 'jmf', 'jo', 'jpo', 'jpold',
  'kh', 'kim', 'kris',
  'lme', 'ma', 'mc', 'mcr', 'mdat', 'med', 'mii', 'mk2', 'mkiio',
  'ml', 'mm4', 'mm8', 'mmdc', 'mms', 'mp', 'mp_id', 'mso', 'mtp2', 'mug', 'mug2',
  'np', 'np1', 'np2', 'np3',
  'okt', 'okta',
  'pap', 'pha', 'pn', 'ps', 'psf', 'pt', 'pt36', 'ptm', 'puma',
  'rh', 'riff', 'rjp',
  'sa', 'sb', 'sc', 'scn', 'scr', 'sct', 'sfx', 'sfx13',
  'sid', 'sid1', 'sid2', 'smn', 'smp', 'smus', 'sndmon', 'snk', 'soc',
  'spm', 'ss', 'sun',
  'syn', 'synmod',
  'tcb', 'tf', 'tfx', 'thm', 'thn', 'tits', 'tme', 'tro', 'tronic',
  'tw',
  'uds',
  'vss',
  'wb',
  'ym',
  'zen',
  // Packed MOD/ProTracker variants
  'ac1', 'ac1d', 'aval', 'chan', 'cp', 'cplx', 'crb', 'di', 'eu',
  'fc-m', 'fcm', 'ft', 'fuz', 'fuzz',
  'ice', 'it1', 'kef', 'kef7', 'krs', 'ksm', 'lax',
  'mexxmp', 'mpro', 'nr', 'nru', 'ntpk',
  'p10', 'p21', 'p30', 'p40a', 'p40b', 'p41a', 'p4x', 'p50a', 'p5a', 'p5x',
  'p60', 'p60a', 'p61', 'p61a', 'p6x', 'pin',
  'pm', 'pm0', 'pm01', 'pm1', 'pm10c', 'pm18a', 'pm2', 'pm20', 'pm4', 'pm40', 'pmz',
  'polk', 'pp10', 'pp20', 'pp21', 'pp30', 'ppk',
  'pr1', 'pr2', 'prom', 'pru', 'pru1', 'pru2', 'prun', 'prun1', 'prun2', 'pwr',
  'pyg', 'pygm', 'pygmy', 'skt', 'skyt', 'snt',
  'st2', 'st26', 'st30', 'star', 'stpk',
  'tp', 'tp1', 'tp2', 'tp3', 'un2', 'unic', 'unic2', 'wn', 'xan', 'xann',
]);

/** Check if a filename should use UADE (Amiga formats) vs libopenmpt (PC formats) */
function isAmigaFormat(filename: string): boolean {
  const ext = filename.split('.').pop()?.toLowerCase() ?? '';
  return AMIGA_EXTENSIONS.has(ext);
}

// ── UADE Engine State ────────────────────────────────────────────────────────

let uadeWasm: WebAssembly.Module | null = null;
let uadeReady = false;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let uadeInstance: any = null;

async function initUADE(): Promise<void> {
  if (uadeReady) return;

  const baseUrl = self.location.origin;
  const [wasmResponse, jsResponse] = await Promise.all([
    fetch(`${baseUrl}/uade/UADE.wasm`),
    fetch(`${baseUrl}/uade/UADE.js`),
  ]);

  const wasmBinary = await wasmResponse.arrayBuffer();
  let jsCode = await jsResponse.text();

  // Transform Emscripten glue for worker scope (same pattern as UADEEngine.ts)
  jsCode = jsCode.replace(/import\.meta\.url/g, `"${baseUrl}/uade/UADE.js"`);
  jsCode = jsCode.replace(/export\s+default\s+/g, 'var createUADE = ');
  jsCode = jsCode.replace(/export\s*\{[^}]*\}/g, '');

  // Fix environment detection and mock document for worker scope
  jsCode = jsCode.replace(/ENVIRONMENT_IS_WEB\s*=\s*!0/g, 'ENVIRONMENT_IS_WEB=false');
  jsCode = jsCode.replace(/ENVIRONMENT_IS_WORKER\s*=\s*!1/g, 'ENVIRONMENT_IS_WORKER=true');
  jsCode = 'var document = { currentScript: { src: "' + baseUrl + '/uade/UADE.js" }, title: "" };\n' + jsCode;

  // Execute the glue code to get factory function
  const factory = new Function(jsCode + '\n;return typeof createUADE !== "undefined" ? createUADE : Module;')();

  // Instantiate UADE WASM
  uadeInstance = await factory({
    wasmBinary,
    noInitialRun: true,
    print: (msg: string) => console.log('[DJRenderWorker/UADE]', msg),
    printErr: (msg: string) => console.warn('[DJRenderWorker/UADE]', msg),
  });

  // Initialize UADE engine (CRITICAL: Loading fails if this isn't called)
  const initRet = uadeInstance._uade_wasm_init(44100);
  if (initRet !== 0) {
    throw new Error(`uade_wasm_init failed with code ${initRet}`);
  }

  // Store for reuse
  uadeWasm = await WebAssembly.compile(wasmBinary);
  void uadeWasm; // keep reference alive
  uadeReady = true;
  console.log('[DJRenderWorker] UADE engine initialized');
}

async function renderWithUADE(
  fileBuffer: ArrayBuffer,
  filename: string,
  subsong: number,
  id: string,
): Promise<{ left: Float32Array; right: Float32Array; sampleRate: number }> {
  await initUADE();
  const wasm = uadeInstance;

  // Load the file into UADE WASM memory
  const fileSize = fileBuffer.byteLength;
  const filePtr = wasm._malloc(fileSize);
  const fileBytes = new Uint8Array(fileBuffer);
  wasm.HEAPU8.set(fileBytes, filePtr);

  // Create a filename in WASM memory
  const fnameLen = filename.length * 3 + 1;
  const fnamePtr = wasm._malloc(fnameLen);
  wasm.stringToUTF8(filename, fnamePtr, fnameLen);

  // Stop any previous playback/loading state to clear IPC buffers
  if (wasm._uade_wasm_stop) wasm._uade_wasm_stop();

  // Load the module with retry logic for IPC sync issues
  let loadResult = wasm._uade_wasm_load(filePtr, fileSize, fnamePtr);
  
  if (loadResult !== 0) {
    console.warn(`[DJRenderWorker/UADE] First load failed (${loadResult}), attempting IPC buffer clear...`);
    // If it failed with IPC issues (likely 'cmd buffer full'), try to pump the 
    // render loop a few times to clear the command queue, then retry.
    const dummyL = wasm._malloc(1024 * 4);
    const dummyR = wasm._malloc(1024 * 4);
    for (let i = 0; i < 5; i++) wasm._uade_wasm_render(dummyL, dummyR, 1024);
    wasm._free(dummyL);
    wasm._free(dummyR);
    
    if (wasm._uade_wasm_stop) wasm._uade_wasm_stop();
    loadResult = wasm._uade_wasm_load(filePtr, fileSize, fnamePtr);
  }

  wasm._free(filePtr);
  wasm._free(fnamePtr);

  if (loadResult !== 0) {
    throw new Error(`UADE failed to load ${filename} (error: ${loadResult})`);
  }

  // Set subsong if specified
  if (subsong > 0) {
    wasm._uade_wasm_set_subsong(subsong);
  }

  // Disable looping for offline render
  wasm._uade_wasm_set_looping(0);

  postProgress(id, 10);

  // Render loop
  const sampleRate = 44100;
  const CHUNK = 4096;
  const MAX_SECONDS = 600; // 10 minute safety limit
  const maxFrames = sampleRate * MAX_SECONDS;

  const tmpL = wasm._malloc(CHUNK * 4);
  const tmpR = wasm._malloc(CHUNK * 4);

  const audioChunks: { left: Float32Array; right: Float32Array }[] = [];
  let totalFrames = 0;

  while (totalFrames < maxFrames) {
    const ret = wasm._uade_wasm_render(tmpL, tmpR, CHUNK);
    if (ret <= 0) break;

    const leftData = new Float32Array(ret);
    const rightData = new Float32Array(ret);
    leftData.set(new Float32Array(wasm.HEAPF32.buffer, tmpL, ret));
    rightData.set(new Float32Array(wasm.HEAPF32.buffer, tmpR, ret));

    audioChunks.push({ left: leftData, right: rightData });
    totalFrames += ret;

    // Progress: 10-80% during render
    if (totalFrames % (sampleRate * 5) < CHUNK) {
      const pct = Math.min(80, 10 + (totalFrames / maxFrames) * 70);
      postProgress(id, pct);
    }
  }

  wasm._free(tmpL);
  wasm._free(tmpR);

  if (totalFrames === 0) {
    throw new Error(`UADE rendered 0 frames for ${filename}`);
  }

  // Concatenate chunks
  const left = new Float32Array(totalFrames);
  const right = new Float32Array(totalFrames);
  let offset = 0;
  for (const chunk of audioChunks) {
    left.set(chunk.left, offset);
    right.set(chunk.right, offset);
    offset += chunk.left.length;
  }

  postProgress(id, 85);
  return { left, right, sampleRate };
}

// ── libopenmpt Engine State ──────────────────────────────────────────────────

// eslint-disable-next-line @typescript-eslint/no-explicit-any
let openmptLib: any = null;
let openmptReady = false;

async function initLibopenmpt(): Promise<void> {
  if (openmptReady) return;

  const baseUrl = self.location.origin;

  // Fetch the libopenmpt emscripten glue (which embeds the WASM as data URL)
  const jsResponse = await fetch(`${baseUrl}/chiptune3/libopenmpt.worklet.js`);
  let jsCode = await jsResponse.text();

  // Transform for worker scope — strip ESM syntax
  jsCode = jsCode.replace(/export\s+default\s+/g, 'var createLibopenmpt = ');
  jsCode = jsCode.replace(/export\s*\{[^}]*\}/g, '');
  jsCode = jsCode.replace(/import\.meta\.url/g, `"${baseUrl}/chiptune3/libopenmpt.worklet.js"`);

  // Execute to get factory
  const factory = new Function(jsCode + '\n;return typeof createLibopenmpt !== "undefined" ? createLibopenmpt : Module;')();

  openmptLib = await factory();
  openmptReady = true;
  console.log('[DJRenderWorker] libopenmpt engine initialized');
}

/** Helper: write ASCII string to WASM stack */
function asciiToStack(lib: { stackAlloc: (n: number) => number; HEAPU8: Uint8Array }, str: string): number {
  const ptr = lib.stackAlloc(str.length + 1);
  for (let i = 0; i < str.length; i++) {
    lib.HEAPU8[ptr + i] = str.charCodeAt(i);
  }
  lib.HEAPU8[ptr + str.length] = 0;
  return ptr;
}

async function renderWithLibopenmpt(
  fileBuffer: ArrayBuffer,
  filename: string,
  id: string,
): Promise<{ left: Float32Array; right: Float32Array; sampleRate: number }> {
  await initLibopenmpt();
  const lib = openmptLib;

  postProgress(id, 10);

  // Allocate and copy file data into WASM heap
  const fileBytes = new Uint8Array(fileBuffer);
  const filePtr = lib._malloc(fileBytes.length);
  lib.HEAPU8.set(fileBytes, filePtr);

  // Create module
  const modulePtr = lib._openmpt_module_create_from_memory(filePtr, fileBytes.length, 0, 0, 0);
  lib._free(filePtr);

  if (!modulePtr) {
    throw new Error(`libopenmpt failed to load ${filename}`);
  }

  // Configure render
  const sampleRate = 44100;
  lib._openmpt_module_set_repeat_count(modulePtr, 0); // Play once, no repeat

  // Set Amiga resampler emulation for MOD-like formats
  const ext = filename.split('.').pop()?.toLowerCase() ?? '';
  if (ext === 'mod' || ext === 'nst' || ext === 'stk' || ext === 'm15') {
    const stack = lib.stackSave();
    lib._openmpt_module_ctl_set(modulePtr, asciiToStack(lib, 'render.resampler.emulate_amiga'), asciiToStack(lib, '1'));
    lib._openmpt_module_ctl_set(modulePtr, asciiToStack(lib, 'render.resampler.emulate_amiga_type'), asciiToStack(lib, 'a1200'));
    lib.stackRestore(stack);
  }

  // Set stereo separation to 100%
  lib._openmpt_module_set_render_param(modulePtr, 2 /* SEPARATION */, 100);

  postProgress(id, 15);

  // Render in chunks
  const CHUNK = 4096;
  const leftPtr = lib._malloc(CHUNK * 4);
  const rightPtr = lib._malloc(CHUNK * 4);

  const chunks: { left: Float32Array; right: Float32Array }[] = [];
  let totalFrames = 0;
  const MAX_FRAMES = sampleRate * 600; // 10 min safety

  while (totalFrames < MAX_FRAMES) {
    const rendered = lib._openmpt_module_read_float_stereo(modulePtr, sampleRate, CHUNK, leftPtr, rightPtr);
    if (rendered <= 0) break;

    const leftData = new Float32Array(rendered);
    const rightData = new Float32Array(rendered);
    leftData.set(new Float32Array(lib.HEAPF32.buffer, leftPtr, rendered));
    rightData.set(new Float32Array(lib.HEAPF32.buffer, rightPtr, rendered));

    chunks.push({ left: leftData, right: rightData });
    totalFrames += rendered;

    if (totalFrames % (sampleRate * 5) < CHUNK) {
      const pct = Math.min(80, 15 + (totalFrames / MAX_FRAMES) * 65);
      postProgress(id, pct);
    }
  }

  lib._free(leftPtr);
  lib._free(rightPtr);
  lib._openmpt_module_destroy(modulePtr);

  if (totalFrames === 0) {
    throw new Error(`libopenmpt rendered 0 frames for ${filename}`);
  }

  // Concatenate
  const left = new Float32Array(totalFrames);
  const right = new Float32Array(totalFrames);
  let offset = 0;
  for (const chunk of chunks) {
    left.set(chunk.left, offset);
    right.set(chunk.right, offset);
    offset += chunk.left.length;
  }

  postProgress(id, 85);
  return { left, right, sampleRate };
}

// ── Message Handling ─────────────────────────────────────────────────────────

function postProgress(id: string, progress: number): void {
  (self as unknown as Worker).postMessage({ type: 'renderProgress', id, progress: Math.round(progress) });
}

self.onmessage = async (e: MessageEvent<WorkerMessage>) => {
  const msg = e.data;

  switch (msg.type) {
    case 'init': {
      // Lazy init — engines are initialized on first render request
      (self as unknown as Worker).postMessage({ type: 'ready' });
      break;
    }

    case 'render': {
      const { id, fileBuffer, filename, subsong = 0 } = msg;
      try {
        let result: { left: Float32Array; right: Float32Array; sampleRate: number };

        if (isAmigaFormat(filename)) {
          result = await renderWithUADE(fileBuffer, filename, subsong, id);
        } else {
          result = await renderWithLibopenmpt(fileBuffer, filename, id);
        }

        const duration = result.left.length / result.sampleRate;

        postProgress(id, 95);

        // Transfer ownership of the Float32Arrays for zero-copy
        (self as unknown as Worker).postMessage(
          {
            type: 'renderComplete',
            id,
            left: result.left,
            right: result.right,
            sampleRate: result.sampleRate,
            duration,
          },
          [result.left.buffer, result.right.buffer],
        );
      } catch (err) {
        const errorMsg = err instanceof Error ? err.message : String(err);
        console.error(`[DJRenderWorker] Render failed for ${filename}:`, errorMsg);
        (self as unknown as Worker).postMessage({ type: 'renderError', id, error: errorMsg });
      }
      break;
    }
  }
};

// Signal ready immediately (engines init lazily on first render)
(self as unknown as Worker).postMessage({ type: 'ready' });
