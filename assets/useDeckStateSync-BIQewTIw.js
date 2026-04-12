const __vite__mapDeps=(i,m=__vite__mapDeps,d=(m.f||(m.f=["assets/parseModuleToSong-B-Yqzlmn.js","assets/main-BbV5VyEH.js","assets/client-DHYdgbIN.js","assets/vendor-ui-AJ7AT9BN.js","assets/vendor-react-Dgd_wxYf.js","assets/vendor-utils-a-Usm5Xm.js","assets/vendor-tone-48TQc1H3.js","assets/main-c6CPs1E0.css"])))=>i.map(i=>d[i]);
import { am as __vitePreload, b as useDJStore, dD as getDJEngine, ex as getBeatPhaseInfo, ep as snapPositionToBeat, ey as snapLoopLength, eq as quantizeAction, ez as hasElectronFS, eA as isElectron, V as getMIDIManager, eB as useVocoderStore, eC as routeDJParameter, eD as isDJContext, eE as getTrackerScratchController, at as getDJEngineIfActive, er as syncBPMToOther, es as phaseAlign, eF as setQuantizeMode, dL as registerViewHandler, eu as getQuantizeMode, et as quantizedEQKill, eG as instantEQKill } from "./main-BbV5VyEH.js";
import { g as getDJPipeline, i as isCached, f as getCachedAudio, D as DJBeatSync, h as setDeckSlipEnabled, k as killAllDecks, j as setCrossfader, l as setDeckLineLoop, m as clearDeckLineLoop, n as nudgeDeck, o as cueDeck, t as togglePlay } from "./DJActions-Ap2A5JjP.js";
import { a as reactExports } from "./vendor-ui-AJ7AT9BN.js";
import { getContext } from "./vendor-tone-48TQc1H3.js";
async function loadUADEToDeck(engine, deckId, fileBuffer, filename, renderIfMissing = false, bpm, trackName) {
  var _a;
  const cached = await getCachedAudio(fileBuffer);
  if (cached) {
    console.log(`[DJPrerender] Loading cached audio for ${filename}`);
    const info = await engine.loadAudioToDeck(deckId, cached.audioData, filename, trackName || cached.filename, bpm || cached.bpm);
    if (!cached.beatGrid) {
      void getDJPipeline().loadOrEnqueue(fileBuffer, filename, deckId, "normal").catch((err) => {
        console.warn(`[DJPrerender] Background analysis failed for ${filename}:`, err);
      });
    }
    return { cached: true, duration: info.duration };
  }
  if (renderIfMissing) {
    console.log(`[DJPrerender] ${filename} not cached, triggering background render + wait`);
    const { parseModuleToSong } = await __vitePreload(async () => {
      const { parseModuleToSong: parseModuleToSong2 } = await import("./parseModuleToSong-B-Yqzlmn.js").then((n) => n.b);
      return { parseModuleToSong: parseModuleToSong2 };
    }, true ? __vite__mapDeps([0,1,2,3,4,5,6,7]) : void 0);
    const file = new File([fileBuffer], filename);
    const song = await parseModuleToSong(file);
    await engine.loadToDeck(deckId, song, filename, bpm || 125);
    useDJStore.getState().setDeckState(deckId, {
      analysisState: "rendering",
      isPlaying: false
    });
    try {
      const result = await getDJPipeline().loadOrEnqueue(fileBuffer, filename, deckId, "high");
      const info = await engine.loadAudioToDeck(deckId, result.wavData, filename, trackName || filename, ((_a = result.analysis) == null ? void 0 : _a.bpm) || bpm || 125);
      return { cached: true, duration: info.duration };
    } catch (err) {
      console.error(`[DJPrerender] Failed to render ${filename}:`, err);
      throw err;
    }
  }
  console.warn(`[DJPrerender] ${filename} not cached and renderIfMissing=false`);
  return { cached: false, duration: 0 };
}
async function renderAndCacheUADE(fileBuffer, filename, subsong = 0) {
  if (await isCached(fileBuffer)) {
    console.log(`[DJPrerender] ${filename} already cached, skipping render`);
    return;
  }
  const pipeline = getDJPipeline();
  const id = `render-${filename}-${Date.now()}`;
  await pipeline.enqueue({
    id,
    fileBuffer,
    filename,
    priority: "normal",
    subsong
  });
}
async function batchRenderUADE(files, onProgress) {
  console.log(`[DJPrerender] Batch rendering ${files.length} files via pipeline...`);
  const pipeline = getDJPipeline();
  const promises = [];
  for (let i = 0; i < files.length; i++) {
    const { buffer, filename } = files[i];
    const id = `batch-${filename}-${Date.now()}-${i}`;
    const p = pipeline.enqueue({
      id,
      fileBuffer: buffer,
      filename,
      priority: "low"
    }).then(() => {
      onProgress == null ? void 0 : onProgress(i + 1, files.length);
    }).catch((err) => {
      console.error(`[DJPrerender] Failed to render ${filename}:`, err);
    });
    promises.push(p);
  }
  await Promise.allSettled(promises);
  console.log(`[DJPrerender] Batch render complete`);
}
async function isUADECached(fileBuffer) {
  return isCached(fileBuffer);
}
const DJUADEPrerender = /* @__PURE__ */ Object.freeze(/* @__PURE__ */ Object.defineProperty({
  __proto__: null,
  batchRenderUADE,
  isUADECached,
  loadUADEToDeck,
  renderAndCacheUADE
}, Symbol.toStringTag, { value: "Module" }));
const deckCaches = /* @__PURE__ */ new Map();
function startLoop(deckId, entry) {
  const tick = () => {
    if (entry.refCount <= 0) return;
    try {
      const deck = getDJEngine().getDeck(deckId);
      entry.data.waveform = deck.getWaveform();
      entry.data.fft = deck.getFFT();
      entry.data.level = deck.getLevel();
    } catch {
    }
    try {
      entry.data.beatPhase = getBeatPhaseInfo(deckId);
    } catch {
      entry.data.beatPhase = null;
    }
    entry.rafId = requestAnimationFrame(tick);
  };
  entry.rafId = requestAnimationFrame(tick);
}
function useDeckVisualizationData(deckId) {
  const deckIdRef = reactExports.useRef(deckId);
  deckIdRef.current = deckId;
  reactExports.useEffect(() => {
    let existing = deckCaches.get(deckId);
    if (!existing) {
      existing = {
        data: {
          waveform: null,
          fft: null,
          level: -Infinity,
          beatPhase: null
        },
        refCount: 0,
        rafId: 0
      };
      deckCaches.set(deckId, existing);
    }
    existing.refCount++;
    if (existing.refCount === 1) {
      startLoop(deckId, existing);
    }
    return () => {
      const entry = deckCaches.get(deckId);
      if (!entry) return;
      entry.refCount--;
      if (entry.refCount <= 0) {
        cancelAnimationFrame(entry.rafId);
        deckCaches.delete(deckId);
      }
    };
  }, [deckId]);
  const getWaveform = reactExports.useCallback(
    () => {
      var _a;
      return ((_a = deckCaches.get(deckIdRef.current)) == null ? void 0 : _a.data.waveform) ?? null;
    },
    []
  );
  const getFFT = reactExports.useCallback(
    () => {
      var _a;
      return ((_a = deckCaches.get(deckIdRef.current)) == null ? void 0 : _a.data.fft) ?? null;
    },
    []
  );
  const getLevel = reactExports.useCallback(
    () => {
      var _a;
      return ((_a = deckCaches.get(deckIdRef.current)) == null ? void 0 : _a.data.level) ?? -Infinity;
    },
    []
  );
  const getBeatPhase = reactExports.useCallback(
    () => {
      var _a;
      return ((_a = deckCaches.get(deckIdRef.current)) == null ? void 0 : _a.data.beatPhase) ?? null;
    },
    []
  );
  return { getWaveform, getFFT, getLevel, getBeatPhase };
}
const SUPPRESS_MS = 250;
const seekTimestamps = /* @__PURE__ */ new Map();
function markSeek(deckId) {
  seekTimestamps.set(deckId, performance.now());
}
function isSeekActive(deckId) {
  const ts = seekTimestamps.get(deckId);
  if (!ts) return false;
  if (performance.now() - ts > SUPPRESS_MS) {
    seekTimestamps.delete(deckId);
    return false;
  }
  return true;
}
function beatJump(deckId, beats) {
  const fire = () => {
    try {
      const state = useDJStore.getState().decks[deckId];
      const engine = getDJEngine();
      const deck = engine.getDeck(deckId);
      const beatGrid = state.beatGrid;
      if (!beatGrid || beatGrid.bpm <= 0) {
        const jumpSec2 = beats * 0.5;
        if (deck.playbackMode === "audio") {
          const newPos = Math.max(0, state.audioPosition + jumpSec2);
          deck.audioPlayer.seek(newPos);
          useDJStore.getState().setDeckState(deckId, { audioPosition: newPos, elapsedMs: newPos * 1e3 });
        } else {
          const jumpPositions = Math.round(beats);
          const newPos = Math.max(0, Math.min(state.totalPositions - 1, state.songPos + jumpPositions));
          deck.cue(newPos, 0);
          useDJStore.getState().setDeckPosition(deckId, newPos, 0);
        }
        return;
      }
      const beatPeriod = 60 / beatGrid.bpm;
      const jumpSec = beats * beatPeriod;
      if (deck.playbackMode === "audio") {
        const snappedNow = snapPositionToBeat(deckId, state.audioPosition, "beat");
        const newPos = Math.max(0, snappedNow + jumpSec);
        deck.audioPlayer.seek(newPos);
        useDJStore.getState().setDeckState(deckId, { audioPosition: newPos, elapsedMs: newPos * 1e3 });
      } else {
        const totalDur = state.durationMs > 0 ? state.durationMs / 1e3 : 1;
        const totalPos = Math.max(state.totalPositions, 1);
        const currentSec = state.elapsedMs / 1e3;
        const snappedNow = snapPositionToBeat(deckId, currentSec, "beat");
        const targetSec = Math.max(0, snappedNow + jumpSec);
        const targetPos = Math.min(
          Math.max(0, Math.floor(targetSec / totalDur * totalPos)),
          totalPos - 1
        );
        deck.cue(targetPos, 0);
        useDJStore.getState().setDeckPosition(deckId, targetPos, 0);
      }
    } catch {
    }
  };
  quantizeAction(deckId, fire, { kind: "jump", allowSolo: true });
}
function triggerHotCue(deckId, index) {
  const store = useDJStore.getState();
  const cue = store.decks[deckId].hotCues[index];
  if (!cue) {
    try {
      const engine = getDJEngine();
      const deck = engine.getDeck(deckId);
      const HOT_CUE_COLORS = ["#E91E63", "#FF9800", "#2196F3", "#4CAF50", "#9C27B0", "#00BCD4", "#FFEB3B", "#F44336"];
      let positionSec = 0;
      if (deck.playbackMode === "audio") {
        positionSec = deck.audioPlayer.getPosition();
      } else {
        positionSec = store.decks[deckId].elapsedMs / 1e3;
      }
      const snappedSec = snapPositionToBeat(deckId, positionSec, "beat");
      store.setHotCue(deckId, index, {
        position: snappedSec * 1e3,
        color: HOT_CUE_COLORS[index] || "#FFFFFF",
        name: ""
      });
    } catch {
    }
    return;
  }
  quantizeAction(
    deckId,
    () => {
      try {
        const engine = getDJEngine();
        const deck = engine.getDeck(deckId);
        const seconds = cue.position / 1e3;
        if (deck.playbackMode === "audio") {
          deck.audioPlayer.seek(seconds);
          useDJStore.getState().setDeckState(deckId, { audioPosition: seconds, elapsedMs: cue.position });
        } else {
          const state = useDJStore.getState().decks[deckId];
          if (state.durationMs > 0 && state.totalPositions > 0) {
            const pos = Math.floor(cue.position / state.durationMs * state.totalPositions);
            deck.cue(Math.max(0, Math.min(pos, state.totalPositions - 1)), 0);
          }
        }
      } catch {
      }
    },
    { kind: "hotcue", allowSolo: true }
  );
}
function activateSeratoLoop(deckId, index) {
  const store = useDJStore.getState();
  const loops = store.decks[deckId].seratoLoops;
  const loop = loops.find((l) => l.index === index);
  if (!loop) return;
  const rawIn = loop.startPosition / 1e3;
  const rawOut = loop.endPosition / 1e3;
  const inSec = snapPositionToBeat(deckId, rawIn, "beat");
  const beatGrid = store.decks[deckId].beatGrid;
  let outSec = rawOut + (inSec - rawIn);
  if (beatGrid && beatGrid.bpm > 0) {
    const beatPeriod = 60 / beatGrid.bpm;
    const lengthBeats = (rawOut - rawIn) / beatPeriod;
    const snappedBeats = snapLoopLength(lengthBeats);
    outSec = inSec + snappedBeats * beatPeriod;
  }
  store.setAudioLoopIn(deckId, inSec);
  store.setAudioLoopOut(deckId, outSec);
  quantizeAction(
    deckId,
    () => {
      try {
        const engine = getDJEngine();
        const deck = engine.getDeck(deckId);
        deck.setAudioLoop(inSec, outSec);
        useDJStore.getState().setDeckLoop(deckId, "line", true);
        if (deck.playbackMode === "audio") {
          deck.audioPlayer.seek(inSec);
          useDJStore.getState().setDeckState(deckId, { audioPosition: inSec, elapsedMs: inSec * 1e3 });
        }
      } catch {
      }
    },
    { kind: "loop", allowSolo: true }
  );
}
class DJVideoRecorder {
  _recorder = null;
  _chunks = [];
  _startTime = 0;
  _recording = false;
  _mimeType = "";
  _totalBytes = 0;
  /** Callbacks */
  onDataAvailable;
  /** Start recording a MediaStream */
  startRecording(stream) {
    if (this._recording) return;
    this._mimeType = pickMimeType();
    this._chunks = [];
    this._totalBytes = 0;
    this._recorder = new MediaRecorder(stream, {
      mimeType: this._mimeType,
      videoBitsPerSecond: 4e6,
      // 4 Mbps
      audioBitsPerSecond: 128e3
      // 128 kbps
    });
    this._recorder.ondataavailable = (e) => {
      var _a;
      if (e.data.size > 0) {
        this._chunks.push(e.data);
        this._totalBytes += e.data.size;
        (_a = this.onDataAvailable) == null ? void 0 : _a.call(this, this._totalBytes, this.durationMs);
      }
    };
    this._recorder.start(1e3);
    this._startTime = performance.now();
    this._recording = true;
    console.log(`[DJVideoRecorder] Started: mimeType=${this._mimeType}`);
  }
  /** Stop recording and return the video Blob */
  async stopRecording() {
    return new Promise((resolve) => {
      if (!this._recorder || !this._recording) {
        resolve(new Blob([], { type: this._mimeType }));
        return;
      }
      this._recorder.onstop = () => {
        const blob = new Blob(this._chunks, { type: this._mimeType });
        this._chunks = [];
        this._recording = false;
        console.log(`[DJVideoRecorder] Stopped: ${(blob.size / 1024 / 1024).toFixed(1)}MB, ${(this.durationMs / 1e3).toFixed(0)}s`);
        resolve(blob);
      };
      this._recorder.stop();
    });
  }
  /** Download the blob as a file */
  static download(blob, filename) {
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
  }
  get isRecording() {
    return this._recording;
  }
  get durationMs() {
    return this._recording ? performance.now() - this._startTime : 0;
  }
  get totalBytes() {
    return this._totalBytes;
  }
  get mimeType() {
    return this._mimeType;
  }
}
function pickMimeType() {
  const candidates = [
    "video/webm;codecs=vp9,opus",
    "video/webm;codecs=vp8,opus",
    "video/webm;codecs=vp9",
    "video/webm;codecs=vp8",
    "video/webm",
    "video/mp4"
  ];
  for (const mime of candidates) {
    if (MediaRecorder.isTypeSupported(mime)) return mime;
  }
  return "video/webm";
}
function parseTLVStream(buffer, startOffset = 0) {
  const view = new DataView(buffer);
  const entries = [];
  let pos = startOffset;
  while (pos + 8 <= buffer.byteLength) {
    const tagBytes = new Uint8Array(buffer, pos, 4);
    const tag = String.fromCharCode(tagBytes[0], tagBytes[1], tagBytes[2], tagBytes[3]);
    const length = view.getUint32(pos + 4, false);
    if (pos + 8 + length > buffer.byteLength) {
      break;
    }
    const data = new Uint8Array(buffer, pos + 8, length);
    entries.push({ tag, data, offset: pos });
    pos += 8 + length;
  }
  return entries;
}
function parseNestedTLV(data) {
  const buffer = data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength);
  return parseTLVStream(buffer);
}
function decodeUTF16BE(data) {
  const chars = [];
  for (let i = 0; i + 1 < data.length; i += 2) {
    const code = data[i] << 8 | data[i + 1];
    if (code === 0) break;
    chars.push(String.fromCharCode(code));
  }
  return chars.join("");
}
function parseSeratoDatabase(buffer) {
  const entries = parseTLVStream(buffer);
  const tracks = [];
  for (const entry of entries) {
    if (entry.tag !== "otrk") continue;
    const children = parseNestedTLV(entry.data);
    const track = parseTrackEntry(children);
    if (track.filePath) {
      tracks.push(track);
    }
  }
  return tracks;
}
function parseTrackEntry(children) {
  const track = {
    filePath: "",
    title: "",
    artist: "",
    album: "",
    genre: "",
    bpm: 0,
    duration: 0,
    bitrate: 0,
    sampleRate: 0,
    key: "",
    fileType: "",
    fileSize: 0,
    dateAdded: ""
  };
  for (const child of children) {
    const text = decodeUTF16BE(child.data);
    switch (child.tag) {
      case "pfil":
      // file path
      case "ptrk":
        if (!track.filePath) track.filePath = text;
        break;
      case "tsng":
        track.title = text;
        break;
      case "tart":
        track.artist = text;
        break;
      case "talb":
        track.album = text;
        break;
      case "tgen":
        track.genre = text;
        break;
      case "tbpm":
        track.bpm = parseFloat(text) || 0;
        break;
      case "tlen":
        track.duration = parseDuration(text);
        break;
      case "tbit":
        track.bitrate = parseInt(text, 10) || 0;
        break;
      case "tsmp":
        track.sampleRate = parseInt(text, 10) || 0;
        break;
      case "tkey":
        track.key = text;
        break;
      case "ttyp":
        track.fileType = text;
        break;
      case "tsiz":
        track.fileSize = parseInt(text, 10) || 0;
        break;
      case "tadd":
        track.dateAdded = text;
        break;
    }
  }
  if (!track.title && track.filePath) {
    const parts = track.filePath.replace(/\\/g, "/").split("/");
    const filename = parts[parts.length - 1] || "";
    track.title = filename.replace(/\.[^.]+$/, "");
  }
  return track;
}
function parseDuration(text) {
  if (text.includes(":")) {
    const parts = text.split(":");
    return (parseInt(parts[0], 10) || 0) * 60 + (parseInt(parts[1], 10) || 0);
  }
  return parseInt(text, 10) || 0;
}
function parseSeratoCrate(buffer, crateFileName) {
  const entries = parseTLVStream(buffer);
  const tracks = [];
  for (const entry of entries) {
    if (entry.tag !== "otrk") continue;
    const children = parseNestedTLV(entry.data);
    for (const child of children) {
      if (child.tag === "ptrk") {
        const path = decodeUTF16BE(child.data);
        if (path) tracks.push(path);
      }
    }
  }
  return {
    name: decodeCrateName(crateFileName),
    fileName: crateFileName,
    tracks
  };
}
function decodeCrateName(fileName) {
  return fileName.replace(/\.crate$/, "").replace(/%%/g, " / ");
}
var define_process_env_default = {};
function getDefaultSeratoPath() {
  var _a;
  if (!isElectron()) return null;
  const platform = (_a = window.electron) == null ? void 0 : _a.platform;
  if (platform === "darwin") {
    return "/Users/" + getUsername() + "/Music/_Serato_";
  } else if (platform === "win32") {
    return "C:\\Users\\" + getUsername() + "\\Music\\_Serato_";
  }
  return "/home/" + getUsername() + "/Music/_Serato_";
}
function getUsername() {
  try {
    if (typeof process !== "undefined" && define_process_env_default) {
      return define_process_env_default.USER || define_process_env_default.USERNAME || "";
    }
  } catch {
  }
  return "";
}
async function isSeratoLibrary(dirPath) {
  if (!hasElectronFS()) return false;
  try {
    const entries = await window.electron.fs.readdir(dirPath);
    return entries.some((e) => e.name === "database V2" && !e.isDirectory);
  } catch {
    return false;
  }
}
async function isSeratoLibraryHandle(handle) {
  try {
    await handle.getFileHandle("database V2");
    return true;
  } catch {
    return false;
  }
}
async function readSeratoLibraryElectron(rootPath) {
  var _a;
  const fs = (_a = window.electron) == null ? void 0 : _a.fs;
  if (!fs) throw new Error("Electron filesystem not available");
  const dbPath = rootPath + (rootPath.endsWith("/") ? "" : "/") + "database V2";
  let tracks = [];
  try {
    const dbBuffer = await fs.readFile(dbPath);
    tracks = parseSeratoDatabase(dbBuffer);
  } catch (err) {
    console.warn("[SeratoLocator] Failed to read database V2:", err);
  }
  const crates = [];
  const cratesPath = rootPath + (rootPath.endsWith("/") ? "" : "/") + "Subcrates";
  try {
    const crateEntries = await fs.readdir(cratesPath, [".crate"]);
    for (const entry of crateEntries) {
      if (entry.isDirectory || !entry.name.endsWith(".crate")) continue;
      try {
        const crateBuffer = await fs.readFile(entry.path);
        const crate = parseSeratoCrate(crateBuffer, entry.name);
        crates.push(crate);
      } catch (err) {
        console.warn(`[SeratoLocator] Failed to read crate ${entry.name}:`, err);
      }
    }
  } catch {
  }
  return { tracks, crates, libraryPath: rootPath };
}
async function readSeratoLibraryBrowser(handle) {
  let tracks = [];
  try {
    const dbFileHandle = await handle.getFileHandle("database V2");
    const dbFile = await dbFileHandle.getFile();
    const dbBuffer = await dbFile.arrayBuffer();
    tracks = parseSeratoDatabase(dbBuffer);
  } catch (err) {
    console.warn("[SeratoLocator] Failed to read database V2:", err);
  }
  const crates = [];
  try {
    const subcratesHandle = await handle.getDirectoryHandle("Subcrates");
    for await (const [name, entryHandle] of subcratesHandle) {
      if (entryHandle.kind !== "file" || !name.endsWith(".crate")) continue;
      try {
        const fileHandle = entryHandle;
        const file = await fileHandle.getFile();
        const buffer = await file.arrayBuffer();
        const crate = parseSeratoCrate(buffer, name);
        crates.push(crate);
      } catch (err) {
        console.warn(`[SeratoLocator] Failed to read crate ${name}:`, err);
      }
    }
  } catch {
  }
  return { tracks, crates, libraryPath: handle.name };
}
async function pickAndReadSeratoLibrary() {
  if (hasElectronFS()) {
    const fs = window.electron.fs;
    const paths = await fs.showOpenDialog({
      properties: ["openDirectory"]
    });
    if (!paths || paths.length === 0) return null;
    const dirPath = paths[0];
    if (!await isSeratoLibrary(dirPath)) {
      throw new Error(`"${dirPath}" does not appear to be a Serato library (no "database V2" file found)`);
    }
    return readSeratoLibraryElectron(dirPath);
  }
  if ("showDirectoryPicker" in window) {
    try {
      const handle = await window.showDirectoryPicker({ mode: "read" });
      if (!await isSeratoLibraryHandle(handle)) {
        throw new Error("Selected folder does not appear to be a Serato library");
      }
      return readSeratoLibraryBrowser(handle);
    } catch (err) {
      if (err.name === "AbortError") return null;
      throw err;
    }
  }
  throw new Error("No file system access available. Use Chrome/Edge for browser mode, or the desktop app.");
}
async function autoDetectSeratoLibrary() {
  if (!hasElectronFS()) return null;
  const defaultPath = getDefaultSeratoPath();
  if (!defaultPath) return null;
  if (await isSeratoLibrary(defaultPath)) {
    return readSeratoLibraryElectron(defaultPath);
  }
  return null;
}
const GENERIC_8x8 = {
  id: "generic-8x8",
  name: "Generic 8-Knob + 8-Pad",
  manufacturer: "Generic",
  description: "Standard 8-knob (CC 70-77) + 8-pad (36-43) layout",
  ccMappings: [
    // Knobs 1-4: Deck A
    { channel: 0, cc: 70, param: "dj.deckA.eqHi" },
    { channel: 0, cc: 71, param: "dj.deckA.eqMid" },
    { channel: 0, cc: 72, param: "dj.deckA.eqLow" },
    { channel: 0, cc: 73, param: "dj.deckA.filter" },
    // Knobs 5-8: Deck B
    { channel: 0, cc: 74, param: "dj.deckB.eqHi" },
    { channel: 0, cc: 75, param: "dj.deckB.eqMid" },
    { channel: 0, cc: 76, param: "dj.deckB.eqLow" },
    { channel: 0, cc: 77, param: "dj.deckB.filter" },
    // Faders (if available)
    { channel: 0, cc: 0, param: "dj.deckA.volume" },
    { channel: 0, cc: 1, param: "dj.deckB.volume" },
    { channel: 0, cc: 2, param: "dj.crossfader" },
    { channel: 0, cc: 3, param: "dj.masterVolume" }
  ],
  noteMappings: [
    // Pads 1-4: Deck A controls
    { channel: 9, note: 36, action: "play_a" },
    { channel: 9, note: 37, action: "cue_a" },
    { channel: 9, note: 38, action: "sync_a" },
    { channel: 9, note: 39, action: "hotcue1_a" },
    // Pads 5-8: Deck B controls
    { channel: 9, note: 40, action: "play_b" },
    { channel: 9, note: 41, action: "cue_b" },
    { channel: 9, note: 42, action: "sync_b" },
    { channel: 9, note: 43, action: "hotcue1_b" }
  ],
  jogMapping: {
    deckA: { channel: 0, cc: 16, touchNote: 60 },
    deckB: { channel: 1, cc: 16, touchNote: 61 }
  }
};
const GENERIC_4x16 = {
  id: "generic-4x16",
  name: "Generic 4-Knob + 16-Pad",
  manufacturer: "Generic",
  description: "Pad-heavy layout: 4 knobs + 16 pads (36-51)",
  ccMappings: [
    // 4 essential knobs
    { channel: 0, cc: 70, param: "dj.deckA.filter" },
    { channel: 0, cc: 71, param: "dj.deckB.filter" },
    { channel: 0, cc: 72, param: "dj.deckA.volume" },
    { channel: 0, cc: 73, param: "dj.deckB.volume" },
    // Crossfader (if available)
    { channel: 0, cc: 2, param: "dj.crossfader" }
  ],
  noteMappings: [
    // Pads 1-8: Deck A (hot cues + transport)
    { channel: 9, note: 36, action: "hotcue1_a" },
    { channel: 9, note: 37, action: "hotcue2_a" },
    { channel: 9, note: 38, action: "hotcue3_a" },
    { channel: 9, note: 39, action: "hotcue4_a" },
    { channel: 9, note: 40, action: "play_a" },
    { channel: 9, note: 41, action: "cue_a" },
    { channel: 9, note: 42, action: "sync_a" },
    { channel: 9, note: 43, action: "loop_a" },
    // Pads 9-16: Deck B (hot cues + transport)
    { channel: 9, note: 44, action: "hotcue1_b" },
    { channel: 9, note: 45, action: "hotcue2_b" },
    { channel: 9, note: 46, action: "hotcue3_b" },
    { channel: 9, note: 47, action: "hotcue4_b" },
    { channel: 9, note: 48, action: "play_b" },
    { channel: 9, note: 49, action: "cue_b" },
    { channel: 9, note: 50, action: "sync_b" },
    { channel: 9, note: 51, action: "loop_b" }
  ],
  jogMapping: {
    deckA: { channel: 0, cc: 16, touchNote: 60 },
    deckB: { channel: 1, cc: 16, touchNote: 61 }
  }
};
const GENERIC_MIXER = {
  id: "generic-mixer",
  name: "Generic 2-Channel Mixer",
  manufacturer: "Generic",
  description: "Simple mixer: faders, EQ, crossfader only",
  ccMappings: [
    // Channel faders
    { channel: 0, cc: 7, param: "dj.deckA.volume" },
    { channel: 1, cc: 7, param: "dj.deckB.volume" },
    // EQ Deck A
    { channel: 0, cc: 16, param: "dj.deckA.eqHi" },
    { channel: 0, cc: 17, param: "dj.deckA.eqMid" },
    { channel: 0, cc: 18, param: "dj.deckA.eqLow" },
    // EQ Deck B
    { channel: 1, cc: 16, param: "dj.deckB.eqHi" },
    { channel: 1, cc: 17, param: "dj.deckB.eqMid" },
    { channel: 1, cc: 18, param: "dj.deckB.eqLow" },
    // Crossfader
    { channel: 0, cc: 8, param: "dj.crossfader" },
    // Master
    { channel: 0, cc: 10, param: "dj.masterVolume" },
    // Pitch
    { channel: 0, cc: 9, param: "dj.deckA.pitch", invert: true },
    { channel: 1, cc: 9, param: "dj.deckB.pitch", invert: true }
  ],
  noteMappings: [
    // Transport (if buttons available)
    { channel: 0, note: 0, action: "play_a" },
    { channel: 1, note: 0, action: "play_b" },
    { channel: 0, note: 1, action: "cue_a" },
    { channel: 1, note: 1, action: "cue_b" },
    { channel: 0, note: 2, action: "sync_a" },
    { channel: 1, note: 2, action: "sync_b" }
  ],
  jogMapping: {
    deckA: { channel: 0, cc: 22, touchNote: 16 },
    deckB: { channel: 1, cc: 22, touchNote: 16 }
  }
};
const GENERIC_4DECK = {
  id: "generic-4deck",
  name: "Generic 4-Deck Controller",
  manufacturer: "Generic",
  description: "Full 4-deck layout (A+B mapped, C+D reserved)",
  ccMappings: [
    // Deck A (Channel 0)
    { channel: 0, cc: 19, param: "dj.deckA.volume" },
    { channel: 0, cc: 7, param: "dj.deckA.eqHi" },
    { channel: 0, cc: 11, param: "dj.deckA.eqMid" },
    { channel: 0, cc: 15, param: "dj.deckA.eqLow" },
    { channel: 0, cc: 23, param: "dj.deckA.filter" },
    { channel: 0, cc: 9, param: "dj.deckA.pitch", invert: true },
    { channel: 0, cc: 4, param: "dj.deckA.trimGain" },
    // Deck B (Channel 1)
    { channel: 1, cc: 19, param: "dj.deckB.volume" },
    { channel: 1, cc: 7, param: "dj.deckB.eqHi" },
    { channel: 1, cc: 11, param: "dj.deckB.eqMid" },
    { channel: 1, cc: 15, param: "dj.deckB.eqLow" },
    { channel: 1, cc: 23, param: "dj.deckB.filter" },
    { channel: 1, cc: 9, param: "dj.deckB.pitch", invert: true },
    { channel: 1, cc: 4, param: "dj.deckB.trimGain" },
    // Master
    { channel: 0, cc: 63, param: "dj.crossfader" },
    { channel: 0, cc: 25, param: "dj.masterVolume" }
  ],
  noteMappings: [
    // Deck A
    { channel: 0, note: 11, action: "play_a" },
    { channel: 0, note: 12, action: "cue_a" },
    { channel: 0, note: 88, action: "sync_a" },
    { channel: 7, note: 0, action: "hotcue1_a" },
    { channel: 7, note: 1, action: "hotcue2_a" },
    { channel: 7, note: 2, action: "hotcue3_a" },
    { channel: 7, note: 3, action: "hotcue4_a" },
    // Deck B
    { channel: 1, note: 11, action: "play_b" },
    { channel: 1, note: 12, action: "cue_b" },
    { channel: 1, note: 88, action: "sync_b" },
    { channel: 7, note: 4, action: "hotcue1_b" },
    { channel: 7, note: 5, action: "hotcue2_b" },
    { channel: 7, note: 6, action: "hotcue3_b" },
    { channel: 7, note: 7, action: "hotcue4_b" }
  ],
  jogMapping: {
    deckA: { channel: 0, cc: 33, touchNote: 54 },
    deckB: { channel: 1, cc: 33, touchNote: 54 }
  }
};
const GENERIC_TWISTER = {
  id: "generic-twister",
  name: "Generic Rotation Controller",
  manufacturer: "Generic",
  description: "16-encoder layout (e.g., MIDI Fighter Twister)",
  ccMappings: [
    // Bank 1: Deck A (knobs 1-8)
    { channel: 0, cc: 0, param: "dj.deckA.volume" },
    { channel: 0, cc: 1, param: "dj.deckA.filter" },
    { channel: 0, cc: 2, param: "dj.deckA.eqHi" },
    { channel: 0, cc: 3, param: "dj.deckA.eqMid" },
    { channel: 0, cc: 4, param: "dj.deckA.eqLow" },
    { channel: 0, cc: 5, param: "dj.deckA.pitch" },
    { channel: 0, cc: 6, param: "dj.deckA.filterQ" },
    { channel: 0, cc: 7, param: "dj.deckA.trimGain" },
    // Bank 2: Deck B (knobs 9-16)
    { channel: 0, cc: 8, param: "dj.deckB.volume" },
    { channel: 0, cc: 9, param: "dj.deckB.filter" },
    { channel: 0, cc: 10, param: "dj.deckB.eqHi" },
    { channel: 0, cc: 11, param: "dj.deckB.eqMid" },
    { channel: 0, cc: 12, param: "dj.deckB.eqLow" },
    { channel: 0, cc: 13, param: "dj.deckB.pitch" },
    { channel: 0, cc: 14, param: "dj.deckB.filterQ" },
    { channel: 0, cc: 15, param: "dj.crossfader" }
  ],
  noteMappings: [
    // Encoder push buttons (if available)
    { channel: 0, note: 0, action: "play_a" },
    { channel: 0, note: 1, action: "cue_a" },
    { channel: 0, note: 2, action: "sync_a" },
    { channel: 0, note: 8, action: "play_b" },
    { channel: 0, note: 9, action: "cue_b" },
    { channel: 0, note: 10, action: "sync_b" }
  ]
};
const DJ_GENERIC_CONTROLLERS = [
  GENERIC_8x8,
  GENERIC_4x16,
  GENERIC_MIXER,
  GENERIC_4DECK,
  GENERIC_TWISTER
];
const PIONEER_DDJ_SB3 = {
  id: "pioneer-ddj-sb3",
  name: "DDJ-SB3",
  manufacturer: "Pioneer DJ",
  description: "2-channel Serato DJ controller",
  ccMappings: [
    // Crossfader
    { channel: 0, cc: 63, param: "dj.crossfader" },
    // Channel faders
    { channel: 0, cc: 19, param: "dj.deckA.volume" },
    { channel: 1, cc: 19, param: "dj.deckB.volume" },
    // Trim/Gain
    { channel: 0, cc: 4, param: "dj.deckA.volume" },
    { channel: 1, cc: 4, param: "dj.deckB.volume" },
    // EQ High
    { channel: 0, cc: 7, param: "dj.deckA.eqHi" },
    { channel: 1, cc: 7, param: "dj.deckB.eqHi" },
    // EQ Mid
    { channel: 0, cc: 11, param: "dj.deckA.eqMid" },
    { channel: 1, cc: 11, param: "dj.deckB.eqMid" },
    // EQ Low
    { channel: 0, cc: 15, param: "dj.deckA.eqLow" },
    { channel: 1, cc: 15, param: "dj.deckB.eqLow" },
    // Filter
    { channel: 0, cc: 23, param: "dj.deckA.filter" },
    { channel: 1, cc: 23, param: "dj.deckB.filter" },
    // Tempo slider
    { channel: 0, cc: 9, param: "dj.deckA.pitch", invert: true },
    { channel: 1, cc: 9, param: "dj.deckB.pitch", invert: true }
  ],
  noteMappings: [
    // Play/Pause
    { channel: 0, note: 11, action: "play_a" },
    { channel: 1, note: 11, action: "play_b" },
    // Cue
    { channel: 0, note: 12, action: "cue_a" },
    { channel: 1, note: 12, action: "cue_b" },
    // Sync
    { channel: 0, note: 88, action: "sync_a" },
    { channel: 1, note: 88, action: "sync_b" },
    // Hot Cues (Performance Pads in Hot Cue mode)
    { channel: 7, note: 0, action: "hotcue1_a" },
    { channel: 7, note: 1, action: "hotcue2_a" },
    { channel: 7, note: 2, action: "hotcue3_a" },
    { channel: 7, note: 3, action: "hotcue4_a" },
    { channel: 7, note: 4, action: "hotcue1_b" },
    { channel: 7, note: 5, action: "hotcue2_b" },
    { channel: 7, note: 6, action: "hotcue3_b" },
    { channel: 7, note: 7, action: "hotcue4_b" }
  ],
  jogMapping: {
    deckA: { channel: 0, cc: 33, touchNote: 54 },
    deckB: { channel: 1, cc: 33, touchNote: 54 }
  }
};
const PIONEER_DDJ_FLX4 = {
  id: "pioneer-ddj-flx4",
  name: "DDJ-FLX4",
  manufacturer: "Pioneer DJ",
  description: "2-channel DJ controller (Serato/rekordbox)",
  ccMappings: [
    { channel: 0, cc: 31, param: "dj.crossfader" },
    { channel: 0, cc: 19, param: "dj.deckA.volume" },
    { channel: 1, cc: 19, param: "dj.deckB.volume" },
    { channel: 0, cc: 7, param: "dj.deckA.eqHi" },
    { channel: 1, cc: 7, param: "dj.deckB.eqHi" },
    { channel: 0, cc: 11, param: "dj.deckA.eqMid" },
    { channel: 1, cc: 11, param: "dj.deckB.eqMid" },
    { channel: 0, cc: 15, param: "dj.deckA.eqLow" },
    { channel: 1, cc: 15, param: "dj.deckB.eqLow" },
    { channel: 0, cc: 23, param: "dj.deckA.filter" },
    { channel: 1, cc: 23, param: "dj.deckB.filter" },
    { channel: 0, cc: 9, param: "dj.deckA.pitch", invert: true },
    { channel: 1, cc: 9, param: "dj.deckB.pitch", invert: true }
  ],
  noteMappings: [
    { channel: 0, note: 11, action: "play_a" },
    { channel: 1, note: 11, action: "play_b" },
    { channel: 0, note: 12, action: "cue_a" },
    { channel: 1, note: 12, action: "cue_b" },
    { channel: 0, note: 88, action: "sync_a" },
    { channel: 1, note: 88, action: "sync_b" },
    { channel: 7, note: 0, action: "hotcue1_a" },
    { channel: 7, note: 1, action: "hotcue2_a" },
    { channel: 7, note: 2, action: "hotcue3_a" },
    { channel: 7, note: 3, action: "hotcue4_a" },
    { channel: 7, note: 4, action: "hotcue1_b" },
    { channel: 7, note: 5, action: "hotcue2_b" },
    { channel: 7, note: 6, action: "hotcue3_b" },
    { channel: 7, note: 7, action: "hotcue4_b" }
  ],
  jogMapping: {
    deckA: { channel: 0, cc: 33, touchNote: 54 },
    deckB: { channel: 1, cc: 33, touchNote: 54 }
  }
};
const PIONEER_DDJ_1000 = {
  id: "pioneer-ddj-1000",
  name: "DDJ-1000",
  manufacturer: "Pioneer DJ",
  description: "4-channel professional DJ controller",
  ccMappings: [
    { channel: 0, cc: 63, param: "dj.crossfader" },
    { channel: 0, cc: 19, param: "dj.deckA.volume" },
    { channel: 1, cc: 19, param: "dj.deckB.volume" },
    { channel: 0, cc: 4, param: "dj.deckA.volume" },
    { channel: 1, cc: 4, param: "dj.deckB.volume" },
    { channel: 0, cc: 7, param: "dj.deckA.eqHi" },
    { channel: 1, cc: 7, param: "dj.deckB.eqHi" },
    { channel: 0, cc: 11, param: "dj.deckA.eqMid" },
    { channel: 1, cc: 11, param: "dj.deckB.eqMid" },
    { channel: 0, cc: 15, param: "dj.deckA.eqLow" },
    { channel: 1, cc: 15, param: "dj.deckB.eqLow" },
    { channel: 0, cc: 23, param: "dj.deckA.filter" },
    { channel: 1, cc: 23, param: "dj.deckB.filter" },
    { channel: 0, cc: 9, param: "dj.deckA.pitch", invert: true },
    { channel: 1, cc: 9, param: "dj.deckB.pitch", invert: true },
    // Master level
    { channel: 0, cc: 25, param: "dj.masterVolume" }
  ],
  noteMappings: [
    { channel: 0, note: 11, action: "play_a" },
    { channel: 1, note: 11, action: "play_b" },
    { channel: 0, note: 12, action: "cue_a" },
    { channel: 1, note: 12, action: "cue_b" },
    { channel: 0, note: 88, action: "sync_a" },
    { channel: 1, note: 88, action: "sync_b" },
    // Hot Cues
    { channel: 7, note: 0, action: "hotcue1_a" },
    { channel: 7, note: 1, action: "hotcue2_a" },
    { channel: 7, note: 2, action: "hotcue3_a" },
    { channel: 7, note: 3, action: "hotcue4_a" },
    { channel: 7, note: 4, action: "hotcue5_a" },
    { channel: 7, note: 5, action: "hotcue6_a" },
    { channel: 7, note: 6, action: "hotcue7_a" },
    { channel: 7, note: 7, action: "hotcue8_a" },
    { channel: 7, note: 8, action: "hotcue1_b" },
    { channel: 7, note: 9, action: "hotcue2_b" },
    { channel: 7, note: 10, action: "hotcue3_b" },
    { channel: 7, note: 11, action: "hotcue4_b" },
    { channel: 7, note: 12, action: "hotcue5_b" },
    { channel: 7, note: 13, action: "hotcue6_b" },
    { channel: 7, note: 14, action: "hotcue7_b" },
    { channel: 7, note: 15, action: "hotcue8_b" }
  ],
  jogMapping: {
    deckA: { channel: 0, cc: 33, touchNote: 54 },
    deckB: { channel: 1, cc: 33, touchNote: 54 }
  }
};
const NUMARK_MIXTRACK_PRO_FX = {
  id: "numark-mixtrack-pro-fx",
  name: "Mixtrack Pro FX",
  manufacturer: "Numark",
  description: "2-channel Serato DJ controller",
  ccMappings: [
    { channel: 0, cc: 26, param: "dj.crossfader" },
    { channel: 0, cc: 23, param: "dj.deckA.volume" },
    { channel: 1, cc: 23, param: "dj.deckB.volume" },
    { channel: 0, cc: 7, param: "dj.deckA.eqHi" },
    { channel: 1, cc: 7, param: "dj.deckB.eqHi" },
    { channel: 0, cc: 11, param: "dj.deckA.eqMid" },
    { channel: 1, cc: 11, param: "dj.deckB.eqMid" },
    { channel: 0, cc: 15, param: "dj.deckA.eqLow" },
    { channel: 1, cc: 15, param: "dj.deckB.eqLow" },
    { channel: 0, cc: 27, param: "dj.deckA.filter" },
    { channel: 1, cc: 27, param: "dj.deckB.filter" },
    { channel: 0, cc: 9, param: "dj.deckA.pitch", invert: true },
    { channel: 1, cc: 9, param: "dj.deckB.pitch", invert: true }
  ],
  noteMappings: [
    { channel: 0, note: 0, action: "play_a" },
    { channel: 1, note: 0, action: "play_b" },
    { channel: 0, note: 1, action: "cue_a" },
    { channel: 1, note: 1, action: "cue_b" },
    { channel: 0, note: 2, action: "sync_a" },
    { channel: 1, note: 2, action: "sync_b" },
    // Pads
    { channel: 0, note: 20, action: "hotcue1_a" },
    { channel: 0, note: 21, action: "hotcue2_a" },
    { channel: 0, note: 22, action: "hotcue3_a" },
    { channel: 0, note: 23, action: "hotcue4_a" },
    { channel: 1, note: 20, action: "hotcue1_b" },
    { channel: 1, note: 21, action: "hotcue2_b" },
    { channel: 1, note: 22, action: "hotcue3_b" },
    { channel: 1, note: 23, action: "hotcue4_b" }
  ],
  jogMapping: {
    deckA: { channel: 0, cc: 22, touchNote: 10 },
    deckB: { channel: 1, cc: 22, touchNote: 10 }
  }
};
const NUMARK_DJ2GO2 = {
  id: "numark-dj2go2",
  name: "DJ2GO2 Touch",
  manufacturer: "Numark",
  description: "Portable 2-channel Serato DJ controller",
  ccMappings: [
    { channel: 0, cc: 8, param: "dj.crossfader" },
    { channel: 0, cc: 9, param: "dj.deckA.pitch", invert: true },
    { channel: 1, cc: 9, param: "dj.deckB.pitch", invert: true },
    { channel: 0, cc: 19, param: "dj.deckA.volume" },
    { channel: 1, cc: 19, param: "dj.deckB.volume" }
  ],
  noteMappings: [
    { channel: 0, note: 7, action: "play_a" },
    { channel: 1, note: 11, action: "play_b" },
    { channel: 0, note: 6, action: "cue_a" },
    { channel: 1, note: 10, action: "cue_b" },
    { channel: 0, note: 5, action: "sync_a" },
    { channel: 1, note: 9, action: "sync_b" }
  ],
  jogMapping: {
    deckA: { channel: 0, cc: 22, touchNote: 16 },
    deckB: { channel: 1, cc: 22, touchNote: 16 }
  }
};
const ROLAND_DJ_202 = {
  id: "roland-dj-202",
  name: "DJ-202",
  manufacturer: "Roland",
  description: "2-channel Serato DJ controller with TR drum machine",
  ccMappings: [
    { channel: 0, cc: 63, param: "dj.crossfader" },
    { channel: 0, cc: 19, param: "dj.deckA.volume" },
    { channel: 1, cc: 19, param: "dj.deckB.volume" },
    { channel: 0, cc: 7, param: "dj.deckA.eqHi" },
    { channel: 1, cc: 7, param: "dj.deckB.eqHi" },
    { channel: 0, cc: 11, param: "dj.deckA.eqMid" },
    { channel: 1, cc: 11, param: "dj.deckB.eqMid" },
    { channel: 0, cc: 15, param: "dj.deckA.eqLow" },
    { channel: 1, cc: 15, param: "dj.deckB.eqLow" },
    { channel: 0, cc: 23, param: "dj.deckA.filter" },
    { channel: 1, cc: 23, param: "dj.deckB.filter" },
    { channel: 0, cc: 9, param: "dj.deckA.pitch", invert: true },
    { channel: 1, cc: 9, param: "dj.deckB.pitch", invert: true }
  ],
  noteMappings: [
    { channel: 0, note: 11, action: "play_a" },
    { channel: 1, note: 11, action: "play_b" },
    { channel: 0, note: 12, action: "cue_a" },
    { channel: 1, note: 12, action: "cue_b" },
    { channel: 0, note: 88, action: "sync_a" },
    { channel: 1, note: 88, action: "sync_b" }
  ],
  jogMapping: {
    deckA: { channel: 0, cc: 33, touchNote: 54 },
    deckB: { channel: 1, cc: 33, touchNote: 54 }
  }
};
const DJ_HARDWARE_PRESETS = [
  PIONEER_DDJ_SB3,
  PIONEER_DDJ_FLX4,
  PIONEER_DDJ_1000,
  NUMARK_MIXTRACK_PRO_FX,
  NUMARK_DJ2GO2,
  ROLAND_DJ_202
];
const DJ_CONTROLLER_PRESETS = [
  ...DJ_HARDWARE_PRESETS,
  ...DJ_GENERIC_CONTROLLERS
];
function getPresetById(id) {
  return DJ_CONTROLLER_PRESETS.find((p) => p.id === id) ?? null;
}
class DJControllerMapper {
  static instance = null;
  activePreset = null;
  handlerRegistered = false;
  // Lookup tables built from preset (for fast message routing)
  ccLookup = /* @__PURE__ */ new Map();
  noteLookup = /* @__PURE__ */ new Map();
  jogCCs = /* @__PURE__ */ new Set();
  // "channel:cc" keys for jog wheel CCs
  jogTouchNotes = /* @__PURE__ */ new Map();
  // "channel:note" → deck
  // Active loop roll state for noteOff handling
  activeLoopRolls = /* @__PURE__ */ new Map();
  // Auto-reconnect state: remember the bound device name so we can re-bind on replug
  boundDeviceName = null;
  boundDeviceConnected = false;
  constructor() {
  }
  static getInstance() {
    if (!DJControllerMapper.instance) {
      DJControllerMapper.instance = new DJControllerMapper();
    }
    return DJControllerMapper.instance;
  }
  /**
   * Activate a controller preset. Builds lookup tables and registers the MIDI handler.
   */
  setPreset(preset) {
    this.activePreset = preset;
    this.ccLookup.clear();
    this.noteLookup.clear();
    this.jogCCs.clear();
    this.jogTouchNotes.clear();
    if (preset) {
      for (const m of preset.ccMappings) {
        this.ccLookup.set(`${m.channel}:${m.cc}`, m);
      }
      for (const m of preset.noteMappings) {
        this.noteLookup.set(`${m.channel}:${m.note}`, m);
      }
      if (preset.jogMapping) {
        const { deckA, deckB } = preset.jogMapping;
        this.jogCCs.add(`${deckA.channel}:${deckA.cc}`);
        this.jogCCs.add(`${deckB.channel}:${deckB.cc}`);
        if (deckA.touchNote !== void 0) {
          this.jogTouchNotes.set(`${deckA.channel}:${deckA.touchNote}`, "A");
        }
        if (deckB.touchNote !== void 0) {
          this.jogTouchNotes.set(`${deckB.channel}:${deckB.touchNote}`, "B");
        }
      }
      this.ensureHandlerRegistered();
    }
  }
  getPreset() {
    return this.activePreset;
  }
  /**
   * Register our MIDI message handler with MIDIManager.
   * Called once — persists across preset changes.
   * Also subscribes to device change events for auto-reconnect.
   */
  ensureHandlerRegistered() {
    if (this.handlerRegistered) return;
    this.handlerRegistered = true;
    const manager = getMIDIManager();
    manager.addMessageHandler((msg) => {
      if (!this.activePreset) return;
      this.handleMessage(msg);
    });
    this.snapshotBoundDevice();
    manager.onDeviceChange(() => {
      this.handleDeviceChange();
    });
  }
  /**
   * Snapshot the currently selected MIDI input device name.
   * Called when the handler is first registered so we know what to reconnect to.
   */
  snapshotBoundDevice() {
    const manager = getMIDIManager();
    const selected = manager.getSelectedInput();
    if (selected) {
      this.boundDeviceName = selected.name;
      this.boundDeviceConnected = true;
    }
  }
  /**
   * Handle MIDI device state changes (connect/disconnect).
   * On disconnect: log warning, keep mapping, mark as disconnected.
   * On reconnect of matching device name: automatically re-bind.
   */
  handleDeviceChange() {
    const manager = getMIDIManager();
    const selected = manager.getSelectedInput();
    if (!this.boundDeviceName && selected) {
      this.boundDeviceName = selected.name;
      this.boundDeviceConnected = true;
      return;
    }
    if (!this.boundDeviceName) return;
    if (this.boundDeviceConnected && !selected) {
      console.warn(`[MIDI] DJ controller disconnected: ${this.boundDeviceName}`);
      this.boundDeviceConnected = false;
      return;
    }
    if (!this.boundDeviceConnected) {
      const inputs = manager.getInputDevices();
      const match = inputs.find((d) => d.name === this.boundDeviceName && d.isConnected);
      if (match) {
        console.log(`[MIDI] DJ controller reconnected: ${match.name} — re-binding`);
        this.boundDeviceConnected = true;
        manager.selectInput(match.id);
      }
    }
  }
  /**
   * Process a MIDI message against the active preset.
   */
  handleMessage(msg) {
    if (msg.type === "cc" && msg.cc !== void 0 && msg.value !== void 0) {
      this.handleCC(msg.channel, msg.cc, msg.value);
    } else if (msg.type === "noteOn" && msg.note !== void 0 && msg.velocity !== void 0) {
      const touchKey = `${msg.channel}:${msg.note}`;
      const touchDeck = this.jogTouchNotes.get(touchKey);
      if (touchDeck) {
        this.handleJogTouch(touchDeck, true);
        return;
      }
      if (msg.velocity > 0) {
        this.handleNote(msg.channel, msg.note);
      }
    } else if (msg.type === "noteOff" && msg.note !== void 0) {
      const touchKey = `${msg.channel}:${msg.note}`;
      const touchDeck = this.jogTouchNotes.get(touchKey);
      if (touchDeck) {
        this.handleJogTouch(touchDeck, false);
      }
      const loopRollKey = `${msg.channel}:${msg.note}`;
      const loopRollState = this.activeLoopRolls.get(loopRollKey);
      if (loopRollState) {
        this.releaseLoopRoll(loopRollKey, loopRollState);
      }
      const noteMapping = this.noteLookup.get(touchKey);
      if ((noteMapping == null ? void 0 : noteMapping.action) === "ptt") {
        useVocoderStore.getState().setPTT(false);
      }
    }
  }
  /**
   * Handle a CC message — route to DJ parameter or jog wheel.
   */
  handleCC(channel, cc, value) {
    var _a;
    const key = `${channel}:${cc}`;
    if (this.jogCCs.has(key) && ((_a = this.activePreset) == null ? void 0 : _a.jogMapping)) {
      const isA = this.activePreset.jogMapping.deckA.channel === channel && this.activePreset.jogMapping.deckA.cc === cc;
      this.handleJogSpin(isA ? "A" : "B", value);
      return;
    }
    const mapping = this.ccLookup.get(key);
    if (!mapping) return;
    if (mapping.param === "tracker_fader_gain") {
      this.executeTrackerScratchAction("tracker_fader_gain", value);
      return;
    }
    let normalized = value / 127;
    if (mapping.invert) normalized = 1 - normalized;
    routeDJParameter(mapping.param, normalized);
    this.syncParamToStore(mapping.param, normalized);
  }
  /**
   * Handle a note-on message — trigger a DJ action.
   */
  handleNote(channel, note) {
    const key = `${channel}:${note}`;
    const mapping = this.noteLookup.get(key);
    if (!mapping) return;
    if (mapping.action.startsWith("loop_roll_")) {
      this.executeDJAction(mapping.action, key);
    } else {
      this.executeDJAction(mapping.action);
    }
  }
  /**
   * Execute a named DJ action (play, cue, sync, hot cue, etc.)
   * @param noteKey - Optional MIDI note key for tracking loop rolls
   */
  executeDJAction(action, noteKey) {
    var _a, _b;
    if (action.startsWith("tracker_")) {
      this.executeTrackerScratchAction(action);
      return;
    }
    if (action === "ptt") {
      useVocoderStore.getState().setPTT(true);
      return;
    }
    if (!isDJContext()) return;
    try {
      const engine = getDJEngine();
      const store = useDJStore.getState();
      switch (action) {
        // ── Transport ──────────────────────────────────────────────
        case "play_a": {
          if (engine.deckA.isPlaying()) {
            engine.deckA.pause();
            store.setDeckPlaying("A", false);
          } else {
            engine.deckA.play();
            store.setDeckPlaying("A", true);
          }
          break;
        }
        case "play_b": {
          if (engine.deckB.isPlaying()) {
            engine.deckB.pause();
            store.setDeckPlaying("B", false);
          } else {
            engine.deckB.play();
            store.setDeckPlaying("B", true);
          }
          break;
        }
        case "cue_a": {
          const cuePoint = store.decks.A.cuePoint;
          engine.deckA.cue(cuePoint);
          break;
        }
        case "cue_b": {
          const cuePoint = store.decks.B.cuePoint;
          engine.deckB.cue(cuePoint);
          break;
        }
        case "sync_a": {
          try {
            const semitones = DJBeatSync.syncBPM(engine.deckB, engine.deckA);
            store.setDeckPitch("A", semitones);
          } catch {
          }
          break;
        }
        case "sync_b": {
          try {
            const semitones = DJBeatSync.syncBPM(engine.deckA, engine.deckB);
            store.setDeckPitch("B", semitones);
          } catch {
          }
          break;
        }
        // ── Loop Controls ──────────────────────────────────────────
        case "loop_a": {
          store.toggleLoop("A");
          break;
        }
        case "loop_b": {
          store.toggleLoop("B");
          break;
        }
        // ── Loop Rolls (momentary loops) ───────────────────────────
        case "loop_roll_4_a":
        case "loop_roll_8_a":
        case "loop_roll_16_a":
        case "loop_roll_32_a": {
          const size = parseInt(((_a = action.match(/\d+/)) == null ? void 0 : _a[0]) || "4");
          this.activateLoopRoll("A", size, noteKey);
          break;
        }
        case "loop_roll_4_b":
        case "loop_roll_8_b":
        case "loop_roll_16_b":
        case "loop_roll_32_b": {
          const size = parseInt(((_b = action.match(/\d+/)) == null ? void 0 : _b[0]) || "4");
          this.activateLoopRoll("B", size, noteKey);
          break;
        }
        // ── Beat Jump ──────────────────────────────────────────────
        case "beatjump_back_a": {
          this.beatJump("A", -4);
          break;
        }
        case "beatjump_fwd_a": {
          this.beatJump("A", 4);
          break;
        }
        case "beatjump_back_b": {
          this.beatJump("B", -4);
          break;
        }
        case "beatjump_fwd_b": {
          this.beatJump("B", 4);
          break;
        }
        // ── PFL (Headphone Cue) ────────────────────────────────────
        case "pfl_a": {
          store.togglePFL("A");
          break;
        }
        case "pfl_b": {
          store.togglePFL("B");
          break;
        }
        // ── Quantized FX ───────────────────────────────────────────
        case "fx_echo_a":
        case "fx_reverb_a":
        case "fx_delay_a":
        case "fx_flanger_a": {
          const fxType = action.replace("fx_", "").replace("_a", "");
          this.triggerQuantizedFX("A", fxType);
          break;
        }
        case "fx_echo_b":
        case "fx_reverb_b":
        case "fx_delay_b":
        case "fx_flanger_b": {
          const fxType = action.replace("fx_", "").replace("_b", "");
          this.triggerQuantizedFX("B", fxType);
          break;
        }
        default: {
          const hotcueMatch = action.match(/^hotcue(\d)_([ab])$/);
          if (hotcueMatch) {
            const cueIndex = parseInt(hotcueMatch[1]) - 1;
            const deckId = hotcueMatch[2].toUpperCase();
            const cuePoints = store.decks[deckId].seratoCuePoints;
            const cue = cuePoints.find((c) => c.index === cueIndex);
            if (cue) {
              const deck = engine.getDeck(deckId);
              if (deck.playbackMode === "audio") {
                deck.audioPlayer.seek(cue.position / 1e3);
                store.setDeckState(deckId, {
                  audioPosition: cue.position / 1e3,
                  elapsedMs: cue.position
                });
              }
            }
          }
        }
      }
    } catch {
    }
  }
  /**
   * Execute tracker scratch actions (fader cut, pattern toggles).
   * These work without DJ engine — they use TrackerScratchController directly.
   */
  executeTrackerScratchAction(action, midiValue) {
    const ctrl = getTrackerScratchController();
    switch (action) {
      case "tracker_fader_cut":
        ctrl.setFaderCut(true);
        setTimeout(() => ctrl.setFaderCut(false), 50);
        break;
      case "tracker_fader_cut_on":
        ctrl.setFaderCut(true);
        break;
      case "tracker_fader_cut_off":
        ctrl.setFaderCut(false);
        break;
      case "tracker_scratch_trans":
        ctrl.toggleFaderPattern("Transformer");
        break;
      case "tracker_scratch_crab":
        ctrl.toggleFaderPattern("Crab");
        break;
      case "tracker_scratch_flare":
        ctrl.toggleFaderPattern("Flare");
        break;
      case "tracker_scratch_chirp":
        ctrl.toggleFaderPattern("Chirp");
        break;
      case "tracker_scratch_stab":
        ctrl.toggleFaderPattern("Stab");
        break;
      case "tracker_scratch_8crab":
        ctrl.toggleFaderPattern("8-Finger Crab");
        break;
      case "tracker_scratch_twdl":
        ctrl.toggleFaderPattern("Twiddle");
        break;
      case "tracker_scratch_stop":
        ctrl.stopFaderPattern();
        break;
      case "tracker_fader_gain": {
        const gain = (midiValue ?? 0) / 127;
        ctrl.setFaderGain(gain);
        break;
      }
    }
  }
  /**
   * Handle jog wheel touch on/off — starts/stops scratch mode.
   * Routes to DJ engine in DJ context, or tracker turntable physics otherwise.
   */
  handleJogTouch(deckId, touching) {
    if (isDJContext()) {
      try {
        const deck = getDJEngine().getDeck(deckId);
        if (touching) {
          deck.startScratch();
          useDJStore.getState().setDeckScratchActive(deckId, true);
        } else {
          deck.stopScratch();
          useDJStore.getState().setDeckScratchActive(deckId, false);
        }
      } catch {
      }
    } else {
      getTrackerScratchController().onMidiJogTouch(touching);
    }
  }
  /**
   * Handle jog wheel spin CC — converts relative CC to scratch velocity.
   *
   * Most DJ controllers send relative values:
   *   0-63 = clockwise (forward), 65-127 = counter-clockwise (backward)
   *   64 = no movement (some controllers), value distance from 64 = speed
   */
  handleJogSpin(deckId, value) {
    const store = useDJStore.getState();
    const sensitivity = store.jogWheelSensitivity || 1;
    let velocity;
    if (value <= 63) {
      velocity = value / 63;
    } else {
      velocity = -(128 - value) / 63;
    }
    velocity *= 2 * sensitivity;
    if (isDJContext()) {
      try {
        const deck = getDJEngine().getDeck(deckId);
        deck.setScratchVelocity(velocity);
      } catch {
      }
    } else {
      const ctrl = getTrackerScratchController();
      const isTouching = ctrl.turntable.touching;
      ctrl.onMidiJogSpin(value, isTouching);
    }
  }
  /**
   * Sync DJ parameter changes back to the Zustand store for UI feedback.
   */
  syncParamToStore(param, normalized) {
    const store = useDJStore.getState();
    switch (param) {
      case "dj.crossfader":
        store.setCrossfader(normalized);
        break;
      case "dj.deckA.volume":
        store.setDeckVolume("A", normalized * 1.5);
        break;
      case "dj.deckB.volume":
        store.setDeckVolume("B", normalized * 1.5);
        break;
      case "dj.masterVolume":
        store.setMasterVolume(normalized * 1.5);
        break;
      case "dj.deckA.pitch":
        store.setDeckPitch("A", -6 + normalized * 12);
        break;
      case "dj.deckB.pitch":
        store.setDeckPitch("B", -6 + normalized * 12);
        break;
      case "dj.deckA.eqHi":
        store.setDeckEQ("A", "high", -24 + normalized * 30);
        break;
      case "dj.deckA.eqMid":
        store.setDeckEQ("A", "mid", -24 + normalized * 30);
        break;
      case "dj.deckA.eqLow":
        store.setDeckEQ("A", "low", -24 + normalized * 30);
        break;
      case "dj.deckB.eqHi":
        store.setDeckEQ("B", "high", -24 + normalized * 30);
        break;
      case "dj.deckB.eqMid":
        store.setDeckEQ("B", "mid", -24 + normalized * 30);
        break;
      case "dj.deckB.eqLow":
        store.setDeckEQ("B", "low", -24 + normalized * 30);
        break;
      case "dj.deckA.filter":
        store.setDeckFilter("A", -1 + normalized * 2);
        break;
      case "dj.deckB.filter":
        store.setDeckFilter("B", -1 + normalized * 2);
        break;
    }
  }
  /**
   * Activate a momentary loop roll (auto-releases when pad is released).
   * Loop roll is a performance technique where a small loop plays momentarily
   * then resumes normal playback.
   * @param noteKey - Optional MIDI note key for tracking state on noteOff
   */
  activateLoopRoll(deckId, beats, noteKey) {
    const store = useDJStore.getState();
    const wasLooping = store.decks[deckId].loopActive;
    const prevSize = store.decks[deckId].lineLoopSize;
    store.setLineLoopSize(deckId, beats);
    if (!wasLooping) {
      store.toggleLoop(deckId);
    }
    if (noteKey) {
      const existing = this.activeLoopRolls.get(noteKey);
      if (existing == null ? void 0 : existing.timeoutId) {
        clearTimeout(existing.timeoutId);
      }
      const timeoutId = setTimeout(() => {
        const state = this.activeLoopRolls.get(noteKey);
        if (state) {
          this.releaseLoopRoll(noteKey, state);
        }
      }, 50);
      this.activeLoopRolls.set(noteKey, {
        deckId,
        prevLooping: wasLooping,
        prevSize,
        timeoutId
      });
    } else {
      setTimeout(() => {
        if (!wasLooping) {
          store.toggleLoop(deckId);
        }
        store.setLineLoopSize(deckId, prevSize);
      }, 50);
    }
  }
  /**
   * Release a loop roll immediately (called on MIDI noteOff).
   */
  releaseLoopRoll(noteKey, state) {
    if (state.timeoutId) {
      clearTimeout(state.timeoutId);
    }
    const store = useDJStore.getState();
    if (!state.prevLooping) {
      store.toggleLoop(state.deckId);
    }
    store.setLineLoopSize(state.deckId, state.prevSize);
    this.activeLoopRolls.delete(noteKey);
  }
  /**
   * Jump forward/backward by beat grid.
   * Uses DJBeatJump engine to snap to nearest beat.
   */
  beatJump(deckId, beats) {
    try {
      const engine = getDJEngine();
      const deck = engine.getDeck(deckId);
      const store = useDJStore.getState();
      const deckState = store.decks[deckId];
      const beatsPerSecond = deckState.effectiveBPM / 60;
      const secondsToJump = beats / beatsPerSecond;
      const newPosition = deckState.audioPosition + secondsToJump;
      const clampedPosition = Math.max(0, Math.min(newPosition, deckState.durationMs / 1e3));
      if (deck.playbackMode === "audio") {
        deck.audioPlayer.seek(clampedPosition);
        store.setDeckState(deckId, {
          audioPosition: clampedPosition,
          elapsedMs: clampedPosition * 1e3
        });
      }
    } catch {
    }
  }
  /**
   * Trigger quantized FX (echo, reverb, delay, flanger).
   * FX are beat-synced to the current BPM.
   */
  async triggerQuantizedFX(deckId, fxType) {
    try {
      switch (fxType) {
        case "echo": {
          const { echoOut } = await __vitePreload(async () => {
            const { echoOut: echoOut2 } = await import("./main-BbV5VyEH.js").then((n) => n.je);
            return { echoOut: echoOut2 };
          }, true ? __vite__mapDeps([1,2,3,4,5,6,7]) : void 0);
          echoOut(deckId, 4);
          break;
        }
        case "reverb": {
          const { filterSweep } = await __vitePreload(async () => {
            const { filterSweep: filterSweep2 } = await import("./main-BbV5VyEH.js").then((n) => n.je);
            return { filterSweep: filterSweep2 };
          }, true ? __vite__mapDeps([1,2,3,4,5,6,7]) : void 0);
          filterSweep(deckId, 0.8, 4);
          break;
        }
        case "delay": {
          const { filterSweep } = await __vitePreload(async () => {
            const { filterSweep: filterSweep2 } = await import("./main-BbV5VyEH.js").then((n) => n.je);
            return { filterSweep: filterSweep2 };
          }, true ? __vite__mapDeps([1,2,3,4,5,6,7]) : void 0);
          filterSweep(deckId, -0.6, 2, () => {
            filterSweep(deckId, 0, 2);
          });
          break;
        }
        case "flanger": {
          const { filterSweep } = await __vitePreload(async () => {
            const { filterSweep: filterSweep2 } = await import("./main-BbV5VyEH.js").then((n) => n.je);
            return { filterSweep: filterSweep2 };
          }, true ? __vite__mapDeps([1,2,3,4,5,6,7]) : void 0);
          filterSweep(deckId, 0.5, 1, () => {
            filterSweep(deckId, -0.5, 1, () => {
              filterSweep(deckId, 0, 1);
            });
          });
          break;
        }
        default:
          console.log(`Unknown FX type: ${fxType}`);
      }
    } catch (err) {
      console.warn(`[DJControllerMapper] Failed to trigger quantized FX: ${fxType}`, err);
    }
  }
}
function getDJControllerMapper() {
  return DJControllerMapper.getInstance();
}
const STUN_SERVERS = [
  { urls: "stun:stun.l.google.com:19302" },
  { urls: "stun:stun1.l.google.com:19302" }
];
class DJRemoteMicReceiver {
  ws = null;
  pc = null;
  remoteSource = null;
  remoteGain = null;
  roomCode = null;
  onStatusChange;
  /**
   * Create a room and wait for the controller to join.
   * Returns the room code for display/QR generation.
   */
  async createRoom(signalingPort = 4002) {
    return new Promise((resolve, reject) => {
      const url = `ws://localhost:${signalingPort}`;
      this.ws = new WebSocket(url);
      this.ws.onopen = () => {
        this.ws.send(JSON.stringify({ type: "create_room" }));
      };
      this.ws.onmessage = async (e) => {
        var _a, _b, _c, _d;
        const msg = JSON.parse(e.data);
        switch (msg.type) {
          case "room_created":
            this.roomCode = msg.roomCode;
            (_a = this.onStatusChange) == null ? void 0 : _a.call(this, "waiting");
            console.log(`[RemoteMic] Room created: ${msg.roomCode}`);
            resolve(msg.roomCode);
            break;
          case "peer_joined":
            console.log("[RemoteMic] Controller peer joined");
            break;
          case "offer":
            await this.handleOffer(msg.sdp);
            break;
          case "answer":
            await ((_b = this.pc) == null ? void 0 : _b.setRemoteDescription(msg.sdp));
            break;
          case "ice_candidate":
            await ((_c = this.pc) == null ? void 0 : _c.addIceCandidate(msg.candidate));
            break;
          case "peer_left":
            console.log("[RemoteMic] Controller disconnected");
            this.cleanupPeerConnection();
            (_d = this.onStatusChange) == null ? void 0 : _d.call(this, "waiting");
            break;
          case "error":
            console.error("[RemoteMic] Signaling error:", msg.message);
            reject(new Error(msg.message));
            break;
        }
      };
      this.ws.onerror = () => reject(new Error("Cannot reach signaling server"));
      this.ws.onclose = () => {
        var _a;
        (_a = this.onStatusChange) == null ? void 0 : _a.call(this, "disconnected");
      };
    });
  }
  /** Handle WebRTC offer from controller */
  async handleOffer(sdp) {
    var _a;
    this.pc = new RTCPeerConnection({ iceServers: STUN_SERVERS });
    this.pc.onicecandidate = (e) => {
      var _a2;
      if (e.candidate) {
        (_a2 = this.ws) == null ? void 0 : _a2.send(JSON.stringify({ type: "ice_candidate", candidate: e.candidate.toJSON() }));
      }
    };
    this.pc.ontrack = (e) => {
      var _a2;
      if (e.track.kind === "audio") {
        console.log("[RemoteMic] Received audio track from controller");
        this.routeRemoteAudio(e.streams[0]);
        (_a2 = this.onStatusChange) == null ? void 0 : _a2.call(this, "connected");
      }
    };
    await this.pc.setRemoteDescription(sdp);
    const answer = await this.pc.createAnswer();
    await this.pc.setLocalDescription(answer);
    (_a = this.ws) == null ? void 0 : _a.send(JSON.stringify({ type: "answer", sdp: this.pc.localDescription }));
  }
  /** Route the received audio stream to the DJ mixer */
  routeRemoteAudio(stream) {
    const ctx = getContext().rawContext;
    this.remoteSource = ctx.createMediaStreamSource(stream);
    this.remoteGain = ctx.createGain();
    this.remoteGain.gain.value = 1;
    this.remoteSource.connect(this.remoteGain);
    const engine = getDJEngineIfActive();
    if (engine) {
      this.remoteGain.connect(engine.mixer.samplerInput);
      console.log("[RemoteMic] Audio routed to DJ mixer samplerInput");
    } else {
      this.remoteGain.connect(ctx.destination);
      console.log("[RemoteMic] Audio routed to audioContext.destination (no DJ engine)");
    }
  }
  /** Set the remote mic volume */
  setGain(value) {
    if (this.remoteGain) {
      this.remoteGain.gain.value = Math.max(0, Math.min(2, value));
    }
  }
  cleanupPeerConnection() {
    var _a, _b, _c;
    (_a = this.remoteSource) == null ? void 0 : _a.disconnect();
    (_b = this.remoteGain) == null ? void 0 : _b.disconnect();
    (_c = this.pc) == null ? void 0 : _c.close();
    this.remoteSource = null;
    this.remoteGain = null;
    this.pc = null;
  }
  /** Shut down everything */
  disconnect() {
    var _a, _b;
    this.cleanupPeerConnection();
    (_a = this.ws) == null ? void 0 : _a.close();
    this.ws = null;
    this.roomCode = null;
    (_b = this.onStatusChange) == null ? void 0 : _b.call(this, "disconnected");
  }
}
const LOOP_SIZES = [1, 2, 4, 8, 16, 32];
function useDJKeyboardHandler() {
  const handleKeyDown = reactExports.useCallback((_normalized, originalEvent) => {
    const e = originalEvent;
    const engine = getDJEngine();
    const store = useDJStore.getState();
    const shift = e.shiftKey;
    const toggleEQKill = (deckId, band) => {
      const killKey = `eq${band.charAt(0).toUpperCase() + band.slice(1)}Kill`;
      const current = store.decks[deckId][killKey];
      const newKill = !current;
      store.setDeckEQKill(deckId, band, newKill);
      if (getQuantizeMode() !== "off") {
        quantizedEQKill(deckId, band, newKill);
      } else {
        instantEQKill(deckId, band, newKill);
      }
    };
    let handled = true;
    if (e.ctrlKey || e.metaKey) {
      const key = e.key.toLowerCase();
      switch (key) {
        // Beat jump Deck A: Ctrl+Z/X/C/V = -16/-4/+4/+16 beats
        case "z":
          beatJump("A", -16);
          break;
        case "x":
          beatJump("A", -4);
          break;
        case "c":
          beatJump("A", 4);
          break;
        case "v":
          beatJump("A", 16);
          break;
        // Beat jump Deck B: Ctrl+M/,/./;
        case "m":
          beatJump("B", -16);
          break;
        case ",":
          beatJump("B", -4);
          break;
        case ".":
          beatJump("B", 4);
          break;
        case "/":
          beatJump("B", 16);
          break;
        // Serato loop Deck A: Ctrl+1-4
        case "1":
          activateSeratoLoop("A", 0);
          break;
        case "2":
          activateSeratoLoop("A", 1);
          break;
        case "3":
          activateSeratoLoop("A", 2);
          break;
        case "4":
          activateSeratoLoop("A", 3);
          break;
        // Serato loop Deck B: Ctrl+7-0
        case "7":
          activateSeratoLoop("B", 0);
          break;
        case "8":
          activateSeratoLoop("B", 1);
          break;
        case "9":
          activateSeratoLoop("B", 2);
          break;
        case "0":
          activateSeratoLoop("B", 3);
          break;
        default:
          handled = false;
      }
      if (handled) {
        return true;
      }
      handled = true;
    }
    switch (e.key.toLowerCase()) {
      // ================================================================
      // DECK A (left hand)
      // ================================================================
      case "q":
        togglePlay("A");
        break;
      case "w":
        if (shift) {
          store.setDeckPitch("A", store.decks.A.pitchOffset + 1);
        } else {
          cueDeck("A", store.decks.A.cuePoint);
        }
        break;
      case "e":
        cueDeck("A", store.decks.A.songPos + 1);
        break;
      case "r":
        store.setDeckCuePoint("A", engine.deckA.replayer.getSongPos());
        break;
      case "a":
        nudgeDeck("A", shift ? -5 : -2, shift ? 16 : 8);
        break;
      case "d":
        nudgeDeck("A", shift ? 5 : 2, shift ? 16 : 8);
        break;
      case "s":
        if (shift) {
          store.setDeckPitch("A", store.decks.A.pitchOffset - 1);
        } else {
          store.setDeckPitch("A", 0);
        }
        break;
      case "z":
        if (store.decks.A.loopActive) {
          clearDeckLineLoop("A");
          store.setDeckLoop("A", "off", false);
        } else {
          setDeckLineLoop("A", store.decks.A.lineLoopSize);
          store.setDeckLoop("A", "line", true);
        }
        break;
      case "x": {
        const idx = LOOP_SIZES.indexOf(store.decks.A.lineLoopSize);
        if (idx > 0) {
          const newSize = LOOP_SIZES[idx - 1];
          store.setDeckLoopSize("A", newSize);
          if (store.decks.A.loopActive) setDeckLineLoop("A", newSize);
        }
        break;
      }
      case "c": {
        const idx = LOOP_SIZES.indexOf(store.decks.A.lineLoopSize);
        if (idx < LOOP_SIZES.length - 1) {
          const newSize = LOOP_SIZES[idx + 1];
          store.setDeckLoopSize("A", newSize);
          if (store.decks.A.loopActive) setDeckLineLoop("A", newSize);
        }
        break;
      }
      case "1":
      case "2":
      case "3":
      case "4": {
        const ch = parseInt(e.key) - 1;
        if (shift) {
          store.setAllDeckChannels("A", false);
          store.toggleDeckChannel("A", ch);
        } else {
          store.toggleDeckChannel("A", ch);
        }
        break;
      }
      case "5":
        store.setAllDeckChannels("A", true);
        break;
      case "tab":
        e.preventDefault();
        store.setDeckState("A", { repitchLock: !store.decks.A.repitchLock });
        break;
      // ================================================================
      // DECK B (right hand)
      // ================================================================
      case "p":
        togglePlay("B");
        break;
      case "o":
        if (shift) {
          store.setDeckPitch("B", store.decks.B.pitchOffset + 1);
        } else {
          cueDeck("B", store.decks.B.cuePoint);
        }
        break;
      case "i":
        cueDeck("B", store.decks.B.songPos + 1);
        break;
      case "u":
        store.setDeckCuePoint("B", engine.deckB.replayer.getSongPos());
        break;
      case "j":
        nudgeDeck("B", shift ? -5 : -2, shift ? 16 : 8);
        break;
      case "l":
        nudgeDeck("B", shift ? 5 : 2, shift ? 16 : 8);
        break;
      case "k":
        if (shift) {
          store.setDeckPitch("B", store.decks.B.pitchOffset - 1);
        } else {
          store.setDeckPitch("B", 0);
        }
        break;
      case "m":
        if (store.decks.B.loopActive) {
          clearDeckLineLoop("B");
          store.setDeckLoop("B", "off", false);
        } else {
          setDeckLineLoop("B", store.decks.B.lineLoopSize);
          store.setDeckLoop("B", "line", true);
        }
        break;
      case ",": {
        const idx = LOOP_SIZES.indexOf(store.decks.B.lineLoopSize);
        if (idx > 0) {
          const newSize = LOOP_SIZES[idx - 1];
          store.setDeckLoopSize("B", newSize);
          if (store.decks.B.loopActive) setDeckLineLoop("B", newSize);
        }
        break;
      }
      case ".": {
        const idx = LOOP_SIZES.indexOf(store.decks.B.lineLoopSize);
        if (idx < LOOP_SIZES.length - 1) {
          const newSize = LOOP_SIZES[idx + 1];
          store.setDeckLoopSize("B", newSize);
          if (store.decks.B.loopActive) setDeckLineLoop("B", newSize);
        }
        break;
      }
      case "7":
      case "8":
      case "9":
      case "0": {
        const chMap = { "7": 0, "8": 1, "9": 2, "0": 3 };
        const ch = chMap[e.key];
        if (shift) {
          store.setAllDeckChannels("B", false);
          store.toggleDeckChannel("B", ch);
        } else {
          store.toggleDeckChannel("B", ch);
        }
        break;
      }
      case "-":
        store.setAllDeckChannels("B", true);
        break;
      case "\\":
        store.setDeckState("B", { repitchLock: !store.decks.B.repitchLock });
        break;
      // ================================================================
      // GLOBAL
      // ================================================================
      case " ":
        e.preventDefault();
        setCrossfader(0.5);
        break;
      case "f":
        setCrossfader(Math.max(0, store.crossfaderPosition - 0.05));
        break;
      case "g":
        setCrossfader(Math.min(1, store.crossfaderPosition + 0.05));
        break;
      case "t":
        {
          const stateA = store.decks.A;
          const stateB = store.decks.B;
          if (stateA.beatGrid && stateB.beatGrid) {
            const semitones = syncBPMToOther("B", "A");
            phaseAlign("B", "A", "beat");
            store.setDeckPitch("B", semitones);
          } else {
            const semitones = DJBeatSync.syncBPM(engine.deckA, engine.deckB);
            store.setDeckPitch("B", semitones);
          }
        }
        break;
      case "`":
        killAllDecks();
        break;
      case "f1":
        e.preventDefault();
        store.setDeckPFL("A", !store.decks.A.pflEnabled);
        break;
      case "f2":
        e.preventDefault();
        store.setDeckPFL("B", !store.decks.B.pflEnabled);
        break;
      case "f4":
        e.preventDefault();
        {
          const newSlip = !store.decks.A.slipEnabled;
          store.setDeckSlip("A", newSlip);
          setDeckSlipEnabled("A", newSlip);
        }
        break;
      // ================================================================
      // FX — DECK A (bottom row)
      // ================================================================
      case "v":
        toggleEQKill("A", "low");
        break;
      case "b":
        toggleEQKill("A", "mid");
        break;
      case "n":
        toggleEQKill("A", "high");
        break;
      // ================================================================
      // FX — DECK B
      // ================================================================
      case "/":
        toggleEQKill("B", "low");
        break;
      case ";":
        toggleEQKill("B", "mid");
        break;
      case "'":
        toggleEQKill("B", "high");
        break;
      // ================================================================
      // FX — GLOBAL
      // ================================================================
      case "h": {
        const modes = ["off", "beat", "bar"];
        const idx = modes.indexOf(getQuantizeMode());
        setQuantizeMode(modes[(idx + 1) % modes.length]);
        break;
      }
      case "y": {
        if (store.decks.A.beatGrid && store.decks.B.beatGrid) {
          const sem = syncBPMToOther("A", "B");
          phaseAlign("A", "B", "beat");
          store.setDeckPitch("A", sem);
        } else {
          const sem = DJBeatSync.syncBPM(engine.deckB, engine.deckA);
          store.setDeckPitch("A", sem);
        }
        break;
      }
      // ================================================================
      // HOT CUES — F5-F8 = Deck A cues 1-4, F9-F12 = Deck B cues 1-4
      // Shift+F5-F8 = Deck A cues 5-8, Shift+F9-F12 = Deck B cues 5-8
      // ================================================================
      case "f5":
        e.preventDefault();
        triggerHotCue("A", shift ? 4 : 0);
        break;
      case "f6":
        e.preventDefault();
        triggerHotCue("A", shift ? 5 : 1);
        break;
      case "f7":
        e.preventDefault();
        triggerHotCue("A", shift ? 6 : 2);
        break;
      case "f8":
        e.preventDefault();
        triggerHotCue("A", shift ? 7 : 3);
        break;
      case "f9":
        e.preventDefault();
        triggerHotCue("B", shift ? 4 : 0);
        break;
      case "f10":
        e.preventDefault();
        triggerHotCue("B", shift ? 5 : 1);
        break;
      case "f11":
        e.preventDefault();
        triggerHotCue("B", shift ? 6 : 2);
        break;
      case "f12":
        e.preventDefault();
        triggerHotCue("B", shift ? 7 : 3);
        break;
      default:
        handled = false;
    }
    return handled;
  }, []);
  reactExports.useEffect(() => {
    const unregister = registerViewHandler("dj", handleKeyDown);
    return unregister;
  }, [handleKeyDown]);
}
function useDeckStateSync(deckId) {
  const animFrameRef = reactExports.useRef(0);
  reactExports.useEffect(() => {
    let running = true;
    let lastPoll = 0;
    const POLL_INTERVAL = 50;
    const poll = () => {
      if (!running) return;
      const now = performance.now();
      if (now - lastPoll < POLL_INTERVAL) {
        animFrameRef.current = requestAnimationFrame(poll);
        return;
      }
      lastPoll = now;
      try {
        const engine = getDJEngine();
        const deck = engine.getDeck(deckId);
        const store = useDJStore.getState();
        if (deck.playbackMode === "audio") {
          const isEngPlaying = deck.audioPlayer.isCurrentlyPlaying();
          const isStorePlaying = store.decks[deckId].isPlaying;
          if ((isEngPlaying || isStorePlaying) && !isSeekActive(deckId)) {
            const pos = deck.audioPlayer.getPosition();
            const dur = deck.audioPlayer.getDuration();
            const update = {
              audioPosition: pos,
              elapsedMs: pos * 1e3,
              durationMs: dur * 1e3
            };
            const tp = deck.getPositionAtTime(pos * 1e3);
            if (tp) {
              update.songPos = tp.songPos;
              update.pattPos = tp.pattPos;
            }
            store.setDeckState(deckId, update);
          }
          if (!isEngPlaying && isStorePlaying) {
            const autoDJActive = store.autoDJEnabled && store.autoDJStatus !== "idle";
            const scratchActive = deck.isScratchActive;
            if (!autoDJActive && !scratchActive) {
              store.setDeckPlaying(deckId, false);
            }
          }
        } else {
          const replayer = deck.replayer;
          if (replayer.isPlaying()) {
            store.setDeckPosition(deckId, replayer.getSongPos(), replayer.getPattPos());
            if (deck.isPatternActive()) {
              const { velocity, faderGain } = deck.getScratchState();
              const prevV = store.decks[deckId].scratchVelocity;
              const prevF = store.decks[deckId].scratchFaderGain;
              const update = {};
              if (Math.abs(velocity - prevV) > 0.05) update.scratchVelocity = velocity;
              if (faderGain !== prevF) update.scratchFaderGain = faderGain;
              if (Object.keys(update).length > 0) {
                store.setDeckState(deckId, update);
              }
            } else {
              const liveBPM = Math.round(replayer.getBPM() * replayer.getTempoMultiplier() * 100) / 100;
              store.setDeckState(deckId, {
                elapsedMs: replayer.getElapsedMs(),
                effectiveBPM: liveBPM
              });
              try {
                deck.notifyBPMChange(liveBPM);
              } catch {
              }
              const lfoDiv = store.decks[deckId].faderLFODivision;
              if (store.decks[deckId].faderLFOActive && lfoDiv) {
                const divBeats = { "1/4": 1, "1/8": 0.5, "1/16": 0.25, "1/32": 0.125 };
                const periodMs = 6e4 / liveBPM * (divBeats[lfoDiv] ?? 1);
                const elapsed = replayer.getElapsedMs();
                const posInPeriod = elapsed % periodMs;
                const lfoFaderGain = posInPeriod < periodMs * 0.5 ? 1 : 0;
                if (lfoFaderGain !== store.decks[deckId].scratchFaderGain) {
                  store.setDeckState(deckId, { scratchFaderGain: lfoFaderGain });
                }
              } else if (store.decks[deckId].scratchVelocity !== 0 || store.decks[deckId].scratchFaderGain !== 1) {
                store.setDeckState(deckId, { scratchVelocity: 0, scratchFaderGain: 1 });
              }
            }
          }
          if (!deck.isPatternActive() && store.decks[deckId].activePatternName !== null) {
            store.setDeckPattern(deckId, null);
          }
        }
      } catch {
      }
      animFrameRef.current = requestAnimationFrame(poll);
    };
    animFrameRef.current = requestAnimationFrame(poll);
    return () => {
      running = false;
      cancelAnimationFrame(animFrameRef.current);
    };
  }, [deckId]);
}
export {
  DJVideoRecorder as D,
  autoDetectSeratoLibrary as a,
  beatJump as b,
  getDJControllerMapper as c,
  DJ_CONTROLLER_PRESETS as d,
  DJRemoteMicReceiver as e,
  useDJKeyboardHandler as f,
  getPresetById as g,
  useDeckStateSync as h,
  isUADECached as i,
  DJUADEPrerender as j,
  loadUADEToDeck as l,
  markSeek as m,
  pickAndReadSeratoLibrary as p,
  useDeckVisualizationData as u
};
