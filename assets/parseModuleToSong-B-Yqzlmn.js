const __vite__mapDeps=(i,m=__vite__mapDeps,d=(m.f||(m.f=["assets/main-BbV5VyEH.js","assets/client-DHYdgbIN.js","assets/vendor-ui-AJ7AT9BN.js","assets/vendor-react-Dgd_wxYf.js","assets/vendor-utils-a-Usm5Xm.js","assets/vendor-tone-48TQc1H3.js","assets/main-c6CPs1E0.css","assets/ModuleConverter-BXW87Cid.js","assets/MidiToSong-Cqn3674F.js","assets/AdPlugParser-B_YVZZlR.js","assets/AdPlugWasmExtractor-DlN6_2a0.js","assets/AmigaFormatParsers-CSczdqTd.js"])))=>i.map(i=>d[i]);
import { am as __vitePreload, dF as extractPatternsFromLibOpenMPT, dG as hashPatterns, an as useSettingsStore } from "./main-BbV5VyEH.js";
const AUDIO_EXTENSIONS = /* @__PURE__ */ new Set([
  ".mp3",
  ".wav",
  ".flac",
  ".ogg",
  ".oga",
  ".aac",
  ".m4a",
  ".m4b",
  ".mp4",
  ".aif",
  ".aiff",
  ".opus",
  ".alac",
  ".wma",
  ".webm",
  ".iff",
  ".8svx"
  // Amiga IFF/8SVX samples
]);
function isAudioFile(filename) {
  if (!filename || !filename.includes(".")) return false;
  const ext = filename.slice(filename.lastIndexOf(".")).toLowerCase();
  return AUDIO_EXTENSIONS.has(ext);
}
function getAudioFormatName(filename) {
  const ext = filename.slice(filename.lastIndexOf(".")).toLowerCase();
  switch (ext) {
    case ".mp3":
      return "MP3";
    case ".wav":
      return "WAV";
    case ".flac":
      return "FLAC";
    case ".ogg":
      return "OGG Vorbis";
    case ".aac":
      return "AAC";
    case ".m4a":
      return "AAC/M4A";
    case ".aif":
    case ".aiff":
      return "AIFF";
    case ".iff":
    case ".8svx":
      return "Amiga IFF/8SVX";
    case ".opus":
      return "Opus";
    case ".wma":
      return "WMA";
    default:
      return "Audio";
  }
}
function formatTime(seconds) {
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${mins}:${secs.toString().padStart(2, "0")}`;
}
function formatTimePrecise(seconds) {
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  const cs = Math.floor(seconds % 1 * 100);
  return `${mins}:${secs.toString().padStart(2, "0")}.${cs.toString().padStart(2, "0")}`;
}
const audioFileUtils = /* @__PURE__ */ Object.freeze(/* @__PURE__ */ Object.defineProperty({
  __proto__: null,
  formatTime,
  formatTimePrecise,
  getAudioFormatName,
  isAudioFile
}, Symbol.toStringTag, { value: "Module" }));
let lastPatternHash = null;
let lastLibOpenMPTMetadata = null;
function getLastPatternHash() {
  return lastPatternHash;
}
function getLastLibOpenMPTMetadata() {
  return lastLibOpenMPTMetadata;
}
async function parseTrackerModule(buffer, fileName) {
  var _a, _b, _c, _d, _e, _f, _g, _h, _i;
  __vitePreload(async () => {
    const { FurnaceDispatchEngine } = await import("./main-BbV5VyEH.js").then((n) => n.iO);
    return { FurnaceDispatchEngine };
  }, true ? __vite__mapDeps([0,1,2,3,4,5,6]) : void 0).then(({ FurnaceDispatchEngine }) => {
    const engine = FurnaceDispatchEngine.getInstance();
    engine.setModuleWavetables(null);
    engine.setModuleSamples(null);
  }).catch(() => {
  });
  const { loadModuleFile } = await __vitePreload(async () => {
    const { loadModuleFile: loadModuleFile2 } = await import("./main-BbV5VyEH.js").then((n) => n.jo);
    return { loadModuleFile: loadModuleFile2 };
  }, true ? __vite__mapDeps([0,1,2,3,4,5,6]) : void 0);
  const { convertModule, convertXMModule, convertMODModule } = await __vitePreload(async () => {
    const { convertModule: convertModule2, convertXMModule: convertXMModule2, convertMODModule: convertMODModule2 } = await import("./ModuleConverter-BXW87Cid.js");
    return { convertModule: convertModule2, convertXMModule: convertXMModule2, convertMODModule: convertMODModule2 };
  }, true ? __vite__mapDeps([7,0,1,2,3,4,5,6]) : void 0);
  const { convertToInstrument } = await __vitePreload(async () => {
    const { convertToInstrument: convertToInstrument2 } = await import("./main-BbV5VyEH.js").then((n) => n.jk);
    return { convertToInstrument: convertToInstrument2 };
  }, true ? __vite__mapDeps([0,1,2,3,4,5,6]) : void 0);
  const moduleInfo = await loadModuleFile(new File([buffer], fileName));
  if (!moduleInfo) throw new Error(`Failed to load ${fileName}`);
  lastLibOpenMPTMetadata = moduleInfo.metadata;
  if (moduleInfo.metadata.song) {
    try {
      const patternData = extractPatternsFromLibOpenMPT(moduleInfo.metadata.song);
      const hashBigInt = hashPatterns(patternData);
      lastPatternHash = hashBigInt.toString();
      console.log("[parseModuleToSong] Computed pattern hash:", lastPatternHash);
    } catch (error) {
      console.warn("[parseModuleToSong] Failed to compute pattern hash:", error);
      lastPatternHash = null;
    }
  } else {
    lastPatternHash = null;
  }
  let result;
  let instruments = [];
  if ((_a = moduleInfo.nativeData) == null ? void 0 : _a.patterns) {
    const { format: format2, patterns: nativePatterns, importMetadata, instruments: nativeInstruments } = moduleInfo.nativeData;
    const channelCount = importMetadata.originalChannelCount;
    const instrumentNames = (nativeInstruments == null ? void 0 : nativeInstruments.map((i) => i.name)) || [];
    if (format2 === "XM") {
      result = convertXMModule(nativePatterns, channelCount, importMetadata, instrumentNames, moduleInfo.arrayBuffer);
    } else if (format2 === "MOD") {
      result = convertMODModule(nativePatterns, channelCount, importMetadata, instrumentNames, moduleInfo.arrayBuffer);
    } else if (moduleInfo.metadata.song) {
      result = convertModule(moduleInfo.metadata.song);
    }
    if (nativeInstruments) {
      for (let i = 0; i < nativeInstruments.length; i++) {
        const slotId = nativeInstruments[i].id;
        const converted = convertToInstrument(nativeInstruments[i], slotId, format2);
        instruments.push(...converted);
      }
    }
  } else if (moduleInfo.metadata.song) {
    result = convertModule(moduleInfo.metadata.song);
  }
  if (!result) throw new Error(`Failed to convert ${fileName}`);
  if (instruments.length === 0) {
    instruments = createFallbackInstruments(result.patterns, result.instrumentNames || []);
  }
  const modData = (_b = result.metadata) == null ? void 0 : _b.modData;
  const order = ((_c = result.order) == null ? void 0 : _c.length) ? result.order : result.patterns.map((_, i) => i);
  const format = ((_d = result.metadata) == null ? void 0 : _d.sourceFormat) || "XM";
  const xmFreqType = (_g = (_f = (_e = result.patterns[0]) == null ? void 0 : _e.importMetadata) == null ? void 0 : _f.xmData) == null ? void 0 : _g.frequencyType;
  const linearPeriods = format === "XM" ? xmFreqType === "linear" || xmFreqType === void 0 : false;
  return {
    name: moduleInfo.metadata.title || fileName.replace(/\.[^/.]+$/, ""),
    format,
    patterns: result.patterns,
    instruments,
    songPositions: order,
    songLength: (modData == null ? void 0 : modData.songLength) ?? order.length,
    restartPosition: 0,
    numChannels: result.channelCount || ((_i = (_h = result.patterns[0]) == null ? void 0 : _h.channels) == null ? void 0 : _i.length) || 4,
    initialSpeed: (modData == null ? void 0 : modData.initialSpeed) ?? 6,
    initialBPM: (modData == null ? void 0 : modData.initialBPM) ?? 125,
    linearPeriods
  };
}
function createFallbackInstruments(patterns, instrumentNames) {
  const usedInstruments = /* @__PURE__ */ new Set();
  for (const pattern of patterns) {
    for (const channel of pattern.channels) {
      for (const cell of channel.rows) {
        if (cell.instrument !== null && cell.instrument > 0) {
          usedInstruments.add(cell.instrument);
        }
      }
    }
  }
  const oscTypes = ["sawtooth", "square", "triangle", "sine"];
  const instruments = [];
  for (const instNum of Array.from(usedInstruments).sort((a, b) => a - b)) {
    instruments.push({
      id: instNum,
      name: instrumentNames[instNum - 1] || `Instrument ${instNum}`,
      type: "synth",
      synthType: "Synth",
      effects: [],
      volume: -6,
      pan: 0,
      oscillator: { type: oscTypes[(instNum - 1) % oscTypes.length], detune: 0, octave: 0 }
    });
  }
  return instruments;
}
const PatternExtractor = /* @__PURE__ */ Object.freeze(/* @__PURE__ */ Object.defineProperty({
  __proto__: null,
  createFallbackInstruments,
  getLastLibOpenMPTMetadata,
  getLastPatternHash,
  parseTrackerModule
}, Symbol.toStringTag, { value: "Module" }));
function getFormatEngine() {
  return useSettingsStore.getState().formatEngine;
}
async function parseModuleToSong(file, subsong = 0, preScannedMeta, midiOptions, companionFiles) {
  var _a;
  const filename = file.name.toLowerCase();
  let buffer = await file.arrayBuffer();
  const prefs = getFormatEngine();
  const header = new Uint8Array(buffer, 0, Math.min(2, buffer.byteLength));
  if (header[0] === 31 && header[1] === 139 && !/\.vgz$/i.test(filename)) {
    const pako = await __vitePreload(() => import("./main-BbV5VyEH.js").then((n) => n.i), true ? __vite__mapDeps([0,1,2,3,4,5,6]) : void 0);
    const inflated = pako.ungzip(new Uint8Array(buffer));
    buffer = inflated.buffer;
    console.log(`[parseModuleToSong] Gzip detected, inflated ${file.size} → ${buffer.byteLength} bytes`);
  }
  if (isAudioFile(file.name)) {
    throw new Error(`Cannot parse ${file.name} as a tracker module: it is a regular audio file.`);
  }
  if (filename.endsWith(".mid") || filename.endsWith(".midi")) {
    const { parseMIDIFile } = await __vitePreload(async () => {
      const { parseMIDIFile: parseMIDIFile2 } = await import("./MidiToSong-Cqn3674F.js");
      return { parseMIDIFile: parseMIDIFile2 };
    }, true ? __vite__mapDeps([8,0,1,2,3,4,5,6]) : void 0);
    return parseMIDIFile(file, midiOptions);
  }
  const { detectFormat } = await __vitePreload(async () => {
    const { detectFormat: detectFormat2 } = await import("./main-BbV5VyEH.js").then((n) => n.jj);
    return { detectFormat: detectFormat2 };
  }, true ? __vite__mapDeps([0,1,2,3,4,5,6]) : void 0);
  const fmt = detectFormat(filename);
  if (((_a = fmt == null ? void 0 : fmt.nativeParser) == null ? void 0 : _a.parseFn) === "parseAdPlugFile") {
    try {
      const { parseAdPlugFile } = await __vitePreload(async () => {
        const { parseAdPlugFile: parseAdPlugFile2 } = await import("./AdPlugParser-B_YVZZlR.js");
        return { parseAdPlugFile: parseAdPlugFile2 };
      }, true ? __vite__mapDeps([9,0,1,2,3,4,5,6]) : void 0);
      const result = parseAdPlugFile(buffer, file.name);
      if (result) return result;
    } catch {
    }
  }
  const { isAdPlugWasmFormat } = await __vitePreload(async () => {
    const { isAdPlugWasmFormat: isAdPlugWasmFormat2 } = await import("./main-BbV5VyEH.js").then((n) => n.jq);
    return { isAdPlugWasmFormat: isAdPlugWasmFormat2 };
  }, true ? __vite__mapDeps([0,1,2,3,4,5,6]) : void 0);
  if (isAdPlugWasmFormat(filename)) {
    try {
      const { extractAdPlugPatterns } = await __vitePreload(async () => {
        const { extractAdPlugPatterns: extractAdPlugPatterns2 } = await import("./AdPlugWasmExtractor-DlN6_2a0.js");
        return { extractAdPlugPatterns: extractAdPlugPatterns2 };
      }, true ? __vite__mapDeps([10,0,1,2,3,4,5,6]) : void 0);
      const extracted = await extractAdPlugPatterns(buffer, file.name);
      if (extracted) return extracted;
    } catch (err) {
      console.warn("[parseModuleToSong] AdPlug WASM extraction failed:", err);
    }
  }
  const { tryRouteFormat } = await __vitePreload(async () => {
    const { tryRouteFormat: tryRouteFormat2 } = await import("./AmigaFormatParsers-CSczdqTd.js");
    return { tryRouteFormat: tryRouteFormat2 };
  }, true ? __vite__mapDeps([11,0,1,2,3,4,5,6]) : void 0);
  const routed = await tryRouteFormat(buffer, filename, file.name, prefs, subsong, preScannedMeta, companionFiles);
  if (routed) return routed;
  if ((filename.endsWith(".mod") || filename.endsWith(".m15")) && prefs.mod === "uade") {
    const { parseUADEFile } = await __vitePreload(async () => {
      const { parseUADEFile: parseUADEFile2 } = await import("./main-BbV5VyEH.js").then((n) => n.ji);
      return { parseUADEFile: parseUADEFile2 };
    }, true ? __vite__mapDeps([0,1,2,3,4,5,6]) : void 0);
    return await parseUADEFile(buffer, file.name, prefs.uade ?? "enhanced", subsong, preScannedMeta);
  }
  const { parseTrackerModule: parseTrackerModule2 } = await __vitePreload(async () => {
    const { parseTrackerModule: parseTrackerModule3 } = await Promise.resolve().then(() => PatternExtractor);
    return { parseTrackerModule: parseTrackerModule3 };
  }, true ? void 0 : void 0);
  try {
    return await parseTrackerModule2(buffer, file.name);
  } catch {
    const { parseUADEFile } = await __vitePreload(async () => {
      const { parseUADEFile: parseUADEFile2 } = await import("./main-BbV5VyEH.js").then((n) => n.ji);
      return { parseUADEFile: parseUADEFile2 };
    }, true ? __vite__mapDeps([0,1,2,3,4,5,6]) : void 0);
    let uadeFileName = file.name;
    if (filename.endsWith(".mod") && buffer.byteLength > 1084) {
      const sig = new Uint8Array(buffer, 1080, 4);
      const sigStr = String.fromCharCode(sig[0], sig[1], sig[2], sig[3]);
      const validMODSigs = [
        "M.K.",
        "M!K!",
        "FLT4",
        "FLT8",
        "4CHN",
        "6CHN",
        "8CHN",
        "OCTA",
        "2CHN",
        "CD81",
        "TDZ1",
        "TDZ2",
        "TDZ3",
        "5CHN",
        "7CHN",
        "9CHN",
        "10CH",
        "11CH",
        "12CH",
        "13CH",
        "14CH",
        "15CH",
        "16CH",
        "18CH",
        "20CH",
        "22CH",
        "24CH",
        "26CH",
        "28CH",
        "30CH",
        "32CH"
      ];
      if (!validMODSigs.some((s) => sigStr.startsWith(s.slice(0, 4)))) {
        const baseName = file.name.replace(/\.mod$/i, "");
        uadeFileName = `mod_comp.${baseName}`;
        console.log(`[parseModuleToSong] No MOD signature at 1080, trying UADE as packed MOD: ${uadeFileName}`);
      }
    }
    return await parseUADEFile(buffer, uadeFileName, prefs.uade ?? "enhanced", subsong, preScannedMeta);
  }
}
const parseModuleToSong$1 = /* @__PURE__ */ Object.freeze(/* @__PURE__ */ Object.defineProperty({
  __proto__: null,
  getLastLibOpenMPTMetadata,
  getLastPatternHash,
  parseModuleToSong
}, Symbol.toStringTag, { value: "Module" }));
export {
  audioFileUtils as a,
  parseModuleToSong$1 as b,
  isAudioFile as i,
  parseModuleToSong as p
};
