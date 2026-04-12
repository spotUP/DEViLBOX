import { bO as getDevilboxAudioContext, $ as getToneEngine } from "./main-BbV5VyEH.js";
import "./client-DHYdgbIN.js";
import "./vendor-ui-AJ7AT9BN.js";
import "./vendor-react-Dgd_wxYf.js";
import "./vendor-utils-a-Usm5Xm.js";
import "./vendor-tone-48TQc1H3.js";
class MaEngine {
  static instance = null;
  static wasmBinary = null;
  static jsCode = null;
  static loadedContexts = /* @__PURE__ */ new WeakSet();
  static initPromises = /* @__PURE__ */ new WeakMap();
  audioContext;
  workletNode = null;
  output;
  _initPromise;
  _resolveInit = null;
  _disposed = false;
  _requestId = 0;
  _pendingRequests = /* @__PURE__ */ new Map();
  constructor() {
    this.audioContext = getDevilboxAudioContext();
    this.output = this.audioContext.createGain();
    this._initPromise = new Promise((resolve) => {
      this._resolveInit = resolve;
    });
    this.initialize();
  }
  static getInstance() {
    if (!MaEngine.instance || MaEngine.instance._disposed) {
      MaEngine.instance = new MaEngine();
    }
    return MaEngine.instance;
  }
  static hasInstance() {
    return !!MaEngine.instance && !MaEngine.instance._disposed;
  }
  setChannelGain(channel, gain) {
    var _a;
    (_a = this.workletNode) == null ? void 0 : _a.port.postMessage({ type: "setChannelGain", channel, gain });
  }
  async initialize() {
    try {
      await MaEngine.ensureInitialized(this.audioContext);
      this.createNode();
    } catch (err) {
      console.error("[MaEngine] Initialization failed:", err);
    }
  }
  static async ensureInitialized(context) {
    if (this.loadedContexts.has(context)) return;
    const existingPromise = this.initPromises.get(context);
    if (existingPromise) return existingPromise;
    const initPromise = (async () => {
      const baseUrl = "/";
      try {
        await context.audioWorklet.addModule(`${baseUrl}ma/Ma.worklet.js`);
      } catch {
      }
      if (!this.wasmBinary || !this.jsCode) {
        const [wasmResponse, jsResponse] = await Promise.all([
          fetch(`${baseUrl}ma/Ma.wasm`),
          fetch(`${baseUrl}ma/Ma.js`)
        ]);
        if (wasmResponse.ok) this.wasmBinary = await wasmResponse.arrayBuffer();
        if (jsResponse.ok) {
          let code = await jsResponse.text();
          code = code.replace(/import\.meta\.url/g, "'.'").replace(/export\s+default\s+\w+;?/g, "").replace(/var\s+wasmBinary;/, 'var wasmBinary = Module["wasmBinary"];').replace(/HEAPU8=new Uint8Array\(b\);/, 'HEAPU8=new Uint8Array(b);Module["HEAPU8"]=HEAPU8;').replace(/HEAPF32=new Float32Array\(b\);/, 'HEAPF32=new Float32Array(b);Module["HEAPF32"]=HEAPF32;');
          this.jsCode = code;
        }
      }
      this.loadedContexts.add(context);
    })();
    this.initPromises.set(context, initPromise);
    return initPromise;
  }
  createNode() {
    const ctx = this.audioContext;
    this.workletNode = new AudioWorkletNode(ctx, "ma-processor", {
      outputChannelCount: [2],
      numberOfOutputs: 1
    });
    this.workletNode.port.onmessage = (event) => {
      const data = event.data;
      switch (data.type) {
        case "ready":
          console.log("[MaEngine] WASM ready");
          if (this._resolveInit) {
            this._resolveInit();
            this._resolveInit = null;
          }
          break;
        case "moduleLoaded":
          console.log("[MaEngine] Module loaded");
          break;
        case "chLevels":
          try {
            const engine = getToneEngine();
            const levels = data.levels;
            for (let i = 0; i < levels.length; i++) {
              engine.triggerChannelMeter(i, levels[i]);
            }
          } catch {
          }
          break;
        case "trackLength":
        case "cellData":
        case "patternData":
        case "cellSet":
        case "numTracks":
        case "save-data": {
          const resolve = this._pendingRequests.get(data.requestId);
          if (resolve) {
            this._pendingRequests.delete(data.requestId);
            resolve(data);
          }
          break;
        }
        case "error":
          console.error("[MaEngine]", data.message);
          break;
      }
    };
    this.workletNode.port.postMessage({
      type: "init",
      sampleRate: ctx.sampleRate,
      wasmBinary: MaEngine.wasmBinary,
      jsCode: MaEngine.jsCode
    });
    this.workletNode.connect(this.output);
  }
  async ready() {
    return this._initPromise;
  }
  async loadTune(buffer) {
    await this._initPromise;
    if (!this.workletNode) throw new Error("MaEngine not initialized");
    this.workletNode.port.postMessage({ type: "loadModule", moduleData: buffer });
  }
  play() {
    var _a;
    (_a = this.workletNode) == null ? void 0 : _a.port.postMessage({ type: "play" });
  }
  stop() {
    var _a;
    (_a = this.workletNode) == null ? void 0 : _a.port.postMessage({ type: "stop" });
  }
  pause() {
    var _a;
    (_a = this.workletNode) == null ? void 0 : _a.port.postMessage({ type: "stop" });
  }
  /**
   * Trigger instrument preview (0-based instrument index, 0-47 note index, 0-64 velocity).
   * Note index: 12 = C-3 (period 856). Uses MA period table directly.
   */
  noteOn(instrument, note, velocity) {
    var _a;
    (_a = this.workletNode) == null ? void 0 : _a.port.postMessage({ type: "noteOn", instrument, note, velocity });
  }
  /** Stop instrument preview */
  noteOff() {
    var _a;
    (_a = this.workletNode) == null ? void 0 : _a.port.postMessage({ type: "noteOff" });
  }
  /** Save/export the module binary */
  async save() {
    await this._initPromise;
    const data = await this._sendRequest({ type: "save" });
    if (!data.data) return new Uint8Array(0);
    return new Uint8Array(data.data);
  }
  _sendRequest(msg) {
    const requestId = ++this._requestId;
    return new Promise((resolve) => {
      var _a;
      this._pendingRequests.set(requestId, resolve);
      (_a = this.workletNode) == null ? void 0 : _a.port.postMessage({ ...msg, requestId });
    });
  }
  /** Get number of tracks in the loaded module */
  async getNumTracks() {
    await this._initPromise;
    const data = await this._sendRequest({ type: "getNumTracks" });
    return data.count;
  }
  /** Get number of events in a track */
  async getTrackLength(trackIdx) {
    await this._initPromise;
    const data = await this._sendRequest({ type: "getTrackLength", trackIdx });
    return data.length;
  }
  /** Get full pattern data for a track: array of decoded events */
  async getPatternData(trackIdx) {
    await this._initPromise;
    return this._sendRequest({ type: "getPatternData", trackIdx });
  }
  /** Set a single cell in a track */
  async setPatternCell(trackIdx, eventIdx, note, instrument, release, delay) {
    await this._initPromise;
    await this._sendRequest({ type: "setCell", trackIdx, eventIdx, note, instrument, release, delay });
  }
  /** Set per-channel mute mask. Bit N=1 means channel N is active, 0=muted. */
  setMuteMask(mask) {
    if (!this.workletNode) return;
    this.workletNode.port.postMessage({ type: "setMuteMask", mask });
  }
  dispose() {
    var _a, _b;
    this._disposed = true;
    (_a = this.workletNode) == null ? void 0 : _a.port.postMessage({ type: "dispose" });
    (_b = this.workletNode) == null ? void 0 : _b.disconnect();
    this.workletNode = null;
    if (MaEngine.instance === this) MaEngine.instance = null;
  }
}
export {
  MaEngine
};
