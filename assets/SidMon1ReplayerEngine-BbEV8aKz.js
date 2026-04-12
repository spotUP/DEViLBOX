import { bO as getDevilboxAudioContext, $ as getToneEngine } from "./main-BbV5VyEH.js";
import "./client-DHYdgbIN.js";
import "./vendor-ui-AJ7AT9BN.js";
import "./vendor-react-Dgd_wxYf.js";
import "./vendor-utils-a-Usm5Xm.js";
import "./vendor-tone-48TQc1H3.js";
class SidMon1ReplayerEngine {
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
    this.output.connect(this.audioContext.destination);
    this._initPromise = new Promise((resolve) => {
      this._resolveInit = resolve;
    });
    this.initialize();
  }
  static getInstance() {
    if (!SidMon1ReplayerEngine.instance || SidMon1ReplayerEngine.instance._disposed) {
      SidMon1ReplayerEngine.instance = new SidMon1ReplayerEngine();
    }
    return SidMon1ReplayerEngine.instance;
  }
  static hasInstance() {
    return !!SidMon1ReplayerEngine.instance && !SidMon1ReplayerEngine.instance._disposed;
  }
  async initialize() {
    try {
      await SidMon1ReplayerEngine.ensureInitialized(this.audioContext);
      this.createNode();
    } catch (err) {
      console.error("[SidMon1ReplayerEngine] Initialization failed:", err);
    }
  }
  static async ensureInitialized(context) {
    if (this.loadedContexts.has(context)) return;
    const existingPromise = this.initPromises.get(context);
    if (existingPromise) return existingPromise;
    const initPromise = (async () => {
      const baseUrl = "/";
      try {
        await context.audioWorklet.addModule(`${baseUrl}sidmon1/SidMon1Replayer.worklet.js`);
      } catch {
      }
      if (!this.wasmBinary || !this.jsCode) {
        const [wasmResponse, jsResponse] = await Promise.all([
          fetch(`${baseUrl}sidmon1/SidMon1Replayer.wasm`),
          fetch(`${baseUrl}sidmon1/SidMon1Replayer.js`)
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
    this.workletNode = new AudioWorkletNode(ctx, "sidmon1-replayer-processor", {
      outputChannelCount: [2],
      numberOfOutputs: 1
    });
    this.workletNode.port.onmessage = (event) => {
      const data = event.data;
      switch (data.type) {
        case "ready":
          console.log("[SidMon1ReplayerEngine] WASM ready");
          if (this._resolveInit) {
            this._resolveInit();
            this._resolveInit = null;
          }
          break;
        case "moduleLoaded":
          console.log("[SidMon1ReplayerEngine] Module loaded");
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
        case "instrumentParam":
        case "numInstruments": {
          const pending = this._pendingRequests.get(data.requestId);
          if (pending) {
            this._pendingRequests.delete(data.requestId);
            pending.resolve(data);
          }
          break;
        }
        case "error":
          console.error("[SidMon1ReplayerEngine]", data.message);
          break;
      }
    };
    this.workletNode.port.postMessage({
      type: "init",
      sampleRate: ctx.sampleRate,
      wasmBinary: SidMon1ReplayerEngine.wasmBinary,
      jsCode: SidMon1ReplayerEngine.jsCode
    });
    this.workletNode.connect(this.output);
  }
  async ready() {
    return this._initPromise;
  }
  async loadTune(buffer) {
    await this._initPromise;
    if (!this.workletNode) throw new Error("SidMon1ReplayerEngine not initialized");
    this.workletNode.port.postMessage(
      { type: "loadModule", moduleData: buffer }
    );
  }
  play() {
    var _a;
    (_a = this.workletNode) == null ? void 0 : _a.port.postMessage({ type: "resume" });
  }
  stop() {
    var _a;
    (_a = this.workletNode) == null ? void 0 : _a.port.postMessage({ type: "pause" });
  }
  pause() {
    var _a;
    (_a = this.workletNode) == null ? void 0 : _a.port.postMessage({ type: "pause" });
  }
  setChannelGain(channel, gain) {
    var _a;
    (_a = this.workletNode) == null ? void 0 : _a.port.postMessage({ type: "setChannelGain", channel, gain });
  }
  setSubsong(index) {
    var _a;
    (_a = this.workletNode) == null ? void 0 : _a.port.postMessage({ type: "setSubsong", subsong: index });
  }
  setInstrumentParam(inst, paramId, value) {
    var _a;
    (_a = this.workletNode) == null ? void 0 : _a.port.postMessage({ type: "setInstrumentParam", inst, paramId, value });
  }
  noteOn(instrument, note, velocity = 127) {
    var _a;
    (_a = this.workletNode) == null ? void 0 : _a.port.postMessage({ type: "noteOn", instrument, note, velocity });
  }
  noteOff() {
    var _a;
    (_a = this.workletNode) == null ? void 0 : _a.port.postMessage({ type: "noteOff" });
  }
  async getInstrumentParam(inst, paramId) {
    await this._initPromise;
    const data = await this._sendRequest({ type: "getInstrumentParam", inst, paramId });
    return data.value;
  }
  async getNumInstruments() {
    await this._initPromise;
    const data = await this._sendRequest({ type: "getNumInstruments" });
    return data.count;
  }
  _sendRequest(msg) {
    return new Promise((resolve) => {
      var _a;
      const requestId = this._nextRequestId++;
      this._pendingRequests.set(requestId, { resolve });
      (_a = this.workletNode) == null ? void 0 : _a.port.postMessage({ ...msg, requestId });
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
    if (SidMon1ReplayerEngine.instance === this) {
      SidMon1ReplayerEngine.instance = null;
    }
  }
}
export {
  SidMon1ReplayerEngine
};
