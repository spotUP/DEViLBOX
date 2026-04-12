(function() {
  "use strict";
  const AMIGA_EXTENSIONS = /* @__PURE__ */ new Set([
    // ProTracker MOD
    "mod",
    // Common UADE-handled exotic formats (non-exhaustive, covers the most common)
    "aam",
    "abk",
    "adpcm",
    "adsc",
    "ahx",
    "amc",
    "aon",
    "aon4",
    "aon8",
    "aps",
    "ash",
    "ast",
    "bd",
    "bds",
    "bp",
    "bp3",
    "bss",
    "bye",
    "cin",
    "cm",
    "core",
    "cus",
    "cust",
    "custom",
    "dh",
    "digi",
    "dl",
    "dl_deli",
    "dln",
    "dlm1",
    "dlm2",
    "dm",
    "dm1",
    "dm2",
    "dmu",
    "dmu2",
    "dsr",
    "dw",
    "dwold",
    "dz",
    "ea",
    "ems",
    "emsv6",
    "fc",
    "fc13",
    "fc14",
    "fp",
    "fred",
    "fw",
    "gmc",
    "gv",
    "hd",
    "hipc",
    "hot",
    "hvl",
    "iff",
    "in",
    "is",
    "is20",
    "jam",
    "jcb",
    "jd",
    "jmf",
    "jo",
    "jpo",
    "jpold",
    "kh",
    "kim",
    "kris",
    "lme",
    "ma",
    "mc",
    "mcr",
    "mdat",
    "med",
    "mii",
    "mk2",
    "mkiio",
    "ml",
    "mm4",
    "mm8",
    "mmdc",
    "mms",
    "mp",
    "mp_id",
    "mso",
    "mtp2",
    "mug",
    "mug2",
    "np",
    "np1",
    "np2",
    "np3",
    "okt",
    "okta",
    "pap",
    "pha",
    "pn",
    "ps",
    "psf",
    "pt",
    "pt36",
    "ptm",
    "puma",
    "rh",
    "riff",
    "rjp",
    "sa",
    "sb",
    "sc",
    "scn",
    "scr",
    "sct",
    "sfx",
    "sfx13",
    "sid",
    "sid1",
    "sid2",
    "smn",
    "smp",
    "smus",
    "sndmon",
    "snk",
    "soc",
    "spm",
    "ss",
    "sun",
    "syn",
    "synmod",
    "tcb",
    "tf",
    "tfx",
    "thm",
    "thn",
    "tits",
    "tme",
    "tro",
    "tronic",
    "tw",
    "uds",
    "vss",
    "wb",
    "ym",
    "zen",
    // Packed MOD/ProTracker variants
    "ac1",
    "ac1d",
    "aval",
    "chan",
    "cp",
    "cplx",
    "crb",
    "di",
    "eu",
    "fc-m",
    "fcm",
    "ft",
    "fuz",
    "fuzz",
    "ice",
    "it1",
    "kef",
    "kef7",
    "krs",
    "ksm",
    "lax",
    "mexxmp",
    "mpro",
    "nr",
    "nru",
    "ntpk",
    "p10",
    "p21",
    "p30",
    "p40a",
    "p40b",
    "p41a",
    "p4x",
    "p50a",
    "p5a",
    "p5x",
    "p60",
    "p60a",
    "p61",
    "p61a",
    "p6x",
    "pin",
    "pm",
    "pm0",
    "pm01",
    "pm1",
    "pm10c",
    "pm18a",
    "pm2",
    "pm20",
    "pm4",
    "pm40",
    "pmz",
    "polk",
    "pp10",
    "pp20",
    "pp21",
    "pp30",
    "ppk",
    "pr1",
    "pr2",
    "prom",
    "pru",
    "pru1",
    "pru2",
    "prun",
    "prun1",
    "prun2",
    "pwr",
    "pyg",
    "pygm",
    "pygmy",
    "skt",
    "skyt",
    "snt",
    "st2",
    "st26",
    "st30",
    "star",
    "stpk",
    "tp",
    "tp1",
    "tp2",
    "tp3",
    "un2",
    "unic",
    "unic2",
    "wn",
    "xan",
    "xann"
  ]);
  const HIVELY_EXTENSIONS = /* @__PURE__ */ new Set(["ahx", "hvl"]);
  const AMIGA_PREFIXES = /* @__PURE__ */ new Set([
    // CustomMade / Delitracker Custom
    "cus",
    "cust",
    "custom",
    // TFMX and variants
    "mdat",
    "smpl",
    "tfhd1.5",
    "tfhd7v",
    "tfhdpro",
    "tfmx1.5",
    "tfmx7v",
    "tfmxpro",
    // SoundMon / BPSoundMon
    "bp",
    "smod",
    // DaveLowe
    "dl",
    "dlw",
    // FutureComposer-BSI
    "bfc",
    "bsi",
    "fc-bsi",
    // ArtAndMagic, AMOS, Sierra-AGI
    "aam",
    "abk",
    "agi",
    // AshleyHogg, ActionAmics, BeathovenSynth
    "ah",
    "ast",
    "bss",
    "bvs",
    // ChipTracker, CoreDesign
    "chip",
    "cba",
    "cd",
    // DynamicSynth, DariusZendeh
    "dns",
    "dz",
    "mkiio",
    // EarAche, EMS
    "ea",
    "ems",
    "emsv6",
    // ForgottenWorlds, FredMon, FuturePlayer2
    "fw",
    "fredmon",
    "fp2",
    // HowieDavies, MajorTom
    "hd",
    "hn",
    "thn",
    "mtp2",
    "arp",
    // JochenHippel
    "hip",
    "mcmd",
    "sog",
    // MarkII, MusiclineEditor
    "mk2",
    "mkii",
    "ml",
    // MaxTrax, Silmarils
    "mxt",
    "mok",
    "sil",
    // NoiseTracker, NTSP, PaulSummers, Pokeynoise
    "nt",
    "ntsp",
    "psum",
    "pn",
    // RiffRaff, SeanConnolly, RobHubbardST, RonKlaren
    "riff",
    "s-c",
    "scn",
    "sc2",
    "rhst",
    "rho",
    "rkl",
    // SonicArranger variants
    "sa-p",
    "lion",
    "sa_old",
    "sas",
    // SCUMM, SynthDream, SoundProgramming, SoundImages
    "scumm",
    "sdr",
    "spl",
    "tw",
    // SUN-Tronic, SynTracker, StoneTracker
    "sun",
    "synmod",
    "st",
    // TimFollin, AHX-thx, TomyTracker, VoodooSupreme
    "tf",
    "thx",
    "tomy",
    "vss"
  ]);
  function isAmigaFormat(filename) {
    const lower = filename.toLowerCase();
    const ext = lower.split(".").pop() ?? "";
    if (HIVELY_EXTENSIONS.has(ext)) return false;
    if (AMIGA_EXTENSIONS.has(ext)) return true;
    const prefix = lower.split(".")[0];
    return AMIGA_PREFIXES.has(prefix);
  }
  function isHivelyFormat(filename) {
    var _a;
    const ext = ((_a = filename.split(".").pop()) == null ? void 0 : _a.toLowerCase()) ?? "";
    return HIVELY_EXTENSIONS.has(ext);
  }
  let uadeWasm = null;
  let uadeWasmBinary = null;
  let uadeJsCode = null;
  let uadeReady = false;
  let uadeInstance = null;
  async function initUADE(forceReinit = false) {
    if (uadeReady && !forceReinit) return;
    const baseUrl = self.location.origin;
    if (!uadeWasmBinary || !uadeJsCode) {
      const [wasmResponse, jsResponse] = await Promise.all([
        fetch(`${baseUrl}/uade/UADE.wasm`),
        fetch(`${baseUrl}/uade/UADE.js`)
      ]);
      uadeWasmBinary = await wasmResponse.arrayBuffer();
      let jsCode = await jsResponse.text();
      jsCode = jsCode.replace(/import\.meta\.url/g, `"${baseUrl}/uade/UADE.js"`);
      jsCode = jsCode.replace(/export\s+default\s+/g, "var createUADE = ");
      jsCode = jsCode.replace(/export\s*\{[^}]*\}/g, "");
      jsCode = jsCode.replace(/ENVIRONMENT_IS_WEB\s*=\s*!0/g, "ENVIRONMENT_IS_WEB=false");
      jsCode = jsCode.replace(/ENVIRONMENT_IS_WORKER\s*=\s*!1/g, "ENVIRONMENT_IS_WORKER=true");
      jsCode = 'var document = { currentScript: { src: "' + baseUrl + '/uade/UADE.js" }, title: "" };\n' + jsCode;
      uadeJsCode = jsCode;
    }
    const factory = new Function(uadeJsCode + '\n;return typeof createUADE !== "undefined" ? createUADE : Module;')();
    uadeInstance = await factory({
      wasmBinary: uadeWasmBinary.slice(0),
      // Clone to ensure fresh instantiation
      print: (msg) => console.log("[DJRenderWorker/UADE]", msg),
      printErr: (msg) => console.warn("[DJRenderWorker/UADE]", msg)
    });
    const initRet = uadeInstance._uade_wasm_init(44100);
    if (initRet !== 0) {
      throw new Error(`uade_wasm_init failed with code ${initRet}`);
    }
    if (!uadeWasm) {
      uadeWasm = await WebAssembly.compile(uadeWasmBinary);
    }
    uadeReady = true;
    console.log("[DJRenderWorker] UADE engine initialized");
  }
  async function renderWithUADE(fileBuffer, filename, subsong, id) {
    uadeReady = false;
    uadeInstance = null;
    await initUADE(true);
    const wasm = uadeInstance;
    const baseName = filename.split(/[\\/]/).pop() || filename;
    const dotIdx = baseName.lastIndexOf(".");
    const ext = dotIdx !== -1 ? baseName.slice(dotIdx + 1) : "mod";
    const nameOnly = dotIdx !== -1 ? baseName.slice(0, dotIdx) : baseName;
    const safeName = nameOnly.replace(/[^a-zA-Z0-9]/g, "_").slice(0, 20);
    const safeFilename = `${safeName}.${ext}`;
    console.log(`[DJRenderWorker/UADE] Rendering ${filename} as ${safeFilename} (${fileBuffer.byteLength} bytes)`);
    const fileSize = fileBuffer.byteLength;
    const filePtr = wasm._malloc(fileSize);
    const fileBytes = new Uint8Array(fileBuffer);
    wasm.HEAPU8.set(fileBytes, filePtr);
    const fnameLen = safeFilename.length * 3 + 1;
    const fnamePtr = wasm._malloc(fnameLen);
    wasm.stringToUTF8(safeFilename, fnamePtr, fnameLen);
    let loadResult = wasm._uade_wasm_load(filePtr, fileSize, fnamePtr);
    if (loadResult !== 0) {
      console.warn(`[DJRenderWorker/UADE] First load failed (${loadResult}), force reinit and retry...`);
      wasm._free(filePtr);
      wasm._free(fnamePtr);
      uadeReady = false;
      uadeInstance = null;
      await initUADE(true);
      const wasm2 = uadeInstance;
      const filePtr2 = wasm2._malloc(fileSize);
      wasm2.HEAPU8.set(fileBytes, filePtr2);
      const fnamePtr2 = wasm2._malloc(fnameLen);
      wasm2.stringToUTF8(safeFilename, fnamePtr2, fnameLen);
      loadResult = wasm2._uade_wasm_load(filePtr2, fileSize, fnamePtr2);
      wasm2._free(filePtr2);
      wasm2._free(fnamePtr2);
      if (loadResult !== 0) {
        throw new Error(`UADE failed to load ${safeFilename} (error: ${loadResult})`);
      }
      return renderWithUADEContinue(wasm2, safeFilename, subsong, id);
    }
    wasm._free(filePtr);
    wasm._free(fnamePtr);
    return renderWithUADEContinue(wasm, safeFilename, subsong, id);
  }
  async function renderWithUADEContinue(wasm, safeFilename, subsong, id) {
    if (subsong > 0) {
      wasm._uade_wasm_set_subsong(subsong);
    }
    wasm._uade_wasm_set_looping(0);
    await new Promise((resolve) => setTimeout(resolve, 350));
    postProgress(id, 10);
    const sampleRate = 44100;
    const CHUNK = 4096;
    const MAX_SECONDS = 600;
    const maxFrames = sampleRate * MAX_SECONDS;
    const tmpL = wasm._malloc(CHUNK * 4);
    const tmpR = wasm._malloc(CHUNK * 4);
    const audioChunks = [];
    let totalFrames = 0;
    let trailingSilenceFrames = 0;
    const SILENCE_THRESHOLD = 1e-4;
    const MAX_SILENCE_SECONDS = 4;
    const MIN_RENDER_SECONDS = 1;
    while (totalFrames < maxFrames) {
      const ret = wasm._uade_wasm_render(tmpL, tmpR, CHUNK);
      if (ret === 0) {
        console.log(`[DJRenderWorker/UADE] Song ended at ${totalFrames} frames (${(totalFrames / sampleRate).toFixed(1)}s)`);
        break;
      }
      if (ret < 0) {
        console.warn(`[DJRenderWorker/UADE] Render error (ret=${ret}) at ${totalFrames} frames`);
        break;
      }
      if (totalFrames === 0) {
        console.log(`[DJRenderWorker/UADE] First audio chunk received (${CHUNK} frames)`);
      }
      const leftData = new Float32Array(CHUNK);
      const rightData = new Float32Array(CHUNK);
      const heapL = new Float32Array(wasm.HEAPF32.buffer, tmpL, CHUNK);
      const heapR = new Float32Array(wasm.HEAPF32.buffer, tmpR, CHUNK);
      leftData.set(heapL);
      rightData.set(heapR);
      let isSilent = true;
      for (let i = 0; i < CHUNK; i++) {
        if (Math.abs(leftData[i]) > SILENCE_THRESHOLD || Math.abs(rightData[i]) > SILENCE_THRESHOLD) {
          isSilent = false;
          break;
        }
      }
      if (isSilent && totalFrames > 0) {
        trailingSilenceFrames += CHUNK;
        if (totalFrames > sampleRate * MIN_RENDER_SECONDS && trailingSilenceFrames > sampleRate * MAX_SILENCE_SECONDS) {
          console.log(`[DJRenderWorker/UADE] Stopping render due to ${MAX_SILENCE_SECONDS}s trailing silence at ${(totalFrames / sampleRate).toFixed(2)}s`);
          break;
        }
      } else {
        trailingSilenceFrames = 0;
      }
      audioChunks.push({ left: leftData, right: rightData });
      totalFrames += CHUNK;
      if (totalFrames % (sampleRate * 5) < CHUNK) {
        const pct = Math.min(80, 10 + totalFrames / maxFrames * 70);
        postProgress(id, pct);
      }
    }
    wasm._free(tmpL);
    wasm._free(tmpR);
    if (totalFrames === 0) {
      throw new Error(`UADE rendered 0 frames for ${safeFilename}`);
    }
    const left = new Float32Array(totalFrames);
    const right = new Float32Array(totalFrames);
    let offset = 0;
    for (const chunk of audioChunks) {
      left.set(chunk.left, offset);
      right.set(chunk.right, offset);
      offset += chunk.left.length;
    }
    postProgress(id, 85);
    let nonZero = 0;
    let maxAmp = 0;
    for (let i = 0; i < Math.min(left.length, 44100); i++) {
      const amp = Math.abs(left[i]) + Math.abs(right[i]);
      if (amp > 1e-4) nonZero++;
      if (amp > maxAmp) maxAmp = amp;
    }
    console.log(`[DJRenderWorker/UADE] ${safeFilename} rendered: ${totalFrames} frames (${(totalFrames / sampleRate).toFixed(1)}s), nonZero: ${nonZero}/${Math.min(totalFrames, 44100)}, maxAmp: ${maxAmp.toFixed(4)}`);
    return { left, right, sampleRate };
  }
  let hivelyInstance = null;
  let hivelyReady = false;
  async function initHively() {
    if (hivelyReady) return;
    const baseUrl = self.location.origin;
    const [wasmResponse, jsResponse] = await Promise.all([
      fetch(`${baseUrl}/hively/Hively.wasm`),
      fetch(`${baseUrl}/hively/Hively.js`)
    ]);
    const wasmBinary = await wasmResponse.arrayBuffer();
    let jsCode = await jsResponse.text();
    jsCode = jsCode.replace(/import\.meta\.url/g, `"${baseUrl}/hively/Hively.js"`);
    jsCode = jsCode.replace(/export\s+default\s+/g, "var createHively = ");
    jsCode = jsCode.replace(/export\s*\{[^}]*\}/g, "");
    jsCode = jsCode.replace(/ENVIRONMENT_IS_WEB\s*=\s*!0/g, "ENVIRONMENT_IS_WEB=false");
    jsCode = jsCode.replace(/ENVIRONMENT_IS_WORKER\s*=\s*!1/g, "ENVIRONMENT_IS_WORKER=true");
    jsCode = jsCode.replace(
      "moduleRtn=Module",
      "Module.HEAPU8=HEAPU8;Module.HEAPF32=HEAPF32;moduleRtn=Module"
    );
    jsCode = 'var document = { currentScript: { src: "' + baseUrl + '/hively/Hively.js" }, title: "" };\n' + jsCode;
    const factory = new Function(jsCode + '\n;return typeof createHively !== "undefined" ? createHively : Module;')();
    hivelyInstance = await factory({
      wasmBinary,
      print: (msg) => console.log("[DJRenderWorker/Hively]", msg),
      printErr: (msg) => console.warn("[DJRenderWorker/Hively]", msg)
    });
    hivelyInstance._hively_init(44100);
    hivelyReady = true;
    console.log("[DJRenderWorker] Hively engine initialized");
  }
  async function renderWithHively(fileBuffer, filename, subsong, id) {
    await initHively();
    const wasm = hivelyInstance;
    const sampleRate = 44100;
    const data = new Uint8Array(fileBuffer);
    const ptr = wasm._malloc(data.length);
    wasm.HEAPU8.set(data, ptr);
    const ok = wasm._hively_load_tune(ptr, data.length, 2);
    wasm._free(ptr);
    if (!ok) {
      throw new Error(`Hively failed to load ${filename}`);
    }
    console.log(`[DJRenderWorker/Hively] Loaded ${filename} — positions: ${wasm._hively_get_positions()}, channels: ${wasm._hively_get_channels()}`);
    if (subsong > 0) {
      wasm._hively_init_subsong(subsong);
    }
    postProgress(id, 10);
    const frameSamples = Math.floor(sampleRate / 50);
    const floatBytes = frameSamples * 4;
    const decodePtrL = wasm._malloc(floatBytes);
    const decodePtrR = wasm._malloc(floatBytes);
    const maxFrames = sampleRate * 600;
    const chunks = [];
    let totalFrames = 0;
    const positions = wasm._hively_get_positions();
    let lastProgressPct = 10;
    while (totalFrames < maxFrames) {
      if (wasm._hively_is_song_end()) break;
      const samples = wasm._hively_decode_frame(decodePtrL, decodePtrR);
      if (samples <= 0) break;
      const heapF32 = wasm.HEAPF32;
      const offsetL = decodePtrL >> 2;
      const offsetR = decodePtrR >> 2;
      const chunkL = new Float32Array(samples);
      const chunkR = new Float32Array(samples);
      for (let i = 0; i < samples; i++) {
        chunkL[i] = heapF32[offsetL + i];
        chunkR[i] = heapF32[offsetR + i];
      }
      chunks.push({ left: chunkL, right: chunkR });
      totalFrames += samples;
      if (positions > 0) {
        const pos = wasm._hively_get_position();
        const pct = Math.round(10 + pos / positions * 75);
        if (pct > lastProgressPct) {
          postProgress(id, pct);
          lastProgressPct = pct;
        }
      }
    }
    wasm._free(decodePtrL);
    wasm._free(decodePtrR);
    wasm._hively_free_tune();
    const left = new Float32Array(totalFrames);
    const right = new Float32Array(totalFrames);
    let offset = 0;
    for (const chunk of chunks) {
      left.set(chunk.left, offset);
      right.set(chunk.right, offset);
      offset += chunk.left.length;
    }
    postProgress(id, 85);
    console.log(`[DJRenderWorker/Hively] Rendered ${filename}: ${(totalFrames / sampleRate).toFixed(1)}s, ${chunks.length} frames`);
    return { left, right, sampleRate };
  }
  let openmptLib = null;
  let openmptReady = false;
  async function initLibopenmpt() {
    if (openmptReady) return;
    const baseUrl = self.location.origin;
    const jsResponse = await fetch(`${baseUrl}/chiptune3/libopenmpt.worklet.js`);
    let jsCode = await jsResponse.text();
    jsCode = jsCode.replace(/export\s+default\s+/g, "var createLibopenmpt = ");
    jsCode = jsCode.replace(/export\s*\{[^}]*\}/g, "");
    jsCode = jsCode.replace(/import\.meta\.url/g, `"${baseUrl}/chiptune3/libopenmpt.worklet.js"`);
    const factory = new Function(jsCode + '\n;return typeof createLibopenmpt !== "undefined" ? createLibopenmpt : Module;')();
    openmptLib = await factory();
    openmptReady = true;
    console.log("[DJRenderWorker] libopenmpt engine initialized");
  }
  function asciiToStack(lib, str) {
    const ptr = lib.stackAlloc(str.length + 1);
    for (let i = 0; i < str.length; i++) {
      lib.HEAPU8[ptr + i] = str.charCodeAt(i);
    }
    lib.HEAPU8[ptr + str.length] = 0;
    return ptr;
  }
  async function renderWithLibopenmpt(fileBuffer, filename, id) {
    var _a;
    await initLibopenmpt();
    const lib = openmptLib;
    postProgress(id, 10);
    const fileBytes = new Uint8Array(fileBuffer);
    const filePtr = lib._malloc(fileBytes.length);
    lib.HEAPU8.set(fileBytes, filePtr);
    const modulePtr = lib._openmpt_module_create_from_memory(filePtr, fileBytes.length, 0, 0, 0);
    lib._free(filePtr);
    if (!modulePtr) {
      throw new Error(`libopenmpt failed to load ${filename}`);
    }
    const sampleRate = 44100;
    lib._openmpt_module_set_repeat_count(modulePtr, 0);
    const ext = ((_a = filename.split(".").pop()) == null ? void 0 : _a.toLowerCase()) ?? "";
    if (ext === "mod" || ext === "nst" || ext === "stk" || ext === "m15") {
      const stack = lib.stackSave();
      lib._openmpt_module_ctl_set(modulePtr, asciiToStack(lib, "render.resampler.emulate_amiga"), asciiToStack(lib, "1"));
      lib._openmpt_module_ctl_set(modulePtr, asciiToStack(lib, "render.resampler.emulate_amiga_type"), asciiToStack(lib, "a1200"));
      lib.stackRestore(stack);
    }
    lib._openmpt_module_set_render_param(modulePtr, 2, 100);
    postProgress(id, 15);
    const CHUNK = 4096;
    const leftPtr = lib._malloc(CHUNK * 4);
    const rightPtr = lib._malloc(CHUNK * 4);
    const chunks = [];
    let totalFrames = 0;
    const MAX_FRAMES = sampleRate * 600;
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
        const pct = Math.min(80, 15 + totalFrames / MAX_FRAMES * 65);
        postProgress(id, pct);
      }
    }
    lib._free(leftPtr);
    lib._free(rightPtr);
    lib._openmpt_module_destroy(modulePtr);
    if (totalFrames === 0) {
      throw new Error(`libopenmpt rendered 0 frames for ${filename}`);
    }
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
  function postProgress(id, progress) {
    self.postMessage({ type: "renderProgress", id, progress: Math.round(progress) });
  }
  self.onmessage = async (e) => {
    const msg = e.data;
    switch (msg.type) {
      case "init": {
        self.postMessage({ type: "ready" });
        break;
      }
      case "render": {
        const { id, fileBuffer, filename, subsong = 0 } = msg;
        try {
          let result;
          if (isHivelyFormat(filename)) {
            result = await renderWithHively(fileBuffer, filename, subsong, id);
          } else if (isAmigaFormat(filename)) {
            result = await renderWithUADE(fileBuffer, filename, subsong, id);
          } else {
            result = await renderWithLibopenmpt(fileBuffer, filename, id);
          }
          const duration = result.left.length / result.sampleRate;
          postProgress(id, 95);
          self.postMessage(
            {
              type: "renderComplete",
              id,
              left: result.left,
              right: result.right,
              sampleRate: result.sampleRate,
              duration
            },
            [result.left.buffer, result.right.buffer]
          );
        } catch (err) {
          const errorMsg = err instanceof Error ? err.message : String(err);
          console.error(`[DJRenderWorker] Render failed for ${filename}:`, errorMsg);
          self.postMessage({ type: "renderError", id, error: errorMsg });
        }
        break;
      }
    }
  };
  self.postMessage({ type: "ready" });
})();
