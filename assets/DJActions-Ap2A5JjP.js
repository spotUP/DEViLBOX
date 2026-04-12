const __vite__mapDeps=(i,m=__vite__mapDeps,d=(m.f||(m.f=["assets/main-BbV5VyEH.js","assets/client-DHYdgbIN.js","assets/vendor-ui-AJ7AT9BN.js","assets/vendor-react-Dgd_wxYf.js","assets/vendor-utils-a-Usm5Xm.js","assets/vendor-tone-48TQc1H3.js","assets/main-c6CPs1E0.css","assets/DJSetRecorder-BgnmRf83.js"])))=>i.map(i=>d[i]);
import { b as useDJStore, ei as autoMatchOnLoad, at as getDJEngineIfActive, dD as getDJEngine, am as __vitePreload, as as useAudioStore, u as useDJPlaylistStore, ej as beatMatchedTransition, ek as bassSwapTransition, el as filterBuildTransition, em as echoOutTransition, en as cutTransition, eo as setTrackedFilterPosition, ep as snapPositionToBeat, eq as quantizeAction, er as syncBPMToOther, es as phaseAlign, et as quantizedEQKill, eu as getQuantizeMode, ev as useDJSetStore } from "./main-BbV5VyEH.js";
import { getContext, start } from "./vendor-tone-48TQc1H3.js";
import { i as isAudioFile, p as parseModuleToSong } from "./parseModuleToSong-B-Yqzlmn.js";
const MAX_CACHE_SIZE = 8;
const cache = /* @__PURE__ */ new Map();
function cacheSong(fileName, song) {
  if (cache.has(fileName)) cache.delete(fileName);
  cache.set(fileName, song);
  while (cache.size > MAX_CACHE_SIZE) {
    const oldest = cache.keys().next().value;
    if (oldest !== void 0) cache.delete(oldest);
    else break;
  }
}
function getCachedSong(fileName) {
  const song = cache.get(fileName);
  if (song) {
    cache.delete(fileName);
    cache.set(fileName, song);
  }
  return song;
}
function hasCachedSong(fileName) {
  return cache.has(fileName);
}
function evictSong(fileName) {
  cache.delete(fileName);
}
function clearSongCache() {
  cache.clear();
}
function songCacheSize() {
  return cache.size;
}
const DJSongCache = /* @__PURE__ */ Object.freeze(/* @__PURE__ */ Object.defineProperty({
  __proto__: null,
  cacheSong,
  clearSongCache,
  evictSong,
  getCachedSong,
  hasCachedSong,
  songCacheSize
}, Symbol.toStringTag, { value: "Module" }));
class DJBeatSync {
  /**
   * Instantly match target deck's BPM to source deck.
   * Calculates the required pitch offset in semitones.
   * Accounts for source deck's tempo multiplier (pitch slider position).
   */
  static syncBPM(source, target) {
    const sourceBPM = source.replayer.getBPM() * source.replayer.getTempoMultiplier();
    const targetBaseBPM = target.replayer.getBPM();
    if (targetBaseBPM <= 0 || sourceBPM <= 0) return 0;
    const ratio = sourceBPM / targetBaseBPM;
    const semitones = 12 * Math.log2(ratio);
    const clamped = Math.max(-16, Math.min(16, semitones));
    return clamped;
  }
  /**
   * Nudge target deck toward phase alignment with source.
   * Uses a small temporary BPM bump to shift the beat grid.
   *
   * @param source - The deck to sync to
   * @param target - The deck to adjust
   * @param direction - 'forward' or 'backward'
   */
  static nudgeToPhase(source, target, direction = "forward") {
    const sourceRow = source.replayer.getCurrentRow();
    const targetRow = target.replayer.getCurrentRow();
    const sourceSpeed = source.replayer.getSpeed();
    const phaseDiff = sourceRow - targetRow;
    if (Math.abs(phaseDiff) < 1) return;
    const nudgeAmount = direction === "forward" ? 3 : -3;
    const nudgeTicks = Math.min(Math.abs(phaseDiff) * sourceSpeed, 32);
    target.nudge(nudgeAmount, nudgeTicks);
  }
  /**
   * Calculate the effective BPM difference between two decks.
   * Accounts for tempo multipliers (pitch slider positions).
   */
  static getBPMDifference(deckA, deckB) {
    const aBPM = deckA.replayer.getBPM() * deckA.replayer.getTempoMultiplier();
    const bBPM = deckB.replayer.getBPM() * deckB.replayer.getTempoMultiplier();
    return aBPM - bBPM;
  }
  /**
   * Check if two decks are BPM-matched (within tolerance).
   */
  static isSynced(deckA, deckB, tolerance = 0.5) {
    return Math.abs(this.getBPMDifference(deckA, deckB)) < tolerance;
  }
}
const DB_NAME = "DEViLBOX_AudioCache";
const DB_VERSION = 1;
const STORE_NAME = "audioCache";
const MAX_CACHE_SIZE_MB = 2e3;
const MAX_CACHE_ENTRIES = 1e3;
let db = null;
async function initDB() {
  if (db) return db;
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onerror = () => reject(new Error("Failed to open IndexedDB"));
    request.onsuccess = () => {
      db = request.result;
      resolve(db);
    };
    request.onupgradeneeded = (event) => {
      const database = event.target.result;
      if (!database.objectStoreNames.contains(STORE_NAME)) {
        const store = database.createObjectStore(STORE_NAME, { keyPath: "hash" });
        store.createIndex("timestamp", "timestamp", { unique: false });
      }
    };
  });
}
async function hashFile(buffer) {
  const hashBuffer = await crypto.subtle.digest("SHA-256", buffer);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map((b) => b.toString(16).padStart(2, "0")).join("");
}
async function getCachedAudio(fileBuffer) {
  try {
    const database = await initDB();
    const hash = await hashFile(fileBuffer);
    return new Promise((resolve, reject) => {
      const tx = database.transaction(STORE_NAME, "readonly");
      const store = tx.objectStore(STORE_NAME);
      const request = store.get(hash);
      request.onsuccess = () => {
        const entry = request.result;
        if (entry) {
          void touchCacheEntry(hash);
          resolve(entry);
        } else {
          resolve(null);
        }
      };
      request.onerror = () => reject(request.error);
    });
  } catch (err) {
    console.error("[DJAudioCache] Failed to get cached audio:", err);
    return null;
  }
}
async function isCached(fileBuffer) {
  try {
    const database = await initDB();
    const hash = await hashFile(fileBuffer);
    return new Promise((resolve) => {
      const tx = database.transaction(STORE_NAME, "readonly");
      const store = tx.objectStore(STORE_NAME);
      const request = store.getKey(hash);
      request.onsuccess = () => resolve(request.result !== void 0);
      request.onerror = () => resolve(false);
    });
  } catch {
    return false;
  }
}
async function cacheAudio(sourceFile, filename, audioData, duration, waveformPeaks, sampleRate, numberOfChannels) {
  try {
    const database = await initDB();
    const hash = await hashFile(sourceFile);
    const sizeBytes = audioData.byteLength;
    let existingSource;
    try {
      const existing = await new Promise((resolve) => {
        const tx = database.transaction(STORE_NAME, "readonly");
        const req = tx.objectStore(STORE_NAME).get(hash);
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => resolve(void 0);
      });
      existingSource = existing == null ? void 0 : existing.sourceData;
    } catch {
    }
    const entry = {
      hash,
      filename,
      audioData,
      duration,
      waveformPeaks: Array.from(waveformPeaks),
      sampleRate,
      numberOfChannels,
      timestamp: Date.now(),
      sizeBytes,
      sourceData: existingSource || sourceFile.slice(0)
      // preserve or store source
    };
    await evictIfNeeded(sizeBytes);
    return new Promise((resolve, reject) => {
      const tx = database.transaction(STORE_NAME, "readwrite");
      const store = tx.objectStore(STORE_NAME);
      const request = store.put(entry);
      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });
  } catch (err) {
    console.error("[DJAudioCache] Failed to cache audio:", err);
    throw err;
  }
}
async function touchCacheEntry(hash) {
  try {
    const database = await initDB();
    const tx = database.transaction(STORE_NAME, "readwrite");
    const store = tx.objectStore(STORE_NAME);
    const getRequest = store.get(hash);
    getRequest.onsuccess = () => {
      const entry = getRequest.result;
      if (entry) {
        entry.timestamp = Date.now();
        store.put(entry);
      }
    };
  } catch (err) {
    console.warn("[DJAudioCache] Failed to touch cache entry:", err);
  }
}
async function getCacheMetadata() {
  try {
    const database = await initDB();
    return new Promise((resolve, reject) => {
      const tx = database.transaction(STORE_NAME, "readonly");
      const store = tx.objectStore(STORE_NAME);
      const request = store.getAll();
      request.onsuccess = () => {
        const entries = request.result;
        const totalSizeBytes = entries.reduce((sum, e) => sum + e.sizeBytes, 0);
        resolve({ totalSizeBytes, entryCount: entries.length });
      };
      request.onerror = () => reject(request.error);
    });
  } catch {
    return { totalSizeBytes: 0, entryCount: 0 };
  }
}
async function evictIfNeeded(newEntrySizeBytes) {
  const metadata = await getCacheMetadata();
  const maxSizeBytes = MAX_CACHE_SIZE_MB * 1024 * 1024;
  if (metadata.totalSizeBytes + newEntrySizeBytes > maxSizeBytes) {
    const bytesToFree = metadata.totalSizeBytes + newEntrySizeBytes - maxSizeBytes;
    await evictOldestEntries(bytesToFree);
  }
  if (metadata.entryCount >= MAX_CACHE_ENTRIES) {
    await evictOldestEntries(0, metadata.entryCount - MAX_CACHE_ENTRIES + 1);
  }
}
async function evictOldestEntries(bytesToFree = 0, countToFree = 0) {
  try {
    const database = await initDB();
    return new Promise((resolve, reject) => {
      const tx = database.transaction(STORE_NAME, "readwrite");
      const store = tx.objectStore(STORE_NAME);
      const index = store.index("timestamp");
      const request = index.openCursor();
      let bytesFreed = 0;
      let entriesFreed = 0;
      request.onsuccess = (event) => {
        const cursor = event.target.result;
        if (!cursor) {
          resolve();
          return;
        }
        const entry = cursor.value;
        if (bytesFreed >= bytesToFree && entriesFreed >= countToFree) {
          resolve();
          return;
        }
        cursor.delete();
        bytesFreed += entry.sizeBytes;
        entriesFreed++;
        cursor.continue();
      };
      request.onerror = () => reject(request.error);
    });
  } catch (err) {
    console.error("[DJAudioCache] Failed to evict entries:", err);
  }
}
async function updateCacheAnalysis(fileBuffer, analysis) {
  try {
    const database = await initDB();
    const hash = await hashFile(fileBuffer);
    return new Promise((resolve, reject) => {
      const tx = database.transaction(STORE_NAME, "readwrite");
      const store = tx.objectStore(STORE_NAME);
      const getReq = store.get(hash);
      getReq.onsuccess = () => {
        const entry = getReq.result;
        if (!entry) {
          resolve();
          return;
        }
        Object.assign(entry, analysis);
        entry.timestamp = Date.now();
        const putReq = store.put(entry);
        putReq.onsuccess = () => resolve();
        putReq.onerror = () => reject(putReq.error);
      };
      getReq.onerror = () => reject(getReq.error);
    });
  } catch (err) {
    console.error("[DJAudioCache] Failed to update analysis:", err);
  }
}
async function cacheSourceFile(fileBuffer, filename) {
  try {
    const database = await initDB();
    const hash = await hashFile(fileBuffer);
    const tx = database.transaction(STORE_NAME, "readwrite");
    const store = tx.objectStore(STORE_NAME);
    return new Promise((resolve, reject) => {
      const getReq = store.get(hash);
      getReq.onsuccess = () => {
        const existing = getReq.result;
        if (existing) {
          existing.sourceData = fileBuffer.slice(0);
          existing.timestamp = Date.now();
          store.put(existing);
        } else {
          const stub = {
            hash,
            filename,
            audioData: new ArrayBuffer(0),
            // empty — not yet rendered
            duration: 0,
            waveformPeaks: [],
            sampleRate: 44100,
            numberOfChannels: 1,
            timestamp: Date.now(),
            sizeBytes: fileBuffer.byteLength,
            sourceData: fileBuffer.slice(0)
          };
          store.put(stub);
        }
        resolve();
      };
      getReq.onerror = () => reject(getReq.error);
    });
  } catch (err) {
    console.warn("[DJAudioCache] Failed to cache source file:", err);
  }
}
async function getCachedFilenames() {
  try {
    const database = await initDB();
    return new Promise((resolve) => {
      const tx = database.transaction(STORE_NAME, "readonly");
      const store = tx.objectStore(STORE_NAME);
      const request = store.getAll();
      request.onsuccess = () => {
        const entries = request.result;
        const names = /* @__PURE__ */ new Set();
        for (const e of entries) {
          if (e.audioData.byteLength > 0 || e.sourceData && e.sourceData.byteLength > 0) {
            names.add(e.filename);
          }
        }
        resolve(names);
      };
      request.onerror = () => resolve(/* @__PURE__ */ new Set());
    });
  } catch {
    return /* @__PURE__ */ new Set();
  }
}
async function getCachedAudioByFilename(filename) {
  try {
    const database = await initDB();
    return new Promise((resolve) => {
      const tx = database.transaction(STORE_NAME, "readonly");
      const store = tx.objectStore(STORE_NAME);
      const request = store.getAll();
      request.onsuccess = () => {
        const entries = request.result;
        const match = entries.find((e) => e.filename === filename && e.audioData.byteLength > 0);
        if (match) void touchCacheEntry(match.hash);
        resolve(match ?? null);
      };
      request.onerror = () => resolve(null);
    });
  } catch {
    return null;
  }
}
const API_URL = "http://localhost:3001/api";
async function lookupServerAnalysis(hash) {
  try {
    const res = await fetch(`${API_URL}/analysis/lookup/${hash}`, {
      signal: AbortSignal.timeout(3e3)
    });
    if (!res.ok) return null;
    const json = await res.json();
    if (!json.found) return null;
    return json.analysis;
  } catch {
    return null;
  }
}
function storeServerAnalysis(data) {
  fetch(`${API_URL}/analysis/cache`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
    signal: AbortSignal.timeout(5e3)
  }).catch(() => {
  });
}
const TARGET_RMS_DB = -14;
const PEAK_HEADROOM_DB = -1;
function computeAutoTrim(rmsDb, peakDb) {
  if (rmsDb <= -80) return 0;
  const rmsBasedTrim = TARGET_RMS_DB - rmsDb;
  const maxTrimFromPeak = peakDb > -80 ? PEAK_HEADROOM_DB - peakDb : 12;
  return Math.max(-12, Math.min(12, Math.min(rmsBasedTrim, maxTrimFromPeak)));
}
function encodePCMToWAV(left, _right, sampleRate) {
  const numChannels = 1;
  const bitsPerSample = 16;
  const numSamples = left.length;
  const dataSize = numSamples * numChannels * (bitsPerSample / 8);
  const bufferSize = 44 + dataSize;
  const buffer = new ArrayBuffer(bufferSize);
  const view = new DataView(buffer);
  writeString(view, 0, "RIFF");
  view.setUint32(4, bufferSize - 8, true);
  writeString(view, 8, "WAVE");
  writeString(view, 12, "fmt ");
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, numChannels, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * numChannels * (bitsPerSample / 8), true);
  view.setUint16(32, numChannels * (bitsPerSample / 8), true);
  view.setUint16(34, bitsPerSample, true);
  writeString(view, 36, "data");
  view.setUint32(40, dataSize, true);
  let offset = 44;
  for (let i = 0; i < numSamples; i++) {
    const s = Math.max(-1, Math.min(1, left[i]));
    view.setInt16(offset, s < 0 ? s * 32768 : s * 32767, true);
    offset += 2;
  }
  return buffer;
}
function writeString(view, offset, str) {
  for (let i = 0; i < str.length; i++) {
    view.setUint8(offset + i, str.charCodeAt(i));
  }
}
function computeWaveformFromPCM(left, right, numBins) {
  const peaks = new Float32Array(numBins);
  const samplesPerBin = Math.floor(left.length / numBins);
  if (samplesPerBin < 1) return peaks;
  for (let bin = 0; bin < numBins; bin++) {
    const start2 = bin * samplesPerBin;
    const end = Math.min(start2 + samplesPerBin, left.length);
    let maxAmp = 0;
    for (let i = start2; i < end; i++) {
      const sample = (Math.abs(left[i]) + Math.abs(right[i])) * 0.5;
      if (sample > maxAmp) maxAmp = sample;
    }
    peaks[bin] = maxAmp;
  }
  return peaks;
}
let instance$1 = null;
function getDJPipeline() {
  if (!instance$1) {
    instance$1 = new DJPipeline();
  }
  return instance$1;
}
class DJPipeline {
  renderWorker = null;
  analysisWorker = null;
  queue = [];
  processing = false;
  currentTaskId = null;
  currentDeckId = null;
  // Pending render/analysis callbacks keyed by task id
  renderCallbacks = /* @__PURE__ */ new Map();
  analysisCallbacks = /* @__PURE__ */ new Map();
  // In-flight render dedup: hash → promise (prevents re-rendering the same file concurrently)
  inflight = /* @__PURE__ */ new Map();
  constructor() {
    this.initWorkers();
  }
  // ── Worker Lifecycle ─────────────────────────────────────────────────────
  initWorkers() {
    this.renderWorker = new Worker(
      new URL(
        /* @vite-ignore */
        "/assets/dj-render.worker-CLsI_4gV.js",
        import.meta.url
      ),
      { type: "module" }
    );
    this.renderWorker.onmessage = (e) => this.handleRenderMessage(e);
    this.renderWorker.onerror = (e) => {
      console.error("[DJPipeline] Render worker error:", e);
    };
    this.analysisWorker = new Worker(
      new URL(
        /* @vite-ignore */
        "/assets/dj-analysis.worker-BEjYLn8u.js",
        import.meta.url
      ),
      { type: "module" }
    );
    this.analysisWorker.onmessage = (e) => this.handleAnalysisMessage(e);
    this.analysisWorker.onerror = (e) => {
      console.error("[DJPipeline] Analysis worker error:", e);
    };
    this.renderWorker.postMessage({ type: "init" });
    this.analysisWorker.postMessage({ type: "init" });
  }
  handleRenderMessage(e) {
    const msg = e.data;
    switch (msg.type) {
      case "ready":
        console.log("[DJPipeline] Render worker ready");
        break;
      case "renderProgress": {
        const { id, progress } = msg;
        if (id === this.currentTaskId) {
          this.updateDeckAnalysisState(id, "rendering", this.currentDeckId);
        }
        this.emitTaskProgress(id, progress * 0.5);
        break;
      }
      case "renderComplete": {
        const { id, left, right, sampleRate, duration } = msg;
        const cb = this.renderCallbacks.get(id);
        if (cb) {
          this.renderCallbacks.delete(id);
          cb.resolve({ left, right, sampleRate, duration });
        }
        break;
      }
      case "renderError": {
        const { id, error } = msg;
        const cb = this.renderCallbacks.get(id);
        if (cb) {
          this.renderCallbacks.delete(id);
          cb.reject(new Error(error));
        }
        break;
      }
    }
  }
  handleAnalysisMessage(e) {
    const msg = e.data;
    switch (msg.type) {
      case "ready":
        console.log("[DJPipeline] Analysis worker ready");
        break;
      case "analysisProgress": {
        const { id, progress } = msg;
        this.emitTaskProgress(id, 50 + progress * 0.5);
        break;
      }
      case "analysisComplete": {
        const { id, result } = msg;
        const cb = this.analysisCallbacks.get(id);
        if (cb) {
          this.analysisCallbacks.delete(id);
          cb.resolve(result);
        }
        break;
      }
      case "analysisError": {
        const { id, error } = msg;
        const cb = this.analysisCallbacks.get(id);
        if (cb) {
          this.analysisCallbacks.delete(id);
          cb.reject(new Error(error));
        }
        break;
      }
    }
  }
  // ── Public API ───────────────────────────────────────────────────────────
  /**
   * Enqueue a file for render + analysis.
   * Returns a promise that resolves when the full pipeline completes.
   */
  enqueue(task) {
    return new Promise((resolve, reject) => {
      const entry = { task, resolve, reject };
      const priorityOrder = { high: 0, normal: 1, low: 2 };
      const insertIdx = this.queue.findIndex(
        (q) => priorityOrder[q.task.priority] > priorityOrder[task.priority]
      );
      if (insertIdx === -1) {
        this.queue.push(entry);
      } else {
        this.queue.splice(insertIdx, 0, entry);
      }
      this.updateStoreQueue();
      if (task.deckId) {
        useDJStore.getState().setDeckState(task.deckId, {
          analysisState: "pending"
        });
      }
      void this.processNext();
    });
  }
  /**
   * Convenience: enqueue render + analysis for a tracker file.
   */
  async renderAndAnalyze(fileBuffer, filename, deckId, priority = "normal") {
    const id = `${filename}-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
    return this.enqueue({ id, fileBuffer, filename, deckId, priority });
  }
  /**
   * Convenience: analyze already-rendered PCM (e.g., from an existing cache entry that
   * was rendered before analysis was implemented).
   */
  async analyzeOnly(fileBuffer, filename, pcmLeft, pcmRight, sampleRate, deckId, priority = "normal") {
    const id = `analyze-${filename}-${Date.now()}`;
    return this.enqueue({
      id,
      fileBuffer,
      filename,
      deckId,
      priority,
      analysisOnly: true,
      pcmLeft,
      pcmRight,
      sampleRate
    });
  }
  /**
   * Check cache and return if fully analyzed; otherwise enqueue.
   * Designed to be the primary entry point for file loading.
   */
  async loadOrEnqueue(fileBuffer, filename, deckId, priority = "high") {
    var _a, _b, _c;
    const cached = await getCachedAudio(fileBuffer);
    if (cached && cached.beatGrid && cached.bpm) {
      console.log(`[DJPipeline] Full cache hit for ${filename}`);
      if (deckId) {
        const rmsDb = cached.rmsDb ?? -100;
        const peakDb = cached.peakDb ?? -100;
        const autoTrimDb = computeAutoTrim(rmsDb, peakDb);
        const deckState = useDJStore.getState().decks[deckId];
        const trimGain = deckState.autoGainEnabled ? autoTrimDb : 0;
        useDJStore.getState().setDeckState(deckId, {
          analysisState: "ready",
          beatGrid: cached.beatGrid,
          musicalKey: cached.musicalKey ?? null,
          keyConfidence: cached.keyConfidence ?? 0,
          frequencyPeaks: cached.frequencyPeaks ? cached.frequencyPeaks.map((b) => new Float32Array(b)) : null,
          rmsDb,
          peakDb,
          trimGain,
          // Genre from cache
          genrePrimary: cached.genrePrimary ?? null,
          genreSubgenre: cached.genreSubgenre ?? null,
          genreConfidence: cached.genreConfidence ?? 0,
          mood: cached.mood ?? null,
          energy: cached.energy ?? 0.5,
          danceability: cached.danceability ?? 0.5
        });
        autoMatchOnLoad(deckId);
      }
      return {
        wavData: cached.audioData,
        duration: cached.duration,
        sampleRate: cached.sampleRate,
        waveformPeaks: new Float32Array(cached.waveformPeaks),
        analysis: {
          bpm: cached.bpm,
          bpmConfidence: cached.bpmConfidence ?? 0,
          beats: ((_a = cached.beatGrid) == null ? void 0 : _a.beats) ?? [],
          downbeats: ((_b = cached.beatGrid) == null ? void 0 : _b.downbeats) ?? [],
          timeSignature: ((_c = cached.beatGrid) == null ? void 0 : _c.timeSignature) ?? 4,
          musicalKey: cached.musicalKey ?? "Unknown",
          keyConfidence: cached.keyConfidence ?? 0,
          frequencyPeaks: cached.frequencyPeaks ?? [],
          rmsDb: cached.rmsDb ?? -100,
          peakDb: cached.peakDb ?? -100,
          genre: {
            primary: cached.genrePrimary ?? "Unknown",
            subgenre: cached.genreSubgenre ?? "Unknown",
            confidence: cached.genreConfidence ?? 0,
            mood: cached.mood ?? "Unknown",
            energy: cached.energy ?? 0.5,
            danceability: cached.danceability ?? 0.5
          }
        }
      };
    }
    if (cached && !cached.beatGrid) {
      const hash2 = await hashFile(fileBuffer);
      const serverAnalysis = await lookupServerAnalysis(hash2);
      if (serverAnalysis && serverAnalysis.bpm > 0 && serverAnalysis.beats.length > 0) {
        console.log(`[DJPipeline] Server analysis cache hit for ${filename}`);
        const beatGrid = {
          beats: serverAnalysis.beats,
          downbeats: serverAnalysis.downbeats,
          bpm: serverAnalysis.bpm,
          timeSignature: serverAnalysis.timeSignature
        };
        await updateCacheAnalysis(fileBuffer, {
          beatGrid,
          bpm: serverAnalysis.bpm,
          bpmConfidence: serverAnalysis.bpmConfidence,
          musicalKey: serverAnalysis.musicalKey,
          keyConfidence: serverAnalysis.keyConfidence,
          frequencyPeaks: serverAnalysis.frequencyPeaks,
          analysisVersion: serverAnalysis.analysisVersion,
          genrePrimary: serverAnalysis.genrePrimary,
          genreSubgenre: serverAnalysis.genreSubgenre,
          genreConfidence: serverAnalysis.genreConfidence,
          mood: serverAnalysis.mood,
          energy: serverAnalysis.energy,
          danceability: serverAnalysis.danceability
        });
        if (deckId) {
          const rmsDb = serverAnalysis.rmsDb;
          const peakDb = serverAnalysis.peakDb;
          const autoTrimDb = computeAutoTrim(rmsDb, peakDb);
          const deckState = useDJStore.getState().decks[deckId];
          const trimGain = deckState.autoGainEnabled ? autoTrimDb : 0;
          useDJStore.getState().setDeckState(deckId, {
            analysisState: "ready",
            beatGrid,
            musicalKey: serverAnalysis.musicalKey,
            keyConfidence: serverAnalysis.keyConfidence,
            frequencyPeaks: serverAnalysis.frequencyPeaks.map((b) => new Float32Array(b)),
            rmsDb,
            peakDb,
            trimGain,
            genrePrimary: serverAnalysis.genrePrimary,
            genreSubgenre: serverAnalysis.genreSubgenre,
            genreConfidence: serverAnalysis.genreConfidence,
            mood: serverAnalysis.mood,
            energy: serverAnalysis.energy,
            danceability: serverAnalysis.danceability
          });
          autoMatchOnLoad(deckId);
        }
        return {
          wavData: cached.audioData,
          duration: cached.duration,
          sampleRate: cached.sampleRate,
          waveformPeaks: new Float32Array(cached.waveformPeaks),
          analysis: {
            bpm: serverAnalysis.bpm,
            bpmConfidence: serverAnalysis.bpmConfidence,
            beats: serverAnalysis.beats,
            downbeats: serverAnalysis.downbeats,
            timeSignature: serverAnalysis.timeSignature,
            musicalKey: serverAnalysis.musicalKey,
            keyConfidence: serverAnalysis.keyConfidence,
            frequencyPeaks: serverAnalysis.frequencyPeaks,
            rmsDb: serverAnalysis.rmsDb,
            peakDb: serverAnalysis.peakDb,
            genre: {
              primary: serverAnalysis.genrePrimary,
              subgenre: serverAnalysis.genreSubgenre,
              confidence: serverAnalysis.genreConfidence,
              mood: serverAnalysis.mood,
              energy: serverAnalysis.energy,
              danceability: serverAnalysis.danceability
            }
          }
        };
      }
      console.log(`[DJPipeline] Cached but unanalyzed: ${filename}`);
      try {
        const audioCtx = new OfflineAudioContext(2, 1, 44100);
        const decoded = await audioCtx.decodeAudioData(cached.audioData.slice(0));
        const left = decoded.getChannelData(0);
        const right = decoded.numberOfChannels > 1 ? decoded.getChannelData(1) : left;
        return this.analyzeOnly(fileBuffer, filename, left, right, decoded.sampleRate, deckId, priority);
      } catch (err) {
        console.warn(`[DJPipeline] Failed to decode cached audio for analysis, re-rendering: ${filename}`, err);
      }
    }
    const hash = await hashFile(fileBuffer);
    const existing = this.inflight.get(hash);
    if (existing) {
      console.log(`[DJPipeline] In-flight dedup hit for ${filename} — waiting for existing render`);
      return existing;
    }
    const promise = this.renderAndAnalyze(fileBuffer, filename, deckId, priority);
    this.inflight.set(hash, promise);
    promise.finally(() => this.inflight.delete(hash));
    return promise;
  }
  /** Number of queued tasks (not counting current). */
  get queueSize() {
    return this.queue.length;
  }
  /** Whether the pipeline is actively processing. */
  get isActive() {
    return this.processing;
  }
  /** Cancel all pending tasks (does not cancel in-progress task). */
  cancelAll() {
    for (const entry of this.queue) {
      entry.reject(new Error("Pipeline cancelled"));
    }
    this.queue = [];
    this.updateStoreQueue();
  }
  /** Cancel tasks for a specific deck. */
  cancelForDeck(deckId) {
    const removed = this.queue.filter((e) => e.task.deckId === deckId);
    this.queue = this.queue.filter((e) => e.task.deckId !== deckId);
    for (const entry of removed) {
      entry.reject(new Error(`Cancelled: deck ${deckId} reloaded`));
    }
    this.updateStoreQueue();
  }
  dispose() {
    var _a, _b;
    this.stopProgressTicker();
    this.cancelAll();
    (_a = this.renderWorker) == null ? void 0 : _a.terminate();
    (_b = this.analysisWorker) == null ? void 0 : _b.terminate();
    this.renderWorker = null;
    this.analysisWorker = null;
  }
  // ── Internal Processing Loop ─────────────────────────────────────────────
  async processNext() {
    if (this.processing || this.queue.length === 0) return;
    this.processing = true;
    const entry = this.queue.shift();
    const { task, resolve, reject } = entry;
    this.currentTaskId = task.id;
    this.currentDeckId = task.deckId ?? null;
    if (this.currentDeckId) {
      this.startProgressTicker(this.currentDeckId);
    }
    this.updateStoreQueue();
    try {
      const result = await this.executeTask(task);
      resolve(result);
    } catch (err) {
      console.error(`[DJPipeline] Task failed: ${task.filename}`, err);
      reject(err instanceof Error ? err : new Error(String(err)));
    } finally {
      this.stopProgressTicker();
      this.processing = false;
      this.currentTaskId = null;
      this.currentDeckId = null;
      if (this.queue.length > 0) {
        void this.processNext();
      } else {
        useDJStore.getState().setPipelineState(0, null);
      }
    }
  }
  async executeTask(task) {
    var _a;
    const startTime = performance.now();
    let left;
    let right;
    let sampleRate;
    let duration;
    let wavData;
    let waveformPeaks;
    if (task.analysisOnly && task.pcmLeft) {
      left = task.pcmLeft;
      right = task.pcmRight ?? task.pcmLeft;
      sampleRate = task.sampleRate ?? 44100;
      duration = left.length / sampleRate;
      wavData = encodePCMToWAV(left, right, sampleRate);
      waveformPeaks = computeWaveformFromPCM(left, right, 800);
    } else if (task.wavData) {
      wavData = task.wavData;
      const audioCtx = new OfflineAudioContext(2, 1, 44100);
      const decoded = await audioCtx.decodeAudioData(wavData.slice(0));
      left = decoded.getChannelData(0);
      right = decoded.numberOfChannels > 1 ? decoded.getChannelData(1) : left;
      sampleRate = decoded.sampleRate;
      duration = decoded.duration;
      waveformPeaks = computeWaveformFromPCM(left, right, 800);
    } else {
      this.updateDeckAnalysisState(task.id, "rendering", task.deckId);
      const renderResult = await this.doRender(task);
      left = renderResult.left;
      right = renderResult.right;
      sampleRate = renderResult.sampleRate;
      duration = renderResult.duration;
      this.emitTaskProgress(task.id, 48);
      wavData = encodePCMToWAV(left, right, sampleRate);
      waveformPeaks = computeWaveformFromPCM(left, right, 800);
      console.log(`[DJPipeline] WAV encoded: ${wavData.byteLength} bytes, duration: ${duration.toFixed(2)}s, PCM frames: ${left.length}`);
      this.emitTaskProgress(task.id, 49);
      await cacheAudio(
        task.fileBuffer,
        task.filename,
        wavData,
        duration,
        waveformPeaks,
        sampleRate,
        2
        // stereo
      );
      console.log(
        `[DJPipeline] Rendered ${task.filename} in ${Math.round(performance.now() - startTime)}ms (${Math.round(duration)}s audio, ${Math.round(wavData.byteLength / 1024)}KB)`
      );
      await new Promise((resolve) => setTimeout(resolve, 50));
    }
    this.updateDeckAnalysisState(task.id, "analyzing", task.deckId);
    let analysis = null;
    try {
      analysis = await this.doAnalysis(task.id, left, right, sampleRate);
      if (analysis) {
        const beatGrid = {
          beats: analysis.beats,
          downbeats: analysis.downbeats,
          bpm: analysis.bpm,
          timeSignature: analysis.timeSignature
        };
        await updateCacheAnalysis(task.fileBuffer, {
          beatGrid,
          bpm: analysis.bpm,
          bpmConfidence: analysis.bpmConfidence,
          musicalKey: analysis.musicalKey,
          keyConfidence: analysis.keyConfidence,
          frequencyPeaks: analysis.frequencyPeaks,
          analysisVersion: 1,
          // Genre classification
          genrePrimary: analysis.genre.primary,
          genreSubgenre: analysis.genre.subgenre,
          genreConfidence: analysis.genre.confidence,
          mood: analysis.genre.mood,
          energy: analysis.genre.energy,
          danceability: analysis.genre.danceability
        });
        const taskHash = await hashFile(task.fileBuffer);
        storeServerAnalysis({
          hash: taskHash,
          bpm: analysis.bpm,
          bpmConfidence: analysis.bpmConfidence,
          timeSignature: analysis.timeSignature,
          musicalKey: analysis.musicalKey,
          keyConfidence: analysis.keyConfidence,
          rmsDb: analysis.rmsDb,
          peakDb: analysis.peakDb,
          genrePrimary: analysis.genre.primary,
          genreSubgenre: analysis.genre.subgenre,
          genreConfidence: analysis.genre.confidence,
          mood: analysis.genre.mood,
          energy: analysis.genre.energy,
          danceability: analysis.genre.danceability,
          duration,
          beats: analysis.beats,
          downbeats: analysis.downbeats,
          waveformPeaks: waveformPeaks ? Array.from(waveformPeaks) : [],
          frequencyPeaks: analysis.frequencyPeaks,
          analysisVersion: 1
        });
      }
    } catch (err) {
      console.warn(`[DJPipeline] Analysis failed for ${task.filename}:`, err);
    }
    if (task.deckId) {
      if (analysis) {
        const autoTrimDb = computeAutoTrim(analysis.rmsDb, analysis.peakDb);
        const deckState = useDJStore.getState().decks[task.deckId];
        const trimGain = deckState.autoGainEnabled ? autoTrimDb : 0;
        useDJStore.getState().setDeckState(task.deckId, {
          analysisState: "ready",
          beatGrid: {
            beats: analysis.beats,
            downbeats: analysis.downbeats,
            bpm: analysis.bpm,
            timeSignature: analysis.timeSignature
          },
          musicalKey: analysis.musicalKey,
          keyConfidence: analysis.keyConfidence,
          frequencyPeaks: analysis.frequencyPeaks.map((b) => new Float32Array(b)),
          rmsDb: analysis.rmsDb,
          peakDb: analysis.peakDb,
          trimGain,
          // Genre classification
          genrePrimary: analysis.genre.primary,
          genreSubgenre: analysis.genre.subgenre,
          genreConfidence: analysis.genre.confidence,
          mood: analysis.genre.mood,
          energy: analysis.genre.energy,
          danceability: analysis.genre.danceability
        });
        autoMatchOnLoad(task.deckId);
      } else {
        useDJStore.getState().setDeckState(task.deckId, {
          analysisState: "ready"
        });
      }
      const djEngine = getDJEngineIfActive();
      if (djEngine) {
        const deck = djEngine.getDeck(task.deckId);
        const currentState = useDJStore.getState().decks[task.deckId];
        if (currentState.fileName === task.filename && currentState.playbackMode === "tracker") {
          void deck.hotSwapToAudio(wavData, task.filename).catch((err) => {
            console.warn(`[DJPipeline] Hot-swap failed for ${task.filename}:`, err);
          });
        }
      }
    }
    const totalTime = Math.round(performance.now() - startTime);
    console.log(
      `[DJPipeline] Pipeline complete for ${task.filename} in ${totalTime}ms (BPM: ${((_a = analysis == null ? void 0 : analysis.bpm) == null ? void 0 : _a.toFixed(1)) ?? "?"}, Key: ${(analysis == null ? void 0 : analysis.musicalKey) ?? "?"})`
    );
    return { wavData, duration, sampleRate, waveformPeaks, analysis };
  }
  // ── Worker Communication ─────────────────────────────────────────────────
  doRender(task) {
    return new Promise((resolve, reject) => {
      if (!this.renderWorker) {
        reject(new Error("Render worker not initialized"));
        return;
      }
      this.renderCallbacks.set(task.id, { resolve, reject });
      const buffer = task.fileBuffer.slice(0);
      this.renderWorker.postMessage(
        { type: "render", id: task.id, fileBuffer: buffer, filename: task.filename, subsong: task.subsong },
        [buffer]
      );
    });
  }
  doAnalysis(id, left, right, sampleRate) {
    return new Promise((resolve, reject) => {
      if (!this.analysisWorker) {
        reject(new Error("Analysis worker not initialized"));
        return;
      }
      this.analysisCallbacks.set(id, { resolve, reject });
      const leftCopy = new Float32Array(left);
      const rightCopy = new Float32Array(right);
      this.analysisWorker.postMessage(
        { type: "analyze", id, pcmLeft: leftCopy, pcmRight: rightCopy, sampleRate, numBins: 800 },
        [leftCopy.buffer, rightCopy.buffer]
      );
    });
  }
  // ── State Updates ────────────────────────────────────────────────────────
  updateStoreQueue() {
    const store = useDJStore.getState();
    store.setPipelineState(
      this.queue.length + (this.processing ? 1 : 0),
      this.currentTaskId ? `Processing: ${this.currentTaskId}` : null
    );
  }
  updateDeckAnalysisState(_taskId, state, deckId) {
    const target = deckId ?? this.findDeckForTask(_taskId);
    if (target) {
      useDJStore.getState().setDeckState(target, {
        analysisState: state
      });
    }
  }
  findDeckForTask(taskId) {
    for (const entry of this.queue) {
      if (entry.task.id === taskId && entry.task.deckId) {
        return entry.task.deckId;
      }
    }
    return null;
  }
  // ── Progress interpolation ────────────────────────────────────────────────
  // Workers report progress in large jumps (e.g. 55% → 70% with nothing in between
  // during a multi-second WASM call). A ticker gradually advances the displayed
  // progress toward the last reported target so the bar never appears frozen.
  progressTarget = 0;
  progressDisplayed = 0;
  progressTickTimer = null;
  progressDeckId = null;
  startProgressTicker(deckId) {
    this.stopProgressTicker();
    this.progressTarget = 0;
    this.progressDisplayed = 0;
    this.progressDeckId = deckId;
    this.progressTickTimer = setInterval(() => {
      if (this.progressDisplayed >= this.progressTarget) return;
      const gap = this.progressTarget - this.progressDisplayed;
      const step = Math.max(0.5, gap * 0.3);
      this.progressDisplayed = Math.min(this.progressTarget, this.progressDisplayed + step);
      if (this.progressDeckId) {
        useDJStore.getState().setDeckAnalysisProgress(this.progressDeckId, Math.round(this.progressDisplayed));
      }
    }, 200);
  }
  stopProgressTicker() {
    if (this.progressTickTimer) {
      clearInterval(this.progressTickTimer);
      this.progressTickTimer = null;
    }
  }
  emitTaskProgress(taskId, progress) {
    const deckId = taskId === this.currentTaskId && this.currentDeckId ? this.currentDeckId : this.findDeckForTask(taskId);
    if (deckId) {
      this.progressTarget = progress;
      this.progressDeckId = deckId;
      if (progress >= 100) {
        this.progressDisplayed = 100;
        this.stopProgressTicker();
        useDJStore.getState().setDeckAnalysisProgress(deckId, 100);
      } else if (this.progressDisplayed < progress) {
        const jump = progress - this.progressDisplayed;
        this.progressDisplayed += jump * 0.6;
        useDJStore.getState().setDeckAnalysisProgress(deckId, Math.round(this.progressDisplayed));
      }
    }
  }
}
function detectBPM(song) {
  const initialBPM = song.initialBPM;
  const bpmCounts = /* @__PURE__ */ new Map();
  song.initialSpeed;
  const scanLimit = Math.min(song.songLength, 8);
  for (let pos = 0; pos < scanLimit; pos++) {
    const patternIndex = song.songPositions[pos];
    const pattern = song.patterns[patternIndex];
    if (!pattern) continue;
    scanPatternForBPM(pattern, song.format, bpmCounts);
  }
  if (bpmCounts.size > 0) {
    let maxCount = 0;
    let dominantBPM = initialBPM;
    for (const [bpm, count] of bpmCounts) {
      if (count > maxCount) {
        maxCount = count;
        dominantBPM = bpm;
      }
    }
    return {
      bpm: dominantBPM,
      confidence: "exact",
      source: `Fxx effect (found ${bpmCounts.size} BPM commands)`
    };
  }
  if (initialBPM > 0 && initialBPM !== 125) {
    return {
      bpm: initialBPM,
      confidence: "estimated",
      source: "Song header initialBPM"
    };
  }
  return {
    bpm: 125,
    confidence: "default",
    source: "Default (no BPM data found)"
  };
}
function scanPatternForBPM(pattern, format, bpmCounts, _speed) {
  for (const channel of pattern.channels) {
    for (const cell of channel.rows) {
      const effTyp = cell.effTyp ?? 0;
      const eff = cell.eff ?? 0;
      if (!effTyp && !eff) continue;
      const isFxx = (format === "MOD" || format === "XM") && effTyp === 15 || (format === "IT" || format === "S3M") && effTyp === 20;
      if (isFxx && eff >= 32) {
        bpmCounts.set(eff, (bpmCounts.get(eff) ?? 0) + 1);
      }
    }
  }
}
function estimateSongDuration(song) {
  let totalRows = 0;
  for (let pos = 0; pos < song.songLength; pos++) {
    const patternIndex = song.songPositions[pos];
    const pattern = song.patterns[patternIndex];
    totalRows += (pattern == null ? void 0 : pattern.length) ?? 64;
  }
  const tickDuration = 2.5 / song.initialBPM;
  return totalRows * song.initialSpeed * tickDuration;
}
const DJBeatDetector = /* @__PURE__ */ Object.freeze(/* @__PURE__ */ Object.defineProperty({
  __proto__: null,
  detectBPM,
  estimateSongDuration
}, Symbol.toStringTag, { value: "Module" }));
async function loadPlaylistTrackToDeck(track, deckId) {
  var _a;
  try {
    const cached = await getCachedAudioByFilename(track.fileName);
    if (cached && cached.audioData.byteLength > 0) {
      console.log(`[DJTrackLoader] Using cached audio for: ${track.fileName}`);
      await getDJEngine().loadAudioToDeck(
        deckId,
        cached.audioData,
        track.fileName,
        track.trackName || cached.filename,
        cached.bpm || 125
      );
      useDJStore.getState().setDeckState(deckId, {
        fileName: track.fileName,
        trackName: track.trackName || cached.filename,
        detectedBPM: cached.bpm || 125,
        effectiveBPM: cached.bpm || 125,
        playbackMode: "audio",
        durationMs: cached.duration * 1e3,
        waveformPeaks: cached.waveformPeaks instanceof Float32Array ? cached.waveformPeaks : new Float32Array(cached.waveformPeaks),
        audioPosition: 0,
        elapsedMs: 0,
        isPlaying: false
      });
      return true;
    }
  } catch (err) {
    console.warn("[DJTrackLoader] Cache lookup failed:", err);
  }
  if (track.fileName.startsWith("modland:")) {
    const modlandPath = track.fileName.slice("modland:".length);
    try {
      const { downloadModlandFile } = await __vitePreload(async () => {
        const { downloadModlandFile: downloadModlandFile2 } = await import("./main-BbV5VyEH.js").then((n) => n.jp);
        return { downloadModlandFile: downloadModlandFile2 };
      }, true ? __vite__mapDeps([0,1,2,3,4,5,6]) : void 0);
      const buffer = await downloadModlandFile(modlandPath);
      const filename = modlandPath.split("/").pop() || "download.mod";
      if (isAudioFile(filename)) {
        await getDJEngine().loadAudioToDeck(deckId, buffer, track.fileName);
        return true;
      }
      const blob = new File([buffer], filename, { type: "application/octet-stream" });
      const song = await parseModuleToSong(blob);
      cacheSong(track.fileName, song);
      const bpmResult = detectBPM(song);
      useDJStore.getState().setDeckState(deckId, {
        fileName: track.fileName,
        trackName: song.name || track.trackName || filename,
        detectedBPM: bpmResult.bpm,
        effectiveBPM: bpmResult.bpm,
        analysisState: "rendering",
        isPlaying: false
      });
      const result = await getDJPipeline().loadOrEnqueue(buffer, filename, deckId, "high");
      await getDJEngine().loadAudioToDeck(
        deckId,
        result.wavData,
        track.fileName,
        song.name || track.trackName || filename,
        ((_a = result.analysis) == null ? void 0 : _a.bpm) || bpmResult.bpm,
        song
      );
      return true;
    } catch (err) {
      console.error(`[DJTrackLoader] Failed to load Modland track ${modlandPath}:`, err);
      return false;
    }
  }
  console.warn(`[DJTrackLoader] Cannot auto-load local track: ${track.fileName}`);
  return false;
}
const KEY_TO_CAMELOT = {
  // Minor keys (A ring)
  "A minor": { number: 8, letter: "A", display: "8A" },
  "E minor": { number: 9, letter: "A", display: "9A" },
  "B minor": { number: 10, letter: "A", display: "10A" },
  "F# minor": { number: 11, letter: "A", display: "11A" },
  "Db minor": { number: 12, letter: "A", display: "12A" },
  "C# minor": { number: 12, letter: "A", display: "12A" },
  "Ab minor": { number: 1, letter: "A", display: "1A" },
  "G# minor": { number: 1, letter: "A", display: "1A" },
  "Eb minor": { number: 2, letter: "A", display: "2A" },
  "D# minor": { number: 2, letter: "A", display: "2A" },
  "Bb minor": { number: 3, letter: "A", display: "3A" },
  "A# minor": { number: 3, letter: "A", display: "3A" },
  "F minor": { number: 4, letter: "A", display: "4A" },
  "C minor": { number: 5, letter: "A", display: "5A" },
  "G minor": { number: 6, letter: "A", display: "6A" },
  "D minor": { number: 7, letter: "A", display: "7A" },
  // Major keys (B ring)
  "C major": { number: 8, letter: "B", display: "8B" },
  "G major": { number: 9, letter: "B", display: "9B" },
  "D major": { number: 10, letter: "B", display: "10B" },
  "A major": { number: 11, letter: "B", display: "11B" },
  "E major": { number: 12, letter: "B", display: "12B" },
  "B major": { number: 1, letter: "B", display: "1B" },
  "Cb major": { number: 1, letter: "B", display: "1B" },
  "F# major": { number: 2, letter: "B", display: "2B" },
  "Gb major": { number: 2, letter: "B", display: "2B" },
  "Db major": { number: 3, letter: "B", display: "3B" },
  "C# major": { number: 3, letter: "B", display: "3B" },
  "Ab major": { number: 4, letter: "B", display: "4B" },
  "G# major": { number: 4, letter: "B", display: "4B" },
  "Eb major": { number: 5, letter: "B", display: "5B" },
  "D# major": { number: 5, letter: "B", display: "5B" },
  "Bb major": { number: 6, letter: "B", display: "6B" },
  "A# major": { number: 6, letter: "B", display: "6B" },
  "F major": { number: 7, letter: "B", display: "7B" }
};
function toCamelot(keyStr) {
  if (!keyStr) return null;
  const direct = KEY_TO_CAMELOT[keyStr];
  if (direct) return direct;
  const normalized = normalizeKeyName(keyStr);
  if (normalized) {
    const found = KEY_TO_CAMELOT[normalized];
    if (found) return found;
  }
  const camelotMatch = keyStr.match(/^(\d{1,2})([ABab])$/);
  if (camelotMatch) {
    const num = parseInt(camelotMatch[1]);
    const letter = camelotMatch[2].toUpperCase();
    if (num >= 1 && num <= 12) {
      return { number: num, letter, display: `${num}${letter}` };
    }
  }
  return null;
}
function camelotDisplay(keyStr) {
  const c = toCamelot(keyStr);
  return c ? c.display : "—";
}
function keyCompatibility(key1, key2) {
  const c1 = toCamelot(key1);
  const c2 = toCamelot(key2);
  if (!c1 || !c2) return "clash";
  if (c1.number === c2.number && c1.letter === c2.letter) return "perfect";
  if (c1.number === c2.number && c1.letter !== c2.letter) return "mood-change";
  if (c1.letter === c2.letter) {
    const diff = (c2.number - c1.number + 12) % 12;
    if (diff === 1) return "energy-boost";
    if (diff === 11) return "energy-drop";
  }
  return "clash";
}
function keyCompatibilityColor(compat) {
  switch (compat) {
    case "perfect":
      return "#22c55e";
    // green-500
    case "compatible":
      return "#22c55e";
    // green-500
    case "energy-boost":
      return "#3b82f6";
    // blue-500
    case "energy-drop":
      return "#a855f7";
    // purple-500
    case "mood-change":
      return "#f59e0b";
    // amber-500
    case "clash":
      return "#ef4444";
  }
}
function camelotColor(keyStr) {
  const c = toCamelot(keyStr);
  if (!c) return "#6b7280";
  const hue = (c.number - 1) * 30 % 360;
  const sat = c.letter === "B" ? 70 : 55;
  const lit = c.letter === "B" ? 65 : 55;
  return `hsl(${hue}, ${sat}%, ${lit}%)`;
}
function normalizeKeyName(raw) {
  const m = raw.match(/^([A-Ga-g][#b♯♭]?)\s*(min(?:or)?|maj(?:or)?|m)$/i);
  if (!m) return null;
  let root = m[1].charAt(0).toUpperCase() + m[1].slice(1).toLowerCase();
  root = root.replace("♯", "#").replace("♭", "b");
  const quality = m[2].toLowerCase();
  const isMinor = quality === "m" || quality.startsWith("min");
  return `${root} ${isMinor ? "minor" : "major"}`;
}
const POLL_INTERVAL_MS = 500;
const PRELOAD_LEAD_TIME_SEC = 60;
const MAX_SKIP_ATTEMPTS = 50;
const SKIP_TRANSITION_BARS = 4;
let instance = null;
function getAutoDJ() {
  if (!instance) {
    instance = new DJAutoDJ();
  }
  return instance;
}
class DJAutoDJ {
  activeDeck = "A";
  idleDeck = "B";
  pollTimer = null;
  transitionCancel = null;
  preloading = false;
  preloadedDeck = null;
  shuffleOrder = [];
  shufflePosition = 0;
  // Stale position detection — if timeRemaining doesn't change for too long, force preload
  lastTimeRemaining = Infinity;
  staleCount = 0;
  // ── Public API ───────────────────────────────────────────────────────────
  /**
   * Enable Auto DJ mode. Starts playing through the active playlist.
   * If a deck is already playing, uses that as the starting point.
   */
  async enable(startIndex) {
    console.log("[AutoDJ] enable() called, startIndex:", startIndex);
    const playlist = this.getActivePlaylist();
    if (!playlist) {
      console.warn("[AutoDJ] No active playlist");
      return "Create a playlist and add tracks first";
    }
    if (playlist.tracks.length < 2) {
      console.warn("[AutoDJ] Need at least 2 tracks — have:", playlist.tracks.length);
      return `Need at least 2 tracks in playlist (have ${playlist.tracks.length})`;
    }
    const modlandCount = playlist.tracks.filter((t) => t.fileName.startsWith("modland:")).length;
    if (modlandCount < 2) {
      console.warn("[AutoDJ] Need at least 2 downloadable (modland) tracks — have:", modlandCount);
      return `Need at least 2 downloadable tracks (have ${modlandCount} — add tracks from Modland browser)`;
    }
    console.log(`[AutoDJ] Playlist: "${playlist.name}", ${playlist.tracks.length} tracks`);
    const store = useDJStore.getState();
    if (store.decks.A.isPlaying) {
      this.activeDeck = "A";
      this.idleDeck = "B";
    } else if (store.decks.B.isPlaying) {
      this.activeDeck = "B";
      this.idleDeck = "A";
    } else {
      this.activeDeck = "A";
      this.idleDeck = "B";
    }
    const currentIndex = startIndex ?? 0;
    const nextIndex = this.computeNextIndex(currentIndex, playlist.tracks.length);
    const crossfaderTarget = this.activeDeck === "A" ? 0 : 1;
    try {
      getDJEngine().setCrossfader(crossfaderTarget);
    } catch {
    }
    store.setCrossfader(crossfaderTarget);
    store.setAutoDJEnabled(true);
    store.setAutoDJStatus("playing");
    store.setAutoDJTrackIndices(currentIndex, nextIndex);
    if (playlist.masterEffects && playlist.masterEffects.length > 0) {
      console.log(`[AutoDJ] Applying playlist master FX (${playlist.masterEffects.length} effects)`);
      useAudioStore.getState().setMasterEffects(playlist.masterEffects);
    }
    if (store.autoDJShuffle) {
      this.generateShuffleOrder(playlist.tracks.length, currentIndex);
    }
    if (!store.decks[this.activeDeck].isPlaying) {
      console.log(`[AutoDJ] No deck playing, loading first track to deck ${this.activeDeck}...`);
      let idx = currentIndex;
      let loaded = false;
      for (let attempts = 0; attempts < playlist.tracks.length; attempts++) {
        const track = playlist.tracks[idx];
        if (track) {
          console.log(`[AutoDJ] Trying track ${idx}: "${track.trackName}" (${track.fileName.substring(0, 60)}...)`);
          loaded = await loadPlaylistTrackToDeck(track, this.activeDeck);
          if (loaded) {
            const nextIdx = this.computeNextIndex(idx, playlist.tracks.length);
            useDJStore.getState().setAutoDJTrackIndices(idx, nextIdx);
            const plId = useDJPlaylistStore.getState().activePlaylistId;
            if (plId) useDJPlaylistStore.getState().markTrackPlayed(plId, idx);
            try {
              const deck = getDJEngine().getDeck(this.activeDeck);
              await deck.play();
              useDJStore.getState().setDeckPlaying(this.activeDeck, true);
            } catch (err) {
              console.error("[AutoDJ] Failed to start playback:", err);
            }
            break;
          }
        }
        idx = (idx + 1) % playlist.tracks.length;
        if (idx === currentIndex) break;
      }
      if (!loaded) {
        console.warn("[AutoDJ] No loadable tracks found in playlist");
        this.disable();
        return "Could not load any tracks from playlist — check network connection";
      }
    }
    this.preloading = false;
    this.preloadedDeck = null;
    this.startPolling();
    const finalIdx = useDJStore.getState().autoDJCurrentTrackIndex;
    console.log(`[AutoDJ] Enabled — starting from track ${finalIdx + 1}/${playlist.tracks.length}`);
    return null;
  }
  /** Disable Auto DJ gracefully. Current track keeps playing. */
  disable() {
    this.stopPolling();
    this.cancelTransition();
    this.preloading = false;
    this.preloadedDeck = null;
    const store = useDJStore.getState();
    store.setAutoDJEnabled(false);
    store.setAutoDJStatus("idle");
    console.log("[AutoDJ] Disabled");
  }
  /** Pause Auto DJ — stops polling/transitions but keeps current track playing. */
  pause() {
    this.stopPolling();
    this.cancelTransition();
    useDJStore.getState().setAutoDJStatus("playing");
    console.log("[AutoDJ] Paused");
  }
  /** Resume Auto DJ — restarts polling from current position. */
  resume() {
    const store = useDJStore.getState();
    if (!store.autoDJEnabled) return;
    this.startPolling();
    store.setAutoDJStatus("playing");
    console.log("[AutoDJ] Resumed");
  }
  /** Jump to a specific track index with a smooth transition. */
  async playFromIndex(index) {
    const store = useDJStore.getState();
    if (!store.autoDJEnabled) return;
    const playlist = this.getActivePlaylist();
    if (!playlist || index < 0 || index >= playlist.tracks.length) return;
    this.cancelTransition();
    this.preloading = false;
    this.preloadedDeck = null;
    const track = playlist.tracks[index];
    store.setAutoDJStatus("preloading");
    store.setAutoDJTrackIndices(index, (index + 1) % playlist.tracks.length);
    const loaded = await loadPlaylistTrackToDeck(track, this.idleDeck);
    if (!loaded) {
      store.setAutoDJStatus("playing");
      return;
    }
    this.preloadedDeck = this.idleDeck;
    this.triggerTransition(SKIP_TRANSITION_BARS);
    console.log(`[AutoDJ] Transitioning to index ${index}: ${track.trackName}`);
  }
  /** Skip to the next track immediately with a short transition. */
  async skip() {
    const store = useDJStore.getState();
    if (!store.autoDJEnabled) return;
    if (this.preloadedDeck) {
      this.cancelTransition();
      this.triggerTransition(SKIP_TRANSITION_BARS);
    } else {
      this.cancelTransition();
      const playlist = this.getActivePlaylist();
      if (!playlist) return;
      const nextIdx = store.autoDJNextTrackIndex;
      const track = playlist.tracks[nextIdx];
      if (!track) return;
      store.setAutoDJStatus("preloading");
      const loaded = await loadPlaylistTrackToDeck(track, this.idleDeck);
      if (loaded) {
        this.preloadedDeck = this.idleDeck;
        this.triggerTransition(SKIP_TRANSITION_BARS);
      }
    }
  }
  // ── Private: Polling ─────────────────────────────────────────────────────
  startPolling() {
    this.stopPolling();
    this.pollTimer = setInterval(() => this.pollLoop(), POLL_INTERVAL_MS);
  }
  stopPolling() {
    if (this.pollTimer !== null) {
      clearInterval(this.pollTimer);
      this.pollTimer = null;
    }
  }
  pollCount = 0;
  pollLoop() {
    var _a, _b;
    const store = useDJStore.getState();
    if (!store.autoDJEnabled) {
      this.stopPolling();
      return;
    }
    const status = store.autoDJStatus;
    const timeRemaining = this.getTimeRemaining();
    this.pollCount++;
    if (this.pollCount % 10 === 0) {
      const cf = store.crossfaderPosition.toFixed(2);
      const aPlay = store.decks.A.isPlaying;
      const bPlay = store.decks.B.isPlaying;
      const aFile = ((_a = store.decks.A.fileName) == null ? void 0 : _a.split("/").pop()) ?? "empty";
      const bFile = ((_b = store.decks.B.fileName) == null ? void 0 : _b.split("/").pop()) ?? "empty";
      console.log(`[AutoDJ poll] status=${status} active=${this.activeDeck} idle=${this.idleDeck} cf=${cf} timeLeft=${timeRemaining.toFixed(1)}s A:[${aPlay ? "PLAY" : "stop"}]${aFile} B:[${bPlay ? "PLAY" : "stop"}]${bFile} preloaded=${this.preloadedDeck ?? "none"}`);
    }
    switch (status) {
      case "playing": {
        if (Math.abs(timeRemaining - this.lastTimeRemaining) < 0.1) {
          this.staleCount++;
        } else {
          this.staleCount = 0;
        }
        this.lastTimeRemaining = timeRemaining;
        const positionFrozen = this.staleCount > 12 && timeRemaining < Infinity;
        const shouldPreload = timeRemaining < PRELOAD_LEAD_TIME_SEC || timeRemaining === Infinity || positionFrozen;
        if (shouldPreload && !this.preloading && !this.preloadedDeck) {
          if (positionFrozen) {
            console.warn(`[AutoDJ] Position frozen at ${timeRemaining.toFixed(1)}s for ${this.staleCount} polls — forcing preload`);
          }
          this.preloadNextTrack();
        }
        break;
      }
      case "transition-pending": {
        const transitionDuration = this.getTransitionDurationSec();
        if (timeRemaining <= transitionDuration) {
          console.log(`[AutoDJ] Triggering transition: timeLeft=${timeRemaining.toFixed(1)}s <= transitionDur=${transitionDuration.toFixed(1)}s`);
          this.triggerTransition(store.autoDJTransitionBars);
        }
        break;
      }
      case "transitioning": {
        const outgoingPlaying = store.decks[this.activeDeck].isPlaying;
        const incomingPlaying = store.decks[this.idleDeck].isPlaying;
        const crossfader = store.crossfaderPosition;
        const crossfaderDone = this.idleDeck === "B" ? crossfader >= 0.98 : this.idleDeck === "A" ? crossfader <= 0.02 : false;
        if (this.pollCount % 4 === 0) {
          console.log(`[AutoDJ transition] outgoing=${this.activeDeck}:${outgoingPlaying} incoming=${this.idleDeck}:${incomingPlaying} cf=${crossfader.toFixed(2)} cfDone=${crossfaderDone}`);
        }
        if (crossfaderDone && !outgoingPlaying) {
          this.completeTransition();
        }
        break;
      }
      case "preloading":
        break;
      case "preload-failed":
        console.log("[AutoDJ] Retrying after preload failure");
        this.preloading = false;
        this.preloadedDeck = null;
        store.setAutoDJStatus("playing");
        break;
      case "idle":
        this.stopPolling();
        break;
    }
  }
  // ── Private: Preloading ──────────────────────────────────────────────────
  async preloadNextTrack() {
    if (this.preloading) return;
    this.preloading = true;
    const store = useDJStore.getState();
    const playlist = this.getActivePlaylist();
    if (!playlist) {
      this.preloading = false;
      return;
    }
    store.setAutoDJStatus("preloading");
    let nextIdx = store.autoDJNextTrackIndex;
    let attempts = 0;
    while (attempts < MAX_SKIP_ATTEMPTS) {
      const track = playlist.tracks[nextIdx];
      if (!track) {
        nextIdx = 0;
        if (attempts > 0) break;
        attempts++;
        continue;
      }
      console.log(`[AutoDJ] Preloading track ${nextIdx + 1}/${playlist.tracks.length} to deck ${this.idleDeck}: ${track.trackName}`);
      try {
        const loaded = await loadPlaylistTrackToDeck(track, this.idleDeck);
        if (loaded) {
          this.preloadedDeck = this.idleDeck;
          useDJStore.getState().setAutoDJTrackIndices(
            useDJStore.getState().autoDJCurrentTrackIndex,
            nextIdx
          );
          useDJStore.getState().setAutoDJStatus("transition-pending");
          console.log(`[AutoDJ] Preload complete → deck ${this.idleDeck}, status=transition-pending`);
          this.preloading = false;
          return;
        }
      } catch (err) {
        console.error(`[AutoDJ] Preload failed for ${track.fileName}:`, err);
      }
      attempts++;
      nextIdx = this.computeNextIndex(nextIdx, playlist.tracks.length);
      console.warn(`[AutoDJ] Skipping unloadable track, trying index ${nextIdx}`);
    }
    console.error("[AutoDJ] Failed to preload any track after", MAX_SKIP_ATTEMPTS, "attempts");
    useDJStore.getState().setAutoDJStatus("preload-failed");
    this.preloading = false;
  }
  // ── Private: Transition ──────────────────────────────────────────────────
  triggerTransition(_userBars) {
    var _a, _b;
    const store = useDJStore.getState();
    if (!this.preloadedDeck) return;
    const outState = store.decks[this.activeDeck];
    const inState = store.decks[this.idleDeck];
    const transType = this.selectTransitionType(outState, inState);
    const bars = this.getSmartTransitionBars(outState, inState, transType);
    store.setDeckPlaying(this.idleDeck, true);
    store.setAutoDJStatus("transitioning");
    const aFile = ((_a = store.decks.A.fileName) == null ? void 0 : _a.split("/").pop()) ?? "empty";
    const bFile = ((_b = store.decks.B.fileName) == null ? void 0 : _b.split("/").pop()) ?? "empty";
    console.log(`[AutoDJ] ${transType.toUpperCase()} ${bars}-bar: ${this.activeDeck} → ${this.idleDeck} | A:${aFile} B:${bFile}`);
    switch (transType) {
      case "cut":
        this.transitionCancel = cutTransition(this.activeDeck, this.idleDeck);
        break;
      case "echo-out":
        this.transitionCancel = echoOutTransition(this.activeDeck, this.idleDeck, bars * 4);
        break;
      case "filter-build":
        this.transitionCancel = filterBuildTransition(this.activeDeck, this.idleDeck, bars);
        break;
      case "bass-swap":
        this.transitionCancel = bassSwapTransition(this.activeDeck, this.idleDeck, bars);
        break;
      case "crossfade":
      default:
        this.transitionCancel = beatMatchedTransition(
          this.activeDeck,
          this.idleDeck,
          bars,
          store.autoDJWithFilter
        );
        break;
    }
  }
  /**
   * Intelligently select transition type based on track characteristics.
   */
  selectTransitionType(outgoing, incoming) {
    const bpmDiff = Math.abs((outgoing.effectiveBPM || 125) - (incoming.effectiveBPM || 125));
    const outEnergy = outgoing.energy ?? 0.5;
    const inEnergy = incoming.energy ?? 0.5;
    const keyCompat = keyCompatibility(outgoing.musicalKey, incoming.musicalKey);
    if (bpmDiff < 4 && outEnergy > 0.6) {
      const roll = Math.random();
      if (keyCompat === "perfect" || keyCompat === "energy-boost") {
        if (roll < 0.3) return "bass-swap";
        if (roll < 0.5) return "cut";
      } else {
        if (roll < 0.3) return "cut";
      }
    }
    if (inEnergy < outEnergy - 0.15) {
      if (Math.random() < 0.5) return "echo-out";
    }
    if (inEnergy > outEnergy + 0.1) {
      if (Math.random() < 0.4) return "filter-build";
    }
    return "crossfade";
  }
  /**
   * Smart transition duration based on context.
   */
  getSmartTransitionBars(outgoing, incoming, transType) {
    if (transType === "cut") return 1;
    if (transType === "echo-out") return 4;
    const bpmDiff = Math.abs((outgoing.effectiveBPM || 125) - (incoming.effectiveBPM || 125));
    const energyJump = Math.abs((outgoing.energy ?? 0.5) - (incoming.energy ?? 0.5));
    if (bpmDiff < 3 && (outgoing.energy ?? 0.5) > 0.6) return 4;
    if (bpmDiff > 10) return 32;
    if (energyJump > 0.3) return 16;
    return 8;
  }
  cancelTransition() {
    if (this.transitionCancel) {
      this.transitionCancel();
      this.transitionCancel = null;
    }
  }
  completeTransition() {
    var _a, _b;
    this.transitionCancel = null;
    try {
      const outgoing = getDJEngine().getDeck(this.activeDeck);
      outgoing.stop();
      outgoing.setFilterPosition(0);
      setTrackedFilterPosition(this.activeDeck, 0);
      outgoing.setVolume(1);
    } catch {
    }
    useDJStore.getState().setDeckPlaying(this.activeDeck, false);
    useDJStore.getState().setDeckFilter(this.activeDeck, 0);
    useDJStore.getState().setDeckVolume(this.activeDeck, 1);
    const oldActive = this.activeDeck;
    this.activeDeck = this.idleDeck;
    this.idleDeck = oldActive;
    this.staleCount = 0;
    this.lastTimeRemaining = Infinity;
    const crossfaderSnap = this.activeDeck === "A" ? 0 : 1;
    try {
      getDJEngine().setCrossfader(crossfaderSnap);
    } catch {
    }
    useDJStore.getState().setCrossfader(crossfaderSnap);
    const store = useDJStore.getState();
    const playlist = this.getActivePlaylist();
    const trackCount = (playlist == null ? void 0 : playlist.tracks.length) ?? 1;
    const newCurrentIdx = store.autoDJNextTrackIndex;
    const newNextIdx = this.computeNextIndex(newCurrentIdx, trackCount);
    store.setAutoDJTrackIndices(newCurrentIdx, newNextIdx);
    store.setAutoDJStatus("playing");
    this.preloading = false;
    this.preloadedDeck = null;
    const plId = useDJPlaylistStore.getState().activePlaylistId;
    if (plId) useDJPlaylistStore.getState().markTrackPlayed(plId, newCurrentIdx);
    const aFile = ((_a = useDJStore.getState().decks.A.fileName) == null ? void 0 : _a.split("/").pop()) ?? "empty";
    const bFile = ((_b = useDJStore.getState().decks.B.fileName) == null ? void 0 : _b.split("/").pop()) ?? "empty";
    console.log(`[AutoDJ] Transition complete — active=${this.activeDeck} idle=${this.idleDeck} cf=${crossfaderSnap} track ${newCurrentIdx + 1}/${trackCount} next=${newNextIdx} A:${aFile} B:${bFile}`);
    this.preloadNextTrack();
  }
  // ── Private: Helpers ─────────────────────────────────────────────────────
  getActivePlaylist() {
    const playlistStore = useDJPlaylistStore.getState();
    if (!playlistStore.activePlaylistId) return null;
    return playlistStore.playlists.find((p) => p.id === playlistStore.activePlaylistId) ?? null;
  }
  getTimeRemaining() {
    const state = useDJStore.getState().decks[this.activeDeck];
    if (state.playbackMode === "audio" && state.durationMs > 0) {
      return state.durationMs / 1e3 - state.audioPosition;
    }
    if (state.durationMs > 0) {
      return (state.durationMs - state.elapsedMs) / 1e3;
    }
    return Infinity;
  }
  getTransitionDurationSec() {
    var _a, _b;
    const state = useDJStore.getState();
    const deckState = state.decks[this.activeDeck];
    const bpm = ((_a = deckState.beatGrid) == null ? void 0 : _a.bpm) || deckState.detectedBPM || deckState.effectiveBPM || 125;
    const beatsPerBar = ((_b = deckState.beatGrid) == null ? void 0 : _b.timeSignature) || 4;
    const totalBeats = state.autoDJTransitionBars * beatsPerBar;
    return totalBeats * 60 / bpm;
  }
  computeNextIndex(currentIndex, trackCount) {
    if (trackCount <= 1) return 0;
    const store = useDJStore.getState();
    if (store.autoDJShuffle) {
      this.shufflePosition++;
      if (this.shufflePosition >= this.shuffleOrder.length) {
        this.generateShuffleOrder(trackCount, currentIndex);
      }
      return this.shuffleOrder[this.shufflePosition] ?? 0;
    }
    return (currentIndex + 1) % trackCount;
  }
  generateShuffleOrder(trackCount, currentIndex) {
    const indices = Array.from({ length: trackCount }, (_, i) => i).filter((i) => i !== currentIndex);
    for (let i = indices.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [indices[i], indices[j]] = [indices[j], indices[i]];
    }
    this.shuffleOrder = indices;
    this.shufflePosition = 0;
  }
}
const BPM_PENALTY_SCALE = 0.8;
const BPM_UNKNOWN_PENALTY = 30;
const KEY_SCORE = {
  "perfect": -20,
  // same key — seamless harmonic blend
  "energy-boost": -12,
  // +1 on wheel — lifts the energy
  "energy-drop": -12,
  // -1 on wheel — brings it down smoothly
  "mood-change": -5,
  // relative major/minor — subtle mood shift
  "compatible": -10,
  // generic compatible (shouldn't occur with our keyCompat fn)
  "clash": 50
  // dissonant — crowd hears it
};
const KEY_UNKNOWN_PENALTY = 5;
const ENERGY_JUMP_SCALE = 60;
const ENERGY_DIRECTION_BONUS = -3;
function transitionScore(a, b, prevEnergyDelta) {
  let score = 0;
  if (a.bpm > 0 && b.bpm > 0) {
    const direct = Math.abs(a.bpm - b.bpm);
    const half = Math.abs(a.bpm - b.bpm * 2);
    const double = Math.abs(a.bpm * 2 - b.bpm);
    const diff = Math.min(direct, half, double);
    score += diff * diff * BPM_PENALTY_SCALE;
  } else {
    score += BPM_UNKNOWN_PENALTY;
  }
  if (a.musicalKey && b.musicalKey) {
    const compat = keyCompatibility(a.musicalKey, b.musicalKey);
    score += KEY_SCORE[compat] ?? 0;
  } else {
    score += KEY_UNKNOWN_PENALTY;
  }
  const eA = a.energy ?? 0.5;
  const eB = b.energy ?? 0.5;
  const eDelta = eB - eA;
  const eAbsDelta = Math.abs(eDelta);
  score += eAbsDelta * eAbsDelta * ENERGY_JUMP_SCALE;
  if (prevEnergyDelta !== 0) {
    const sameDirection = eDelta > 0 && prevEnergyDelta > 0 || eDelta < 0 && prevEnergyDelta < 0;
    if (sameDirection) score += ENERGY_DIRECTION_BONUS;
  }
  if (eAbsDelta >= 0.05 && eAbsDelta <= 0.2) {
    score -= 2;
  }
  return score;
}
function smartSort(tracks) {
  if (tracks.length <= 2) return [...tracks];
  const result = [];
  const remaining = new Set(tracks.map((_, i) => i));
  const energies = tracks.map((t) => t.energy ?? 0.5).sort((a, b) => a - b);
  const medianEnergy = energies[Math.floor(energies.length / 2)];
  let startIdx = 0;
  let bestStartScore = Infinity;
  for (const i of remaining) {
    const t = tracks[i];
    const energyDist = Math.abs((t.energy ?? 0.5) - medianEnergy * 0.7);
    const bpmFactor = t.bpm > 0 ? t.bpm / 200 : 0.5;
    const startScore = energyDist + bpmFactor * 0.3;
    if (startScore < bestStartScore) {
      bestStartScore = startScore;
      startIdx = i;
    }
  }
  result.push(tracks[startIdx]);
  remaining.delete(startIdx);
  let prevEnergyDelta = 0;
  while (remaining.size > 0) {
    const current = result[result.length - 1];
    let bestIdx = -1;
    let bestScore = Infinity;
    for (const i of remaining) {
      const score = transitionScore(current, tracks[i], prevEnergyDelta);
      if (score < bestScore) {
        bestScore = score;
        bestIdx = i;
      }
    }
    const picked = tracks[bestIdx];
    const eNow = current.energy ?? 0.5;
    const eNext = picked.energy ?? 0.5;
    prevEnergyDelta = eNext - eNow;
    result.push(picked);
    remaining.delete(bestIdx);
  }
  return result;
}
function sortByBPM(tracks, desc = false) {
  return [...tracks].sort((a, b) => {
    const bpmA = a.bpm || 999;
    const bpmB = b.bpm || 999;
    return desc ? bpmB - bpmA : bpmA - bpmB;
  });
}
function sortByKey(tracks) {
  return [...tracks].sort((a, b) => {
    const ca = toCamelot(a.musicalKey);
    const cb = toCamelot(b.musicalKey);
    if (!ca && !cb) return 0;
    if (!ca) return 1;
    if (!cb) return -1;
    if (ca.number !== cb.number) return ca.number - cb.number;
    return ca.letter.localeCompare(cb.letter);
  });
}
function sortByEnergy(tracks) {
  return [...tracks].sort((a, b) => {
    const ea = a.energy ?? 0.5;
    const eb = b.energy ?? 0.5;
    return ea - eb;
  });
}
function sortByName(tracks) {
  return [...tracks].sort((a, b) => a.trackName.localeCompare(b.trackName));
}
async function togglePlay(deckId, options = {}) {
  const {
    quantize = true,
    spinDownMs = 800,
    spinDownCurve = "exponential"
  } = options;
  if (getContext().state !== "running") {
    await start();
  }
  const store = useDJStore.getState();
  const isPlaying = store.decks[deckId].isPlaying;
  if (isPlaying) {
    if (spinDownMs > 0) {
      try {
        const deck = getDJEngine().getDeck(deckId);
        const startTime = performance.now();
        const startRate = 1;
        await new Promise((resolve) => {
          function tick() {
            const elapsed = performance.now() - startTime;
            const progress = Math.min(1, elapsed / spinDownMs);
            let rate;
            if (spinDownCurve === "exponential") {
              rate = startRate * Math.pow(1 - progress, 2);
            } else {
              rate = startRate * (1 - progress);
            }
            if (progress >= 1) {
              deck.pause();
              if (deck.playbackMode === "audio") {
                deck.audioPlayer.setPlaybackRate(1);
              } else {
                deck.replayer.setTempoMultiplier(1);
                deck.replayer.setPitchMultiplier(1);
              }
              useDJStore.getState().setDeckPlaying(deckId, false);
              resolve();
              return;
            }
            const clampedRate = Math.max(0.01, rate);
            if (deck.playbackMode === "audio") {
              deck.audioPlayer.setPlaybackRate(clampedRate);
            } else {
              deck.replayer.setTempoMultiplier(clampedRate);
              deck.replayer.setPitchMultiplier(clampedRate);
            }
            requestAnimationFrame(tick);
          }
          requestAnimationFrame(tick);
        });
      } catch {
        store.setDeckPlaying(deckId, false);
      }
    } else {
      store.setDeckPlaying(deckId, false);
      try {
        getDJEngine().getDeck(deckId).pause();
      } catch {
      }
    }
  } else {
    try {
      getDJEngine().getDeck(deckId).setVolume(store.decks[deckId].volume);
    } catch {
    }
    const fire = async () => {
      const s = useDJStore.getState();
      const otherDeckId = deckId === "A" ? "B" : "A";
      const otherIsPlaying = s.decks[otherDeckId].isPlaying;
      if (otherIsPlaying && s.decks[otherDeckId].beatGrid && s.decks[deckId].beatGrid) {
        syncBPMToOther(deckId, otherDeckId);
        const mode = getQuantizeMode();
        phaseAlign(deckId, otherDeckId, mode === "bar" ? "bar" : "beat");
      }
      s.setDeckPlaying(deckId, true);
      try {
        await getDJEngine().getDeck(deckId).play();
      } catch {
        useDJStore.getState().setDeckPlaying(deckId, false);
      }
    };
    if (quantize === false) {
      await fire();
    } else {
      quantizeAction(deckId, fire, { kind: "play", allowSolo: true });
    }
  }
}
function stopDeck(deckId) {
  useDJStore.getState().setDeckPlaying(deckId, false);
  try {
    getDJEngine().getDeck(deckId).stop();
  } catch {
  }
}
function cueDeck(deckId, position, pattPos = 0) {
  let snapped = position;
  try {
    const deck = getDJEngine().getDeck(deckId);
    if (deck.playbackMode === "audio") {
      snapped = snapPositionToBeat(deckId, position, "beat");
    }
  } catch {
  }
  useDJStore.getState().setDeckCuePoint(deckId, snapped);
  quantizeAction(
    deckId,
    () => {
      try {
        getDJEngine().getDeck(deckId).cue(snapped, pattPos);
      } catch {
      }
    },
    { kind: "cue", allowSolo: true }
  );
}
function syncDeckBPM(deckId, otherDeckId) {
  const resolvedOther = otherDeckId ?? (deckId === "A" ? "B" : "A");
  try {
    const engine = getDJEngine();
    const thisDeck = engine.getDeck(deckId);
    const otherDeck = engine.getDeck(resolvedOther);
    const store = useDJStore.getState();
    const otherState = store.decks[resolvedOther];
    const thisState = store.decks[deckId];
    if (!otherState.fileName) return;
    const cf = store.crossfaderPosition;
    if (deckId === "A" && cf < 1) store.setCrossfader(1);
    else if (deckId === "B" && cf > 0) store.setCrossfader(0);
    if (thisState.beatGrid && otherState.beatGrid) {
      const semitones = syncBPMToOther(deckId, resolvedOther);
      store.setDeckPitch(deckId, semitones);
      phaseAlign(deckId, resolvedOther);
    } else if (otherDeck.playbackMode === "audio" || thisDeck.playbackMode === "audio") {
      const targetBPM = otherState.detectedBPM;
      const thisBPMBase = thisState.detectedBPM;
      if (targetBPM > 0 && thisBPMBase > 0) {
        const ratio = targetBPM / thisBPMBase;
        const semitones = 12 * Math.log2(ratio);
        store.setDeckPitch(deckId, semitones);
      }
    } else {
      if (!otherDeck.replayer.getSong()) return;
      const semitones = DJBeatSync.syncBPM(otherDeck, thisDeck);
      store.setDeckPitch(deckId, semitones);
    }
    if (!thisState.isPlaying) {
      thisDeck.play().then(() => {
        useDJStore.getState().setDeckPlaying(deckId, true);
      }).catch(() => {
      });
    }
  } catch {
  }
}
function setDeckEQ(deckId, band, dB) {
  const clamped = Math.max(-24, Math.min(6, dB));
  useDJStore.getState().setDeckEQ(deckId, band, clamped);
  try {
    getDJEngine().getDeck(deckId).setEQ(band, clamped);
  } catch {
  }
}
function setDeckEQKill(deckId, band, kill) {
  useDJStore.getState().setDeckEQKill(deckId, band, kill);
  const qMode = getQuantizeMode();
  if (qMode !== "off") {
    return quantizedEQKill(deckId, band, kill);
  }
  try {
    getDJEngine().getDeck(deckId).setEQKill(band, kill);
  } catch {
  }
}
function setDeckFilter(deckId, position) {
  const clamped = Math.max(-1, Math.min(1, position));
  useDJStore.getState().setDeckFilter(deckId, clamped);
  setTrackedFilterPosition(deckId, clamped);
  try {
    getDJEngine().getDeck(deckId).setFilterPosition(clamped);
  } catch {
  }
}
function setDeckVolume(deckId, volume) {
  const clamped = Math.max(0, Math.min(1, volume));
  useDJStore.getState().setDeckVolume(deckId, clamped);
  try {
    getDJEngine().getDeck(deckId).setVolume(clamped);
  } catch {
  }
}
function setDeckTrimGain(deckId, dB) {
  const clamped = Math.max(-12, Math.min(12, dB));
  useDJStore.getState().setDeckTrimGain(deckId, clamped);
  try {
    getDJEngine().getDeck(deckId).setTrimGain(clamped);
  } catch {
  }
}
function setCrossfader(position) {
  const clamped = Math.max(0, Math.min(1, position));
  useDJStore.getState().setCrossfader(clamped);
  try {
    getDJEngine().mixer.setCrossfader(clamped);
  } catch {
  }
}
function setCrossfaderCurve(curve) {
  useDJStore.getState().setCrossfaderCurve(curve);
  try {
    getDJEngine().mixer.setCurve(curve);
  } catch {
  }
}
function setMasterVolume(volume) {
  const clamped = Math.max(0, Math.min(1.5, volume));
  useDJStore.getState().setMasterVolume(clamped);
  try {
    getDJEngine().mixer.setMasterVolume(clamped);
  } catch {
  }
}
function setBoothVolume(volume) {
  const clamped = Math.max(0, Math.min(1.5, volume));
  useDJStore.getState().setBoothVolume(clamped);
}
function togglePFL(deckId) {
  const store = useDJStore.getState();
  const current = store.decks[deckId].pflEnabled;
  const next = !current;
  store.setDeckPFL(deckId, next);
  try {
    getDJEngine().mixer.setPFL(deckId, next);
  } catch {
  }
}
function setDeckKeyLock(deckId, enabled) {
  useDJStore.getState().setDeckKeyLock(deckId, enabled);
  try {
    getDJEngine().getDeck(deckId).setKeyLock(enabled);
  } catch {
  }
}
function startScratch(deckId) {
  useDJStore.getState().setDeckScratchActive(deckId, true);
  try {
    getDJEngine().getDeck(deckId).startScratch();
  } catch {
  }
}
function setScratchVelocity(deckId, velocity) {
  useDJStore.getState().setDeckState(deckId, { scratchVelocity: velocity });
  try {
    getDJEngine().getDeck(deckId).setScratchVelocity(velocity);
  } catch {
  }
}
function stopScratch(deckId, decayMs = 200) {
  useDJStore.getState().setDeckScratchActive(deckId, false);
  useDJStore.getState().setDeckState(deckId, { scratchVelocity: 0 });
  try {
    getDJEngine().getDeck(deckId).stopScratch(decayMs);
  } catch {
  }
}
async function toggleMic() {
  const engine = getDJEngineIfActive();
  if (!engine) return;
  const active = await engine.toggleMic();
  useDJSetStore.getState().setMicEnabled(active);
}
function setMicGain(gain) {
  var _a;
  const clamped = Math.max(0, Math.min(1.5, gain));
  useDJSetStore.getState().setMicGain(clamped);
  const engine = getDJEngineIfActive();
  (_a = engine == null ? void 0 : engine.mic) == null ? void 0 : _a.setGain(clamped);
}
function nudgeDeck(deckId, offset, ticks = 8) {
  try {
    getDJEngine().getDeck(deckId).nudge(offset, ticks);
  } catch {
  }
}
function setDeckLineLoop(deckId, size) {
  try {
    getDJEngine().getDeck(deckId).setLineLoop(size);
  } catch {
  }
}
function clearDeckLineLoop(deckId) {
  try {
    getDJEngine().getDeck(deckId).clearLineLoop();
  } catch {
  }
}
function setDeckSlipEnabled(deckId, enabled) {
  try {
    getDJEngine().getDeck(deckId).setSlipEnabled(enabled);
  } catch {
  }
}
function killAllDecks() {
  useDJStore.getState().setDeckPlaying("A", false);
  useDJStore.getState().setDeckPlaying("B", false);
  try {
    getDJEngine().killAll();
  } catch {
  }
}
function setDeckPitch(deckId, semitones) {
  useDJStore.getState().setDeckPitch(deckId, semitones);
  try {
    getDJEngine().getDeck(deckId).setPitch(semitones);
  } catch {
  }
}
function setDeckChannelMuteMask(deckId, mask) {
  try {
    getDJEngine().getDeck(deckId).replayer.setChannelMuteMask(mask);
  } catch {
  }
}
function seekDeck(deckId, position, pattPos = 0) {
  try {
    getDJEngine().getDeck(deckId).cue(position, pattPos);
  } catch {
  }
}
function seekDeckAudio(deckId, seconds) {
  try {
    getDJEngine().getDeck(deckId).audioPlayer.seek(seconds);
  } catch {
  }
}
function playDeckPattern(deckId, name, onWaiting) {
  try {
    getDJEngine().getDeck(deckId).playPattern(name, onWaiting);
  } catch {
  }
}
function stopDeckPattern(deckId) {
  try {
    getDJEngine().getDeck(deckId).stopPattern();
  } catch {
  }
}
function finishDeckPatternCycle(deckId) {
  try {
    getDJEngine().getDeck(deckId).finishPatternCycle();
  } catch {
  }
}
function startDeckFaderLFO(deckId, division) {
  try {
    getDJEngine().getDeck(deckId).startFaderLFO(division);
  } catch {
  }
}
function stopDeckFaderLFO(deckId) {
  try {
    getDJEngine().getDeck(deckId).stopFaderLFO();
  } catch {
  }
}
async function startRecording() {
  const { DJSetRecorder } = await __vitePreload(async () => {
    const { DJSetRecorder: DJSetRecorder2 } = await import("./DJSetRecorder-BgnmRf83.js");
    return { DJSetRecorder: DJSetRecorder2 };
  }, true ? __vite__mapDeps([7,0,1,2,3,4,5,6]) : void 0);
  const recorder = new DJSetRecorder();
  recorder.startRecording();
  const engine = getDJEngineIfActive();
  if (engine) engine.recorder = recorder;
  useDJSetStore.getState().setRecording(true);
  useDJSetStore.getState().setRecordingStartTime(Date.now());
}
async function stopRecording(name, userId, username) {
  const engine = getDJEngineIfActive();
  if (!(engine == null ? void 0 : engine.recorder)) return null;
  const set = engine.recorder.stopRecording(name, userId, username);
  engine.recorder = null;
  useDJSetStore.getState().setRecording(false);
  useDJSetStore.getState().setRecordingDuration(0);
  return set;
}
async function enableAutoDJ(startIndex) {
  const { activePlaylistId, playlists, sortTracks } = useDJPlaylistStore.getState();
  if (activePlaylistId) {
    const playlist = playlists.find((p) => p.id === activePlaylistId);
    if (playlist && playlist.tracks.length >= 2) {
      const sorted = smartSort([...playlist.tracks]);
      sortTracks(activePlaylistId, sorted);
    }
  }
  return await getAutoDJ().enable(startIndex);
}
function disableAutoDJ() {
  getAutoDJ().disable();
}
async function skipAutoDJ() {
  await getAutoDJ().skip();
}
function pauseAutoDJ() {
  getAutoDJ().pause();
}
function resumeAutoDJ() {
  getAutoDJ().resume();
}
async function playAutoDJFromIndex(index) {
  await getAutoDJ().playFromIndex(index);
}
const DJActions = /* @__PURE__ */ Object.freeze(/* @__PURE__ */ Object.defineProperty({
  __proto__: null,
  clearDeckLineLoop,
  cueDeck,
  disableAutoDJ,
  enableAutoDJ,
  finishDeckPatternCycle,
  killAllDecks,
  nudgeDeck,
  pauseAutoDJ,
  playAutoDJFromIndex,
  playDeckPattern,
  resumeAutoDJ,
  seekDeck,
  seekDeckAudio,
  setBoothVolume,
  setCrossfader,
  setCrossfaderCurve,
  setDeckChannelMuteMask,
  setDeckEQ,
  setDeckEQKill,
  setDeckFilter,
  setDeckKeyLock,
  setDeckLineLoop,
  setDeckPitch,
  setDeckSlipEnabled,
  setDeckTrimGain,
  setDeckVolume,
  setMasterVolume,
  setMicGain,
  setScratchVelocity,
  skipAutoDJ,
  startDeckFaderLFO,
  startRecording,
  startScratch,
  stopDeck,
  stopDeckFaderLFO,
  stopDeckPattern,
  stopRecording,
  stopScratch,
  syncDeckBPM,
  toggleMic,
  togglePFL,
  togglePlay
}, Symbol.toStringTag, { value: "Module" }));
export {
  resumeAutoDJ as $,
  syncDeckBPM as A,
  camelotDisplay as B,
  keyCompatibility as C,
  DJBeatSync as D,
  keyCompatibilityColor as E,
  camelotColor as F,
  seekDeckAudio as G,
  playDeckPattern as H,
  finishDeckPatternCycle as I,
  stopDeckPattern as J,
  stopDeckFaderLFO as K,
  startDeckFaderLFO as L,
  setDeckPitch as M,
  setDeckChannelMuteMask as N,
  cacheSong as O,
  detectBPM as P,
  setDeckEQKill as Q,
  stopRecording as R,
  startRecording as S,
  estimateSongDuration as T,
  getCachedFilenames as U,
  cacheSourceFile as V,
  sortByName as W,
  sortByEnergy as X,
  sortByKey as Y,
  sortByBPM as Z,
  smartSort as _,
  startScratch as a,
  pauseAutoDJ as a0,
  playAutoDJFromIndex as a1,
  clearSongCache as a2,
  toggleMic as a3,
  setMicGain as a4,
  DJSongCache as a5,
  DJBeatDetector as a6,
  DJActions as a7,
  setScratchVelocity as b,
  stopScratch as c,
  disableAutoDJ as d,
  enableAutoDJ as e,
  getCachedAudio as f,
  getDJPipeline as g,
  setDeckSlipEnabled as h,
  isCached as i,
  setCrossfader as j,
  killAllDecks as k,
  setDeckLineLoop as l,
  clearDeckLineLoop as m,
  nudgeDeck as n,
  cueDeck as o,
  togglePFL as p,
  setDeckVolume as q,
  setMasterVolume as r,
  skipAutoDJ as s,
  togglePlay as t,
  setDeckTrimGain as u,
  setDeckEQ as v,
  setBoothVolume as w,
  setCrossfaderCurve as x,
  setDeckFilter as y,
  setDeckKeyLock as z
};
