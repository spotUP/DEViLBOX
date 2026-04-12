import { bO as getDevilboxAudioContext, $ as getToneEngine } from "./main-BbV5VyEH.js";
import "./client-DHYdgbIN.js";
import "./vendor-ui-AJ7AT9BN.js";
import "./vendor-react-Dgd_wxYf.js";
import "./vendor-utils-a-Usm5Xm.js";
import "./vendor-tone-48TQc1H3.js";
class PumaTrackerEngine {
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
  _pendingRequests = /* @__PURE__ */ new Map();
  _nextRequestId = 1;
  constructor() {
    this.audioContext = getDevilboxAudioContext();
    this.output = this.audioContext.createGain();
    this._initPromise = new Promise((resolve) => {
      this._resolveInit = resolve;
    });
    this.initialize();
  }
  static getInstance() {
    if (!PumaTrackerEngine.instance || PumaTrackerEngine.instance._disposed) {
      PumaTrackerEngine.instance = new PumaTrackerEngine();
    }
    return PumaTrackerEngine.instance;
  }
  static hasInstance() {
    return !!PumaTrackerEngine.instance && !PumaTrackerEngine.instance._disposed;
  }
  async initialize() {
    try {
      await PumaTrackerEngine.ensureInitialized(this.audioContext);
      this.createNode();
    } catch (err) {
      console.error("[PumaTrackerEngine] Initialization failed:", err);
    }
  }
  static async ensureInitialized(context) {
    if (this.loadedContexts.has(context)) return;
    const existingPromise = this.initPromises.get(context);
    if (existingPromise) return existingPromise;
    const initPromise = (async () => {
      const baseUrl = "/";
      try {
        await context.audioWorklet.addModule(`${baseUrl}pumatracker/PumaTracker.worklet.js`);
      } catch {
      }
      if (!this.wasmBinary || !this.jsCode) {
        const [wasmResponse, jsResponse] = await Promise.all([
          fetch(`${baseUrl}pumatracker/Pumatracker.wasm`),
          fetch(`${baseUrl}pumatracker/Pumatracker.js`)
        ]);
        if (wasmResponse.ok) {
          this.wasmBinary = await wasmResponse.arrayBuffer();
        }
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
    this.workletNode = new AudioWorkletNode(ctx, "pumatracker-processor", {
      outputChannelCount: [2],
      numberOfOutputs: 1
    });
    this.workletNode.port.onmessage = (event) => {
      const data = event.data;
      switch (data.type) {
        case "ready":
          console.log("[PumaTrackerEngine] WASM ready");
          if (this._resolveInit) {
            this._resolveInit();
            this._resolveInit = null;
          }
          break;
        case "moduleLoaded":
          console.log("[PumaTrackerEngine] Module loaded");
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
        case "numPatterns":
        case "cellData":
        case "patternData": {
          const pending = this._pendingRequests.get(data.requestId);
          if (pending) {
            this._pendingRequests.delete(data.requestId);
            pending.resolve(data);
          }
          break;
        }
        case "error":
          console.error("[PumaTrackerEngine]", data.message);
          break;
      }
    };
    this.workletNode.port.postMessage({
      type: "init",
      sampleRate: ctx.sampleRate,
      wasmBinary: PumaTrackerEngine.wasmBinary,
      jsCode: PumaTrackerEngine.jsCode
    });
    this.workletNode.connect(this.output);
  }
  async ready() {
    return this._initPromise;
  }
  async loadTune(buffer) {
    await this._initPromise;
    if (!this.workletNode) throw new Error("PumaTrackerEngine not initialized");
    this.workletNode.port.postMessage(
      { type: "loadModule", moduleData: buffer }
    );
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
  setChannelGain(channel, gain) {
    var _a;
    (_a = this.workletNode) == null ? void 0 : _a.port.postMessage({ type: "setChannelGain", channel, gain });
  }
  setSubsong(index) {
    var _a;
    (_a = this.workletNode) == null ? void 0 : _a.port.postMessage({ type: "setSubsong", subsong: index });
  }
  _sendRequest(msg) {
    return new Promise((resolve) => {
      var _a;
      const requestId = this._nextRequestId++;
      this._pendingRequests.set(requestId, { resolve });
      (_a = this.workletNode) == null ? void 0 : _a.port.postMessage({ ...msg, requestId });
    });
  }
  /** Get the number of patterns in the loaded module */
  async getNumPatterns() {
    await this._initPromise;
    const data = await this._sendRequest({ type: "getNumPatterns" });
    return data.count;
  }
  /** Get all 32 rows of a pattern (single-channel) */
  async getPatternData(patternIdx) {
    await this._initPromise;
    const data = await this._sendRequest({
      type: "getPatternData",
      patternIdx
    });
    return data.cells;
  }
  /** Preview a note: trigger instrument on Paula channel 0 */
  noteOn(instrument, note, velocity = 127) {
    var _a;
    (_a = this.workletNode) == null ? void 0 : _a.port.postMessage({
      type: "noteOn",
      instrument,
      note,
      velocity
    });
  }
  /** Stop the preview note */
  noteOff() {
    var _a;
    (_a = this.workletNode) == null ? void 0 : _a.port.postMessage({ type: "noteOff" });
  }
  /** Set a single cell in a pattern */
  setPatternCell(patternIdx, row, channel, cell) {
    var _a;
    (_a = this.workletNode) == null ? void 0 : _a.port.postMessage({
      type: "setCell",
      patternIdx,
      row,
      channel,
      noteX2: cell.noteX2,
      instrEffect: cell.instrEffect,
      param: cell.param
    });
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
    if (PumaTrackerEngine.instance === this) {
      PumaTrackerEngine.instance = null;
    }
  }
}
export {
  PumaTrackerEngine
};
